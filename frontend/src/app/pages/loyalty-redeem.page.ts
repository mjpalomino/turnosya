import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UiIconComponent } from '../ui/icon.component';
import { ApiService } from '../core/api.service';

/**
 * Página a la que llega el cliente tras escanear el QR del empleado.
 * Toma ?t=<token> y lo canjea para sumar un sello.
 */
@Component({
  selector: 'app-loyalty-redeem',
  standalone: true,
  imports: [UiIconComponent],
  template: `
    <main class="container-narrow" style="padding-block:clamp(2.5rem,9vh,6rem)">
      <div class="card stack" style="align-items:center;text-align:center;gap:1rem;padding:2.25rem 1.5rem" aria-live="polite">
        <span class="brand-mark"><app-ui-icon name="gift" /></span>
        <span class="eyebrow">Programa de fidelización</span>
        <h1 style="font-size:1.7rem">Tu tarjeta de sellos</h1>
        @if (state() === 'loading') {
          <div class="loading-state"><span class="spinner" aria-hidden="true"></span> Sumando tu sello…</div>
        }
        @if (state() === 'ok') {
          <div class="booking-done"><app-ui-icon name="check-circle" /> <div><strong>¡Sello sumado!</strong><small>Ya tienes {{ stickers() }} de {{ threshold() }} sellos.</small></div></div>
          @if (rewardReady()) { <p class="badge badge-ok">¡Ya puedes canjear tu premio!</p> }
        }
        @if (state() === 'error') { <p class="error" role="alert">{{ error() }}</p> }
      </div>
    </main>
  `,
})
export class LoyaltyRedeemPage implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  state = signal<'loading' | 'ok' | 'error'>('loading');
  stickers = signal(0);
  threshold = signal(0);
  rewardReady = signal(false);
  error = signal('');

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('t');
    if (!token) { this.state.set('error'); this.error.set('QR inválido'); return; }
    this.api
      .post<{ stickers: number; threshold: number; rewardReady: boolean }>('/loyalty/redeem-token', { token })
      .subscribe({
        next: (r) => {
          this.stickers.set(r.stickers);
          this.threshold.set(r.threshold);
          this.rewardReady.set(r.rewardReady);
          this.state.set('ok');
        },
        error: (e) => {
          this.state.set('error');
          this.error.set(e?.error?.error ?? 'No se pudo sumar el sello. ¿Iniciaste sesión?');
        },
      });
  }
}
