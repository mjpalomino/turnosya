import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { UiIconComponent } from '../ui/icon.component';
import type { FeatureDef, Plan } from '../core/models';

interface PlanForm {
  id: string | null; name: string; description: string; priceCop: number;
  maxStaff: number; maxBranches: number; maxServices: number;
  discountQuarterlyPct: number; discountSemiannualPct: number;
  features: Record<string, boolean>; isActive: boolean; sortOrder: number;
}

/** Planes: precio, límites, funcionalidades incluidas y descuentos trimestral/semestral. */
@Component({
  selector: 'app-admin-plans',
  standalone: true,
  imports: [FormsModule, DecimalPipe, UiIconComponent],
  template: `
    <div class="management-grid">
      <section class="card form-stack" aria-labelledby="plan-form-title">
        <div class="panel-head"><div><h3 id="plan-form-title">{{ f.id ? 'Editar plan' : 'Crear un plan' }}</h3><p class="muted">Lo que defines aquí se aplica a todos los negocios suscritos a este plan.</p></div></div>
        <div class="form-columns">
          <div class="field"><label for="pl-name">Nombre</label><input id="pl-name" class="input" [(ngModel)]="f.name" maxlength="60" placeholder="Ej. Profesional" /></div>
          <div class="field"><label for="pl-price">Precio mensual (COP)</label><input id="pl-price" class="input" type="number" min="0" [(ngModel)]="f.priceCop" /></div>
        </div>
        <div class="field"><label for="pl-desc">Descripción comercial</label><input id="pl-desc" class="input" [(ngModel)]="f.description" maxlength="300" placeholder="Para quién es este plan" /></div>
        <div class="form-columns">
          <div class="field"><label for="pl-staff">Máx. empleados activos</label><input id="pl-staff" class="input" type="number" min="0" [(ngModel)]="f.maxStaff" /></div>
          <div class="field"><label for="pl-services">Máx. servicios activos</label><input id="pl-services" class="input" type="number" min="1" [(ngModel)]="f.maxServices" /></div>
        </div>
        <div class="form-columns">
          <div class="field"><label for="pl-branches">Máx. sedes</label><input id="pl-branches" class="input" type="number" min="1" [(ngModel)]="f.maxBranches" /></div>
          <div class="field"><label for="pl-order">Orden en la lista</label><input id="pl-order" class="input" type="number" [(ngModel)]="f.sortOrder" /></div>
        </div>
        <div class="card-divider"></div>
        <div class="field"><span class="field-label">Descuentos por pago anticipado</span><p class="muted">Se aplican al pagar varios meses juntos.</p></div>
        <div class="form-columns">
          <div class="field"><label for="pl-q">Trimestral (%)</label><input id="pl-q" class="input" type="number" min="0" max="90" step="0.5" [(ngModel)]="f.discountQuarterlyPct" /><span class="input-hint">3 meses: {{ total(3) | number }} COP</span></div>
          <div class="field"><label for="pl-s">Semestral (%)</label><input id="pl-s" class="input" type="number" min="0" max="90" step="0.5" [(ngModel)]="f.discountSemiannualPct" /><span class="input-hint">6 meses: {{ total(6) | number }} COP</span></div>
        </div>
        <div class="card-divider"></div>
        <div class="field"><span class="field-label">Funcionalidades incluidas</span>
          <div class="feature-checks">
            @for (ft of catalog(); track ft.key) {
              <label class="check-row"><input type="checkbox" [checked]="!!f.features[ft.key]" (change)="f.features[ft.key] = !f.features[ft.key]" /> {{ ft.label }}</label>
            }
          </div>
          <span class="input-hint">Durante la prueba gratis los negocios tienen todas las funcionalidades.</span>
        </div>
        <label class="check-row"><input type="checkbox" [checked]="f.isActive" (change)="f.isActive = !f.isActive" /> Plan visible para nuevos pagos</label>
        <div class="form-actions-row">
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save()"><app-ui-icon [name]="f.id ? 'check' : 'plus'" /> {{ f.id ? 'Guardar cambios' : 'Crear plan' }}</button>
          @if (f.id) { <button type="button" class="btn btn-subtle" (click)="reset()">Cancelar edición</button> }
        </div>
      </section>

      <div class="section-stack"><h3 class="card-title">Planes registrados <span class="badge badge-neutral">{{ plans().length }}</span></h3>
        <div class="record-list">
          @for (p of plans(); track p.id) {
            <div class="card plan-card" [class.current]="f.id === p.id">
              <div class="panel-head"><div><h3>{{ p.name }}</h3>@if (p.description) { <p class="muted">{{ p.description }}</p> }</div>
                <span class="badge" [class]="p.isActive ? 'badge-ok' : 'badge-neutral'">{{ p.isActive ? 'Activo' : 'Oculto' }}</span></div>
              <div class="plan-price">{{ p.priceCop | number }} <small>COP/mes</small></div>
              <p class="muted">{{ p.maxStaff }} empleados · {{ p.maxServices }} servicios · {{ p.maxBranches }} sede(s) · {{ p.subscribers ?? 0 }} suscriptores</p>
              <div class="data-pair">
                @if (p.discountQuarterlyPct) { <span class="badge badge-ok"><app-ui-icon name="percent" /> Trimestral −{{ p.discountQuarterlyPct }}%</span> }
                @if (p.discountSemiannualPct) { <span class="badge badge-ok"><app-ui-icon name="percent" /> Semestral −{{ p.discountSemiannualPct }}%</span> }
              </div>
              <ul class="feature-list">
                @for (ft of catalog(); track ft.key) {
                  <li [class.on]="p.features[ft.key] === true" [class.off]="p.features[ft.key] !== true"><app-ui-icon [name]="p.features[ft.key] === true ? 'check' : 'x'" /> {{ ft.label }}</li>
                }
              </ul>
              <button type="button" class="btn btn-secondary btn-sm" (click)="edit(p)">Editar plan</button>
            </div>
          } @empty { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="credit-card" /></span><h3>Sin planes creados</h3><p>Crea tu primer plan para comenzar.</p></div> }
        </div>
      </div>
    </div>
  `,
})
export class AdminPlansComponent implements OnInit {
  private api = inject(ApiService);
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();
  plans = signal<Plan[]>([]);
  catalog = signal<FeatureDef[]>([]);
  busy = signal(false);
  f: PlanForm = this.blank();

