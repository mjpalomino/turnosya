import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { UiIconComponent } from '../ui/icon.component';
import { CYCLE_OPTIONS, type BillingCycle, type FeatureDef, type Plan, type PriceQuote, type WompiCheckout } from '../core/models';
import { cycleLabel, goToWompi, paymentBadge, paymentStatusLabel, subStatusLabel } from '../core/wompi';

interface SubState {
  status: string; trialEndsAt: string | null; currentPeriodEnd: string | null;
  autoRenew: boolean; payerEmail: string | null; hasCard: boolean;
  planId: string | null; planName: string | null; billingCycleMonths: number;
  features: Record<string, boolean>; limits: { maxStaff: number | null; maxServices: number | null; maxBranches: number | null };
  featureCatalog: FeatureDef[];
}
interface Payment {
  reference: string; amountInCents: number; status: string; periodMonths: number; createdAt: string;
  discountInCents: number; discountDetail: { label: string }[]; provider: string; planName: string | null;
}
interface ReferralInfo {
  program: { enabled: boolean; referralDiscountPct: number; referrerRewardPct: number };
  code: string; canShare: boolean; availableRewards: number; canApplyCode: boolean;
  referrals: { status: string; createdAt: string; businessName: string; rewardPct: number }[];
  applied: { status: string; discountPct: number; referrerName: string; code: string } | null;
}
interface AcceptanceResponse { publicKey: string; acceptanceToken: string; personalAuthToken: string; }

declare global {
  interface Window {
    WidgetCheckout?: new (opts: Record<string, unknown>) => { open: (cb: (result: { transaction?: unknown; token?: string }) => void) => void };
  }
}

/**
 * Suscripción del negocio: estado, funcionalidades del plan, elección de plan y ciclo
 * (mensual, trimestral, semestral) con descuentos, pago con Wompi, cobro automático,
 * programa de referidos e historial de pagos.
 */
