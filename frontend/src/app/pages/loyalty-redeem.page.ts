import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/api.service';

/**
 * Página a la que llega el cliente tras escanear el QR del empleado.
 * Toma ?t=<token> y lo canjea para sumar un sello.
 */
@Component({
  selector: 'app-loyalty-redeem',
  standalone: true,
  template: `
    <div class="container-narrow" style="padding-top:3rem">
      <div class="card stack" style="text-align:center">
        <h2>Fidelización</h2>
        @if (state() === 'loading') { <p class="muted">Sumando tu sello…</p> }
        @if (state() === 'ok') {
          <p class="badge badge-ok">¡Sello sumado!</p>
          <p>Llevas {{ stickers() }} / {{ threshold() }}.</p>
          @if (rewardReady()) { <p class="badge badge-ok">¡Ya puedes canjear tu premio!</p> }
        }
        @if (state() === 'error') { <p class="error">{{ error() }}</p> }
      </div>
    </div>
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