  ngOnInit(): void {
    this.api.get<FeatureDef[]>('/admin/plan-features').subscribe({ next: (c) => { this.catalog.set(c); if (!this.f.id) this.f = this.blank(); } });
    this.load();
  }

  load(): void { this.api.get<Plan[]>('/admin/plans').subscribe({ next: (p) => this.plans.set(p) }); }

  blank(): PlanForm {
    const features: Record<string, boolean> = {};
    for (const c of this.catalog?.() ?? []) features[c.key] = ['waitlist', 'reviews', 'loyalty', 'reminders', 'staff_photos'].includes(c.key);
    return { id: null, name: '', description: '', priceCop: 49000, maxStaff: 3, maxBranches: 1, maxServices: 20,
      discountQuarterlyPct: 5, discountSemiannualPct: 10, features, isActive: true, sortOrder: 0 };
  }

  reset(): void { this.f = this.blank(); }

  edit(p: Plan): void {
    const features: Record<string, boolean> = {};
    for (const c of this.catalog()) features[c.key] = p.features[c.key] === true;
    this.f = { id: p.id, name: p.name, description: p.description ?? '', priceCop: p.priceCop, maxStaff: p.maxStaff,
      maxBranches: p.maxBranches, maxServices: p.maxServices, discountQuarterlyPct: p.discountQuarterlyPct ?? 0,
      discountSemiannualPct: p.discountSemiannualPct ?? 0, features, isActive: p.isActive, sortOrder: p.sortOrder };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  total(months: 3 | 6): number {
    const pct = months === 3 ? Number(this.f.discountQuarterlyPct) || 0 : Number(this.f.discountSemiannualPct) || 0;
    const base = (Number(this.f.priceCop) || 0) * months;
    return Math.round(base - (base * pct) / 100);
  }

  save(): void {
    if (!this.f.name.trim()) { this.notify.emit({ message: 'Ingresa el nombre del plan.', type: 'error' }); return; }
    const body = {
      name: this.f.name.trim(), description: this.f.description.trim() || null,
      priceCop: Number(this.f.priceCop), maxStaff: Number(this.f.maxStaff), maxBranches: Number(this.f.maxBranches),
      maxServices: Number(this.f.maxServices), features: this.f.features, isActive: this.f.isActive,
      sortOrder: Number(this.f.sortOrder) || 0,
      discountQuarterlyPct: Number(this.f.discountQuarterlyPct) || 0, discountSemiannualPct: Number(this.f.discountSemiannualPct) || 0,
    };
    this.busy.set(true);
    const req = this.f.id ? this.api.put(`/admin/plans/${this.f.id}`, body) : this.api.post('/admin/plans', body);
    req.subscribe({
      next: () => { this.busy.set(false); this.notify.emit({ message: this.f.id ? 'Plan actualizado.' : 'Plan creado.', type: 'ok' }); this.reset(); this.load(); },
      error: (e) => { this.busy.set(false); this.notify.emit({ message: e?.error?.error ?? 'No se pudo guardar el plan. Revisa los valores.', type: 'error' }); },
    });
  }
}