@Component({
  selector: 'app-owner-subscription',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, UiIconComponent],
  template: `
    @if (sub(); as sv) {
      <div class="management-grid">
        <div class="card form-stack">
          <div class="panel-head"><h3>Tu suscripción</h3><span class="badge" [class]="sv.status==='active' || sv.status==='trial' ? 'badge-ok':'badge-danger'">{{ subLabel(sv.status) }}</span></div>
          <div class="info-row"><span class="info-label">Plan</span><strong>{{ sv.planName || (sv.status === 'trial' ? 'Prueba con todas las funciones' : 'Sin plan') }}</strong></div>
          @if (sv.status !== 'trial') { <div class="info-row"><span class="info-label">Ciclo de pago</span><strong>{{ cycle(sv.billingCycleMonths) }}</strong></div> }
          @if (sv.currentPeriodEnd) { <div class="info-row"><span class="info-label">{{ sv.status === 'trial' ? 'Tu prueba termina' : 'Vence' }}</span><strong>{{ sv.currentPeriodEnd | date:'d MMM y' }}</strong></div> }
          <div class="info-row"><span class="info-label">Cobro automático</span><span class="badge" [class]="sv.autoRenew ? 'badge-ok':'badge-warn'">{{ sv.autoRenew ? 'Activo' : 'Inactivo' }}</span></div>
          @if (sv.autoRenew) {
            <p class="muted">Se cobrará {{ cycle(sv.billingCycleMonths).toLowerCase() }} con la tarjeta guardada{{ sv.payerEmail ? ' (' + sv.payerEmail + ')' : '' }}.</p>
            <div><button type="button" class="btn btn-outline-danger btn-sm" (click)="cancelAutoRenew()">Desactivar cobro automático</button></div>
          }
        </div>
        <div class="card form-stack">
          <h3>Incluido en tu plan</h3>
          <ul class="feature-list">
            @for (f of sv.featureCatalog; track f.key) { <li [class.on]="sv.features[f.key]" [class.off]="!sv.features[f.key]"><app-ui-icon [name]="sv.features[f.key] ? 'check' : 'x'" /> {{ f.label }}</li> }
          </ul>
          <p class="muted">Límites: {{ lim(sv.limits.maxStaff) }} empleados · {{ lim(sv.limits.maxServices) }} servicios · {{ lim(sv.limits.maxBranches) }} sede(s).</p>
        </div>
      </div>
    }

    <!-- Elegir plan y ciclo -->
    <div class="section-heading secondary-section"><div><h2>Elige tu plan</h2><p>Paga varios meses juntos y ahorra.</p></div>
      <div class="segmented" role="group" aria-label="Ciclo de pago">
        @for (c of cycles; track c.months) {
          <button type="button" [attr.aria-pressed]="months() === c.months" (click)="setMonths(c.months)">{{ c.label }}@if (bestPct(c.months)) { <span class="save-tag">hasta −{{ bestPct(c.months) }}%</span> }</button>
        }
      </div>
    </div>
    <div class="grid">
      @for (p of plans(); track p.id) {
        <div class="card plan-card" [class.current]="sub()?.planId === p.id">
          <div><h3>{{ p.name }}</h3>@if (p.description) { <p class="muted">{{ p.description }}</p> }</div>
          @if (quotes()[p.id]; as q) {
            <div>
              @if (q.discountCop > 0) { <span class="price-old">{{ q.baseCop | number }} COP</span> }
              <div class="plan-price">{{ q.totalCop | number }} <small>COP / {{ cycle(months()).toLowerCase() }}</small></div>
              @if (months() > 1) { <span class="muted">Equivale a {{ q.effectiveMonthlyCop | number }} COP al mes</span> }
            </div>
            @if (q.discounts.length) {
              <div class="discount-lines">@for (d of q.discounts; track d.kind) { <div><span>{{ d.label }} ({{ d.pct }}%)</span><span class="neg">−{{ d.amountCop | number }}</span></div> }</div>
            }
          } @else { <div class="plan-price">{{ p.priceCop | number }} <small>COP/mes</small></div> }
          <p class="muted">{{ p.maxStaff }} empleados · {{ p.maxServices }} servicios · {{ p.maxBranches }} sede(s)</p>
          <ul class="feature-list">
            @for (f of catalog(); track f.key) { @if (p.features[f.key] === true) { <li class="on"><app-ui-icon name="check" /> {{ f.label }}</li> } }
          </ul>
          <button type="button" class="btn btn-primary" [disabled]="paying()" [attr.aria-busy]="paying() === p.id" (click)="pay(p.id)">@if (paying() === p.id) { <span class="spinner"></span> Redirigiendo… } @else { Pagar con Wompi <app-ui-icon name="arrow-right" /> }</button>
        </div>
      } @empty { <div class="empty-state"><h3>Sin planes disponibles</h3><p>Vuelve a consultar más adelante.</p></div> }
    </div>
    @if (payError()) { <p class="error" role="alert">{{ payError() }}</p> }

    <!-- Cobro automático -->
    @if (sub(); as sv) { @if (!sv.autoRenew) {
      <div class="card form-stack form-panel" style="margin-top:1.5rem">
        <h3>Cobro automático</h3>
        <p class="muted">Guarda tu tarjeta en Wompi y renovamos tu plan en cada ciclo, con el mismo descuento.</p>
        <div class="form-columns">
          <div class="field"><label for="auto-plan">Plan</label><select id="auto-plan" class="input" [(ngModel)]="autoPlanId"><option value="">— Elige un plan —</option>@for (p of plans(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select></div>
          <div class="field"><label for="auto-cycle">Ciclo</label><select id="auto-cycle" class="input" [(ngModel)]="autoMonths">@for (c of cycles; track c.months) { <option [ngValue]="c.months">{{ c.label }}</option> }</select></div>
        </div>
        <div class="field"><label for="auto-email">Correo para los recibos</label><input id="auto-email" class="input" type="email" [(ngModel)]="autoEmail" autocomplete="email" /></div>
        <div class="form-actions"><button type="button" class="btn btn-secondary" [disabled]="autoBusy()" [attr.aria-busy]="autoBusy()" (click)="startAutoRenew()">@if (autoBusy()) { <span class="spinner"></span> Abriendo Wompi… } @else { Guardar tarjeta y activar }</button></div>
        @if (autoError()) { <p class="error" role="alert">{{ autoError() }}</p> }
      </div>
    } }

    <!-- Referidos -->
    @if (ref(); as r) { @if (r.program.enabled) {
      <div class="section-heading secondary-section"><div><h2>Refiere y ahorra</h2><p>Invita a otros negocios: ellos reciben {{ r.program.referralDiscountPct }}% en su primer pago y tú {{ r.program.referrerRewardPct }}% en tu siguiente pago por cada uno.</p></div></div>
      <div class="management-grid">
        <div class="card form-stack">
          <h3>Tu código</h3>
          @if (r.canShare) {
            <div class="code-box"><strong>{{ r.code }}</strong>
              <button type="button" class="btn btn-subtle btn-sm" (click)="copy(r.code)"><app-ui-icon name="copy" /> Copiar código</button>
              <button type="button" class="btn btn-subtle btn-sm" (click)="copy(referralLink(r.code))"><app-ui-icon name="link" /> Copiar link</button>
            </div>
            <p class="muted">Recompensas disponibles: <strong>{{ r.availableRewards }}</strong>. Se aplican solas en tu próximo pago.</p>
          } @else {
            <p class="muted">Tu código se activa cuando tengas una suscripción paga activa.</p>
          }
          @if (r.referrals.length) {
            <div class="discount-lines">@for (x of r.referrals; track x.createdAt) { <div><span>{{ x.businessName }}</span><span class="badge" [class]="x.status === 'converted' ? 'badge-ok' : 'badge-neutral'">{{ refLabel(x.status) }}</span></div> }</div>
          }
        </div>
        <div class="card form-stack">
          <h3>¿Te recomendó otro negocio?</h3>
          @if (r.applied) {
            <p>Código <strong>{{ r.applied.code }}</strong> de {{ r.applied.referrerName }}: {{ r.applied.discountPct }}% de descuento {{ r.applied.status === 'pending' ? 'en tu primer pago' : 'aplicado' }}.</p>
          } @else if (r.canApplyCode) {
            <div class="field"><label for="ref-code">Código de referido</label><input id="ref-code" class="input" [(ngModel)]="refCode" maxlength="20" placeholder="Ej. ABCD2345" style="text-transform:uppercase" /></div>
            <div class="form-actions"><button type="button" class="btn btn-secondary" (click)="applyCode()">Aplicar código</button></div>
          } @else { <p class="muted">Los códigos de referido aplican solo antes del primer pago.</p> }
        </div>
      </div>
    } }

    <!-- Historial -->
    <div class="section-heading secondary-section"><div><h2>Historial de pagos</h2><p>Tus pagos con los descuentos aplicados.</p></div></div>
    <div class="record-list">
      @for (pay of payments(); track pay.reference) {
        <div class="card record-card">
          <div class="record-main"><strong class="record-title">{{ pay.amountInCents / 100 | number }} COP · {{ pay.planName || 'Plan' }} {{ cycle(pay.periodMonths).toLowerCase() }}</strong>
            <span class="record-meta">{{ pay.createdAt | date:'d MMM y, HH:mm' }}@if (pay.discountInCents) { · ahorraste {{ pay.discountInCents / 100 | number }} COP } · {{ pay.provider === 'manual' ? 'Pago registrado por soporte' : 'Wompi' }}</span></div>
          <span class="badge" [class]="badge(pay.status)">{{ statusLabel(pay.status) }}</span>
        </div>
      } @empty { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="credit-card" /></span><h3>Aún no hay pagos</h3><p>Los pagos aparecerán aquí cuando los realices.</p></div> }
    </div>
  `,
})
export class OwnerSubscriptionComponent implements OnInit {
  private api = inject(ApiService);
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();

