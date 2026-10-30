import { Component, EventEmitter, OnInit, Output, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subject, Subscription, debounceTime, switchMap, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ImageUploadComponent } from '../ui/image-upload.component';
import { UiIconComponent } from '../ui/icon.component';
import type { Category } from '../core/models';

interface Profile {
  name: string; slug: string; categoryId: string | null; city: string | null; tagline: string | null;
  latitude: number | null; longitude: number | null; isListed: boolean;
}
interface Branding {
  logoUrl: string | null; coverUrl: string | null; primaryColor: string; secondaryColor: string;
  phone: string | null; whatsappNumber: string | null; email: string | null; address: string | null;
  about: string | null; instagram: string | null; website: string | null;
}
type SlugState = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid' | 'reserved';

/**
 * "Mi negocio": el dueño autogestiona su negocio.
 * Identidad (logo, portada, colores), datos para el directorio, link personalizado,
 * contacto y ubicación (GPS). Incluye vista previa de cómo se ve en la comunidad.
 */
@Component({
  selector: 'app-business-profile',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ImageUploadComponent, UiIconComponent],
  template: `
    @if (rev() && p && b) {
      <div class="profile-layout">
        <div class="section-stack">
          <!-- Identidad visual -->
          <section class="card form-stack" aria-labelledby="pf-identity">
            <div class="panel-head"><div><h3 id="pf-identity">Identidad visual</h3><p class="muted">Tu logo y colores se usan en tu página y en tu tarjeta del directorio.</p></div></div>
            <app-image-upload kind="logo" label="Logo del negocio" hint="Cuadrado, PNG con fondo transparente ideal. Máx. 8 MB."
                              [value]="b.logoUrl" (valueChange)="b.logoUrl = $event; touch()" />
            <app-image-upload kind="cover" shape="wide" label="Foto de portada (opcional)" hint="Horizontal, ej. tu local o tu trabajo. Se ajusta automáticamente."
                              [value]="b.coverUrl" (valueChange)="b.coverUrl = $event; touch()" />
            <div class="color-fields">
              <div class="field"><label for="pf-primary">Color principal</label>
                <div class="color-input"><input id="pf-primary" type="color" [(ngModel)]="b.primaryColor" (ngModelChange)="touch()" /><input class="input" [(ngModel)]="b.primaryColor" (ngModelChange)="touch()" maxlength="7" aria-label="Código del color principal" /></div></div>
              <div class="field"><label for="pf-secondary">Color secundario</label>
                <div class="color-input"><input id="pf-secondary" type="color" [(ngModel)]="b.secondaryColor" (ngModelChange)="touch()" /><input class="input" [(ngModel)]="b.secondaryColor" (ngModelChange)="touch()" maxlength="7" aria-label="Código del color secundario" /></div></div>
            </div>
            <div class="palette-presets" role="group" aria-label="Paletas sugeridas">
              @for (pal of palettes; track pal[0]) {
                <button type="button" class="palette-swatch" [style.background]="'linear-gradient(135deg,' + pal[0] + ' 50%,' + pal[1] + ' 50%)'"
                        [attr.aria-label]="'Usar colores ' + pal[0] + ' y ' + pal[1]" (click)="b.primaryColor = pal[0]; b.secondaryColor = pal[1]; touch()"></button>
              }
            </div>
          </section>

          <!-- Datos del directorio -->
          <section class="card form-stack" aria-labelledby="pf-data">
            <div class="panel-head"><div><h3 id="pf-data">Datos del negocio</h3><p class="muted">Así te encuentran los clientes en la comunidad.</p></div></div>
            <div class="field"><label for="pf-name">Nombre del negocio</label><input id="pf-name" class="input" [(ngModel)]="p.name" (ngModelChange)="touch()" maxlength="100" /></div>
            <div class="form-columns">
              <div class="field"><label for="pf-category">Tipo de negocio</label>
                <select id="pf-category" class="input" [(ngModel)]="p.categoryId" (ngModelChange)="touch()">
                  <option [ngValue]="null">Sin categoría</option>
                  @for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
                </select></div>
              <div class="field"><label for="pf-city">Ciudad</label><input id="pf-city" class="input" [(ngModel)]="p.city" (ngModelChange)="touch()" maxlength="80" placeholder="Ej. Medellín" /></div>
            </div>
            <div class="field"><label for="pf-tagline">Frase corta</label><input id="pf-tagline" class="input" [(ngModel)]="p.tagline" (ngModelChange)="touch()" maxlength="120" placeholder="Ej. Cortes clásicos y modernos desde 2010" /><span class="input-hint">Aparece en tu tarjeta del directorio. {{ (p.tagline || '').length }}/120</span></div>
            <div class="field"><label for="pf-about">Descripción</label><textarea id="pf-about" class="input" [(ngModel)]="b.about" (ngModelChange)="touch()" maxlength="1000" placeholder="Cuéntales a tus clientes qué hacen y por qué elegirlos."></textarea></div>
            <label class="check-row toggle-row"><input type="checkbox" [(ngModel)]="p.isListed" (ngModelChange)="touch()" />
              <span><strong>Mostrar mi negocio en la comunidad</strong><small>Si lo desactivas, solo podrán reservar quienes tengan tu link o QR.</small></span></label>
          </section>

          <!-- Link personalizado -->
          <section class="card form-stack" aria-labelledby="pf-link">
            <div class="panel-head"><div><h3 id="pf-link">Tu link personalizado</h3><p class="muted">Compártelo en redes, WhatsApp o en tu QR.</p></div></div>
            <div class="field"><label for="pf-slug">Link de tu negocio</label>
              <div class="slug-input"><span class="slug-prefix">{{ host }}/</span><input id="pf-slug" class="input" [ngModel]="p.slug" (ngModelChange)="onSlug($event)" maxlength="50" autocapitalize="none" spellcheck="false" [attr.aria-invalid]="slugBad() ? 'true' : null" aria-describedby="pf-slug-status" /></div>
              <span id="pf-slug-status" class="slug-status" [class.ok]="slugState() === 'ok'" [class.bad]="slugBad()" aria-live="polite">
                @switch (slugState()) {
                  @case ('checking') { <span class="spinner" aria-hidden="true"></span> Verificando… }
                  @case ('ok') { <app-ui-icon name="check-circle" /> Disponible }
                  @case ('taken') { <app-ui-icon name="alert" /> Ese link ya lo usa otro negocio }
                  @case ('reserved') { <app-ui-icon name="alert" /> Ese link está reservado, prueba otro }
                  @case ('invalid') { <app-ui-icon name="alert" /> Usa de 3 a 50 letras minúsculas, números o guiones }
                  @default { Solo minúsculas, números y guiones. Si lo cambias, el link anterior deja de funcionar. }
                }
              </span>
            </div>
          </section>

          <!-- Contacto -->
          <section class="card form-stack" aria-labelledby="pf-contact">
            <div class="panel-head"><div><h3 id="pf-contact">Datos de contacto</h3><p class="muted">Se muestran en tu página para que te escriban o llamen.</p></div></div>
            <div class="form-columns">
              <div class="field"><label for="pf-wa">WhatsApp</label><input id="pf-wa" class="input" type="tel" [(ngModel)]="b.whatsappNumber" (ngModelChange)="touch()" placeholder="Ej. 57 300 123 4567" /><span class="input-hint">Con indicativo del país (57 para Colombia).</span></div>
              <div class="field"><label for="pf-phone">Teléfono</label><input id="pf-phone" class="input" type="tel" [(ngModel)]="b.phone" (ngModelChange)="touch()" /></div>
            </div>
            <div class="form-columns">
              <div class="field"><label for="pf-email">Correo de contacto</label><input id="pf-email" class="input" type="email" [(ngModel)]="b.email" (ngModelChange)="touch()" /></div>
              <div class="field"><label for="pf-ig">Instagram</label><input id="pf-ig" class="input" [(ngModel)]="b.instagram" (ngModelChange)="touch()" placeholder="&#64;tunegocio" /></div>
            </div>
            <div class="field"><label for="pf-web">Sitio web</label><input id="pf-web" class="input" type="url" [(ngModel)]="b.website" (ngModelChange)="touch()" placeholder="https://" /></div>
          </section>

          <!-- Ubicación -->
          <section class="card form-stack" aria-labelledby="pf-location">
            <div class="panel-head"><div><h3 id="pf-location">Ubicación</h3><p class="muted">Permite que te encuentren con la búsqueda "cerca de mí".</p></div></div>
            <div class="field"><label for="pf-address">Dirección</label><input id="pf-address" class="input" [(ngModel)]="b.address" (ngModelChange)="touch()" maxlength="200" placeholder="Ej. Cra. 43A #1-50, local 3" /></div>
            <div class="location-box">
              <div>
                @if (p.latitude !== null && p.longitude !== null) {
                  <strong><app-ui-icon name="check-circle" /> Ubicación GPS guardada</strong>
                  <small>{{ p.latitude | number:'1.5-5' }}, {{ p.longitude | number:'1.5-5' }} · <a [href]="mapsUrl()" target="_blank" rel="noopener noreferrer">Ver en el mapa</a></small>
                } @else {
                  <strong>Sin ubicación GPS</strong>
                  <small>Estando en tu local, pulsa el botón para guardar el punto exacto.</small>
                }
                @if (geoMsg()) { <small class="geo-error" role="alert">{{ geoMsg() }}</small> }
              </div>
              <div class="form-actions-row">
                <button type="button" class="btn btn-secondary btn-sm" (click)="useMyLocation()" [disabled]="locating()">
                  @if (locating()) { <span class="spinner" aria-hidden="true"></span> Ubicando… } @else { <app-ui-icon name="locate" /> Usar mi ubicación actual }
                </button>
                @if (p.latitude !== null) { <button type="button" class="btn btn-subtle btn-sm" (click)="p.latitude = null; p.longitude = null; touch()">Quitar</button> }
              </div>
            </div>
            <details class="manual-coords"><summary>Ingresar coordenadas manualmente</summary>
              <div class="form-columns">
                <div class="field"><label for="pf-lat">Latitud</label><input id="pf-lat" class="input" type="number" step="0.000001" min="-90" max="90" [(ngModel)]="p.latitude" (ngModelChange)="touch()" /></div>
                <div class="field"><label for="pf-lng">Longitud</label><input id="pf-lng" class="input" type="number" step="0.000001" min="-180" max="180" [(ngModel)]="p.longitude" (ngModelChange)="touch()" /></div>
              </div>
              <span class="input-hint">En Google Maps, mantén presionado tu local y copia los números que aparecen.</span>
            </details>
          </section>
        </div>

        <!-- Vista previa -->
        <aside class="profile-preview" aria-label="Vista previa en el directorio">
          <span class="section-kicker">Así te ven en la comunidad</span>
          <article class="mk-card mk-card-preview">
            <div class="mk-card-cover" [style.background]="'linear-gradient(135deg,' + b.primaryColor + ',' + b.secondaryColor + ')'">
              @if (b.coverUrl) { <img [src]="b.coverUrl" alt="" /> }
            </div>
            <div class="mk-card-body">
              <div class="mk-card-logo" [style.background]="b.logoUrl ? '#fff' : b.primaryColor" style="color:#fff">
                @if (b.logoUrl) { <img [src]="b.logoUrl" alt="" /> } @else { <span>{{ initials() }}</span> }
              </div>
              <h3 class="mk-card-title">{{ p.name || 'Tu negocio' }}</h3>
              <p class="mk-card-sub">
                @if (categoryRef(); as c) { <span><app-ui-icon [name]="c.icon" /> {{ c.name }}</span> }
                @if (p.city) { <span>{{ p.city }}</span> }
              </p>
              <p class="mk-card-desc">{{ p.tagline || b.about || 'Agrega una frase corta para destacar.' }}</p>
              <div class="mk-card-meta"><span class="mk-new">Nuevo</span></div>
            </div>
            <div class="mk-card-foot"><span class="btn btn-sm mk-card-cta" [style.background]="b.primaryColor" [style.color]="contrast(b.primaryColor)">Pedir turno <app-ui-icon name="arrow-right" /></span></div>
          </article>
          @if (!p.isListed) { <p class="badge badge-warn">Oculto en el directorio</p> }
          <a class="btn btn-secondary btn-block" [href]="'/' + savedSlug()" target="_blank" rel="noopener noreferrer"><app-ui-icon name="eye" /> Ver mi página</a>
        </aside>
      </div>

      <div class="save-bar" [class.visible]="dirty() || saving()">
        <span>{{ saving() ? 'Guardando cambios…' : 'Tienes cambios sin guardar' }}</span>
        <div class="form-actions-row">
          <button type="button" class="btn btn-subtle" (click)="load()" [disabled]="saving()">Descartar</button>
          <button type="button" class="btn btn-primary" (click)="save()" [disabled]="saving() || slugBad() || slugState() === 'checking'" [attr.aria-busy]="saving()">
            @if (saving()) { <span class="spinner" aria-hidden="true"></span> } Guardar cambios
          </button>
        </div>
      </div>
    } @else {
      @if (loadError()) { <p class="error" role="alert">{{ loadError() }}</p> }
      @else { <div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span> Cargando tu negocio…</div> }
    }
  `,
})
export class BusinessProfileComponent implements OnInit {
  private api = inject(ApiService);
  @Output() saved = new EventEmitter<{ message: string; type: 'ok' | 'error'; slug?: string }>();

