import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import type { Appointment, Plan, Service } from '../core/models';

interface Payment {
  reference: string; amountInCents: number; currency: string;
  status: string; periodMonths: number; createdAt: string;
}
interface CheckoutResponse {
  publicKey: string; currency: string; amountInCents: number;
  reference: string; signatureIntegrity: string | null; redirectUrl: string;
}
interface SubState {
  status: string; trialEndsAt: string | null; currentPeriodEnd: string | null;
  autoRenew: boolean; payerEmail: string | null; hasCard: boolean;
}
interface AcceptanceResponse { publicKey: string; acceptanceToken: string; personalAuthToken: string; }

// Tipado mínimo del widget global de Wompi.
declare global {
  interface Window {
    WidgetCheckout?: new (opts: Record<string, unknown>) => { open: (cb: (result: { transaction?: unknown; token?: string }) => void) => void };
  }
}

interface Branding {
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  address?: string | null;
  about?: string | null;
}
interface StaffRow { id: string; fullName: string; email: string; title?: string; isActive: boolean; }
interface Summary { today: number; upcoming: number; staff: number; services: number; }
interface Settings {
  minLeadMinutes: number; cancelLeadMinutes: number; slotMinutes: number;
  allowWaitlist: boolean; allowReviews: boolean; onlinePayment: boolean;
}
interface Loyalty {
  enabled: boolean; stickersForReward: number; rewardServiceId: string | null;
  rewardLabel: string; cardExpiryDays: number | null;
}

