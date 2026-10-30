import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { InstallService } from '../core/install.service';
import { PlatformService } from '../core/platform.service';
import { BrandLockupComponent } from '../ui/brand-lockup.component';
import { InstallButtonComponent } from '../ui/install-button.component';
import { UiIconComponent } from '../ui/icon.component';
import type { Category, DirectoryBusiness, DirectoryPage } from '../core/models';

type GeoState = 'off' | 'locating' | 'on' | 'denied' | 'error';
const PAGE_SIZE = 24;

/**
 * Sitio principal: comunidad / centro de negocios.
 * Los visitantes (sin login) buscan negocios por texto, categoría, ciudad o cercanía (GPS)
 * y entran al negocio para pedir turno (allí sí se pide iniciar sesión).
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe, UiIconComponent, BrandLockupComponent, InstallButtonComponent],
  template: `
    <a class="skip-link" href="#explorar">Saltar a los negocios</a>
    <header class="mk-header">
      <div class="container mk-header-inner">
        <a routerLink="/" class="mk-brand-link" aria-label="Inicio"><app-brand-lockup /></a>
        <nav class="mk-nav" aria-label="Secciones">
          <a href="#explorar">Explorar</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#negocios">Para negocios</a>
        </nav>
        <div class="mk-header-actions">
          <app-install-button variant="header" />
          @if (auth.isLoggedIn()) {
            <a class="btn btn-primary btn-sm" [routerLink]="auth.homeFor(auth.role())"><app-ui-icon name="user" /> {{ accountLabel() }}</a>
          } @else {
            <a class="btn btn-subtle btn-sm" routerLink="/login">Ingresar</a>
            <a class="btn btn-primary btn-sm mk-hide-xs" routerLink="/registro">Crear cuenta</a>
          }
        </div>
      </div>
    </header>

    <section class="mk-hero" aria-labelledby="hero-title">
      <div class="container mk-hero-inner">
        <div class="mk-hero-copy">
          <span class="mk-hero-eyebrow"><span class="showcase-dot"></span> {{ platform.branding().tagline || 'La comunidad de negocios de tu ciudad' }}</span>
          <h1 id="hero-title">Pide tu turno en los negocios <em>cerca de ti</em>.</h1>
          <p>Barberías, spas, consultorios, talleres y más. Encuentra el lugar, elige tu horario y reserva en segundos.</p>

          <form class="mk-search" role="search" (ngSubmit)="search()">
            <div class="mk-search-field">
              <app-ui-icon name="search" />
              <label class="sr-only" for="mk-q">¿Qué buscas?</label>
              <input id="mk-q" name="q" type="search" [(ngModel)]="q" (ngModelChange)="typed$.next($event)"
                     placeholder="Barbería, uñas, odontología…" autocomplete="off" enterkeyhint="search" />
            </div>
            <div class="mk-search-field mk-search-city">
              <app-ui-icon name="map-pin" />
              <label class="sr-only" for="mk-city">Ciudad</label>
              <select id="mk-city" name="city" [(ngModel)]="city" (ngModelChange)="search()">
                <option value="">Todas las ciudades</option>
                @for (c of cities(); track c.city) { <option [value]="c.city">{{ c.city }}</option> }
              </select>
            </div>
            <button class="btn btn-primary btn-lg mk-search-btn" type="submit"><app-ui-icon name="search" /> <span>Buscar</span></button>
          </form>

          <div class="mk-hero-meta">
            <button type="button" class="mk-near-btn" [class.on]="geo() === 'on'" (click)="toggleNearMe()" [disabled]="geo() === 'locating'">
              @if (geo() === 'locating') { <span class="spinner" aria-hidden="true"></span> Buscando tu ubicación… }
              @else if (geo() === 'on') { <app-ui-icon name="locate" /> Mostrando lo más cercano · Quitar }
              @else { <app-ui-icon name="locate" /> Negocios cerca de mí }
            </button>
            @if (totalBusinesses() > 0) { <span class="mk-hero-stat"><strong>{{ totalBusinesses() }}</strong> negocios en la comunidad</span> }
          </div>
          @if (geoMessage()) { <p class="mk-geo-msg" role="status">{{ geoMessage() }}</p> }
        </div>

        <div class="mk-hero-art" aria-hidden="true">
          <div class="mk-art-card mk-art-card-1">
            <span class="mk-art-logo" style="background:#f2e8ff;color:#6b3fc0"><app-ui-icon name="scissors" /></span>
            <div><strong>Tu barbería favorita</strong><small>a 600 m · Abierto</small></div>
            <span class="mk-art-pill">10:30</span>
          </div>
          <div class="mk-art-card mk-art-card-2">
            <span class="mk-art-logo" style="background:#e3f6ee;color:#13734d"><app-ui-icon name="leaf" /></span>
            <div><strong>Spa del barrio</strong><small>a 1,2 km · ★ 4,9</small></div>
            <span class="mk-art-pill">15:00</span>
          </div>
          <div class="mk-art-card mk-art-card-3">
            <span class="mk-art-check"><app-ui-icon name="check" /></span>
            <div><strong>¡Turno confirmado!</strong><small>Te enviamos un recordatorio</small></div>
          </div>
          <span class="mk-art-caption">Vista de ejemplo</span>
        </div>
      </div>
    </section>

    <main id="main-content">
      <section class="container mk-categories" aria-label="Categorías">
        <div class="mk-chip-row" role="list">
          <button type="button" role="listitem" class="mk-chip" [class.active]="!category()" [attr.aria-pressed]="!category()" (click)="pickCategory('')">
            <span class="mk-chip-icon"><app-ui-icon name="compass" /></span> Todos
          </button>
          @for (c of categories(); track c.slug) {
            <button type="button" role="listitem" class="mk-chip" [class.active]="category() === c.slug" [attr.aria-pressed]="category() === c.slug" (click)="pickCategory(c.slug)">
              <span class="mk-chip-icon"><app-ui-icon [name]="c.icon" /></span> {{ c.name }}
              @if (c.count) { <span class="mk-chip-count">{{ c.count }}</span> }
            </button>
          }
        </div>
      </section>

      <section id="explorar" class="container mk-results" aria-labelledby="results-title">
        <div class="mk-results-head">
          <div>
            <h2 id="results-title">{{ resultsTitle() }}</h2>
            <p class="muted" aria-live="polite">
              @if (loading() && items().length === 0) { Buscando negocios… }
              @else { {{ total() }} {{ total() === 1 ? 'negocio encontrado' : 'negocios encontrados' }}@if (geo() === 'on') { · ordenados por cercanía } }
            </p>
          </div>
          <div class="mk-results-tools">
            @if (geo() === 'on') {
              <label class="sr-only" for="mk-radius">Distancia máxima</label>
              <select id="mk-radius" class="input mk-select" [ngModel]="radius()" (ngModelChange)="setRadius($event)">
                <option [ngValue]="0">Cualquier distancia</option>
                <option [ngValue]="2">Hasta 2 km</option>
                <option [ngValue]="5">Hasta 5 km</option>
                <option [ngValue]="10">Hasta 10 km</option>
                <option [ngValue]="25">Hasta 25 km</option>
              </select>
            }
            <label class="sr-only" for="mk-sort">Ordenar</label>
            <select id="mk-sort" class="input mk-select" [ngModel]="sort()" (ngModelChange)="setSort($event)">
              <option value="relevance">{{ geo() === 'on' ? 'Más cercanos' : 'Recomendados' }}</option>
              <option value="rating">Mejor calificados</option>
              <option value="new">Nuevos</option>
            </select>
          </div>
        </div>

        @if (hasFilters()) {
          <div class="mk-active-filters">
            @if (q) { <button type="button" class="mk-filter-tag" (click)="clearQuery()">“{{ q }}” <app-ui-icon name="x" /></button> }
            @if (category()) { <button type="button" class="mk-filter-tag" (click)="pickCategory('')">{{ categoryName() }} <app-ui-icon name="x" /></button> }
            @if (city) { <button type="button" class="mk-filter-tag" (click)="city = ''; search()">{{ city }} <app-ui-icon name="x" /></button> }
            @if (geo() === 'on') { <button type="button" class="mk-filter-tag" (click)="toggleNearMe()">Cerca de mí <app-ui-icon name="x" /></button> }
            <button type="button" class="btn-link mk-clear" (click)="clearAll()">Limpiar filtros</button>
          </div>
        }

        @if (error()) {
          <div class="empty-state"><span class="empty-icon"><app-ui-icon name="alert" /></span><h3>No pudimos cargar los negocios</h3><p>{{ error() }}</p><button class="btn btn-primary" style="margin-top:1rem" (click)="search()">Reintentar</button></div>
        } @else {
          <div class="mk-grid">
            @for (b of items(); track b.slug) {
              <article class="mk-card">
                <div class="mk-card-cover" [style.background]="coverBg(b)">
                  @if (b.coverUrl) { <img [src]="b.coverUrl" alt="" loading="lazy" /> }
                  @if (b.distanceKm !== null) { <span class="mk-card-distance"><app-ui-icon name="map-pin" /> {{ distance(b.distanceKm) }}</span> }
                </div>
                <div class="mk-card-body">
                  <div class="mk-card-logo" [style.background]="b.logoUrl ? '#fff' : b.primaryColor" [style.color]="initialColor(b)">
                    @if (b.logoUrl) { <img [src]="b.logoUrl" [alt]="'Logo de ' + b.name" loading="lazy" /> }
                    @else { <span>{{ initials(b.name) }}</span> }
                  </div>
                  <h3 class="mk-card-title"><a [routerLink]="['/', b.slug]" class="mk-card-link">{{ b.name }}</a></h3>
                  <p class="mk-card-sub">
                    @if (b.category) { <span><app-ui-icon [name]="b.category.icon" /> {{ b.category.name }}</span> }
                    @if (b.city) { <span>{{ b.city }}</span> }
                  </p>
                  @if (b.tagline || b.about) { <p class="mk-card-desc">{{ b.tagline || b.about }}</p> }
                  <div class="mk-card-meta">
                    @if (b.rating) { <span class="mk-rating"><app-ui-icon name="star" /> {{ b.rating | number:'1.1-1' }} <small>({{ b.reviews }})</small></span> }
                    @else { <span class="mk-new">Nuevo</span> }
                    @if (b.minPrice) { <span>Desde {{ b.minPrice | number }} COP</span> }
                    @else if (b.servicesCount) { <span>{{ b.servicesCount }} servicios</span> }
                  </div>
                </div>
                <div class="mk-card-foot">
                  <span class="btn btn-primary btn-sm mk-card-cta" aria-hidden="true">Pedir turno <app-ui-icon name="arrow-right" /></span>
                </div>
              </article>
            }
            @if (loading()) {
              @for (s of skeletons; track s) { <div class="mk-card mk-skeleton" aria-hidden="true"><div class="mk-card-cover"></div><div class="mk-card-body"><span></span><span></span><span></span></div></div> }
            }
          </div>
          @if (!loading() && items().length === 0) {
            <div class="empty-state mk-empty">
              <span class="empty-icon"><app-ui-icon name="search" /></span>
              <h3>No encontramos negocios con esos filtros</h3>
              <p>Prueba con otra palabra, otra categoría o amplía la distancia.</p>
              @if (hasFilters()) { <button class="btn btn-secondary" style="margin-top:1rem" (click)="clearAll()">Ver todos los negocios</button> }
            </div>
          }
          @if (items().length < total() && !loading()) {
            <div class="mk-more"><button class="btn btn-secondary btn-lg" (click)="loadMore()">Ver más negocios</button></div>
          }
        }
      </section>

      <section id="como-funciona" class="container mk-how" aria-labelledby="how-title">
        <span class="eyebrow">Así de fácil</span>
        <h2 id="how-title">Tu turno en tres pasos</h2>
        <div class="mk-how-grid">
          <div class="mk-how-step"><span class="mk-how-num">1</span><app-ui-icon name="search" /><h3>Encuentra el negocio</h3><p>Busca por tipo de negocio, ciudad o lo que tengas cerca.</p></div>
          <div class="mk-how-step"><span class="mk-how-num">2</span><app-ui-icon name="calendar" /><h3>Elige servicio y hora</h3><p>Ve la disponibilidad real y escoge el horario que te sirva.</p></div>
          <div class="mk-how-step"><span class="mk-how-num">3</span><app-ui-icon name="check-circle" /><h3>Listo, te esperamos</h3><p>Recibe la confirmación y gestiona tus citas desde tu cuenta.</p></div>
        </div>
      </section>

      <section class="container mk-app-band" aria-labelledby="app-title">
        <div class="mk-app-icon"><app-ui-icon name="smartphone" /></div>
        <div class="mk-app-copy">
          <h2 id="app-title">Lleva {{ platform.branding().brandName }} en tu celular</h2>
          <p>Instala la app gratis: abre más rápido, funciona como una app y no ocupa espacio de tienda.</p>
        </div>
        <app-install-button variant="band" />
      </section>

      <section id="negocios" class="mk-business" aria-labelledby="biz-title">
        <div class="container mk-business-inner">
          <div>
            <span class="mk-hero-eyebrow"><span class="showcase-dot"></span> Para dueños de negocio</span>
            <h2 id="biz-title">¿Tienes un negocio? Recibe reservas las 24 horas.</h2>
            <ul class="mk-business-list">
              <li><app-ui-icon name="check-circle" /> Tu propia página con logo, colores y link personalizado</li>
              <li><app-ui-icon name="check-circle" /> Código QR para tu local, redes y tarjetas</li>
              <li><app-ui-icon name="check-circle" /> Agenda de tu equipo, recordatorios y fidelización</li>
              <li><app-ui-icon name="check-circle" /> Apareces en esta comunidad para nuevos clientes</li>
            </ul>
          </div>
          <div class="mk-business-cta">
            <strong>2 meses gratis</strong>
            <span>Sin tarjeta. Configúralo tú mismo en minutos.</span>
            <a class="btn btn-lg mk-btn-light" routerLink="/registro-negocio">Registrar mi negocio <app-ui-icon name="arrow-right" /></a>
            <a class="mk-business-login" routerLink="/login">Ya tengo cuenta · Ingresar</a>
          </div>
        </div>
      </section>
    </main>

    <footer class="mk-footer">
      <div class="container mk-footer-inner">
        <app-brand-lockup />
        <nav aria-label="Enlaces del pie">
          <a href="#explorar">Explorar negocios</a>
          <a routerLink="/registro">Crear cuenta</a>
          <a routerLink="/registro-negocio">Registrar negocio</a>
          <a routerLink="/login">Ingresar</a>
        </nav>
        <small>© {{ year }} {{ platform.branding().brandName }}</small>
      </div>
    </footer>

    <app-install-button variant="floating" />
  `,
})
export class HomePage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  auth = inject(AuthService);
  install = inject(InstallService);
  platform = inject(PlatformService);

  year = new Date().getFullYear();
  skeletons = [1, 2, 3, 4, 5, 6];

  q = '';
  city = '';
  category = signal('');
  sort = signal<'relevance' | 'rating' | 'new'>('relevance');
  radius = signal(0);
  geo = signal<GeoState>('off');
  geoMessage = signal('');
  private coords: { lat: number; lng: number } | null = null;

  categories = signal<Category[]>([]);
  cities = signal<{ city: string; count: number }[]>([]);
  items = signal<DirectoryBusiness[]>([]);
  total = signal(0);
  totalBusinesses = signal(0);
  loading = signal(false);
  error = signal('');

  typed$ = new Subject<string>();
  private subs = new Subscription();
  private requestSeq = 0;

  categoryName = computed(() => this.categories().find((c) => c.slug === this.category())?.name ?? '');
  resultsTitle = computed(() => (this.category() ? this.categoryName() : 'Negocios de la comunidad'));
  accountLabel = computed(() => ({ superadmin: 'Administración', owner: 'Mi negocio', staff: 'Mi agenda', customer: 'Mis citas' })[this.auth.role() ?? 'customer']);

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.q = qp.get('q') ?? '';
    this.city = qp.get('ciudad') ?? '';
    this.category.set(qp.get('categoria') ?? '');

    this.api.get<Category[]>('/directory/categories').subscribe({
      next: (c) => {
        this.categories.set(c);
      },
    });
    this.api.get<{ city: string; count: number }[]>('/directory/cities').subscribe({ next: (c) => this.cities.set(c) });
    this.subs.add(this.typed$.pipe(debounceTime(350)).subscribe(() => this.search()));
    this.fetch(true);
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  hasFilters(): boolean { return !!(this.q || this.category() || this.city || this.geo() === 'on'); }

  search(): void { this.fetch(true); }

  pickCategory(slug: string): void {
    this.category.set(this.category() === slug ? '' : slug);
    this.fetch(true);
  }

  setSort(v: 'relevance' | 'rating' | 'new'): void { this.sort.set(v); this.fetch(true); }
  setRadius(v: number): void { this.radius.set(Number(v)); this.fetch(true); }
  clearQuery(): void { this.q = ''; this.fetch(true); }

  clearAll(): void {
    this.q = '';
    this.city = '';
    this.category.set('');
    this.radius.set(0);
    if (this.geo() === 'on') { this.geo.set('off'); this.coords = null; }
    this.geoMessage.set('');
    this.fetch(true);
  }

  loadMore(): void { this.fetch(false); }

  toggleNearMe(): void {
    if (this.geo() === 'on') {
      this.geo.set('off');
      this.coords = null;
      this.radius.set(0);
      this.geoMessage.set('');
      this.fetch(true);
      return;
    }
    if (!('geolocation' in navigator)) {
      this.geo.set('error');
      this.geoMessage.set('Tu navegador no permite usar la ubicación. Busca por ciudad.');
      return;
    }
    this.geo.set('locating');
    this.geoMessage.set('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.geo.set('on');
        this.fetch(true);
        document.getElementById('explorar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      (err) => {
        this.geo.set(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        this.geoMessage.set(err.code === err.PERMISSION_DENIED
          ? 'No diste permiso de ubicación. Puedes activarlo en tu navegador o buscar por ciudad.'
          : 'No pudimos obtener tu ubicación. Intenta de nuevo o busca por ciudad.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  private fetch(reset: boolean): void {
    const seq = ++this.requestSeq;
    const offset = reset ? 0 : this.items().length;
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(offset), sort: this.sort() };
    if (this.q.trim()) params['q'] = this.q.trim();
    if (this.category()) params['category'] = this.category();
    if (this.city) params['city'] = this.city;
    if (this.coords) {
      params['lat'] = this.coords.lat.toFixed(5);
      params['lng'] = this.coords.lng.toFixed(5);
      if (this.radius()) params['radiusKm'] = String(this.radius());
    }
    if (reset) {
      this.items.set([]);
      this.syncUrl();
    }
    this.loading.set(true);
    this.error.set('');
    this.api.get<DirectoryPage>('/directory/businesses', params).subscribe({
      next: (page) => {
        if (seq !== this.requestSeq) return;
        this.items.set(reset ? page.items : [...this.items(), ...page.items]);
        this.total.set(page.total);
        if (reset && !this.hasFilters()) this.totalBusinesses.set(page.total);
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.requestSeq) return;
        this.loading.set(false);
        this.error.set('Revisa tu conexión e intenta de nuevo.');
      },
    });
  }

  /** Deja los filtros en la URL para compartir la búsqueda. */
  private syncUrl(): void {
    const queryParams: Record<string, string | null> = {
      q: this.q.trim() || null,
      categoria: this.category() || null,
      ciudad: this.city || null,
    };
    void this.router.navigate([], { queryParams, replaceUrl: true });
  }

  coverBg(b: DirectoryBusiness): string {
    return `linear-gradient(135deg, ${b.primaryColor}, ${b.secondaryColor})`;
  }

  initialColor(b: DirectoryBusiness): string {
    if (b.logoUrl) return 'inherit';
    const hex = b.primaryColor.replace('#', '');
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
    return lum > 0.55 ? '#111827' : '#ffffff';
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  }

  distance(km: number): string {
    return km < 1 ? `a ${Math.max(50, Math.round(km * 1000 / 50) * 50)} m` : `a ${km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km`;
  }
}
