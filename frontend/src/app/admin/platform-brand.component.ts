import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { PlatformService } from '../core/platform.service';
import { ImageUploadComponent } from '../ui/image-upload.component';
import { UiIconComponent } from '../ui/icon.component';
import type { PlatformBranding } from '../core/models';

/**
 * Marca de la plataforma (superadmin): nombre, logo cargado desde el equipo,
 * colores y frase. Se aplica de inmediato a toda la plataforma (sitio principal,
 * login, paneles) y a la barra del navegador/PWA.
 */
@Component({
  selector: 'app-platform-brand',
  standalone: true,
  imports: [FormsModule, ImageUploadComponent, UiIconComponent],
  template: `
    @if (b(); as brand) {
      <div class="profile-layout">
        <section class="card form-stack" aria-labelledby="pb-title">
          <div class="panel-head"><div><h3 id="pb-title">Identidad de la plataforma</h3><p class="muted">Se ve en el sitio principal, el login, los paneles y la app instalada.</p></div></div>
          <div class="field"><label for="pb-name">Nombre de la plataforma</label><input id="pb-name" class="input" [(ngModel)]="brand.brandName" maxlength="60" /></div>
          <div class="field"><label for="pb-tagline">Frase del sitio principal</label><input id="pb-tagline" class="input" [ngModel]="brand.tagline" (ngModelChange)="brand.tagline = $event" maxlength="140" placeholder="La comunidad de negocios de tu ciudad" /></div>
          <app-image-upload kind="platform_logo" label="Logo de la plataforma" hint="Cuadrado o ícono, PNG transparente ideal."
                            [value]="brand.logoUrl" (valueChange)="brand.logoUrl = $event" />
          <div class="color-fields">
            <div class="field"><label for="pb-primary">Color principal</label>
              <div class="color-input"><input id="pb-primary" type="color" [(ngModel)]="brand.primaryColor" /><input class="input" [(ngModel)]="brand.primaryColor" maxlength="7" aria-label="Código del color principal" /></div></div>
            <div class="field"><label for="pb-secondary">Color secundario</label>
              <div class="color-input"><input id="pb-secondary" type="color" [(ngModel)]="brand.secondaryColor" /><input class="input" [(ngModel)]="brand.secondaryColor" maxlength="7" aria-label="Código del color secundario" /></div></div>
          </div>
          <div class="form-actions-row">
            <button type="button" class="btn btn-primary" (click)="save()" [disabled]="saving()" [attr.aria-busy]="saving()">@if (saving()) { <span class="spinner"></span> } Guardar y aplicar</button>
            <button type="button" class="btn btn-subtle" (click)="restoreDefaults()">Restaurar colores originales</button>
          </div>
        </section>
        <aside class="profile-preview" aria-label="Vista previa">
          <span class="section-kicker">Vista previa</span>
          <div class="brand-preview" [style.background]="'linear-gradient(135deg,' + brand.primaryColor + ',' + brand.secondaryColor + ')'">
            <div class="brand-preview-head">
              @if (brand.logoUrl) { <img [src]="brand.logoUrl" alt="" /> } @else { <span class="brand-mark brand-mark-light"><app-ui-icon name="calendar-check" /></span> }
              <strong>{{ brand.brandName || 'Tu plataforma' }}</strong>
            </div>
            <p>{{ brand.tagline || 'La comunidad de negocios de tu ciudad' }}</p>
            <span class="brand-preview-btn" [style.color]="brand.primaryColor">Buscar negocios</span>
          </div>
          <p class="muted">Los negocios mantienen sus propios colores en su página.</p>
        </aside>
      </div>
    } @else { <div class="loading-state" role="status"><span class="spinner"></span> Cargando marca…</div> }
  `,
})
export class PlatformBrandComponent implements OnInit {
  private api = inject(ApiService);
  private platform = inject(PlatformService);
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();
  b = signal<PlatformBranding | null>(null);
  saving = signal(false);

  ngOnInit(): void {
    this.api.get<PlatformBranding>('/admin/branding').subscribe({
      next: (b) => this.b.set({ ...b, secondaryColor: b.secondaryColor ?? '#203CB3' }),
      error: () => this.notify.emit({ message: 'No se pudo cargar la marca.', type: 'error' }),
    });
  }

  restoreDefaults(): void {
    const b = this.b();
    if (b) this.b.set({ ...b, primaryColor: '#3458E8', secondaryColor: '#203CB3' });
  }

  save(): void {
    const b = this.b();
    if (!b) return;
    if (!b.brandName.trim()) { this.notify.emit({ message: 'Escribe el nombre de la plataforma.', type: 'error' }); return; }
    const color = /^#[0-9a-fA-F]{6}$/;
    if (!color.test(b.primaryColor) || !color.test(b.secondaryColor)) {
      this.notify.emit({ message: 'Los colores deben tener el formato #RRGGBB.', type: 'error' });
      return;
    }
    this.saving.set(true);
    this.api.put('/admin/branding', { ...b, brandName: b.brandName.trim(), tagline: b.tagline?.trim() || null }).subscribe({
      next: () => {
        this.saving.set(false);
        this.platform.set(b);
        this.notify.emit({ message: 'Marca actualizada en toda la plataforma.', type: 'ok' });
      },
      error: (e) => {
        this.saving.set(false);
        this.notify.emit({ message: e?.error?.error ?? 'No se pudo guardar la marca.', type: 'error' });
      },
    });
  }
}
