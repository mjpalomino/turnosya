import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { prepareImage } from '../core/image.util';
import { UiIconComponent } from './icon.component';

/**
 * Pago por Nequi: muestra el QR, el número y el valor; quien paga sube la captura
 * del comprobante. Emite { proofDataUrl, note } para que el padre lo envíe al API.
 */
@Component({
  selector: 'app-nequi-pay',
  standalone: true,
  imports: [DecimalPipe, FormsModule, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nequi-pay">
      <div class="nequi-head"><span class="nequi-badge">Nequi</span><strong>Paga {{ amountCop | number }} COP</strong></div>
      <div class="nequi-body">
        @if (qrUrl) { <img class="nequi-qr" [src]="qrUrl" alt="Código QR de Nequi para pagar" /> }
        <div class="nequi-data">
          <ol class="nequi-steps">
            <li>Abre tu app Nequi y {{ qrUrl ? 'escanea el QR o envía' : 'envía' }} el dinero al número:</li>
          </ol>
          <div class="code-box"><strong>{{ formatted() }}</strong><button type="button" class="btn btn-subtle btn-sm" (click)="copy()"><app-ui-icon name="copy" /> {{ copied() ? 'Copiado' : 'Copiar' }}</button></div>
          @if (holder) { <small class="muted">A nombre de {{ holder }}</small> }
          <ol class="nequi-steps" start="2"><li>Toma una captura del comprobante y súbela aquí.</li></ol>
        </div>
      </div>
      <div class="field">
        <label class="btn btn-secondary btn-sm" [attr.for]="inputId"><app-ui-icon name="upload" /> {{ proof() ? 'Cambiar comprobante' : 'Subir comprobante' }}</label>
        <input class="sr-only" type="file" [id]="inputId" accept="image/png,image/jpeg,image/webp" (change)="onFile($event)" [disabled]="busy" />
        @if (proof()) { <img class="nequi-proof" [src]="proof()" alt="Vista previa del comprobante" /> }
      </div>
      <div class="field"><label [for]="inputId + '-note'">Nota (opcional)</label><input class="input" [id]="inputId + '-note'" [(ngModel)]="note" maxlength="200" placeholder="Ej. Pagué desde el Nequi de mi esposa" /></div>
      @if (error() || errorMsg) { <p class="error" role="alert">{{ error() || errorMsg }}</p> }
      <button type="button" class="btn btn-primary" [disabled]="!proof() || busy" [attr.aria-busy]="busy" (click)="send()">@if (busy) { <span class="spinner"></span> Enviando… } @else { Enviar comprobante }</button>
      <small class="muted">Tu pago queda en revisión hasta que {{ reviewer }} lo confirme.</small>
    </div>
  `,
})
export class NequiPayComponent {
  private static seq = 0;
  @Input() qrUrl: string | null = null;
  @Input({ required: true }) number = '';
  @Input() holder: string | null = null;
  @Input() amountCop = 0;
  @Input() busy = false;
  @Input() errorMsg = '';
  @Input() reviewer = 'el negocio';
  @Output() submitProof = new EventEmitter<{ proofDataUrl: string; note: string }>();
  readonly inputId = `nequi-proof-${++NequiPayComponent.seq}`;
  proof = signal<string | null>(null);
  error = signal('');
  copied = signal(false);
  note = '';

  formatted(): string { const n = this.number; return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n; }

  copy(): void {
    void navigator.clipboard?.writeText(this.number).then(() => { this.copied.set(true); setTimeout(() => this.copied.set(false), 1500); });
  }

  async onFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    try { this.proof.set(await prepareImage(file, 1400)); }
    catch (err) { this.error.set(err instanceof Error ? err.message : 'No se pudo leer la imagen'); }
  }

  send(): void {
    const p = this.proof();
    if (!p) { this.error.set('Sube la captura del comprobante.'); return; }
    this.submitProof.emit({ proofDataUrl: p, note: this.note.trim() });
  }
}
