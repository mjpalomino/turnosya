import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';

interface ReferralSettings { enabled: boolean; referralDiscountPct: number; referrerRewardPct: number; }
interface ReferralRow {
  id: string; code: string; status: 'pending' | 'converted' | 'rewarded' | 'void';
  createdAt: string; discountPct: number; rewardPct: number; referrerName: string; referredName: string;
}

/** Programa de referidos entre negocios suscritos: reglas y seguimiento. */
@Component({
  selector: 'app-admin-referrals',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="management-grid">
      @if (s(); as st) {
        <section class="card form-stack" aria-labelledby="ref-title">
          <div class="panel-head"><div><h3 id="ref-title">Reglas del programa</h3><p class="muted">Cada negocio con suscripción activa tiene un código. Quien lo usa al registrarse obtiene un descuento en su primer pago y quien lo compartió, una recompensa en su siguiente pago.</p></div></div>
          <label class="check-row"><input type="checkbox" [checked]="st.enabled" (change)="st.enabled = !st.enabled" /> Programa de referidos activo</label>
          <div class="form-columns">
            <div class="field"><label for="ref-new">Descuento para el negocio nuevo (%)</label><input id="ref-new" class="input" type="number" min="0" max="90" [(ngModel)]="st.referralDiscountPct" /><span class="input-hint">Se aplica a su primer pago.</span></div>
            <div class="field"><label for="ref-reward">Recompensa para quien refiere (%)</label><input id="ref-reward" class="input" type="number" min="0" max="90" [(ngModel)]="st.referrerRewardPct" /><span class="input-hint">Una recompensa por cada referido que pague, en su siguiente cobro.</span></div>
          </div>
          <div class="form-actions-row"><button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save()">Guardar reglas</button></div>
          <p class="muted">Los cambios aplican a los nuevos referidos; los ya registrados conservan sus porcentajes.</p>
        </section>
      }
      <section class="section-stack">
        <h3 class="card-title">Referidos <span class="badge badge-neutral">{{ rows().length }}</span></h3>
        <div class="table-wrap">
          <table class="data-table" style="min-width:560px">
            <thead><tr><th>Fecha</th><th>Refirió</th><th>Negocio nuevo</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr>
                  <td>{{ r.createdAt | date:'d MMM y' }}<span class="cell-sub">{{ r.code }}</span></td>
                  <td>{{ r.referrerName }}<span class="cell-sub">Recompensa {{ r.rewardPct }}%</span></td>
                  <td>{{ r.referredName }}<span class="cell-sub">Descuento {{ r.discountPct }}%</span></td>
                  <td><span class="badge" [class]="badge(r.status)">{{ label(r.status) }}</span></td>
                  <td>@if (r.status === 'pending' || r.status === 'converted') { <button type="button" class="btn btn-subtle btn-sm" (click)="voidRow(r)">Anular</button> }</td>
                </tr>
              } @empty { <tr><td colspan="5" class="muted">Aún no hay referidos.</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
})
export class AdminReferralsComponent implements OnInit {
  private api = inject(ApiService);
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();
  s = signal<ReferralSettings | null>(null);
  rows = signal<ReferralRow[]>([]);
  busy = signal(false);

  ngOnInit(): void {
    this.api.get<ReferralSettings>('/admin/settings/referrals').subscribe({ next: (s) => this.s.set(s) });
    this.load();
  }
  load(): void { this.api.get<ReferralRow[]>('/admin/referrals').subscribe({ next: (r) => this.rows.set(r) }); }

  save(): void {
    const s = this.s();
    if (!s) return;
    this.busy.set(true);
    this.api.put('/admin/settings/referrals', { enabled: s.enabled, referralDiscountPct: Number(s.referralDiscountPct) || 0, referrerRewardPct: Number(s.referrerRewardPct) || 0 }).subscribe({
      next: () => { this.busy.set(false); this.notify.emit({ message: 'Reglas de referidos guardadas.', type: 'ok' }); },
      error: (e) => { this.busy.set(false); this.notify.emit({ message: e?.error?.error ?? 'Revisa los porcentajes (0 a 90).', type: 'error' }); },
    });
  }

  voidRow(r: ReferralRow): void {
    if (!confirm(`¿Anular el referido de ${r.referredName}? Se pierde el descuento o la recompensa pendiente.`)) return;
    this.api.post(`/admin/referrals/${r.id}/void`, {}).subscribe({
      next: () => { this.notify.emit({ message: 'Referido anulado.', type: 'ok' }); this.load(); },
      error: (e) => this.notify.emit({ message: e?.error?.error ?? 'No se pudo anular.', type: 'error' }),
    });
  }

  label(s: string): string { return ({ pending: 'Sin pago aún', converted: 'Pagó · recompensa disponible', rewarded: 'Recompensa usada', void: 'Anulado' } as Record<string, string>)[s] ?? s; }
  badge(s: string): string { return s === 'converted' ? 'badge-ok' : s === 'rewarded' ? 'badge-neutral' : s === 'void' ? 'badge-danger' : 'badge-warn'; }
}
