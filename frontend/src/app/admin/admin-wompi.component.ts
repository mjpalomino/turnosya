import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { UiIconComponent } from '../ui/icon.component';

type Src = 'panel' | 'env' | 'none';
interface WompiState {
  environment: 'test' | 'prod'; publicKey: string | null;
  privateKey: string | null; integritySecret: string | null; eventsSecret: string | null;
  sources: { publicKey: Src; privateKey: Src; integritySecret: Src; eventsSecret: Src };
  webhookUrl: string; ready: { checkout: boolean; autoRenew: boolean; webhook: boolean };
}

/**
 * Pasarela Wompi de la plataforma (cobro de suscripciones). Los secretos se envían
 * una sola vez y se guardan cifrados; el panel solo muestra los últimos 4 caracteres.
 */
@Component({
  selector: 'app-admin-wompi',
  standalone: true,
  imports: [FormsModule, UiIconComponent],
  template: `
    @if (st(); as s) {
      <div class="management-grid">
        <section class="card form-stack" aria-labelledby="wp-title">
          <div class="panel-head"><div><h3 id="wp-title">Credenciales de Wompi</h3><p class="muted">Cuenta con la que la plataforma cobra las suscripciones. Las encuentras en el panel de Wompi › Desarrolladores.</p></div></div>
          <div class="field"><span class="field-label">Ambiente</span>
            <div class="segmented" role="group" aria-label="Ambiente">
              <button type="button" [attr.aria-pressed]="env === 'test'" (click)="env = 'test'">Pruebas (sandbox)</button>
              <button type="button" [attr.aria-pressed]="env === 'prod'" (click)="env = 'prod'">Producción</button>
            </div>
          </div>
          <div class="field"><label for="wp-pub">Llave pública</label><input id="wp-pub" class="input" [(ngModel)]="pub" [placeholder]="'pub_' + env + '_…'" autocomplete="off" spellcheck="false" />
            <span class="secret-state">Actual: {{ s.publicKey || 'sin configurar' }}<span class="source-tag">{{ src(s.sources.publicKey) }}</span></span></div>
          <div class="field"><label for="wp-prv">Llave privada <small class="muted">(cobro automático)</small></label><input id="wp-prv" class="input" type="password" [(ngModel)]="prv" [placeholder]="'prv_' + env + '_…'" autocomplete="new-password" />
            <span class="secret-state">Actual: {{ s.privateKey || 'sin configurar' }}<span class="source-tag">{{ src(s.sources.privateKey) }}</span></span></div>
          <div class="field"><label for="wp-int">Secreto de integridad</label><input id="wp-int" class="input" type="password" [(ngModel)]="integ" [placeholder]="env + '_integrity_…'" autocomplete="new-password" />
            <span class="secret-state">Actual: {{ s.integritySecret || 'sin configurar' }}<span class="source-tag">{{ src(s.sources.integritySecret) }}</span></span></div>
          <div class="field"><label for="wp-ev">Secreto de eventos</label><input id="wp-ev" class="input" type="password" [(ngModel)]="events" [placeholder]="env + '_events_…'" autocomplete="new-password" />
            <span class="secret-state">Actual: {{ s.eventsSecret || 'sin configurar' }}<span class="source-tag">{{ src(s.sources.eventsSecret) }}</span></span></div>
          <p class="muted">Deja vacío un campo para conservar el valor actual. Los secretos nunca se vuelven a mostrar completos.</p>
          <div class="form-actions-row">
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save()">Guardar credenciales</button>
            <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="test()">Probar conexión</button>
          </div>
        </section>
        <aside class="card form-stack" aria-labelledby="wp-status">
          <h3 id="wp-status">Estado</h3>
          <ul class="feature-list">
            <li [class.on]="s.ready.checkout" [class.off]="!s.ready.checkout"><app-ui-icon [name]="s.ready.checkout ? 'check' : 'x'" /> Pagos con Web Checkout</li>
            <li [class.on]="s.ready.autoRenew" [class.off]="!s.ready.autoRenew"><app-ui-icon [name]="s.ready.autoRenew ? 'check' : 'x'" /> Cobro automático con tarjeta guardada</li>
            <li [class.on]="s.ready.webhook" [class.off]="!s.ready.webhook"><app-ui-icon [name]="s.ready.webhook ? 'check' : 'x'" /> Confirmación de pagos (eventos)</li>
          </ul>
          <div class="field"><span class="field-label">URL de eventos para registrar en Wompi</span>
            <div class="code-box"><code style="word-break:break-all">{{ s.webhookUrl }}</code><button type="button" class="btn btn-subtle btn-sm" (click)="copy(s.webhookUrl)"><app-ui-icon name="copy" /> Copiar</button></div></div>
          <p class="muted">“Panel” indica que el valor se guardó aquí; “Servidor” que viene de las variables de entorno del despliegue.</p>
          <p class="muted">Ambiente actual: <strong>{{ s.environment === 'prod' ? 'Producción' : 'Pruebas' }}</strong>. Al pasar a producción cambia las cuatro credenciales.</p>
        </aside>
      </div>
    } @else { <div class="loading-state" role="status"><span class="spinner"></span> Cargando…</div> }
  `,
})
export class AdminWompiComponent implements OnInit {
  private api = inject(ApiService);
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();
  st = signal<WompiState | null>(null);
  busy = signal(false);
  env: 'test' | 'prod' = 'test';
  pub = ''; prv = ''; integ = ''; events = '';

  ngOnInit(): void { this.load(); }
  load(): void {
    this.api.get<WompiState>('/admin/settings/wompi').subscribe({
      next: (s) => { this.st.set(s); this.env = s.environment; },
      error: () => this.notify.emit({ message: 'No se pudo cargar la configuración de Wompi.', type: 'error' }),
    });
  }

  save(): void {
    this.busy.set(true);
    this.api.put('/admin/settings/wompi', {
      environment: this.env, publicKey: this.pub.trim() || undefined, privateKey: this.prv.trim() || undefined,
      integritySecret: this.integ.trim() || undefined, eventsSecret: this.events.trim() || undefined,
    }).subscribe({
      next: () => { this.busy.set(false); this.pub = this.prv = this.integ = this.events = ''; this.notify.emit({ message: 'Credenciales guardadas de forma segura.', type: 'ok' }); this.load(); },
      error: (e) => { this.busy.set(false); this.notify.emit({ message: e?.error?.error ?? 'No se pudieron guardar las credenciales.', type: 'error' }); },
    });
  }

  test(): void {
    this.busy.set(true);
    this.api.post<{ ok: boolean }>('/admin/settings/wompi/test', {}).subscribe({
      next: () => { this.busy.set(false); this.notify.emit({ message: 'Wompi respondió correctamente con la llave pública.', type: 'ok' }); },
      error: (e) => { this.busy.set(false); this.notify.emit({ message: e?.error?.error ?? 'No se pudo conectar con Wompi.', type: 'error' }); },
    });
  }

  copy(text: string): void {
    void navigator.clipboard?.writeText(text).then(() => this.notify.emit({ message: 'URL copiada.', type: 'ok' }));
  }
  src(s: Src): string { return s === 'panel' ? 'Panel' : s === 'env' ? 'Servidor' : 'Falta'; }
}
