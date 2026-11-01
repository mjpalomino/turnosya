import { Component, EventEmitter, OnInit, Output, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { UiIconComponent } from '../ui/icon.component';
import { CYCLE_OPTIONS, type BillingCycle, type Plan } from '../core/models';
import { cycleLabel, paymentBadge, paymentStatusLabel, subStatusLabel } from '../core/wompi';

interface Summary {
  mrrCop: number; revenueMonthCop: number; revenue30dCop: number; discountsMonthCop: number;
  pendingPayments: number; failedPayments30d: number; renewalsNext7d: number; trialsEndingNext7d: number;
  pastDue: number; autoRenew: number; referralsConverted: number;
  byStatus: { status: string; n: number }[]; byPlan: { plan: string; n: number }[];
  byCycle: { months: number; n: number }[]; monthly: { month: string; revenueCop: number; payments: number }[];
}
interface SubRow {
  tenantId: string; tenantName: string; slug: string; tenantStatus: string; status: string;
  planId: string | null; planName: string | null; priceCop: number | null; billingCycleMonths: number;
  trialEndsAt: string | null; currentPeriodEnd: string | null; autoRenew: boolean; failedCharges: number;
  referralCode: string | null; ownerEmail: string | null; lastPaymentCop: number | null;
  lastPaymentStatus: string | null; lastPaymentAt: string | null; totalPaidCop: number;
}
interface PaymentRow {
  id: string; reference: string; status: string; provider: string; amountCop: number; baseCop: number;
  discountCop: number; discountDetail: { label: string; amountCop: number }[]; periodMonths: number;
  isRecurring: boolean; notes: string | null; createdAt: string; tenantName: string; planName: string | null;
}

/**
 * Seguimiento de suscripciones y pagos (superadmin): indicadores, recaudo por mes,
 * suscripciones con su vencimiento, pagos con filtros, pago manual y ajuste de suscripción.
 */
@Component({
  selector: 'app-admin-billing',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, UiIconComponent],
  template: `
    @if (summary(); as s) {
      <div class="metric-grid">
        <div class="card metric-card"><span class="metric-icon"><app-ui-icon name="wallet" /></span><strong class="metric-number">{{ s.mrrCop | number }}</strong><span class="metric-label">Ingreso mensual recurrente (COP)</span></div>
        <div class="card metric-card"><span class="metric-icon"><app-ui-icon name="receipt" /></span><strong class="metric-number">{{ s.revenueMonthCop | number }}</strong><span class="metric-label">Recaudo del mes (COP)</span><span class="metric-sub">{{ s.revenue30dCop | number }} en 30 días</span></div>
        <div class="card metric-card" [class.warn]="s.renewalsNext7d > 0"><span class="metric-icon"><app-ui-icon name="calendar" /></span><strong class="metric-number">{{ s.renewalsNext7d }}</strong><span class="metric-label">Renovaciones en 7 días</span><span class="metric-sub">{{ s.trialsEndingNext7d }} pruebas terminan</span></div>
        <div class="card metric-card" [class.danger]="s.pastDue > 0"><span class="metric-icon"><app-ui-icon name="alert" /></span><strong class="metric-number">{{ s.pastDue }}</strong><span class="metric-label">Con pago vencido</span><span class="metric-sub">{{ s.failedPayments30d }} pagos fallidos en 30 días</span></div>
      </div>
      <div class="management-grid">
        <div class="card section-stack" style="gap:.75rem">
          <h3>Recaudo de los últimos 6 meses</h3>
          <div class="bar-chart" role="img" [attr.aria-label]="chartLabel()">
            @for (m of s.monthly; track m.month) {
              <div class="bar"><strong>{{ short(m.revenueCop) }}</strong><span class="fill" [style.height.%]="pct(m.revenueCop)"></span><span>{{ monthName(m.month) }}</span></div>
            }
          </div>
          <p class="muted">Descuentos otorgados este mes: {{ s.discountsMonthCop | number }} COP · {{ s.pendingPayments }} pagos pendientes · {{ s.autoRenew }} con cobro automático · {{ s.referralsConverted }} referidos convertidos.</p>
        </div>
        <div class="card section-stack" style="gap:.9rem">
          <h3>Distribución</h3>
          <div><span class="section-kicker">Por estado</span><div class="data-pair" style="margin-top:.4rem">@for (x of s.byStatus; track x.status) { <span class="badge badge-neutral">{{ subLabel(x.status) }}: {{ x.n }}</span> }</div></div>
          <div><span class="section-kicker">Por plan (pagando)</span><div class="data-pair" style="margin-top:.4rem">@for (x of s.byPlan; track x.plan) { <span class="badge badge-neutral">{{ x.plan }}: {{ x.n }}</span> } @empty { <span class="muted">Sin datos</span> }</div></div>
          <div><span class="section-kicker">Por ciclo</span><div class="data-pair" style="margin-top:.4rem">@for (x of s.byCycle; track x.months) { <span class="badge badge-neutral">{{ cycle(x.months) }}: {{ x.n }}</span> } @empty { <span class="muted">Sin datos</span> }</div></div>
        </div>
      </div>
    } @else { <div class="loading-state" role="status"><span class="spinner"></span> Cargando indicadores…</div> }

    <!-- Suscripciones -->
    <div class="section-heading secondary-section"><div><h2>Suscripciones</h2><p>Plan, ciclo, vencimiento y último pago de cada negocio.</p></div>
      <div class="field" style="min-width:200px"><label for="sub-filter">Estado</label>
        <select id="sub-filter" class="input" [(ngModel)]="subFilter"><option value="">Todos</option><option value="trial">Prueba gratis</option><option value="active">Activa</option><option value="past_due">Pago vencido</option><option value="cancelled">Cancelada</option></select></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Negocio</th><th>Estado</th><th>Plan / ciclo</th><th>Vence</th><th>Último pago</th><th class="num">Total pagado</th><th></th></tr></thead>
        <tbody>
          @for (r of filteredSubs(); track r.tenantId) {
            <tr>
              <td><strong>{{ r.tenantName }}</strong><span class="cell-sub">{{ r.ownerEmail }}</span></td>
              <td><span class="badge" [class]="r.status === 'active' ? 'badge-ok' : r.status === 'trial' ? 'badge-neutral' : 'badge-danger'">{{ subLabel(r.status) }}</span>@if (r.autoRenew) { <span class="cell-sub">Cobro automático</span> }@if (r.failedCharges) { <span class="cell-sub">{{ r.failedCharges }} cobros fallidos</span> }</td>
              <td>{{ r.planName || 'Sin plan' }}<span class="cell-sub">{{ cycle(r.billingCycleMonths) }}</span></td>
              <td>{{ (r.status === 'trial' ? r.trialEndsAt : r.currentPeriodEnd) | date:'d MMM y' }}</td>
              <td>@if (r.lastPaymentAt) { {{ r.lastPaymentCop | number }} COP <span class="cell-sub">{{ statusLabel(r.lastPaymentStatus || '') }} · {{ r.lastPaymentAt | date:'d MMM' }}</span> } @else { <span class="muted">—</span> }</td>
              <td class="num">{{ r.totalPaidCop | number }}</td>
              <td><button type="button" class="btn btn-secondary btn-sm" (click)="startEdit(r)">Gestionar</button></td>
            </tr>
          } @empty { <tr><td colspan="7" class="muted">No hay suscripciones con ese filtro.</td></tr> }
        </tbody>
      </table>
    </div>

    @if (editing(); as e) {
      <div class="management-grid">
        <section class="card form-stack" aria-labelledby="manual-title">
          <div class="panel-head"><div><h3 id="manual-title">Registrar pago manual</h3><p class="muted">{{ e.tenantName }} · transferencia, efectivo u otro medio. Renueva la suscripción.</p></div></div>
          <div class="form-columns">
            <div class="field"><label for="mp-plan">Plan</label><select id="mp-plan" class="input" [(ngModel)]="mpPlanId">@for (p of plans(); track p.id) { <option [value]="p.id">{{ p.name }} · {{ p.priceCop | number }}/mes</option> }</select></div>
            <div class="field"><label for="mp-cycle">Ciclo</label><select id="mp-cycle" class="input" [(ngModel)]="mpMonths">@for (c of cycles; track c.months) { <option [ngValue]="c.months">{{ c.label }}</option> }</select></div>
          </div>
          <div class="field"><label for="mp-amount">Valor recibido (COP)</label><input id="mp-amount" class="input" type="number" min="0" [(ngModel)]="mpAmount" [placeholder]="'Sugerido: ' + (suggested() | number)" /><span class="input-hint">Déjalo vacío para usar el valor del plan con el descuento del ciclo ({{ suggested() | number }} COP).</span></div>
          <div class="field"><label for="mp-notes">Nota</label><input id="mp-notes" class="input" [(ngModel)]="mpNotes" maxlength="300" placeholder="Ej. Transferencia Bancolombia 31/10" /></div>
          <div class="form-actions-row"><button type="button" class="btn btn-primary" [disabled]="busy()" (click)="saveManual()">Registrar pago</button><button type="button" class="btn btn-subtle" (click)="editing.set(null)">Cerrar</button></div>
        </section>
        <section class="card form-stack" aria-labelledby="adj-title">
          <div class="panel-head"><div><h3 id="adj-title">Ajustar suscripción</h3><p class="muted">Cambia estado, plan, ciclo o vencimiento sin registrar un pago.</p></div></div>
          <div class="form-columns">
            <div class="field"><label for="adj-status">Estado</label><select id="adj-status" class="input" [(ngModel)]="adjStatus"><option value="trial">Prueba gratis</option><option value="active">Activa</option><option value="past_due">Pago vencido</option><option value="cancelled">Cancelada</option></select></div>
            <div class="field"><label for="adj-plan">Plan</label><select id="adj-plan" class="input" [(ngModel)]="adjPlanId"><option value="">Sin plan</option>@for (p of plans(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select></div>
          </div>
          <div class="form-columns">
            <div class="field"><label for="adj-cycle">Ciclo</label><select id="adj-cycle" class="input" [(ngModel)]="adjMonths">@for (c of cycles; track c.months) { <option [ngValue]="c.months">{{ c.label }}</option> }</select></div>
            <div class="field"><label for="adj-end">Vence el</label><input id="adj-end" class="input" type="date" [(ngModel)]="adjEnd" /></div>
          </div>
          <div class="form-actions-row"><button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="saveAdjust()">Guardar ajuste</button></div>
        </section>
      </div>
    }

    <!-- Pagos -->
    <div class="section-heading secondary-section"><div><h2>Pagos</h2><p>Todos los cobros de suscripción, con sus descuentos.</p></div><span class="badge badge-neutral">{{ total() }} pagos</span></div>
    <div class="card filters-row">
      <div class="field"><label for="pf-status">Estado</label><select id="pf-status" class="input" [(ngModel)]="fStatus" (ngModelChange)="reloadPayments(0)"><option value="">Todos</option><option value="approved">Aprobados</option><option value="pending">Pendientes</option><option value="declined">Rechazados</option><option value="error">Con error</option><option value="voided">Anulados</option></select></div>
      <div class="field"><label for="pf-from">Desde</label><input id="pf-from" class="input" type="date" [(ngModel)]="fFrom" (change)="reloadPayments(0)" /></div>
      <div class="field"><label for="pf-to">Hasta</label><input id="pf-to" class="input" type="date" [(ngModel)]="fTo" (change)="reloadPayments(0)" /></div>
      <div class="field"><label for="pf-tenant">Negocio</label><select id="pf-tenant" class="input" [(ngModel)]="fTenant" (ngModelChange)="reloadPayments(0)"><option value="">Todos</option>@for (r of subs(); track r.tenantId) { <option [value]="r.tenantId">{{ r.tenantName }}</option> }</select></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Fecha</th><th>Negocio</th><th>Plan / ciclo</th><th>Estado</th><th>Origen</th><th class="num">Valor base</th><th class="num">Descuento</th><th class="num">Pagado</th></tr></thead>
        <tbody>
          @for (p of payments(); track p.id) {
            <tr>
              <td>{{ p.createdAt | date:'d MMM y, HH:mm' }}<span class="cell-sub">{{ p.reference }}</span></td>
              <td>{{ p.tenantName }}</td>
              <td>{{ p.planName || '—' }}<span class="cell-sub">{{ cycle(p.periodMonths) }}</span></td>
              <td><span class="badge" [class]="badge(p.status)">{{ statusLabel(p.status) }}</span></td>
              <td>{{ p.provider === 'manual' ? 'Manual' : (p.isRecurring ? 'Wompi automático' : 'Wompi') }}@if (p.notes) { <span class="cell-sub">{{ p.notes }}</span> }</td>
              <td class="num">{{ p.baseCop | number }}</td>
              <td class="num">@if (p.discountCop) { −{{ p.discountCop | number }} @for (d of p.discountDetail; track $index) { <span class="cell-sub">{{ d.label }}</span> } } @else { — }</td>
              <td class="num"><strong>{{ p.amountCop | number }}</strong></td>
            </tr>
          } @empty { <tr><td colspan="8" class="muted">No hay pagos con esos filtros.</td></tr> }
        </tbody>
      </table>
    </div>
    @if (total() > pageSize) {
      <div class="form-actions-row"><button type="button" class="btn btn-secondary btn-sm" [disabled]="offset() === 0" (click)="reloadPayments(offset() - pageSize)"><app-ui-icon name="arrow-left" /> Anteriores</button><span class="muted">{{ offset() + 1 }}–{{ min(offset() + pageSize, total()) }} de {{ total() }}</span><button type="button" class="btn btn-secondary btn-sm" [disabled]="offset() + pageSize >= total()" (click)="reloadPayments(offset() + pageSize)">Siguientes <app-ui-icon name="arrow-right" /></button></div>
    }
  `,
})
export class AdminBillingComponent implements OnInit {
  private api = inject(ApiService);
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();

