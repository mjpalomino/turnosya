import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ImageUploadComponent } from './image-upload.component';

interface NequiCfg { enabled: boolean; number: string | null; holder: string | null; qrUrl: string | null; planAllows?: boolean; }

/** Configuración de Nequi (número, titular y QR). La usan el superadmin y cada negocio. */
@Component({
  selector: 'app-nequi-settings',
  standalone: true,
  imports: [FormsModule, ImageUploadComponent],
  template: `
    @if (c(); as f) {
      <section class="card form-stack" aria-labelledby="nq-title">
        <div class="panel-head"><div><h3 id="nq-title"><span class="nequi-badge">Nequi</span> {{ title }}</h3><p class="muted">{{ hint }}</p></div></div>
        @if (f.planAllows === false) { <p class="muted">Tu plan no incluye pagos de citas; puedes dejar todo listo y se activa al cambiar de plan.</p> }
        <label class="check-row"><input type="checkbox" [checked]="f.enabled" (change)="f.enabled = !f.enabled" [disabled]="f.planAllows === false" /> Recibir pagos por Nequi</label>
        <div class="form-columns">
          <div class="field"><label for="nq-number">Número Nequi</label><input id="nq-number" class="input" type="tel" inputmode="numeric" [(ngModel)]="f.number" placeholder="300 123 4567" /><span class="input-hint">Celular de 10 dígitos registrado en Nequi.</span></div>
          <div class="field"><label for="nq-holder">Titular de la cuenta</label><input id="nq-holder" class="input" [(ngModel)]="f.holder" maxlength="80" placeholder="Nombre como aparece en Nequi" /></div>
        </div>
        <app-image-upload kind="nequi_qr" label="Código QR de Nequi" hint="Descárgalo en tu app Nequi › Recibir con QR. PNG o JPG."
                          [value]="f.qrUrl" (valueChange)="f.qrUrl = $event" />
        <div class="form-actions-row"><button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save()">Guardar Nequi</button></div>
      </section>
    }
  `,
})
export class NequiSettingsComponent implements OnInit {
  private api = inject(ApiService);
  @Input({ required: true }) endpoint = '';
  @Input() title = 'Cuenta Nequi';
  @Input() hint = 'Quien paga verá tu QR y tu número, y subirá el comprobante para que lo apruebes.';
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();
  c = signal<NequiCfg | null>(null);
  busy = signal(false);

  ngOnInit(): void {
    this.api.get<NequiCfg>(this.endpoint).subscribe({
      next: (c) => this.c.set({ ...c, number: c.number ?? '', holder: c.holder ?? '' }),
      error: () => this.notify.emit({ message: 'No se pudo cargar la configuración de Nequi.', type: 'error' }),
    });
  }

  save(): void {
    const f = this.c();
    if (!f) return;
    this.busy.set(true);
    this.api.put(this.endpoint, { enabled: f.enabled, number: f.number || null, holder: f.holder || null, qrUrl: f.qrUrl || null }).subscribe({
      next: () => { this.busy.set(false); this.notify.emit({ message: 'Nequi guardado.', type: 'ok' }); },
      error: (e) => { this.busy.set(false); this.notify.emit({ message: e?.error?.error ?? 'No se pudo guardar Nequi.', type: 'error' }); },
    });
  }
}
