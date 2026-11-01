import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { UiIconComponent } from '../ui/icon.component';
import { BrandLockupComponent } from '../ui/brand-lockup.component';
import { PlatformBrandComponent } from '../admin/platform-brand.component';
import { AdminBillingComponent } from '../admin/admin-billing.component';
import { AdminPlansComponent } from '../admin/admin-plans.component';
import { AdminReferralsComponent } from '../admin/admin-referrals.component';
import { AdminContactComponent } from '../admin/admin-contact.component';
import { AdminWompiComponent } from '../admin/admin-wompi.component';
import type { TenantRow } from '../core/models';

interface Metrics { tenants: number; active: number; appts: number; subscriptions: { status: string; n: number }[]; }

/** Panel del superadministrador: métricas, negocios y planes. */
@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [FormsModule, DatePipe, UiIconComponent, BrandLockupComponent, RouterLink, PlatformBrandComponent,
    AdminBillingComponent, AdminPlansComponent, AdminReferralsComponent, AdminContactComponent, AdminWompiComponent],
  template: `
    <a class="skip-link" href="#main-content">Saltar al contenido</a>
    <header class="topbar"><div class="container topbar-inner">
      <a routerLink="/" class="topbar-brand" aria-label="Ir al inicio"><app-brand-lockup subtitle="Centro de administración" /></a>
      <div class="topbar-actions"><span class="role-badge">Superadministrador</span><button class="btn btn-subtle btn-sm" (click)="logout()"><app-ui-icon name="logout" /> Salir</button></div>
    </div></header>
    <main id="main-content" class="container page-shell section-stack">
      <div class="page-hero"><div><span class="eyebrow">Vista global</span><h1>Administración general.</h1><p>Visibilidad y control de los negocios, suscripciones y planes de la plataforma.</p></div></div>
      <nav class="tabs" aria-label="Secciones de administración">
        @for (t of tabs; track t.id) {
          <button class="tab" [class.active]="tab()===t.id" [attr.aria-pressed]="tab()===t.id" (click)="selectTab(t.id)"><app-ui-icon [name]="t.icon" /> {{ t.label }}</button>
        }
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
                <div class="record-main"><strong class="record-title">{{ t.name }}</strong><a class="record-meta" [href]="'/' + t.slug" target="_blank" rel="noopener noreferrer">/{{ t.slug }} <app-ui-icon name="external" /></a>@if (t.categoryName || t.city) { <span class="record-meta">{{ t.categoryName || 'Sin categoría' }}@if (t.city) { · {{ t.city }} }</span> }@if (t.isListed === false) { <span class="badge badge-warn">Oculto en directorio</span> }<div class="data-pair"><span class="badge" [class]="t.status==='active' ? 'badge-ok':'badge-danger'">{{ t.status==='active' ? 'Activo' : 'Suspendido' }}</span>@if (t.subStatus) { <span class="badge badge-neutral">{{ t.subStatus }}</span> }@if (t.planName) { <span class="record-meta">{{ t.planName }}</span> }@if (t.currentPeriodEnd) { <span class="record-meta">Vence {{ t.currentPeriodEnd | date:'d MMM y' }}</span> }</div></div>
                <div class="record-action"><button class="btn btn-sm" [class.btn-outline-danger]="t.status==='active'" [class.btn-secondary]="t.status!=='active'" (click)="toggle(t)">{{ t.status==='active' ? 'Suspender' : 'Activar' }}</button></div>
              </div>
            }
            @if (tenants().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="store" /></span><h3>Sin negocios registrados</h3><p>Los negocios aparecerán aquí cuando se registren.</p></div> }
          </div>
        </section>
      }
      @if (tab()==='billing') {
        <section class="section-stack" aria-labelledby="billing-title"><div class="section-heading"><div><h2 id="billing-title">Suscripciones y pagos</h2><p>Recaudo, renovaciones, pagos y ajustes de cada negocio.</p></div></div>
          <app-admin-billing (notify)="notify($event.message, $event.type)" />
        </section>
      }
      @if (tab()==='plans') {
        <section class="section-stack" aria-labelledby="plans-title"><div class="section-heading"><div><h2 id="plans-title">Planes comerciales</h2><p>Precio, límites, funcionalidades y descuentos trimestral y semestral.</p></div></div>
          <app-admin-plans (notify)="notify($event.message, $event.type)" />
        </section>
      }
      @if (tab()==='referrals') {
        <section class="section-stack" aria-labelledby="ref-section-title"><div class="section-heading"><div><h2 id="ref-section-title">Referidos</h2><p>Descuentos por códigos de negocios suscritos activos.</p></div></div>
          <app-admin-referrals (notify)="notify($event.message, $event.type)" />
        </section>
      }
      @if (tab()==='contact') {
        <section class="section-stack" aria-labelledby="contact-title"><div class="section-heading"><div><h2 id="contact-title">Contacto</h2><p>Datos de contacto del sitio principal.</p></div></div>
          <app-admin-contact (notify)="notify($event.message, $event.type)" />
        </section>
      }
      @if (tab()==='wompi') {
        <section class="section-stack" aria-labelledby="wompi-title"><div class="section-heading"><div><h2 id="wompi-title">Pasarela de pagos</h2><p>Configuración de Wompi para cobrar las suscripciones.</p></div></div>
          <app-admin-wompi (notify)="notify($event.message, $event.type)" />
        </section>
      }
      @if (tab()==='brand') {
        <section class="section-stack" aria-labelledby="brand-title"><div class="section-heading"><div><h2 id="brand-title">Marca de la plataforma</h2><p>Logo, nombre y colores que ven todos los usuarios.</p></div></div>
          <app-platform-brand (notify)="notify($event.message, $event.type)" />
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

  tabs = [
    { id: 'metrics', label: 'Métricas', icon: 'chart' },
    { id: 'billing', label: 'Suscripciones y pagos', icon: 'wallet' },
    { id: 'tenants', label: 'Negocios', icon: 'store' },
    { id: 'plans', label: 'Planes', icon: 'credit-card' },
    { id: 'referrals', label: 'Referidos', icon: 'gift' },
    { id: 'contact', label: 'Contacto', icon: 'phone' },
    { id: 'wompi', label: 'Pasarela', icon: 'shield' },
    { id: 'brand', label: 'Marca', icon: 'palette' },
  ];
  tab = signal('metrics');
  feedback = signal<{ type: 'error' | 'ok'; message: string } | null>(null);
  metricsFailed = signal(false);
  metrics = signal<Metrics | null>(null);
  tenants = signal<TenantRow[]>([]);

  ngOnInit(): void {
    this.api.get<Metrics>('/admin/metrics').subscribe({ next: (m) => this.metrics.set(m), error: () => this.metricsFailed.set(true) });
    this.api.get<TenantRow[]>('/admin/tenants').subscribe({ next: (t) => this.tenants.set(t) });
  }

  selectTab(id: string): void { this.tab.set(id); this.feedback.set(null); }

  toggle(t: TenantRow): void {
    const status = t.status === 'active' ? 'suspended' : 'active';
    this.api.post(`/admin/tenants/${t.id}/status`, { status }).subscribe({
      next: () => { this.notify('Estado del negocio actualizado.', 'ok'); this.api.get<TenantRow[]>('/admin/tenants').subscribe({ next: (r) => this.tenants.set(r) }); },
      error: () => this.notify('No se pudo actualizar el negocio.'),
    });
  }

  notify(message: string, type: 'error' | 'ok' = 'error'): void { this.feedback.set({ message, type }); }

  logout(): void { this.auth.logout(); this.router.navigate(['/']); }
}