  readonly cycles = CYCLE_OPTIONS;
  readonly pageSize = 25;
  summary = signal<Summary | null>(null);
  subs = signal<SubRow[]>([]);
  payments = signal<PaymentRow[]>([]);
  plans = signal<Plan[]>([]);
  total = signal(0);
  offset = signal(0);
  busy = signal(false);
  editing = signal<SubRow | null>(null);

  subFilter = '';
  fStatus = ''; fFrom = ''; fTo = ''; fTenant = '';
  mpPlanId = ''; mpMonths: BillingCycle = 1; mpAmount: number | null = null; mpNotes = '';
  adjStatus = 'active'; adjPlanId = ''; adjMonths: BillingCycle = 1; adjEnd = '';

  filteredSubs = computed(() => this.subs().filter((r) => !this.subFilter || r.status === this.subFilter));

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.api.get<Summary>('/admin/billing/summary').subscribe({ next: (s) => this.summary.set(s), error: () => this.fail('No se pudieron cargar los indicadores.') });
    this.api.get<SubRow[]>('/admin/subscriptions').subscribe({ next: (s) => this.subs.set(s) });
    this.api.get<Plan[]>('/admin/plans').subscribe({ next: (p) => this.plans.set(p) });
    this.reloadPayments(0);
  }

  reloadPayments(offset: number): void {
    const params: Record<string, string> = { limit: String(this.pageSize), offset: String(Math.max(0, offset)) };
    if (this.fStatus) params['status'] = this.fStatus;
    if (this.fTenant) params['tenantId'] = this.fTenant;
    if (this.fFrom) params['from'] = new Date(`${this.fFrom}T00:00:00`).toISOString();
    if (this.fTo) params['to'] = new Date(`${this.fTo}T23:59:59`).toISOString();
    this.api.get<{ total: number; items: PaymentRow[] }>('/admin/payments', params).subscribe({
      next: (r) => { this.payments.set(r.items); this.total.set(r.total); this.offset.set(Math.max(0, offset)); },
      error: () => this.fail('No se pudieron cargar los pagos.'),
    });
  }

  startEdit(r: SubRow): void {
    this.editing.set(r);
    this.mpPlanId = r.planId ?? this.plans()[0]?.id ?? '';
    this.mpMonths = (r.billingCycleMonths as BillingCycle) || 1;
    this.mpAmount = null; this.mpNotes = '';
    this.adjStatus = r.status; this.adjPlanId = r.planId ?? ''; this.adjMonths = (r.billingCycleMonths as BillingCycle) || 1;
    const end = r.status === 'trial' ? r.trialEndsAt : r.currentPeriodEnd;
    this.adjEnd = end ? end.slice(0, 10) : '';
  }

  suggested(): number {
    const p = this.plans().find((x) => x.id === this.mpPlanId);
    if (!p) return 0;
    const base = p.priceCop * this.mpMonths;
    const pct = this.mpMonths === 3 ? p.discountQuarterlyPct ?? 0 : this.mpMonths === 6 ? p.discountSemiannualPct ?? 0 : 0;
    return Math.round(base - (base * pct) / 100);
  }

  saveManual(): void {
    const e = this.editing();
    if (!e || !this.mpPlanId) { this.fail('Elige un plan.'); return; }
    this.busy.set(true);
    this.api.post<{ amountCop: number }>('/admin/payments/manual', {
      tenantId: e.tenantId, planId: this.mpPlanId, months: Number(this.mpMonths),
      amountCop: this.mpAmount === null || (this.mpAmount as unknown) === '' ? undefined : Number(this.mpAmount),
      notes: this.mpNotes || undefined,
    }).subscribe({
      next: (r) => { this.busy.set(false); this.editing.set(null); this.notify.emit({ message: `Pago manual de ${r.amountCop.toLocaleString('es-CO')} COP registrado.`, type: 'ok' }); this.reload(); },
      error: (err) => { this.busy.set(false); this.fail(err?.error?.error ?? 'No se pudo registrar el pago.'); },
    });
  }

  saveAdjust(): void {
    const e = this.editing();
    if (!e) return;
    this.busy.set(true);
    this.api.post(`/admin/tenants/${e.tenantId}/subscription`, {
      status: this.adjStatus, planId: this.adjPlanId || null, billingCycleMonths: Number(this.adjMonths),
      currentPeriodEnd: this.adjEnd ? new Date(`${this.adjEnd}T23:59:59`).toISOString() : null,
    }).subscribe({
      next: () => { this.busy.set(false); this.notify.emit({ message: 'Suscripción actualizada.', type: 'ok' }); this.reload(); },
      error: (err) => { this.busy.set(false); this.fail(err?.error?.error ?? 'No se pudo actualizar la suscripción.'); },
    });
  }

  private maxRevenue(): number { return Math.max(1, ...(this.summary()?.monthly ?? []).map((m) => m.revenueCop)); }
  pct(v: number): number { return Math.round((v / this.maxRevenue()) * 100); }
  short(v: number): string { return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} M` : v >= 1000 ? `${Math.round(v / 1000)} mil` : String(v); }
  monthName(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString('es-CO', { month: 'short' });
  }
  chartLabel(): string {
    return 'Recaudo por mes: ' + (this.summary()?.monthly ?? []).map((m) => `${this.monthName(m.month)} ${m.revenueCop.toLocaleString('es-CO')} COP`).join(', ');
  }
  min(a: number, b: number): number { return Math.min(a, b); }
  subLabel = subStatusLabel; statusLabel = paymentStatusLabel; badge = paymentBadge; cycle = cycleLabel;
  private fail(message: string): void { this.notify.emit({ message, type: 'error' }); }
}
