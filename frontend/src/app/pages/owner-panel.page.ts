import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { UiIconComponent } from '../ui/icon.component';
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
  imports: [FormsModule, DecimalPipe, DatePipe, UiIconComponent],
  template: `
    <a class="skip-link" href="#main-content">Saltar al contenido</a>
    <header class="topbar">
      <div class="container topbar-inner">
        <div class="topbar-brand"><span class="brand-mark"><app-ui-icon name="calendar-check" /></span><div class="brand-stack"><span class="brand-wordmark">Turnos<span>Ya</span></span><span class="brand-small">Espacio de gestión</span></div></div>
        <div class="topbar-actions"><span class="role-badge">Propietario</span><button class="btn btn-subtle btn-sm" (click)="logout()"><app-ui-icon name="logout" /> Salir</button></div>
      </div>
    </header>
    <main id="main-content" class="container page-shell section-stack">
      <div class="page-hero"><div><span class="eyebrow">Panel del negocio</span><h1>Todo tu negocio, en orden.</h1><p>Gestiona tus citas, equipo y servicios desde un único espacio.</p></div></div>
      <nav class="tabs" aria-label="Secciones del negocio">
        @for (t of tabs; track t.id) {
          <button type="button" class="tab" [class.active]="tab() === t.id" [attr.aria-pressed]="tab() === t.id" (click)="selectTab(t.id)"><app-ui-icon [name]="t.icon" /> {{ t.label }}</button>
        }
      </nav>

      @if (tab() === 'summary') {
        <section aria-labelledby="summary-title" class="section-stack">
          <div class="section-heading"><div><h2 id="summary-title">El negocio de un vistazo</h2><p>Información general de tu operación.</p></div></div>
          @if (summary(); as s) {
            <div class="metric-grid">
              <div class="card metric-card"><span class="metric-icon"><app-ui-icon name="calendar-check" /></span><div class="metric-number">{{ s.today }}</div><span class="metric-label">Citas para hoy</span></div>
              <div class="card metric-card"><span class="metric-icon"><app-ui-icon name="clock" /></span><div class="metric-number">{{ s.upcoming }}</div><span class="metric-label">Próximas citas</span></div>
              <div class="card metric-card"><span class="metric-icon"><app-ui-icon name="users" /></span><div class="metric-number">{{ s.staff }}</div><span class="metric-label">Colaboradores</span></div>
              <div class="card metric-card"><span class="metric-icon"><app-ui-icon name="layers" /></span><div class="metric-number">{{ s.services }}</div><span class="metric-label">Servicios activos</span></div>
            </div>
          } @else { @if (summaryFailed()) { <p class="error" role="alert">No se pudo cargar el resumen del negocio.</p> } @else { <div class="loading-state" role="status"><span class="spinner"></span> Cargando resumen…</div> } }
          <div class="card">
            <div class="panel-head"><div><h3>Accesos rápidos</h3><p class="muted" style="margin-top:.25rem">Ve directamente a las tareas más frecuentes.</p></div></div>
            <div class="quick-links">
              <button class="quick-link" (click)="selectTab('appointments')"><span class="metric-icon"><app-ui-icon name="calendar" /></span><span><strong>Ver citas</strong><small>Consulta las reservas del equipo</small></span><app-ui-icon name="chevron-right" /></button>
              <button class="quick-link" (click)="selectTab('services')"><span class="metric-icon"><app-ui-icon name="layers" /></span><span><strong>Servicios</strong><small>Organiza tu catálogo</small></span><app-ui-icon name="chevron-right" /></button>
              <button class="quick-link" (click)="selectTab('staff')"><span class="metric-icon"><app-ui-icon name="users" /></span><span><strong>Empleados</strong><small>Horarios y colaboradores</small></span><app-ui-icon name="chevron-right" /></button>
            </div>
          </div>
        </section>
      }

      @if (tab() === 'services') {
        <section class="section-stack" aria-labelledby="services-title">
          <div class="section-heading"><div><h2 id="services-title">Servicios</h2><p>Configura lo que pueden reservar tus clientes.</p></div></div>
          <div class="management-grid">
            <div class="card form-stack"><h3>Agregar servicio</h3>
              <div class="field"><label for="svc-name">Nombre del servicio</label><input id="svc-name" class="input" placeholder="Ej. Corte de cabello" [(ngModel)]="svcName" /></div>
              <div class="form-columns">
                <div class="field"><label for="svc-duration">Duración (min)</label><input id="svc-duration" class="input" type="number" min="1" [(ngModel)]="svcDuration" /></div>
                <div class="field"><label for="svc-price">Precio (COP)</label><input id="svc-price" class="input" type="number" min="0" [(ngModel)]="svcPrice" /></div>
              </div>
              <button class="btn btn-primary" (click)="addService()"><app-ui-icon name="plus" /> Agregar servicio</button>
            </div>
            <div class="section-stack"><h3 class="card-title">Servicios registrados <span class="badge badge-neutral">{{ services().length }}</span></h3>
              <div class="record-list">
                @for (sv of services(); track sv.id) {
                  <div class="card record-card"><div class="record-main"><strong class="record-title">{{ sv.name }}</strong><span class="record-meta">{{ sv.durationMinutes }} minutos</span></div><span class="record-title">{{ sv.priceCop | number }} COP</span></div>
                }
                @if (services().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="layers" /></span><h3>Aún sin servicios</h3><p>Agrega tu primer servicio para empezar.</p></div> }
              </div>
            </div>
          </div>
        </section>
      }

      @if (tab() === 'staff') {
        <section class="section-stack" aria-labelledby="staff-title">
          <div class="section-heading"><div><h2 id="staff-title">Tu equipo</h2><p>Administra quién atiende y cuándo está disponible.</p></div></div>
          <div class="card form-stack form-panel"><h3>Agregar empleado</h3>
            <div class="field"><label for="staff-name">Nombre completo</label><input id="staff-name" class="input" [(ngModel)]="stName" autocomplete="off" /></div>
            <div class="field"><label for="staff-email">Correo electrónico</label><input id="staff-email" class="input" type="email" [(ngModel)]="stEmail" autocomplete="off" /></div>
            <div class="field"><label for="staff-pass">Contraseña inicial</label><input id="staff-pass" class="input" type="password" [(ngModel)]="stPass" autocomplete="new-password" /></div>
            <button class="btn btn-primary" (click)="addStaff()"><app-ui-icon name="plus" /> Agregar empleado</button>
          </div>
          <div class="section-heading"><div><h2>Empleados registrados</h2><p>{{ staff().length }} colaboradores.</p></div></div>
          <div class="record-list">
            @for (st of staff(); track st.id) {
              <div class="card stack" style="gap:1.2rem">
                <div class="record-card" style="padding:0;border:0;box-shadow:none">
                  <div class="record-main"><strong class="record-title">{{ st.fullName }}</strong><span class="record-meta">{{ st.email }}</span></div>
                  <button class="btn btn-secondary btn-sm" [attr.aria-expanded]="editStaff() === st.id" (click)="toggleStaffEdit(st.id)">{{ editStaff() === st.id ? 'Cerrar edición' : 'Horario y servicios' }} <app-ui-icon name="chevron-right" /></button>
                </div>
                @if (editStaff() === st.id) {
                  <div class="card-divider"></div>
                  <div class="form-stack">
                    <div class="field"><span class="field-label">Servicios que presta</span>
                      <div class="check-group">
                        @for (sv of services(); track sv.id) {
                          <label class="check-row"><input type="checkbox" [checked]="staffSvc().has(sv.id)" (change)="toggleSvc(sv.id)" /> {{ sv.name }}</label>
                        }
                      </div>
                    </div>
                    <div class="form-actions"><button class="btn btn-secondary btn-sm" (click)="saveStaffServices(st.id)">Guardar servicios</button></div>
                    <div class="card-divider"></div>
                    <div class="field"><span class="field-label">Horario semanal</span><p class="muted">Marca los días de atención y configura las horas de inicio y fin.</p></div>
                    <div class="schedule-list">
                      @for (d of weekdays; track d.w) {
                        <div class="schedule-row">
                          <label class="check-row"><input type="checkbox" [checked]="dayOn()[d.w]" (change)="toggleDay(d.w)" /> {{ d.name }}</label>
                          @if (dayOn()[d.w]) {
                            <div class="field"><label [for]="'start-' + st.id + '-' + d.w">Desde</label><input class="input" [id]="'start-' + st.id + '-' + d.w" type="time" [value]="dayStart()[d.w] || '09:00'" (input)="setDayStart(d.w, $event)" /></div>
                            <div class="field"><label [for]="'end-' + st.id + '-' + d.w">Hasta</label><input class="input" [id]="'end-' + st.id + '-' + d.w" type="time" [value]="dayEnd()[d.w] || '18:00'" (input)="setDayEnd(d.w, $event)" /></div>
                          } @else { <span class="muted">Sin atención</span> }
                        </div>
                      }
                    </div>
                    <div class="form-actions"><button class="btn btn-primary" (click)="saveStaffSchedule(st.id)">Guardar horario</button>@if (staffSaved()) { <span class="badge badge-ok" role="status"><app-ui-icon name="check" /> Guardado</span> }</div>
                  </div>
                }
              </div>
            }
            @if (staff().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="users" /></span><h3>Tu equipo aún está vacío</h3><p>Invita a tu primer colaborador.</p></div> }
          </div>
        </section>
      }

      @if (tab() === 'appointments') {
        <section class="section-stack" aria-labelledby="appts-title">
          <div class="section-heading"><div><h2 id="appts-title">Agenda del equipo</h2><p>Revisa todas las reservas de una fecha.</p></div></div>
          <div class="card" style="max-width:400px"><div class="field"><label for="owner-appt-date">Selecciona el día</label><input id="owner-appt-date" class="input" type="date" [value]="apptDate" (change)="onApptDate($event)" /></div></div>
          <div class="record-list">
            @for (a of appts(); track a.id) {
              <div class="card record-card"><div class="record-main"><strong class="record-title">{{ a.startsAt | date:'HH:mm' }} · {{ a.serviceName }}</strong><span class="record-meta">{{ a.customerName }} · con {{ a.staffName }}</span></div><span class="badge" [class]="a.status==='cancelled' ? 'badge-danger':'badge-ok'">{{ a.status }}</span></div>
            }
            @if (appts().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="calendar" /></span><h3>Sin citas este día</h3><p>Prueba otra fecha para consultar las reservas.</p></div> }
          </div>
        </section>
      }

      @if (tab() === 'loyalty' && loyalty(); as l) {
        <section class="section-stack" aria-labelledby="loyalty-title">
          <div class="section-heading"><div><h2 id="loyalty-title">Programa de fidelización</h2><p>Premia a tus clientes frecuentes con sellos y beneficios.</p></div></div>
          <div class="card form-stack form-panel"><h3>Configuración de premios</h3>
            <label class="check-row"><input type="checkbox" [checked]="l.enabled" (change)="l.enabled = !l.enabled" /> Activar fidelización</label>
            <div class="field"><label for="loyalty-goal">Sellos para el premio</label><input id="loyalty-goal" class="input" type="number" min="1" [ngModel]="l.stickersForReward" (ngModelChange)="l.stickersForReward = $event" /></div>
            <div class="field"><label for="loyalty-reward">Nombre del premio</label><input id="loyalty-reward" class="input" [ngModel]="l.rewardLabel" (ngModelChange)="l.rewardLabel = $event" /></div>
            <div class="field"><label for="loyalty-service">Servicio de regalo (opcional)</label><select id="loyalty-service" class="input" [ngModel]="l.rewardServiceId" (ngModelChange)="l.rewardServiceId = $event"><option [ngValue]="null">— Ninguno —</option>@for (sv of services(); track sv.id) { <option [ngValue]="sv.id">{{ sv.name }}</option> }</select></div>
            <div class="form-actions"><button class="btn btn-primary" (click)="saveLoyalty()">Guardar cambios</button>@if (loyaltySaved()) { <span class="badge badge-ok" role="status"><app-ui-icon name="check" /> Guardado</span> }</div>
          </div>
        </section>
      }

      @if (tab() === 'subscription') {
        <section class="section-stack" aria-labelledby="sub-title">
          <div class="section-heading"><div><h2 id="sub-title">Suscripción y pagos</h2><p>Controla tu plan y el historial de tus pagos.</p></div></div>
          @if (sub(); as sv) {
            <div class="card form-stack" style="max-width:620px">
              <div class="panel-head"><h3>Estado de tu suscripción</h3><span class="badge" [class]="sv.status==='active' || sv.status==='trial' ? 'badge-ok':'badge-danger'">{{ subLabel(sv.status) }}</span></div>
              @if (sv.currentPeriodEnd) { <div class="info-row"><span class="info-label">Fecha de vencimiento</span><strong>{{ sv.currentPeriodEnd | date:'d MMM y' }}</strong></div> }
              <div class="info-row"><span class="info-label">Cobro automático mensual</span><span class="badge" [class]="sv.autoRenew ? 'badge-ok':'badge-warn'">{{ sv.autoRenew ? 'Activo' : 'Inactivo' }}</span></div>
              @if (sv.autoRenew) {
                <p class="muted">Tu plan se renovará automáticamente con la tarjeta guardada{{ sv.payerEmail ? ' (' + sv.payerEmail + ')' : '' }}.</p>
                <div><button class="btn btn-outline-danger" (click)="cancelAutoRenew()">Desactivar cobro automático</button></div>
              } @else {
                <p class="muted">Activa el cobro automático con Wompi para mantener tu suscripción al día.</p>
                <div class="field"><label for="auto-plan">Plan a cobrar</label><select id="auto-plan" class="input" [(ngModel)]="autoPlanId"><option value="">— Elige un plan —</option>@for (p of plans(); track p.id) { <option [value]="p.id">{{ p.name }} · {{ p.priceCop | number }} COP/mes</option> }</select></div>
                <div class="field"><label for="auto-email">Correo para los recibos</label><input id="auto-email" class="input" type="email" [(ngModel)]="autoEmail" autocomplete="email" /></div>
                <div class="form-actions"><button class="btn btn-primary" [disabled]="autoBusy()" [attr.aria-busy]="autoBusy()" (click)="startAutoRenew()">@if (autoBusy()) { <span class="spinner"></span> Abriendo Wompi… } @else { Guardar tarjeta y activar }</button></div>
                @if (autoError()) { <p class="error" role="alert">{{ autoError() }}</p> }
                @if (autoDone()) { <p class="success-message" role="status">Cobro automático activado.</p> }
              }
            </div>
          }
          <div class="section-heading secondary-section"><div><h2>Pago único</h2><p>Tus primeros 2 meses son gratis. Luego elige el plan que mejor se adapte a ti.</p></div></div>
          <div class="grid">
            @for (p of plans(); track p.id) {
              <div class="card plan-card"><h3>{{ p.name }}</h3><div class="plan-price">{{ p.priceCop | number }} <small>COP/mes</small></div><p class="muted">{{ p.maxStaff }} empleados · {{ p.maxServices }} servicios</p><button class="btn btn-primary" [disabled]="paying()" [attr.aria-busy]="paying()" (click)="pay(p.id)">@if (paying()) { <span class="spinner"></span> Redirigiendo… } @else { Pagar con Wompi <app-ui-icon name="arrow-right" /> }</button></div>
            }
            @if (plans().length === 0) { <div class="empty-state"><h3>Sin planes disponibles</h3><p>Vuelve a consultar más adelante.</p></div> }
          </div>
          @if (payError()) { <p class="error" role="alert">{{ payError() }}</p> }
          <div class="section-heading secondary-section"><div><h2>Historial de pagos</h2><p>Consulta los últimos movimientos de tu cuenta.</p></div></div>
          <div class="record-list">
            @for (pay of payments(); track pay.reference) {
              <div class="card record-card"><div class="record-main"><strong class="record-title">{{ pay.amountInCents / 100 | number }} COP</strong><span class="record-meta">{{ pay.createdAt | date:'d MMM y, HH:mm' }}</span></div><span class="badge" [class]="pay.status==='approved' ? 'badge-ok' : (pay.status==='pending' ? 'badge-warn':'badge-danger')">{{ pay.status }}</span></div>
            }
            @if (payments().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="credit-card" /></span><h3>Aún no hay pagos</h3><p>Los pagos aparecerán aquí cuando los realices.</p></div> }
          </div>
        </section>
      }

      @if (tab() === 'settings' && settings(); as s) {
        <section class="section-stack" aria-labelledby="settings-title"><div class="section-heading"><div><h2 id="settings-title">Reglas de reserva</h2><p>Define cómo funciona tu agenda y qué opciones están habilitadas.</p></div></div>
          <div class="card form-stack form-panel"><h3>Configuración general</h3>
            <div class="field"><label for="setting-lead">Antelación mínima para reservar (min)</label><input id="setting-lead" class="input" type="number" min="0" [ngModel]="s.minLeadMinutes" (ngModelChange)="s.minLeadMinutes = $event" /></div>
            <div class="field"><label for="setting-cancel">Antelación mínima para cancelar (min)</label><input id="setting-cancel" class="input" type="number" min="0" [ngModel]="s.cancelLeadMinutes" (ngModelChange)="s.cancelLeadMinutes = $event" /></div>
            <div class="field"><label for="setting-slot">Duración del turno base (min)</label><input id="setting-slot" class="input" type="number" min="1" [ngModel]="s.slotMinutes" (ngModelChange)="s.slotMinutes = $event" /></div>
            <div class="card-divider"></div>
            <div class="field"><span class="field-label">Opciones de reserva</span><div class="form-stack" style="gap:.85rem"><label class="check-row"><input type="checkbox" [checked]="s.allowWaitlist" (change)="s.allowWaitlist = !s.allowWaitlist" /> Lista de espera</label><label class="check-row"><input type="checkbox" [checked]="s.allowReviews" (change)="s.allowReviews = !s.allowReviews" /> Reseñas</label><label class="check-row"><input type="checkbox" [checked]="s.onlinePayment" (change)="s.onlinePayment = !s.onlinePayment" /> Pago en línea</label></div></div>
            <div class="form-actions"><button class="btn btn-primary" (click)="saveSettings()">Guardar cambios</button>@if (settingsSaved()) { <span class="badge badge-ok" role="status"><app-ui-icon name="check" /> Guardado</span> }</div>
          </div>
        </section>
      }

      @if (tab() === 'branding' && branding(); as b) {
        <section class="section-stack" aria-labelledby="branding-title"><div class="section-heading"><div><h2 id="branding-title">Personaliza tu sitio</h2><p>Haz que tu página de reservas refleje la identidad de tu marca.</p></div></div>
          <div class="card form-stack form-panel"><h3>Identidad visual</h3>
            <div class="color-fields"><div class="field"><label for="branding-primary">Color principal</label><input id="branding-primary" class="input" type="color" [(ngModel)]="b.primaryColor" /></div><div class="field"><label for="branding-secondary">Color secundario</label><input id="branding-secondary" class="input" type="color" [(ngModel)]="b.secondaryColor" /></div></div>
            <div class="field"><label for="branding-logo">URL del logo</label><input id="branding-logo" class="input" type="url" [ngModel]="b.logoUrl" (ngModelChange)="b.logoUrl = $event" placeholder="https://ejemplo.com/logo.png" /></div>
            <div class="field"><label for="branding-whatsapp">Número de WhatsApp</label><input id="branding-whatsapp" class="input" type="tel" [ngModel]="b.whatsappNumber" (ngModelChange)="b.whatsappNumber = $event" /></div>
            <div class="field"><label for="branding-address">Dirección</label><input id="branding-address" class="input" [ngModel]="b.address" (ngModelChange)="b.address = $event" /></div>
            <div class="field"><label for="branding-about">Descripción del negocio</label><textarea id="branding-about" class="input" [ngModel]="b.about" (ngModelChange)="b.about = $event"></textarea></div>
            <div class="form-actions"><button class="btn btn-primary" (click)="saveBranding()">Guardar cambios</button>@if (saved()) { <span class="badge badge-ok" role="status"><app-ui-icon name="check" /> Guardado</span> }</div>
          </div>
        </section>
      }
      @if (feedback(); as f) {
        <div class="feedback-toast" [class.feedback-error]="f.type === 'error'" [class.feedback-success]="f.type === 'ok'" [attr.role]="f.type === 'error' ? 'alert' : 'status'">
          <app-ui-icon [name]="f.type === 'error' ? 'alert' : 'check-circle'" />
          <span>{{ f.message }}</span>
          <button type="button" class="feedback-close" aria-label="Cerrar notificación" (click)="feedback.set(null)">×</button>
        </div>
      }
    </main>
  `,
})
export class OwnerPanelPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  tabs = [
    { id: 'summary', label: 'Resumen', icon: 'chart' },
    { id: 'appointments', label: 'Citas', icon: 'calendar' },
    { id: 'services', label: 'Servicios', icon: 'layers' },
    { id: 'staff', label: 'Empleados', icon: 'users' },
    { id: 'loyalty', label: 'Fidelización', icon: 'gift' },
    { id: 'subscription', label: 'Suscripción', icon: 'credit-card' },
    { id: 'branding', label: 'Personalizar', icon: 'palette' },
    { id: 'settings', label: 'Ajustes', icon: 'settings' },
  ];
  tab = signal('summary');
  feedback = signal<{ type: 'error' | 'ok'; message: string } | null>(null);
  summaryFailed = signal(false);

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
    this.api.get<Summary>('/tenant/summary').subscribe({ next: (s) => this.summary.set(s), error: () => this.summaryFailed.set(true) });
    this.api.get<Service[]>('/services').subscribe({ next: (s) => this.services.set(s) });
    this.api.get<StaffRow[]>('/staff').subscribe({ next: (s) => this.staff.set(s) });
    this.api.get<Branding>('/tenant/branding').subscribe({ next: (b) => this.branding.set(b) });
    this.api.get<Settings>('/tenant/settings').subscribe({ next: (s) => this.settings.set(s) });
    this.api.get<Loyalty>('/loyalty/settings').subscribe({ next: (l) => this.loyalty.set(l) });
  }

  selectTab(id: string): void {
    this.tab.set(id);
    this.feedback.set(null);
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
    this.api.post('/billing/auto-renew/cancel', {}).subscribe({
      next: () => { this.loadBilling(); this.notify('Se desactivó el cobro automático.', 'ok'); },
      error: () => this.notify('No se pudo desactivar el cobro automático.'),
    });
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
    this.api.get<Appointment[]>('/tenant/appointments', { from, to }).subscribe({ next: (r) => this.appts.set(r), error: () => this.notify('No se pudieron cargar las citas.') });
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
      error: () => this.notify('No se pudieron guardar los servicios del empleado.'),
    });
  }
  saveStaffSchedule(id: string): void {
    const slots = this.weekdays
      .filter((d) => this.dayOn()[d.w])
      .map((d) => ({ weekday: d.w, startTime: this.dayStart()[d.w] || '09:00', endTime: this.dayEnd()[d.w] || '18:00' }));
    this.api.put(`/staff/${id}/schedule`, { slots }).subscribe({ next: () => this.flashStaffSaved(), error: () => this.notify('No se pudo guardar el horario.') });
  }
  private flashStaffSaved(): void { this.staffSaved.set(true); setTimeout(() => this.staffSaved.set(false), 2000); }

  saveSettings(): void {
    const s = this.settings();
    if (!s) return;
    this.api.put('/tenant/settings', s).subscribe({
      next: () => { this.settingsSaved.set(true); setTimeout(() => this.settingsSaved.set(false), 2000); },
      error: () => this.notify('No se pudieron guardar los ajustes.'),
    });
  }
  saveLoyalty(): void {
    const l = this.loyalty();
    if (!l) return;
    this.api.put('/loyalty/settings', l).subscribe({
      next: () => { this.loyaltySaved.set(true); setTimeout(() => this.loyaltySaved.set(false), 2000); },
      error: () => this.notify('No se pudo guardar la fidelización.'),
    });
  }

  addService(): void {
    if (!this.svcName.trim()) { this.notify('Ingresa el nombre del servicio.'); return; }
    this.api.post('/services', { name: this.svcName, durationMinutes: this.svcDuration, priceCop: this.svcPrice })
      .subscribe({
        next: () => { this.svcName = ''; this.notify('Servicio creado correctamente.', 'ok'); this.api.get<Service[]>('/services').subscribe({ next: (s) => this.services.set(s) }); },
        error: () => this.notify('No se pudo crear el servicio.'),
      });
  }

  addStaff(): void {
    if (!this.stName || !this.stEmail || !this.stPass) { this.notify('Completa los datos del empleado.'); return; }
    this.api.post('/staff', { fullName: this.stName, email: this.stEmail, password: this.stPass })
      .subscribe({
        next: () => { this.stName = this.stEmail = this.stPass = ''; this.notify('Empleado agregado correctamente.', 'ok'); this.api.get<StaffRow[]>('/staff').subscribe({ next: (s) => this.staff.set(s) }); },
        error: (e) => this.notify(e?.error?.error ?? 'No se pudo agregar el empleado.'),
      });
  }

  saveBranding(): void {
    const b = this.branding();
    if (!b) return;
    this.api.put('/tenant/branding', b).subscribe({
      next: () => { this.saved.set(true); setTimeout(() => this.saved.set(false), 2000); },
      error: () => this.notify('No se pudo guardar la personalización.'),
    });
  }

  private notify(message: string, type: 'error' | 'ok' = 'error'): void { this.feedback.set({ message, type }); }

  logout(): void { this.auth.logout(); this.router.navigate(['/login']); }
}