  host = location.host;
  p: Profile | null = null;
  b: Branding | null = null;
  categories = signal<Category[]>([]);
  /** Cambia cada vez que se cargan los datos (la app no usa zone.js: así se refresca la vista). */
  rev = signal(0);
  private snapshot = '';
  dirty = signal(false);
  saving = signal(false);
  loadError = signal('');
  locating = signal(false);
  geoMsg = signal('');
  slugState = signal<SlugState>('idle');
  savedSlug = signal('');
  private categoryId = signal<string | null>(null);
  private slug$ = new Subject<string>();
  private sub = new Subscription();

  palettes: [string, string][] = [
    ['#3458E8', '#203CB3'], ['#0F766E', '#115E59'], ['#B91C1C', '#7F1D1D'], ['#7C3AED', '#4C1D95'],
    ['#DB2777', '#9D174D'], ['#EA580C', '#9A3412'], ['#111827', '#374151'], ['#CA8A04', '#713F12'],
  ];

  slugBad = computed(() => ['taken', 'invalid', 'reserved'].includes(this.slugState()));
  categoryRef = computed(() => this.categories().find((c) => c.id === this.categoryId()) ?? null);

  ngOnInit(): void {
    this.api.get<Category[]>('/directory/categories').subscribe({ next: (c) => this.categories.set(c) });
    this.sub.add(
      this.slug$.pipe(
        debounceTime(400),
        switchMap((slug) => {
          if (slug === this.savedSlug()) return of({ available: true, reason: null, same: true });
          if (!/^[a-z0-9](?:[a-z0-9-]{1,48})[a-z0-9]$/.test(slug) || slug.includes('--')) {
            return of({ available: false, reason: 'invalid' });
          }
          return this.api.get<{ available: boolean; reason: string | null }>(`/tenant/slug-available/${encodeURIComponent(slug)}`);
        }),
      ).subscribe({
        next: (r) => this.slugState.set(
          'same' in r ? 'idle' : r.available ? 'ok' : (r.reason === 'reserved' ? 'reserved' : r.reason === 'invalid' ? 'invalid' : 'taken'),
        ),
        error: () => this.slugState.set('idle'),
      }),
    );
    this.load();
  }