/** Panel del dueño: resumen, servicios, empleados, branding. */
@Component({
  selector: 'app-owner-panel',
  standalone: true,
  imports: [FormsModule, DecimalPipe, DatePipe],
  template: `
    <header class="topbar">
      <div class="container row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0;color:#fff">Mi negocio</h2>
        <button class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.4)" (click)="logout()">Salir</button>
      </div>
    </header>

    <div class="container stack">
      <nav class="tabs">
        @for (t of tabs; track t.id) {
          <button class="tab" [class.active]="tab() === t.id" (click)="selectTab(t.id)">{{ t.label }}</button>
        }
      </nav>

      <!-- Resumen -->
      @if (tab() === 'summary' && summary(); as s) {
        <div class="grid">
          <div class="card"><h3>{{ s.today }}</h3><p class="muted">Citas hoy</p></div>
          <div class="card"><h3>{{ s.upcoming }}</h3><p class="muted">Próximas</p></div>
          <div class="card"><h3>{{ s.staff }}</h3><p class="muted">Empleados</p></div>
          <div class="card"><h3>{{ s.services }}</h3><p class="muted">Servicios</p></div>
        </div>
      }

      <!-- Servicios -->
      @if (tab() === 'services') {
        <div class="card stack" style="max-width:480px">
          <h3>Nuevo servicio</h3>
          <input class="input" placeholder="Nombre" [(ngModel)]="svcName" />
          <div class="row">
            <input class="input" type="number" placeholder="Duración (min)" [(ngModel)]="svcDuration" />
            <input class="input" type="number" placeholder="Precio COP" [(ngModel)]="svcPrice" />
          </div>
          <button class="btn btn-primary" (click)="addService()">Agregar</button>
        </div>
        <div class="stack">
          @for (sv of services(); track sv.id) {
            <div class="card row" style="justify-content:space-between">
              <span>{{ sv.name }} · {{ sv.durationMinutes }} min · {{ sv.priceCop | number }} COP</span>
            </div>
          }
        </div>
      }

      <!-- Empleados -->
      @if (tab() === 'staff') {
        <div class="card stack" style="max-width:480px">
          <h3>Nuevo empleado</h3>
          <input class="input" placeholder="Nombre" [(ngModel)]="stName" />
          <input class="input" placeholder="Correo" [(ngModel)]="stEmail" />
          <input class="input" type="password" placeholder="Contraseña" [(ngModel)]="stPass" />
          <button class="btn btn-primary" (click)="addStaff()">Agregar</button>
        </div>
        <div class="stack">
          @for (st of staff(); track st.id) {
            <div class="card stack">
              <div class="row" style="justify-content:space-between;align-items:center">
                <span><strong>{{ st.fullName }}</strong> · {{ st.email }}</span>
                <button class="btn btn-ghost" (click)="toggleStaffEdit(st.id)">
                  {{ editStaff() === st.id ? 'Cerrar' : 'Horario y servicios' }}
                </button>
              </div>
              @if (editStaff() === st.id) {
                <div class="stack" style="border-top:1px solid var(--border);padding-top:.8rem">
                  <strong>Servicios que presta</strong>
                  <div class="row" style="flex-wrap:wrap">
                    @for (sv of services(); track sv.id) {
                      <label class="row" style="align-items:center;gap:.3rem">
                        <input type="checkbox" [checked]="staffSvc().has(sv.id)" (change)="toggleSvc(sv.id)" />
                        {{ sv.name }}
                      </label>
                    }
                  </div>
                  <button class="btn btn-ghost" (click)="saveStaffServices(st.id)">Guardar servicios</button>

                  <strong style="margin-top:.6rem">Horario semanal</strong>
                  @for (d of weekdays; track d.w) {
                    <div class="row" style="align-items:center;gap:.5rem">
                      <label class="row" style="align-items:center;gap:.3rem;min-width:110px">
                        <input type="checkbox" [checked]="dayOn()[d.w]" (change)="toggleDay(d.w)" /> {{ d.name }}
                      </label>
                      @if (dayOn()[d.w]) {
                        <input class="input" style="max-width:120px" type="time" [value]="dayStart()[d.w] || '09:00'" (input)="setDayStart(d.w, $event)" />
                        <input class="input" style="max-width:120px" type="time" [value]="dayEnd()[d.w] || '18:00'" (input)="setDayEnd(d.w, $event)" />
                      }
                    </div>
                  }
                  <button class="btn btn-primary" (click)="saveStaffSchedule(st.id)">Guardar horario</button>
                  @if (staffSaved()) { <span class="badge badge-ok">Guardado</span> }
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- CITAS (agenda del equipo) -->
      @if (tab()==='appointments') {
        <div class="field" style="max-width:220px">
          <label>Día</label>
          <input class="input" type="date" [value]="apptDate" (change)="onApptDate($event)" />
        </div>
        <div class="stack">
          @for (a of appts(); track a.id) {
            <div class="card">
              <strong>{{ a.startsAt | date: 'HH:mm' }}</strong> · {{ a.serviceName }}
              <div class="muted">{{ a.customerName }} · con {{ a.staffName }} ·
                <span class="badge" [class]="a.status==='cancelled' ? 'badge-danger':'badge-ok'">{{ a.status }}</span>
              </div>
            </div>
          }
          @if (appts().length === 0) { <p class="muted">Sin citas ese día.</p> }
        </div>
      }

      <!-- FIDELIZACIÓN -->
      @if (tab()==='loyalty' && loyalty(); as l) {
        <div class="card stack" style="max-width:480px">
          <h3>Tarjeta de fidelización</h3>
          <label class="row" style="align-items:center;gap:.4rem">
            <input type="checkbox" [checked]="l.enabled" (change)="l.enabled = !l.enabled" /> Activar fidelización
          </label>
          <div class="field"><label>Sellos para el premio</label>
            <input class="input" type="number" [ngModel]="l.stickersForReward" (ngModelChange)="l.stickersForReward = $event" /></div>
          <div class="field"><label>Nombre del premio</label>
            <input class="input" [ngModel]="l.rewardLabel" (ngModelChange)="l.rewardLabel = $event" /></div>
          <div class="field"><label>Servicio de regalo (opcional)</label>
            <select class="input" [ngModel]="l.rewardServiceId" (ngModelChange)="l.rewardServiceId = $event">
              <option [ngValue]="null">— ninguno —</option>
              @for (sv of services(); track sv.id) { <option [ngValue]="sv.id">{{ sv.name }}</option> }
            </select></div>
          <button class="btn btn-primary" (click)="saveLoyalty()">Guardar</button>
          @if (loyaltySaved()) { <span class="badge badge-ok">Guardado</span> }
        </div>
      }

      <!-- SUSCRIPCIÓN -->
      @if (tab()==='subscription') {
        @if (sub(); as sv) {
          <div class="card stack" style="max-width:520px">
            <h3>Estado de tu suscripción</h3>
            <div class="row" style="justify-content:space-between">
              <span>Estado</span>
              <span class="badge" [class]="sv.status==='active' || sv.status==='trial' ? 'badge-ok':'badge-danger'">{{ subLabel(sv.status) }}</span>
            </div>
            @if (sv.currentPeriodEnd) {
              <div class="row" style="justify-content:space-between"><span>Vence</span><strong>{{ sv.currentPeriodEnd | date:'d MMM y' }}</strong></div>
            }
            <div class="row" style="justify-content:space-between">
              <span>Cobro automático mensual</span>
              <span class="badge" [class]="sv.autoRenew ? 'badge-ok':'badge-warn'">{{ sv.autoRenew ? 'Activo' : 'Inactivo' }}</span>
            </div>

            @if (sv.autoRenew) {
              <p class="muted">Cobraremos tu plan cada mes con la tarjeta guardada{{ sv.payerEmail ? ' (' + sv.payerEmail + ')' : '' }}.</p>
              <button class="btn btn-ghost" (click)="cancelAutoRenew()">Desactivar cobro automático</button>
            } @else {
              <p class="muted">Activa el cobro automático para no quedarte sin servicio al vencer. Guardamos tu tarjeta de forma segura con Wompi.</p>
              <div class="field"><label>Plan a cobrar</label>
                <select class="input" [(ngModel)]="autoPlanId">
                  <option value="">— elige un plan —</option>
                  @for (p of plans(); track p.id) { <option [value]="p.id">{{ p.name }} · {{ p.priceCop | number }} COP/mes</option> }
                </select></div>
              <div class="field"><label>Correo para los recibos</label><input class="input" type="email" [(ngModel)]="autoEmail" /></div>
              <button class="btn btn-primary" [disabled]="autoBusy()" (click)="startAutoRenew()">
                {{ autoBusy() ? 'Abriendo Wompi…' : 'Guardar tarjeta y activar' }}
              </button>
              @if (autoError()) { <p class="error">{{ autoError() }}</p> }
              @if (autoDone()) { <span class="badge badge-ok">Cobro automático activado</span> }
            }
          </div>
        }

        <h3 style="margin-top:1rem">Pago único</h3>
        <p class="muted">Tus primeros 2 meses son gratis. Luego elige un plan para seguir activo.</p>
        <div class="grid">
          @for (p of plans(); track p.id) {
            <div class="card stack">
              <h3>{{ p.name }}</h3>
              <strong style="font-size:1.4rem">{{ p.priceCop | number }} COP<span class="muted" style="font-size:.9rem">/mes</span></strong>
              <p class="muted">{{ p.maxStaff }} empleados · {{ p.maxServices }} servicios</p>
              <button class="btn btn-primary" [disabled]="paying()" (click)="pay(p.id)">
                {{ paying() ? 'Redirigiendo…' : 'Pagar con Wompi' }}
              </button>
            </div>
          }
          @if (plans().length === 0) { <p class="muted">No hay planes disponibles.</p> }
        </div>
        @if (payError()) { <p class="error">{{ payError() }}</p> }

        <h3 style="margin-top:1rem">Historial de pagos</h3>
        <div class="stack">
          @for (pay of payments(); track pay.reference) {
            <div class="card row" style="justify-content:space-between">
              <span>{{ pay.createdAt | date:'d MMM y, HH:mm' }} · {{ pay.amountInCents / 100 | number }} COP</span>
              <span class="badge" [class]="pay.status==='approved' ? 'badge-ok' : (pay.status==='pending' ? 'badge-warn':'badge-danger')">{{ pay.status }}</span>
            </div>
          }
          @if (payments().length === 0) { <p class="muted">Sin pagos todavía.</p> }
        </div>
      }

      <!-- AJUSTES -->
      @if (tab()==='settings' && settings(); as s) {
        <div class="card stack" style="max-width:480px">
          <h3>Reglas de reserva</h3>
          <div class="field"><label>Antelación mínima para reservar (min)</label>
            <input class="input" type="number" [ngModel]="s.minLeadMinutes" (ngModelChange)="s.minLeadMinutes = $event" /></div>
          <div class="field"><label>Antelación mínima para cancelar (min)</label>
            <input class="input" type="number" [ngModel]="s.cancelLeadMinutes" (ngModelChange)="s.cancelLeadMinutes = $event" /></div>
          <div class="field"><label>Duración del turno base (min)</label>
            <input class="input" type="number" [ngModel]="s.slotMinutes" (ngModelChange)="s.slotMinutes = $event" /></div>
          <label class="row" style="align-items:center;gap:.4rem"><input type="checkbox" [checked]="s.allowWaitlist" (change)="s.allowWaitlist = !s.allowWaitlist" /> Lista de espera</label>
          <label class="row" style="align-items:center;gap:.4rem"><input type="checkbox" [checked]="s.allowReviews" (change)="s.allowReviews = !s.allowReviews" /> Reseñas</label>
          <label class="row" style="align-items:center;gap:.4rem"><input type="checkbox" [checked]="s.onlinePayment" (change)="s.onlinePayment = !s.onlinePayment" /> Pago en línea</label>
          <button class="btn btn-primary" (click)="saveSettings()">Guardar</button>
          @if (settingsSaved()) { <span class="badge badge-ok">Guardado</span> }
        </div>
      }

      <!-- Branding -->
      @if (tab() === 'branding' && branding(); as b) {
        <div class="card stack" style="max-width:480px">
          <h3>Personaliza tu sitio</h3>
          <div class="row">
            <div class="field"><label>Color principal</label><input class="input" type="color" [(ngModel)]="b.primaryColor" /></div>
            <div class="field"><label>Color secundario</label><input class="input" type="color" [(ngModel)]="b.secondaryColor" /></div>
          </div>
          <div class="field"><label>URL del logo</label><input class="input" [ngModel]="b.logoUrl" (ngModelChange)="b.logoUrl = $event" /></div>
          <div class="field"><label>WhatsApp</label><input class="input" [ngModel]="b.whatsappNumber" (ngModelChange)="b.whatsappNumber = $event" /></div>
          <div class="field"><label>Dirección</label><input class="input" [ngModel]="b.address" (ngModelChange)="b.address = $event" /></div>
          <div class="field"><label>Descripción</label><textarea class="input" [ngModel]="b.about" (ngModelChange)="b.about = $event"></textarea></div>
          <button class="btn btn-primary" (click)="saveBranding()">Guardar</button>
          @if (saved()) { <span class="badge badge-ok">Guardado</span> }
        </div>
      }
    </div>
  `,
  styles: [`
    .topbar { background: var(--brand-primary); padding: 1rem 0; }
    .tabs { display:flex; gap:.5rem; flex-wrap:wrap; }
    .tab { padding:.5rem 1rem; border:1px solid var(--border); background:var(--surface); border-radius:999px; cursor:pointer; }
    .tab.active { background:var(--brand-primary); color:#fff; border-color:var(--brand-primary); }
  `],
})
export class OwnerPanelPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  tabs = [
    { id: 'summary', label: 'Resumen' },
    { id: 'appointments', label: 'Citas' },
    { id: 'services', label: 'Servicios' },
    { id: 'staff', label: 'Empleados' },
    { id: 'loyalty', label: 'Fidelización' },
    { id: 'subscription', label: 'Suscripción' },
    { id: 'branding', label: 'Personalizar' },
    { id: 'settings', label: 'Ajustes' },
  ];
  tab = signal('summary');

  summary = signal<Summary | null>(null);
  services = signal<Service[]>([]);
  staff = signal<StaffRow[]>([]);
  branding = signal<Branding | null>(null);
  settings = signal<Settings | null>(null);
  loyalty = signal<Loyalty | null>(null);
  appts = signal<Appointment[]>([]);
  plans = signal<Plan[]>([]);
  payments = signal<Payment[]>([]);
  sub = signal<SubState | null>(null);
  paying = signal(false);
  payError = signal('');
  autoBusy = signal(false);
  autoError = signal('');
  autoDone = signal(false);
  autoPlanId = '';
  autoEmail = '';
  saved = signal(false);
  settingsSaved = signal(false);
  loyaltySaved = signal(false);
  staffSaved = signal(false);

  svcName = ''; svcDuration = 30; svcPrice = 0;
  stName = ''; stEmail = ''; stPass = '';
  apptDate = new Date().toISOString().slice(0, 10);

  weekdays = [
    { w: 1, name: 'Lunes' }, { w: 2, name: 'Martes' }, { w: 3, name: 'Miércoles' },
    { w: 4, name: 'Jueves' }, { w: 5, name: 'Viernes' }, { w: 6, name: 'Sábado' }, { w: 0, name: 'Domingo' },
  ];

  // Edición de horario/servicios de un empleado concreto.
  editStaff = signal<string | null>(null);
  staffSvc = signal<Set<string>>(new Set());
  dayOn = signal<Record<number, boolean>>({});
  dayStart = signal<Record<number, string>>({});
  dayEnd = signal<Record<number, string>>({});

  ngOnInit(): void {
    this.api.get<Summary>('/tenant/summary').subscribe({ next: (s) => this.summary.set(s) });
    this.api.get<Service[]>('/services').subscribe({ next: (s) => this.services.set(s) });
    this.api.get<StaffRow[]>('/staff').subscribe({ next: (s) => this.staff.set(s) });
    this.api.get<Branding>('/tenant/branding').subscribe({ next: (b) => this.branding.set(b) });
    this.api.get<Settings>('/tenant/settings').subscribe({ next: (s) => this.settings.set(s) });
    this.api.get<Loyalty>('/loyalty/settings').subscribe({ next: (l) => this.loyalty.set(l) });
  }

  selectTab(id: string): void {
    this.tab.set(id);
    if (id === 'appointments') this.loadAppts();
    if (id === 'subscription') this.loadBilling();
  }

  loadBilling(): void {
    this.api.get<Plan[]>('/plans').subscribe({ next: (p) => this.plans.set(p) });
    this.api.get<Payment[]>('/billing/payments').subscribe({ next: (p) => this.payments.set(p) });
    this.api.get<SubState>('/billing/subscription').subscribe({ next: (s) => this.sub.set(s) });
  }

  subLabel(status: string): string {
    return { trial: 'Prueba gratis', active: 'Activa', past_due: 'Pago vencido', cancelled: 'Cancelada' }[status] ?? status;
  }

  /** Carga el widget.js de Wompi una sola vez. */
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

  /**
   * Activa el cobro automático: abre el widget de Wompi para tokenizar la
   * tarjeta y envía el token al backend, que crea la fuente de pago.
   */
  async startAutoRenew(): Promise<void> {
    this.autoError.set('');
    this.autoDone.set(false);
    if (!this.autoPlanId || !this.autoEmail) { this.autoError.set('Elige plan y correo'); return; }
    this.autoBusy.set(true);
    try {
      const acc = await new Promise<AcceptanceResponse>((res, rej) =>
        this.api.get<AcceptanceResponse>('/billing/acceptance').subscribe({ next: res, error: rej }));
      await this.loadWompiWidget();
      if (!window.WidgetCheckout) throw new Error('Widget no disponible');

      const checkout = new window.WidgetCheckout({
        currency: 'COP',
        amountInCents: 0,
        reference: `tok_${Date.now()}`,
        publicKey: acc.publicKey,
        // Operación de tokenización de tarjeta.
        widgetOperation: 'tokenize',
      });
      checkout.open((result) => {
        const token = result?.token;
        if (!token) { this.autoBusy.set(false); this.autoError.set('No se recibió la tarjeta'); return; }
        this.api.post('/billing/auto-renew', { cardToken: token, payerEmail: this.autoEmail, planId: this.autoPlanId })
          .subscribe({
            next: () => { this.autoBusy.set(false); this.autoDone.set(true); this.loadBilling(); },
            error: (e) => { this.autoBusy.set(false); this.autoError.set(e?.error?.error ?? 'No se pudo activar'); },
          });
      });
    } catch (e) {
      this.autoBusy.set(false);
      this.autoError.set(e instanceof Error ? e.message : 'Error al activar el cobro');
    }
  }

  cancelAutoRenew(): void {
    this.api.post('/billing/auto-renew/cancel', {}).subscribe({ next: () => this.loadBilling() });
  }

  /**
   * Crea el checkout en el backend y redirige al Web Checkout de Wompi con los
   * parámetros firmados. Al volver, Wompi notifica al webhook que renueva.
   */
  pay(planId: string): void {
    this.paying.set(true);
    this.payError.set('');
    this.api.post<CheckoutResponse>('/billing/checkout', { planId, periodMonths: 1 }).subscribe({
      next: (c) => {
        const params = new URLSearchParams({
          'public-key': c.publicKey,
          currency: c.currency,
          'amount-in-cents': String(c.amountInCents),
          reference: c.reference,
          'redirect-url': c.redirectUrl,
        });
        if (c.signatureIntegrity) params.set('signature:integrity', c.signatureIntegrity);
        window.location.href = `https://checkout.wompi.co/p/?${params.toString()}`;
      },
      error: (e) => {
        this.paying.set(false);
        this.payError.set(e?.error?.error ?? 'No se pudo iniciar el pago');
      },
    });
  }

  onApptDate(e: Event): void {
    this.apptDate = (e.target as HTMLInputElement).value;
    this.loadAppts();
  }
  loadAppts(): void {
    const from = `${this.apptDate}T00:00:00.000Z`;
    const to = `${this.apptDate}T23:59:59.999Z`;
    this.api.get<Appointment[]>('/tenant/appointments', { from, to }).subscribe({ next: (r) => this.appts.set(r) });
  }

  // --- Edición por empleado ---
  toggleStaffEdit(id: string): void {
    if (this.editStaff() === id) { this.editStaff.set(null); return; }
    this.editStaff.set(id);
    this.staffSvc.set(new Set());
    this.dayOn.set({}); this.dayStart.set({}); this.dayEnd.set({});
  }
  toggleSvc(id: string): void {
    this.staffSvc.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  toggleDay(w: number): void { this.dayOn.update((m) => ({ ...m, [w]: !m[w] })); }
  setDayStart(w: number, e: Event): void { this.dayStart.update((m) => ({ ...m, [w]: (e.target as HTMLInputElement).value })); }
  setDayEnd(w: number, e: Event): void { this.dayEnd.update((m) => ({ ...m, [w]: (e.target as HTMLInputElement).value })); }

  saveStaffServices(id: string): void {
    this.api.put(`/staff/${id}/services`, { serviceIds: [...this.staffSvc()] }).subscribe({
      next: () => this.flashStaffSaved(),
    });
  }
  saveStaffSchedule(id: string): void {
    const slots = this.weekdays
      .filter((d) => this.dayOn()[d.w])
      .map((d) => ({ weekday: d.w, startTime: this.dayStart()[d.w] || '09:00', endTime: this.dayEnd()[d.w] || '18:00' }));
    this.api.put(`/staff/${id}/schedule`, { slots }).subscribe({ next: () => this.flashStaffSaved() });
  }
  private flashStaffSaved(): void { this.staffSaved.set(true); setTimeout(() => this.staffSaved.set(false), 2000); }

  saveSettings(): void {
    const s = this.settings();
    if (!s) return;
    this.api.put('/tenant/settings', s).subscribe({
      next: () => { this.settingsSaved.set(true); setTimeout(() => this.settingsSaved.set(false), 2000); },
    });
  }
  saveLoyalty(): void {
    const l = this.loyalty();
    if (!l) return;
    this.api.put('/loyalty/settings', l).subscribe({
      next: () => { this.loyaltySaved.set(true); setTimeout(() => this.loyaltySaved.set(false), 2000); },
    });
  }

  addService(): void {
    if (!this.svcName) return;
    this.api.post('/services', { name: this.svcName, durationMinutes: this.svcDuration, priceCop: this.svcPrice })
      .subscribe({ next: () => { this.svcName = ''; this.api.get<Service[]>('/services').subscribe({ next: (s) => this.services.set(s) }); } });
  }

  addStaff(): void {
    if (!this.stName || !this.stEmail || !this.stPass) return;
    this.api.post('/staff', { fullName: this.stName, email: this.stEmail, password: this.stPass })
      .subscribe({
        next: () => { this.stName = this.stEmail = this.stPass = ''; this.api.get<StaffRow[]>('/staff').subscribe({ next: (s) => this.staff.set(s) }); },
        error: (e) => alert(e?.error?.error ?? 'Error'),
      });
  }

  saveBranding(): void {
    const b = this.branding();
    if (!b) return;
    this.api.put('/tenant/branding', b).subscribe({ next: () => { this.saved.set(true); setTimeout(() => this.saved.set(false), 2000); } });
  }

  logout(): void { this.auth.logout(); this.router.navigate(['/login']); }
}
