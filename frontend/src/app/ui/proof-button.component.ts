import { ChangeDetectionStrategy, Component, Input, OnDestroy, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { UiIconComponent } from './icon.component';

/** Botón "Ver comprobante": descarga la imagen privada con sesión y la muestra en un diálogo. */
@Component({
  selector: 'app-proof-button',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="btn btn-subtle btn-sm" (click)="open()" [disabled]="loading()"><app-ui-icon name="receipt" /> Ver comprobante</button>
    @if (url()) {
      <div class="sheet-backdrop" (click)="close()"></div>
      <div class="sheet proof-sheet" role="dialog" aria-modal="true" aria-label="Comprobante de pago">
        <div class="panel-head"><h2>Comprobante</h2><button type="button" class="feedback-close" aria-label="Cerrar" (click)="close()">×</button></div>
        <img [src]="url()" alt="Comprobante de pago" />
      </div>
    }
    @if (error()) { <small class="error">{{ error() }}</small> }
  `,
})
export class ProofButtonComponent implements OnDestroy {
  private api = inject(ApiService);
  @Input({ required: true }) path = '';
  url = signal<string | null>(null);
  loading = signal(false);
  error = signal('');

  open(): void {
    this.loading.set(true); this.error.set('');
    this.api.getBlob(this.path).subscribe({
      next: (b) => { this.loading.set(false); this.url.set(URL.createObjectURL(b)); },
      error: () => { this.loading.set(false); this.error.set('No se pudo cargar'); },
    });
  }
  close(): void { const u = this.url(); if (u) URL.revokeObjectURL(u); this.url.set(null); }
  ngOnDestroy(): void { this.close(); }
}
