import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ApiService } from '../core/api.service';
import { UiIconComponent } from '../ui/icon.component';
import { ProofButtonComponent } from '../ui/proof-button.component';
import { paymentBadge, paymentStatusLabel } from '../core/wompi';

interface ReviewRow {
  id: string; reference: string; status: string; amountCop: number; createdAt: string; payerNote: string | null;
  reviewNote: string | null; hasProof: boolean; startsAt: string; customerName: string; serviceName: string;
}

/** Pagos de citas por Nequi: el dueño revisa el comprobante y aprueba o rechaza. */
@Component({
  selector: 'app-owner-nequi-review',
  standalone: true,
  imports: [DatePipe, DecimalPipe, UiIconComponent, ProofButtonComponent],
  template: `
    <div class="section-heading secondary-section"><div><h2>Pagos por Nequi de tus clientes</h2><p>Revisa el comprobante en tu app Nequi antes de aprobar.</p></div>
      <button type="button" class="btn btn-secondary btn-sm" (click)="load()"><app-ui-icon name="search" /> Actualizar</button></div>
    <div class="record-list">
      @for (r of rows(); track r.id) {
        <div class="card record-card">
          <div class="record-main">
            <strong class="record-title">{{ r.amountCop | number }} COP · {{ r.customerName }}</strong>
            <span class="record-meta">{{ r.serviceName }} · cita {{ r.startsAt | date:'EEE d MMM, h:mm a' }} · enviado {{ r.createdAt | date:'d MMM, HH:mm' }}</span>
            @if (r.payerNote) { <span class="record-meta">“{{ r.payerNote }}”</span> }
            @if (r.reviewNote && r.status !== 'pending') { <span class="record-meta">Revisión: {{ r.reviewNote }}</span> }
          </div>
          <div class="data-pair">
            <span class="badge" [class]="badge(r.status)">{{ r.status === 'pending' ? 'Por revisar' : label(r.status) }}</span>
            @if (r.hasProof) { <app-proof-button [path]="'/payments/tenant/payments/' + r.id + '/proof'" /> }
            @if (r.status === 'pending') {
              <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="review(r, 'approve')">Aprobar</button>
              <button type="button" class="btn btn-outline-danger btn-sm" [disabled]="busy()" (click)="review(r, 'reject')">Rechazar</button>
            }
          </div>
        </div>
      } @empty { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="receipt" /></span><h3>Sin pagos por Nequi</h3><p>Cuando un cliente envíe su comprobante aparecerá aquí.</p></div> }
    </div>
  `,
})
export class OwnerNequiReviewComponent implements OnInit {
  private api = inject(ApiService);
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();
  rows = signal<ReviewRow[]>([]);
  busy = signal(false);

  ngOnInit(): void { this.load(); }
  load(): void { this.api.get<ReviewRow[]>('/payments/tenant/review').subscribe({ next: (r) => this.rows.set(r) }); }

  review(r: ReviewRow, action: 'approve' | 'reject'): void {
    let note: string | null = null;
    if (action === 'reject') {
      note = prompt('Motivo del rechazo (lo verá el cliente):', 'No encontramos el pago en Nequi');
      if (note === null) return;
    } else if (!confirm(`¿Confirmas que recibiste ${r.amountCop.toLocaleString('es-CO')} COP de ${r.customerName} en tu Nequi?`)) return;
    this.busy.set(true);
    this.api.post(`/payments/tenant/payments/${r.id}/${action}`, { note }).subscribe({
      next: () => { this.busy.set(false); this.notify.emit({ message: action === 'approve' ? 'Pago aprobado: la cita quedó pagada.' : 'Pago rechazado; el cliente puede enviar otro comprobante.', type: 'ok' }); this.load(); },
      error: (e) => { this.busy.set(false); this.notify.emit({ message: e?.error?.error ?? 'No se pudo completar la revisión.', type: 'error' }); },
    });
  }
  label = paymentStatusLabel; badge = paymentBadge;
}
