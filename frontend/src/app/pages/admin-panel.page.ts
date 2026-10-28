import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { UiIconComponent } from '../ui/icon.component';
import type { Plan, TenantRow } from '../core/models';

interface Metrics { tenants: number; active: number; appts: number; subscriptions: { status: string; n: number }[]; }

/** Panel del superadministrador: métricas, negocios y planes. */
@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, UiIconComponent],
  template: `
    <a class="skip-link" href="#main-content">Saltar al contenido</a>
    <header class="topbar"><div class="container topbar-inner">
      <div class="topbar-brand"><span class="brand-mark"><app-ui-icon name="calendar-check" /></span><div class="brand-stack"><span class="brand-wordmark">Turnos<span>Ya</span></span><span class="brand-small">Centro de administración</span></div></div>
      <div class="topbar-actions"><span class="role-badge">Superadministrador</span><button class="btn btn-subtle btn-sm" (click)="logout()"><app-ui-icon name="logout" /> Salir</button></div>
    </div></header>
    <main id="main-content" class="container page-shell section-stack">
      <div class="page-hero"><div><span class="eyebrow">Vista global</span><h1>Administración general.</h1><p>Visibilidad y control de los negocios, suscripciones y planes de la plataforma.</p></div></div>
      <nav class="tabs" aria-label="Secciones de administración">
        <button class="tab" [class.active]="tab()==='metrics'" [attr.aria-pressed]="tab()==='metrics'" (click)="tab.set('metrics')"><app-ui-icon name="chart" /> Métricas</button>
        <button class="tab" [class.active]="tab()==='tenants'" [attr.aria-pressed]="tab()==='tenants'" (click)="tab.set('tenants')"><app-ui-icon name="store" /> Negocios</button>
        <button class="tab" [class.active]="tab()==='plans'" [attr.aria-pressed]="tab()==='plans'" (click)="tab.set('plans')"><app-ui-icon name="credit-card" /> Planes</button>
      </nav>
      @if (tab()==='metrics') {
        <section class="section-stack" aria-labelledby="admin-metrics-title"><div class="section-heading"><div><h2 id="admin-metrics-title">Indicadores de la plataforma</h2><p>Resumen de operación y suscripciones.</p></div></div>
          @if (metrics(); as m) {
            <div class="metric-grid">
              <div class="card metric-card"><span class="metric-icon"><app-ui-icon name="store" /></span><strong class="metric-number">{{ m.tenants }}</strong><span class="metric-label">Negocios registrados</span></div>
              <div class="card metric-card"><span class="metric-icon"><app-ui-icon name="check-circle" /></span><strong class="metric-number">{{ m.active }}</strong><span class="metric-label">Negocios activos</span></div>
              <div class="card metric-card"><span class="metric-icon"><app-ui-icon name="calendar" /></span><strong class="metric-number">{{ m.appts }}</strong><span class="metric-label">Citas en 30 días</span></div>
            </div>
            <div class="card section-stack" style="gap:1rem"><h3>Estado de las suscripciones</h3>
              <div class="subscription-statuses">
                @for (item of m.subscriptions; track item.status) { <div class="subscription-status"><span class="badge badge-neutral">{{ item.status }}</span><strong>{{ item.n }}</strong></div> }
                @if (m.subscriptions.length === 0) { <p class="muted">Sin suscripciones registradas.</p> }
              </div>
            </div>
          } @else { @if (metricsFailed()) { <p class="error" role="alert">No se pudieron cargar los indicadores.</p> } @else { <div class="loading-state" role="status"><span class="spinner"></span> Cargando indicadores…</div> } }
        </section>
      }
      @if (tab()==='tenants') {
        <section class="section-stack" aria-labelledby="tenants-title"><div class="section-heading"><div><h2 id="tenants-title">Negocios registrados</h2><p>Consulta sus datos y administra su estado.</p></div><span class="badge badge-neutral">{{ tenants().length }} negocios</span></div>
          <div class="record-list">
            @for (t of tenants(); track t.id) {
              <div class="card record-card">
                <div class="record-main"><strong class="record-title">{{ t.name }}</strong><span class="record-meta">/sitio/{{ t.slug }}</span><div class="data-pair"><span class="badge" [class]="t.status==='active' ? 'badge-ok':'badge-danger'">{{ t.status==='active' ? 'Activo' : 'Suspendido' }}</span>@if (t.subStatus) { <span class="badge badge-neutral">{{ t.subStatus }}</span> }@if (t.planName) { <span class="record-meta">{{ t.planName }}</span> }@if (t.currentPeriodEnd) { <span class="record-meta">Vence {{ t.currentPeriodEnd | date:'d MMM y' }}</span> }</div></div>
                <div class="record-action"><button class="btn btn-sm" [class.btn-outline-danger]="t.status==='active'" [class.btn-secondary]="t.status!=='active'" (click)="toggle(t)">{{ t.status==='active' ? 'Suspender' : 'Activar' }}</button></div>
              </div>
            }
            @if (tenants().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="store" /></span><h3>Sin negocios registrados</h3><p>Los negocios aparecerán aquí cuando se registren.</p></div> }
          </div>
        </section>
      }
      @if (tab()==='plans') {
        <section class="section-stack" aria-labelledby="plans-title"><div class="section-heading"><div><h2 id="plans-title">Planes comerciales</h2><p>Administra los planes que ofreces a los negocios.</p></div></div>
          <div class="management-grid">
            <div class="card form-stack"><h3>Crear un plan</h3>
              <div class="field"><label for="plan-name">Nombre del plan</label><input id="plan-name" class="input" [(ngModel)]="pName" placeholder="Ej. Profesional" /></div>
              <div class="field"><label for="plan-price">Precio mensual (COP)</label><input id="plan-price" class="input" type="number" min="0" [(ngModel)]="pPrice" /></div>
              <div class="form-columns"><div class="field"><label for="plan-staff">Máx. empleados</label><input id="plan-staff" class="input" type="number" min="1" [(ngModel)]="pStaff" /></div><div class="field"><label for="plan-services">Máx. servicios</label><input id="plan-services" class="input" type="number" min="1" [(ngModel)]="pServices" /></div></div>
              <button class="btn btn-primary" (click)="addPlan()"><app-ui-icon name="plus" /> Crear plan</button>
            </div>
            <div class="section-stack"><h3 class="card-title">Planes registrados <span class="badge badge-neutral">{{ plans().length }}</span></h3>
              <div class="record-list">
                @for (p of plans(); track p.id) {
                  <div class="card record-card"><div class="record-main"><strong class="record-title">{{ p.name }}</strong><span class="record-meta">{{ p.maxStaff }} empleados · {{ p.maxServices }} servicios</span></div><strong class="record-title">{{ p.priceCop | number }} COP<small class="muted">/mes</small></strong></div>
                }
                @if (plans().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="credit-card" /></span><h3>Sin planes creados</h3><p>Crea tu primer plan para comenzar.</p></div> }
              </div>
            </div>
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
export class AdminPanelPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  tab = signal('metrics');
  feedback = signal<{ type: 'error' | 'ok'; message: string } | null>(null);
  metricsFailed = signal(false);
  metrics = signal<Metrics | null>(null);
  tenants = signal<TenantRow[]>([]);
  plans = signal<Plan[]>([]);

  pName = ''; pPrice = 49000; pStaff = 3; pServices = 20;

  ngOnInit(): void {
    this.api.get<Metrics>('/admin/metrics').subscribe({ next: (m) => this.metrics.set(m), error: () => this.metricsFailed.set(true) });
    this.api.get<TenantRow[]>('/admin/tenants').subscribe({ next: (t) => this.tenants.set(t) });
    this.api.get<Plan[]>('/admin/plans').subscribe({ next: (p) => this.plans.set(p) });
  }

  toggle(t: TenantRow): void {
    const status = t.status === 'active' ? 'suspended' : 'active';
    this.api.post(`/admin/tenants/${t.id}/status`, { status }).subscribe({
      next: () => { this.notify('Estado del negocio actualizado.', 'ok'); this.api.get<TenantRow[]>('/admin/tenants').subscribe({ next: (r) => this.tenants.set(r) }); },
      error: () => this.notify('No se pudo actualizar el negocio.'),
    });
  }

  addPlan(): void {
    if (!this.pName.trim()) { this.notify('Ingresa el nombre del plan.'); return; }
    this.api.post('/admin/plans', {
      name: this.pName, priceCop: this.pPrice, maxStaff: this.pStaff,
      maxBranches: 1, maxServices: this.pServices, features: {}, isActive: true, sortOrder: 0,
    }).subscribe({
      next: () => { this.pName = ''; this.notify('Plan creado correctamente.', 'ok'); this.api.get<Plan[]>('/admin/plans').subscribe({ next: (p) => this.plans.set(p) }); },
      error: () => this.notify('No se pudo crear el plan.'),
    });
  }

  private notify(message: string, type: 'error' | 'ok' = 'error'): void { this.feedback.set({ message, type }); }

  logout(): void { this.auth.logout(); this.router.navigate(['/login']); }
}