  load(): void {
    this.loadError.set('');
    forkJoin({ p: this.api.get<Profile>('/tenant/profile'), b: this.api.get<Branding>('/tenant/branding') }).subscribe({
      next: ({ p, b }) => {
        this.p = { ...p };
        this.b = { ...b };
        this.savedSlug.set(p.slug);
        this.categoryId.set(p.categoryId);
        this.slugState.set('idle');
        this.snapshot = this.serialize();
        this.dirty.set(false);
        this.rev.update((v) => v + 1);
      },
      error: () => this.loadError.set('No se pudo cargar la información del negocio.'),
    });
  }

  /** Marca cambios comparando con lo guardado (ignora eventos de inicialización de los campos). */
  touch(): void {
    this.dirty.set(this.serialize() !== this.snapshot);
    if (this.p) this.categoryId.set(this.p.categoryId);
  }

  onSlug(value: string): void {
    if (!this.p) return;
    // Normaliza mientras escribe: minúsculas, sin tildes, espacios a guiones.
    const clean = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    this.p.slug = clean;
    this.touch();
    this.slugState.set('checking');
    this.slug$.next(clean);
  }

  useMyLocation(): void {
    if (!('geolocation' in navigator)) { this.geoMsg.set('Tu navegador no permite obtener la ubicación.'); return; }
    this.locating.set(true);
    this.geoMsg.set('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(false);
        if (!this.p) return;
        this.p.latitude = Math.round(pos.coords.latitude * 1e6) / 1e6;
        this.p.longitude = Math.round(pos.coords.longitude * 1e6) / 1e6;
        this.touch();
        this.rev.update((v) => v + 1);
      },
      (err) => {
        this.locating.set(false);
        this.geoMsg.set(err.code === err.PERMISSION_DENIED ? 'Permiso de ubicación denegado. Actívalo en tu navegador.' : 'No se pudo obtener la ubicación. Intenta de nuevo.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  save(): void {
    if (!this.p || !this.b) return;
    if (this.p.name.trim().length < 2) { this.saved.emit({ message: 'Escribe el nombre del negocio.', type: 'error' }); return; }
    const hasLat = this.p.latitude !== null && this.p.latitude !== undefined && String(this.p.latitude) !== '';
    const hasLng = this.p.longitude !== null && this.p.longitude !== undefined && String(this.p.longitude) !== '';
    if (hasLat !== hasLng) { this.saved.emit({ message: 'Completa latitud y longitud, o quita la ubicación.', type: 'error' }); return; }
    const color = /^#[0-9a-fA-F]{6}$/;
    if (!color.test(this.b.primaryColor) || !color.test(this.b.secondaryColor)) {
      this.saved.emit({ message: 'Los colores deben tener el formato #RRGGBB.', type: 'error' });
      return;
    }
    this.saving.set(true);
    const profile = {
      ...this.p,
      name: this.p.name.trim(),
      latitude: hasLat ? Number(this.p.latitude) : null,
      longitude: hasLng ? Number(this.p.longitude) : null,
    };
    this.api.put<{ ok: boolean; slug: string }>('/tenant/profile', profile).pipe(
      switchMap(() => this.api.put('/tenant/branding', this.b)),
    ).subscribe({
      next: () => {
        this.saving.set(false);
        this.snapshot = this.serialize();
        this.dirty.set(false);
        this.savedSlug.set(profile.slug);
        this.slugState.set('idle');
        this.saved.emit({ message: 'Cambios guardados. Tu página ya está actualizada.', type: 'ok', slug: profile.slug });
      },
      error: (e) => {
        this.saving.set(false);
        const detail = e?.error?.details ? ' Revisa los campos marcados (correo, sitio web o WhatsApp).' : '';
        this.saved.emit({ message: (e?.error?.error ?? 'No se pudieron guardar los cambios.') + detail, type: 'error' });
      },
    });
  }

  private serialize(): string {
    const norm = (o: object | null) => JSON.stringify(o, (_k, v) => (v === '' || v === undefined ? null : v));
    return norm(this.p) + norm(this.b);
  }

  mapsUrl(): string {
    return `https://www.google.com/maps/search/?api=1&query=${this.p?.latitude},${this.p?.longitude}`;
  }

  initials(): string {
    return (this.p?.name || 'TN').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  }

  contrast(hex: string): string {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.55 ? '#111827' : '#ffffff';
  }
}
