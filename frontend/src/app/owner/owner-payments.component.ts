import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { UiIconComponent } from '../ui/icon.component';

interface TenantWompi {
  enabled: boolean; environment: 'test' | 'prod'; publicKey: string | null;
  integritySecret: string | null; eventsSecret: string | null;
  chargeMode: 'full' | 'deposit'; depositPct: number; ready: boolean; planAllows: boolean; webhookUrl: string;
}

/**
 * Pagos en línea del micrositio: el negocio conecta SU cuenta Wompi y decide si
 * cobra el valor completo de la cita o un anticipo. El dinero llega directo a su cuenta.
 */
@Component({
  selector: 'app-owner-payments',
  standalone: true,
  imports: [FormsModule, UiIconComponent],
  template: `
    @if (w(); as s) {
      @if (!s.planAllows) {
        <div class="welcome-banner" role="status"><app-ui-icon name="info" /><div><strong>Tu plan no incluye pagos en línea.</strong><p>Puedes dejar todo configurado; se activan al cambiar a un plan que los incluya.</p></div></div>
      }
      <div class="management-grid">
        <section class="card form-stack" aria-labelledby="tw-title">
          <div class="panel-head"><div><h3 id="tw-title">Tu cuenta Wompi</h3><p class="muted">Crea tu cuenta en wompi.com y copia las llaves desde Desarrolladores. Tus clientes pagan y el dinero llega directo a ti.</p></div></div>
          <label class="check-row"><input type="checkbox" [checked]="enabled" (change)="enabled = !enabled" [disabled]="!s.planAllows" /> Recibir pagos en línea en mi página</label>
          <div class="field"><span class="field-label">Ambiente</span>
            <div class="segmented" role="group" aria-label="Ambiente">
              <button type="button" [attr.aria-pressed]="env === 'test'" (click)="env = 'test'">Pruebas</button>
              <button type="button" [attr.aria-pressed]="env === 'prod'" (click)="env = 'prod'">Producción</button>
            </div>
          </div>
          <div class="field"><label for="tw-pub">Llave pública</label><input id="tw-pub" class="input" [(ngModel)]="pub" [placeholder]="'pub_' + env + '_…'" autocomplete="off" spellcheck="false" /></div>
          <div class="field"><label for="tw-int">Secreto de integridad</label><input id="tw-int" class="input" type="password" [(ngModel)]="integ" [placeholder]="s.integritySecret ? 'Guardado ' + s.integritySecret + ' · escribe para cambiarlo' : env + '_integrity_…'" autocomplete="new-password" /></div>
          <div class="field"><label for="tw-ev">Secreto de eventos</label><input id="tw-ev" class="input" type="password" [(ngModel)]="events" [placeholder]="s.eventsSecret ? 'Guardado ' + s.eventsSecret + ' · escribe para cambiarlo' : env + '_events_…'" autocomplete="new-password" /><span class="input-hint">Necesario para que las citas se marquen como pagadas automáticamente.</span></div>
          <div class="card-divider"></div>
          <div class="field"><span class="field-label">¿Cuánto cobrar al reservar? <small class="muted">(aplica a Wompi y a Nequi)</small></span>
            <div class="segmented" role="group" aria-label="Modo de cobro">
              <button type="button" [attr.aria-pressed]="mode === 'full'" (click)="mode = 'full'">Valor completo</button>
              <button type="button" [attr.aria-pressed]="mode === 'deposit'" (click)="mode = 'deposit'">Anticipo</button>
            </div>
          </div>
          @if (mode === 'deposit') { <div class="field" style="max-width:220px"><label for="tw-dep">Porcentaje del anticipo</label><input id="tw-dep" class="input" type="number" min="1" max="100" [(ngModel)]="deposit" /></div> }
          <div class="form-actions-row"><button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save()">Guardar</button></div>
        </section>
        <aside class="card form-stack">
          <h3>Estado</h3>
          <span class="badge" [class]="s.ready && s.planAllows ? 'badge-ok' : 'badge-warn'">{{ s.ready && s.planAllows ? 'Tus clientes ya pueden pagar en línea' : 'Pagos en línea inactivos' }}</span>
          <div class="field"><span class="field-label">URL de eventos (pégala en Wompi › Desarrolladores › Eventos)</span>
            <div class="code-box"><code style="word-break:break-all">{{ s.webhookUrl }}</code><button type="button" class="btn btn-subtle btn-sm" (click)="copy(s.webhookUrl)"><app-ui-icon name="copy" /> Copiar</button></div></div>
          <p class="muted">Tus secretos se guardan cifrados y nunca se muestran completos.</p>
        </aside>
      </div>
    } @else { <div class="loading-state" role="status"><span class="spinner"></span> Cargando…</div> }
  `,
})
export class OwnerPaymentsComponent implements OnInit {
  private api = inject(ApiService);
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();
  w = signal<TenantWompi | null>(null);
  busy = signal(false);
  enabled = false; env: 'test' | 'prod' = 'test'; pub = ''; integ = ''; events = '';
  mode: 'full' | 'deposit' = 'full'; deposit = 30;

  ngOnInit(): void { this.load(); }
  load(): void {
    this.api.get<TenantWompi>('/payments/tenant/wompi').subscribe({
      next: (s) => { this.w.set(s); this.enabled = s.enabled; this.env = s.environment; this.pub = s.publicKey ?? ''; this.mode = s.chargeMode; this.deposit = s.depositPct; this.integ = this.events = ''; },
      error: () => this.notify.emit({ message: 'No se pudo cargar la configuración de pagos.', type: 'error' }),
    });
  }

  save(): void {
    this.busy.set(true);
    this.api.put('/payments/tenant/wompi', {
      enabled: this.enabled, environment: this.env, publicKey: this.pub.trim() || null,
      integritySecret: this.integ.trim() || undefined, eventsSecret: this.events.trim() || undefined,
      chargeMode: this.mode, depositPct: Number(this.deposit) || 30,
    }).subscribe({
      next: () => { this.busy.set(false); this.notify.emit({ message: 'Configuración de pagos guardada.', type: 'ok' }); this.load(); },
      error: (e) => { this.busy.set(false); this.notify.emit({ message: e?.error?.error ?? 'No se pudo guardar.', type: 'error' }); },
    });
  }

  copy(text: string): void { void navigator.clipboard?.writeText(text).then(() => this.notify.emit({ message: 'URL copiada.', type: 'ok' })); }
}