  readonly cycles = CYCLE_OPTIONS;
  sub = signal<SubState | null>(null);
  plans = signal<Plan[]>([]);
  catalog = signal<FeatureDef[]>([]);
  quotes = signal<Record<string, PriceQuote>>({});
  payments = signal<Payment[]>([]);
  ref = signal<ReferralInfo | null>(null);
  months = signal<BillingCycle>(1);
  paying = signal<string | false>(false);
  payError = signal('');
  autoBusy = signal(false);
  autoError = signal('');
  autoPlanId = ''; autoEmail = ''; autoMonths: BillingCycle = 1; refCode = '';

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.get<SubState>('/billing/subscription').subscribe({ next: (s) => {
      this.sub.set(s);
      if (s) { this.catalog.set(s.featureCatalog); if (s.status !== 'trial' && [1, 3, 6].includes(s.billingCycleMonths)) this.months.set(s.billingCycleMonths as BillingCycle); }
      this.loadQuotes();
    } });
    this.api.get<Plan[]>('/plans').subscribe({ next: (p) => { this.plans.set(p); this.loadQuotes(); } });
    this.api.get<Payment[]>('/billing/payments').subscribe({ next: (p) => this.payments.set(p) });
    this.api.get<ReferralInfo>('/billing/referrals').subscribe({ next: (r) => this.ref.set(r) });
  }

  setMonths(m: BillingCycle): void { this.months.set(m); this.loadQuotes(); }

  /** Cotiza en el servidor cada plan con el ciclo elegido (incluye referidos y recompensas). */
  loadQuotes(): void {
    const m = this.months();
    for (const p of this.plans()) {
      this.api.post<PriceQuote>('/billing/quote', { planId: p.id, months: m }).subscribe({
        next: (q) => { if (this.months() === m) this.quotes.update((all) => ({ ...all, [p.id]: q })); },
      });
    }
  }

  bestPct(m: BillingCycle): number {
    if (m === 1) return 0;
    return Math.max(0, ...this.plans().map((p) => (m === 3 ? p.discountQuarterlyPct ?? 0 : p.discountSemiannualPct ?? 0)));
  }

  pay(planId: string): void {
    this.paying.set(planId);
    this.payError.set('');
    this.api.post<WompiCheckout>('/billing/checkout', { planId, months: this.months() }).subscribe({
      next: (c) => goToWompi(c),
      error: (e) => { this.paying.set(false); this.payError.set(e?.error?.error ?? 'No se pudo iniciar el pago'); },
    });
  }

  private loadWompiWidget(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.WidgetCheckout) return resolve();
      const s = document.createElement('script');
      s.src = 'https://checkout.wompi.co/widget.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar Wompi'));
      document.head.appendChild(s);
    });
  }

  async startAutoRenew(): Promise<void> {
    this.autoError.set('');
    if (!this.autoPlanId || !this.autoEmail) { this.autoError.set('Elige plan, ciclo y correo'); return; }
    this.autoBusy.set(true);
    try {
      const acc = await new Promise<AcceptanceResponse>((res, rej) =>
        this.api.get<AcceptanceResponse>('/billing/acceptance').subscribe({ next: res, error: rej }));
      await this.loadWompiWidget();
      if (!window.WidgetCheckout) throw new Error('Widget no disponible');
      const checkout = new window.WidgetCheckout({ currency: 'COP', amountInCents: 0, reference: `tok_${Date.now()}`, publicKey: acc.publicKey, widgetOperation: 'tokenize' });
      checkout.open((result) => {
        const token = result?.token;
        if (!token) { this.autoBusy.set(false); this.autoError.set('No se recibió la tarjeta'); return; }
        this.api.post('/billing/auto-renew', { cardToken: token, payerEmail: this.autoEmail, planId: this.autoPlanId, months: Number(this.autoMonths) }).subscribe({
          next: () => { this.autoBusy.set(false); this.notify.emit({ message: 'Cobro automático activado.', type: 'ok' }); this.load(); },
          error: (e) => { this.autoBusy.set(false); this.autoError.set(e?.error?.error ?? 'No se pudo activar'); },
        });
      });
    } catch (e) {
      this.autoBusy.set(false);
      this.autoError.set((e as { error?: { error?: string } })?.error?.error ?? (e instanceof Error ? e.message : 'Error al activar el cobro'));
    }
  }

  cancelAutoRenew(): void {
    this.api.post('/billing/auto-renew/cancel', {}).subscribe({
      next: () => { this.notify.emit({ message: 'Se desactivó el cobro automático.', type: 'ok' }); this.load(); },
      error: () => this.notify.emit({ message: 'No se pudo desactivar el cobro automático.', type: 'error' }),
    });
  }

  applyCode(): void {
    if (!this.refCode.trim()) return;
    this.api.post<{ referrerName: string; discountPct: number }>('/billing/referral', { code: this.refCode }).subscribe({
      next: (r) => { this.refCode = ''; this.notify.emit({ message: `Código de ${r.referrerName} aplicado: ${r.discountPct}% en tu primer pago.`, type: 'ok' }); this.load(); },
      error: (e) => this.notify.emit({ message: e?.error?.error ?? 'No se pudo aplicar el código.', type: 'error' }),
    });
  }

  referralLink(code: string): string { return `${location.origin}/registro-negocio?ref=${encodeURIComponent(code)}`; }
  copy(text: string): void { void navigator.clipboard?.writeText(text).then(() => this.notify.emit({ message: 'Copiado.', type: 'ok' })); }
  lim(n: number | null): string { return n === null ? 'sin límite de' : String(n); }
  refLabel(s: string): string { return ({ pending: 'Aún no paga', converted: 'Recompensa disponible', rewarded: 'Recompensa usada', void: 'Anulado' } as Record<string, string>)[s] ?? s; }
  subLabel = subStatusLabel; statusLabel = paymentStatusLabel; badge = paymentBadge; cycle = cycleLabel;
}
