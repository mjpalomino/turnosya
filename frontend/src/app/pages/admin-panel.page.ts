import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import type { Plan, TenantRow } from '../core/models';

interface Metrics { tenants: number; active: number; appts: number; subscriptions: { status: string; n: number }[]; }

/** Panel del superadministrador: métricas, negocios y planes. */
@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <header class="topbar">
      <div class="container row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0;color:#fff">Superadmin · TurnosYa</h2>
        <button class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.4)" (click)="logout()">Salir</button>
      </div>
    </header>

    <div class="container stack">
      <nav class="tabs">
        <button class="tab" [class.active]="tab()==='metrics'" (click)="tab.set('metrics')">Métricas</button>
        <button class="tab" [class.active]="tab()==='tenants'" (click)="tab.set('tenants')">Negocios</button>
        <button class="tab" [class.active]="tab()==='plans'" (click)="tab.set('plans')">Planes</button>
      </nav>

      @if (tab()==='metrics' && metrics(); as m) {
        <div class="grid">
          <div class="card"><h3>{{ m.tenants }}</h3><p class="muted">Negocios</p></div>
          <div class="card"><h3>{{ m.active }}</h3><p class="muted">Activos</p></div>
          <div class="card"><h3>{{ m.appts }}</h3><p class="muted">Citas (30 días)</p></div>
        </div>
        <div class="card">
          <h3>Suscripciones</h3>
          @for (s of m.subscriptions; track s.status) { <div>{{ s.status }}: {{ s.n }}</div> }
        </div>
      }

      @if (tab()==='tenants') {
        <div class="stack">
          @for (t of tenants(); track t.id) {
            <div class="card row" style="justify-content:space-between;align-items:center">
              <div>
                <strong>{{ t.name }}</strong> <span class="muted">/{{ t.slug }}</span>
                <div><span class="badge" [class]="t.status==='active' ? 'badge-ok':'badge-danger'">{{ t.status }}</span>
                  · {{ t.subStatus }} @if (t.planName) { · {{ t.planName }} }
                  @if (t.currentPeriodEnd) { · vence {{ t.currentPeriodEnd | date:'d MMM y' }} }
                </div>
              </div>
              <button class="btn btn-ghost" (click)="toggle(t)">{{ t.status==='active' ? 'Suspender':'Activar' }}</button>
            </div>
          }
        </div>
      }

      @if (tab()==='plans') {
        <div class="card stack" style="max-width:480px">
          <h3>Nuevo plan</h3>
          <input class="input" placeholder="Nombre" [(ngModel)]="pName" />
          <input class="input" type="number" placeholder="Precio COP" [(ngModel)]="pPrice" />
          <div class="row">
            <input class="input" type="number" placeholder="Máx empleados" [(ngModel)]="pStaff" />
            <input class="input" type="number" placeholder="Máx servicios" [(ngModel)]="pServices" />
          </div>
          <button class="btn btn-primary" (click)="addPlan()">Crear plan</button>
        </div>
        <div class="stack">
          @for (p of plans(); track p.id) {
            <div class="card row" style="justify-content:space-between">
              <span><strong>{{ p.name }}</strong> · {{ p.priceCop | number }} COP/mes</span>
              <span class="muted">{{ p.maxStaff }} empleados · {{ p.maxServices }} servicios</span>
            </div>
          }
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
export class AdminPanelPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  tab = signal('metrics');
  metrics = signal<Metrics | null>(null);
  tenants = signal<TenantRow[]>([]);
  plans = signal<Plan[]>([]);

  pName = ''; pPrice = 49000; pStaff = 3; pServices = 20;

  ngOnInit(): void {
    this.api.get<Metrics>('/admin/metrics').subscribe({ next: (m) => this.metrics.set(m) });
    this.api.get<TenantRow[]>('/admin/tenants').subscribe({ next: (t) => this.tenants.set(t) });
    this.api.get<Plan[]>('/admin/plans').subscribe({ next: (p) => this.plans.set(p) });
  }

  toggle(t: TenantRow): void {
    const status = t.status === 'active' ? 'suspended' : 'active';
    this.api.post(`/admin/tenants/${t.id}/status`, { status }).subscribe({
      next: () => this.api.get<TenantRow[]>('/admin/tenants').subscribe({ next: (r) => this.tenants.set(r) }),
    });
  }

  addPlan(): void {
    if (!this.pName) return;
    this.api.post('/admin/plans', {
      name: this.pName, priceCop: this.pPrice, maxStaff: this.pStaff,
      maxBranches: 1, maxServices: this.pServices, features: {}, isActive: true, sortOrder: 0,
    }).subscribe({ next: () => { this.pName = ''; this.api.get<Plan[]>('/admin/plans').subscribe({ next: (p) => this.plans.set(p) }); } });
  }

  logout(): void { this.auth.logout(); this.router.navigate(['/login']); }
}
