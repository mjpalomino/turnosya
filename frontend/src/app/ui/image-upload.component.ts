import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { prepareImage } from '../core/image.util';
import { UiIconComponent } from './icon.component';

/**
 * Carga de imagen desde el equipo (clic o arrastrar y soltar), con vista previa.
 * La imagen se reduce en el navegador y se sube a /api/media/upload.
 * Emite la URL resultante (/api/media/<id>) o null si se quita.
 */
@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="upload" [class.upload-wide]="shape === 'wide'" [class.dragging]="dragging()"
         (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
      <div class="upload-preview" [class.empty]="!value">
        @if (value) { <img [src]="value" [alt]="label" /> }
        @else { <app-ui-icon [name]="shape === 'wide' ? 'image' : 'store'" /> }
        @if (busy()) { <span class="upload-busy"><span class="spinner" aria-hidden="true"></span></span> }
      </div>
      <div class="upload-body">
        <strong>{{ label }}</strong>
        <small>{{ hint }}</small>
        <div class="upload-actions">
          <label class="btn btn-secondary btn-sm" [attr.for]="inputId" [class.disabled]="busy()">
            <app-ui-icon name="upload" /> {{ value ? 'Cambiar imagen' : 'Cargar desde mi equipo' }}
          </label>
          <input class="sr-only" type="file" [id]="inputId" accept="image/png,image/jpeg,image/webp"
                 [disabled]="busy()" (change)="onFile($event)" />
          @if (value) {
            <button type="button" class="btn btn-subtle btn-sm" (click)="remove()" [disabled]="busy()"><app-ui-icon name="trash" /> Quitar</button>
          }
        </div>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      </div>
    </div>
  `,
})
export class ImageUploadComponent {
  private api = inject(ApiService);
  private static seq = 0;

  @Input({ required: true }) kind: 'logo' | 'cover' | 'platform_logo' = 'logo';
  @Input() value: string | null | undefined = null;
  @Input() label = 'Logo';
  @Input() hint = 'PNG, JPG o WebP. Se ajusta automáticamente.';
  @Input() shape: 'square' | 'wide' = 'square';
  @Output() valueChange = new EventEmitter<string | null>();

  readonly inputId = `image-upload-${++ImageUploadComponent.seq}`;
  busy = signal(false);
  error = signal('');
  dragging = signal(false);

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(true);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void this.upload(file);
  }

  onFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.upload(file);
  }

  remove(): void {
    this.error.set('');
    this.valueChange.emit(null);
  }

  private async upload(file: File): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      const dataUrl = await prepareImage(file, this.shape === 'wide' ? 1600 : 512);
      this.api.post<{ id: string; url: string }>('/media/upload', { kind: this.kind, dataUrl }).subscribe({
        next: (r) => { this.busy.set(false); this.valueChange.emit(r.url); },
        error: (e) => { this.busy.set(false); this.error.set(e?.error?.error ?? 'No se pudo subir la imagen.'); },
      });
    } catch (e) {
      this.busy.set(false);
      this.error.set(e instanceof Error ? e.message : 'No se pudo procesar la imagen.');
    }
  }
}
