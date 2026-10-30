import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { BrandLockupComponent } from '../ui/brand-lockup.component';
import { InstallButtonComponent } from '../ui/install-button.component';
import { UiIconComponent } from '../ui/icon.component';
import type { Availability, PublicSite, Service } from '../core/models';

interface PendingBooking { serviceId: string; date: string; staffId: string; slot: string; }
const PENDING_KEY = 'turnosya_pending_booking';

/**
 * Página del negocio: /<slug> (link corto) o /sitio/<slug>.
 * Cualquiera puede ver el negocio; para pedir el turno se exige cuenta de cliente.
 * Si el visitante no ha iniciado sesión, se guarda su selección y vuelve aquí tras el login.
 */
@Component({
  selector: 'app-public-site',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, RouterLink, UiIconComponent, BrandLockupComponent, InstallButtonComponent],
  template: `
    @if (site(); as s) {
      <a class="skip-link" href="#reservar">Saltar a la reserva</a>
      <div class="biz-topbar">
        <div class="container biz-topbar-inner">
          <a routerLink="/" class="biz-back"><app-ui-icon name="arrow-left" /> <span>Más negocios</span></a>
          <a routerLink="/" class="biz-platform" aria-label="Ir al inicio"><app-brand-lockup /></a>
          <div class="biz-topbar-actions">
            <app-install-button variant="header" />
            @if (auth.isLoggedIn()) {
              <a class="btn btn-subtle btn-sm" [routerLink]="auth.homeFor(auth.role())"><app-ui-icon name="user" /> <span class="mk-hide-xs">Mi cuenta</span></a>
            } @else {
              <a class="btn btn-subtle btn-sm" routerLink="/login" [queryParams]="{ returnUrl: currentUrl() }">Ingresar</a>
            }
          </div>
        </div>
      </div>

      <header class="biz-hero">
        <div class="biz-cover" [style.background]="coverBg()">
          @if (s.branding?.coverUrl) { <img [src]="s.branding!.coverUrl" alt="" /> }
        </div>
        <div class="container biz-hero-inner">
          <div class="biz-logo">
            @if (s.branding?.logoUrl) { <img [src]="s.branding!.logoUrl" [alt]="'Logo de ' + s.name" /> }
            @else { <span>{{ initials(s.name) }}</span> }
          </div>
          <div class="biz-id">
            <h1>{{ s.name }}</h1>
            <p class="biz-sub">
              @if (s.category) { <span><app-ui-icon [name]="s.category.icon" /> {{ s.category.name }}</span> }
              @if (s.city) { <span><app-ui-icon name="map-pin" /> {{ s.city }}</span> }
              @if (s.rating) { <span class="mk-rating"><app-ui-icon name="star" /> {{ s.rating | number:'1.1-1' }} <small>({{ s.reviews }} reseñas)</small></span> }
            </p>
            @if (s.tagline) { <p class="biz-tagline">{{ s.tagline }}</p> }
          </div>
          <div class="biz-actions">
            <a class="btn btn-primary" href="#reservar"><app-ui-icon name="calendar-check" /> Pedir turno</a>
            @if (s.branding?.whatsappNumber) {
              <a class="btn btn-secondary" [href]="'https://wa.me/' + s.branding!.whatsappNumber" target="_blank" rel="noopener noreferrer"><app-ui-icon name="whatsapp" /> WhatsApp <span class="sr-only">(abre en una pestaña nueva)</span></a>
            }
            <button type="button" class="btn btn-secondary" (click)="share()" [attr.aria-label]="'Compartir ' + s.name"><app-ui-icon name="share" /> <span class="mk-hide-xs">Compartir</span></button>
          </div>
        </div>
      </header>

      <main id="main-content" class="container biz-main">
        <div class="booking-grid">
          <div class="booking-main" id="reservar">
            <section class="card booking-section" aria-labelledby="step-service">
              <div class="booking-step-header">
                <span class="step-number">01</span>
                <div><h2 class="step-title" id="step-service">Elige tu servicio</h2><p>Selecciona qué te gustaría reservar.</p></div>
              </div>
              <div class="service-grid">
                @for (svc of s.services; track svc.id) {
                  <button type="button" class="service-card" [class.selected]="selectedService()?.id === svc.id"
                          [attr.aria-pressed]="selectedService()?.id === svc.id" (click)="pickService(svc)">
                    <span class="service-card-top"><strong class="service-card-name">{{ svc.name }}</strong><span class="service-radio"><app-ui-icon name="check" /></span></span>
                    @if (svc.description) { <span class="service-description">{{ svc.description }}</span> }
                    <span class="service-card-bottom"><span class="service-duration"><app-ui-icon name="clock" /> {{ svc.durationMinutes }} min</span><strong>{{ svc.priceCop | number }} COP</strong></span>
                  </button>
                }
                @if (s.services.length === 0) { <p class="booking-placeholder">Este negocio aún no tiene servicios disponibles. Escríbeles para más información.</p> }
              </div>
            </section>
            @if (selectedService()) {
              <section class="card booking-section" aria-labelledby="step-date">
                <div class="booking-step-header"><span class="step-number">02</span><div><h2 class="step-title" id="step-date">Elige fecha y hora</h2><p>Consulta los espacios disponibles para tu visita.</p></div></div>
                <div class="date-strip" role="group" aria-label="Próximos días">
                  @for (d of nextDays; track d.iso) {
                    <button type="button" class="date-chip" [class.selected]="date === d.iso" [attr.aria-pressed]="date === d.iso" (click)="pickDate(d.iso)">
                      <small>{{ d.weekday }}</small><strong>{{ d.day }}</strong><small>{{ d.month }}</small>
                    </button>
                  }
                  <label class="date-chip date-chip-other" for="booking-date"><app-ui-icon name="calendar" /><small>Otra fecha</small></label>
                  <input id="booking-date" class="sr-only" type="date" [min]="today" [(ngModel)]="date" (change)="loadAvailability()" />
                </div>
                @if (loadingSlots()) { <div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span> Buscando horarios disponibles…</div> }
                @if (slotError()) { <p class="error" role="alert">{{ slotError() }}</p> }
                @if (availability(); as av) {
                  @if (av.options.length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="calendar" /></span><h3>Sin horarios para el {{ date | date:'d MMM' }}</h3><p>Prueba con otro día para encontrar disponibilidad.</p></div> }
                  @for (opt of av.options; track opt.staffId) {
                    @if (av.options.length > 1 || staffName(opt.staffId)) { <p class="section-kicker slot-staff"><app-ui-icon name="user" /> {{ staffName(opt.staffId) || 'Profesional' }}</p> }
                    <div class="slots">
                      @for (slot of opt.slots; track slot) {
                        <button type="button" class="btn btn-ghost slot" [class.selected]="chosenSlot === slot && chosenStaff === opt.staffId"
                                [attr.aria-pressed]="chosenSlot === slot && chosenStaff === opt.staffId"
                                [attr.aria-label]="'Elegir horario ' + (slot | date:'HH:mm')" (click)="chooseSlot(opt.staffId, slot)">{{ slot | date:'h:mm a' }}</button>
                      }
                    </div>
                  }
                }
              </section>
            }
            @if (chosenSlot) {
              <section class="card booking-section" aria-labelledby="step-confirm">
                <div class="booking-step-header"><span class="step-number">03</span><div><h2 class="step-title" id="step-confirm">Confirma tu turno</h2><p>Revisa el resumen y confirma.</p></div></div>
                @if (auth.role() === 'customer') {
                  <div class="form-stack">
                    <div class="info-row"><span class="info-label">A nombre de</span><strong>{{ auth.user()?.fullName }}</strong></div>
                    <div class="field"><label for="booking-phone">Celular para recordatorio (opcional)</label><input id="booking-phone" class="input" type="tel" [(ngModel)]="customerPhone" autocomplete="tel" placeholder="Número de contacto" [disabled]="done()" /></div>
                    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
                    @if (done()) {
                      <div class="booking-done" role="status"><app-ui-icon name="check-circle" /><div><strong>¡Turno reservado!</strong><small>Te esperamos el {{ chosenSlot | date:'EEEE d MMM, h:mm a' }}.</small></div></div>
                      <div class="form-actions-row"><a class="btn btn-primary" routerLink="/mis-citas">Ver mis citas</a><button class="btn btn-secondary" (click)="resetBooking()">Pedir otro turno</button></div>
                    } @else {
                      <button type="button" class="btn btn-primary btn-lg" [disabled]="booking()" [attr.aria-busy]="booking()" (click)="book()">
                        @if (booking()) { <span class="spinner" aria-hidden="true"></span> Reservando… }
                        @else { Confirmar turno <app-ui-icon name="arrow-right" /> }
                      </button>
                    }
                  </div>
                } @else if (auth.isLoggedIn()) {
                  <div class="login-gate">
                    <app-ui-icon name="info" />
                    <div><strong>Necesitas una cuenta de cliente</strong><p>Iniciaste sesión como {{ roleLabel() }}. Para pedir turnos, ingresa con una cuenta de cliente.</p></div>
                  </div>
                } @else {
                  <div class="login-gate">
                    <app-ui-icon name="lock" />
                    <div>
                      <strong>Inicia sesión para confirmar tu turno</strong>
                      <p>Guardamos tu selección. Ingresa o crea tu cuenta gratis y vuelves aquí para confirmar.</p>
                      <div class="form-actions-row">
                        <button type="button" class="btn btn-primary" (click)="goAuth('/login')">Ingresar</button>
                        <button type="button" class="btn btn-secondary" (click)="goAuth('/registro')">Crear cuenta</button>
                      </div>
                    </div>
                  </div>
                }
              </section>
            }
          </div>
          <aside class="booking-sidebar" aria-label="Resumen e información del negocio">
            <div class="card">
              <div class="summary-title"><app-ui-icon name="calendar-check" /> Tu reserva</div>
              @if (selectedService(); as svc) {
                <div class="summary-line"><app-ui-icon name="layers" /><div><small>Servicio</small><strong>{{ svc.name }}</strong></div></div>
                <div class="summary-line"><app-ui-icon name="calendar" /><div><small>Fecha</small><strong>{{ date | date:'EEEE d MMM' }}</strong></div></div>
                <div class="summary-line"><app-ui-icon name="clock" /><div><small>Hora</small><strong>{{ chosenSlot ? (chosenSlot | date:'h:mm a') : 'Por elegir' }}</strong></div></div>
                @if (chosenStaff && staffName(chosenStaff)) { <div class="summary-line"><app-ui-icon name="user" /><div><small>Te atiende</small><strong>{{ staffName(chosenStaff) }}</strong></div></div> }
                <div class="summary-total"><span>Total</span><strong>{{ svc.priceCop | number }} COP</strong></div>
              } @else {
                <p class="booking-placeholder">Selecciona un servicio para ver los detalles de tu cita aquí.</p>
              }
            </div>
            <div class="card biz-info">
              <h2 class="card-title">Sobre el negocio</h2>
              @if (s.branding?.about) { <p class="biz-about">{{ s.branding!.about }}</p> }
              <ul class="biz-contact">
                @if (s.branding?.address) { <li><app-ui-icon name="map-pin" /><a [href]="mapsUrl()" target="_blank" rel="noopener noreferrer">{{ s.branding!.address }}</a></li> }
                @else if (s.location) { <li><app-ui-icon name="map-pin" /><a [href]="mapsUrl()" target="_blank" rel="noopener noreferrer">Ver ubicación en el mapa</a></li> }
                @if (s.branding?.phone) { <li><app-ui-icon name="phone" /><a [href]="'tel:' + s.branding!.phone">{{ s.branding!.phone }}</a></li> }
                @if (s.branding?.email) { <li><app-ui-icon name="mail" /><a [href]="'mailto:' + s.branding!.email">{{ s.branding!.email }}</a></li> }
                @if (s.branding?.instagram) { <li><app-ui-icon name="instagram" /><a [href]="instagramUrl()" target="_blank" rel="noopener noreferrer">{{ instagramHandle() }}</a></li> }
                @if (s.branding?.website) { <li><app-ui-icon name="globe" /><a [href]="s.branding!.website" target="_blank" rel="noopener noreferrer">Sitio web</a></li> }
              </ul>
            </div>
          </aside>
        </div>
      </main>
      @if (toast()) { <div class="feedback-toast feedback-success" role="status"><app-ui-icon name="check-circle" /><span>{{ toast() }}</span><button type="button" class="feedback-close" aria-label="Cerrar" (click)="toast.set('')">×</button></div> }
    } @else {
      <main class="container" style="padding-top:3rem">
        @if (siteError()) {
          <div class="empty-state"><span class="empty-icon"><app-ui-icon name="alert" /></span><h2>No encontramos este negocio</h2><p style="margin:.5rem 0 1.2rem">{{ siteError() }}</p><div class="form-actions-row" style="justify-content:center"><button class="btn btn-secondary" (click)="loadSite()">Reintentar</button><a class="btn btn-primary" routerLink="/">Explorar negocios</a></div></div>
        } @else { <div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span> Cargando negocio…</div> }
      </main>
    }
  `,
})
export class PublicSitePage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private theme = inject(ThemeService);
  auth = inject(AuthService);

  slug = '';
  today = this.isoDate(new Date());
  date = this.today;
  nextDays = this.buildDays(10);

  site = signal<PublicSite | null>(null);
  selectedService = signal<Service | null>(null);
  availability = signal<Availability | null>(null);
  loadingSlots = signal(false);
  booking = signal(false);
  done = signal(false);
  error = signal('');
  siteError = signal('');
  slotError = signal('');
  toast = signal('');
  private availabilityRequest = 0;
  private pendingSlot: { staffId: string; slot: string } | null = null;

  chosenStaff = '';
  chosenSlot = '';
  customerPhone = '';

  currentUrl = computed(() => this.router.url.split('#')[0]);
  roleLabel = computed(() => ({ superadmin: 'superadministrador', owner: 'dueño de negocio', staff: 'empleado', customer: 'cliente' })[this.auth.role() ?? 'customer']);

  ngOnInit(): void {
    this.slug = (this.route.snapshot.paramMap.get('slug') ?? '').toLowerCase();
    this.loadSite();
  }

  ngOnDestroy(): void { this.theme.reset(); }

  loadSite(): void {
    this.siteError.set('');
    this.api.get<PublicSite>(`/public/${this.slug}`).subscribe({
      next: (s) => {
        this.site.set(s);
        this.theme.apply(s.branding?.primaryColor, s.branding?.secondaryColor);
        document.title = `${s.name} · Pide tu turno`;
        this.restorePending(s);
      },
      error: () => this.siteError.set('Verifica el link o explora otros negocios de la comunidad.'),
    });
  }

  staffName(id: string): string {
    return this.site()?.staff?.find((x) => x.id === id)?.fullName ?? '';
  }

  pickService(svc: Service): void {
    this.selectedService.set(svc);
    this.done.set(false);
    this.error.set('');
    this.loadAvailability();
  }

  pickDate(iso: string): void {
    this.date = iso;
    this.loadAvailability();
  }

  loadAvailability(): void {
    const svc = this.selectedService();
    if (!svc) return;
    if (this.date < this.today) this.date = this.today;
    const request = ++this.availabilityRequest;
    this.availability.set(null);
    this.slotError.set('');
    this.loadingSlots.set(true);
    this.chosenSlot = '';
    this.chosenStaff = '';
    this.done.set(false);
    this.api
      .get<Availability>(`/public/${this.slug}/availability`, { serviceId: svc.id, date: this.date })
      .subscribe({
        next: (av) => {
          if (request !== this.availabilityRequest) return;
          this.availability.set(av);
          this.loadingSlots.set(false);
          // Restaura el horario elegido antes de iniciar sesión, si sigue libre.
          const p = this.pendingSlot;
          if (p && av.options.some((o) => o.staffId === p.staffId && o.slots.includes(p.slot))) {
            this.chooseSlot(p.staffId, p.slot);
            setTimeout(() => document.getElementById('step-confirm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
          }
          this.pendingSlot = null;
        },
        error: () => {
          if (request !== this.availabilityRequest) return;
          this.loadingSlots.set(false);
          this.slotError.set('No pudimos consultar los horarios. Intenta nuevamente.');
        },
      });
  }

  chooseSlot(staffId: string, slot: string): void {
    this.chosenStaff = staffId;
    this.chosenSlot = slot;
    this.done.set(false);
    this.error.set('');
  }

  /** Guarda la selección y va al login/registro; luego vuelve a esta página. */
  goAuth(path: '/login' | '/registro'): void {
    const svc = this.selectedService();
    if (svc && this.chosenSlot) {
      this.savePending({ serviceId: svc.id, date: this.date, staffId: this.chosenStaff, slot: this.chosenSlot });
    }
    void this.router.navigate([path], { queryParams: { returnUrl: this.currentUrl() } });
  }

  book(): void {
    const svc = this.selectedService();
    if (!svc || !this.chosenSlot) return;
    this.booking.set(true);
    this.error.set('');
    this.api
      .post(`/public/${this.slug}/book`, {
        serviceId: svc.id,
        staffId: this.chosenStaff,
        startsAt: this.chosenSlot,
        customerPhone: this.customerPhone.trim() || undefined,
      })
      .subscribe({
        next: () => { this.booking.set(false); this.done.set(true); this.clearPending(); },
        error: (e) => {
          this.booking.set(false);
          if (e?.status === 401) { this.auth.logout(); this.error.set('Tu sesión venció. Ingresa de nuevo.'); return; }
          this.error.set(e?.error?.error ?? 'No se pudo reservar');
          if (e?.status === 409) this.loadAvailability();
        },
      });
  }

  resetBooking(): void {
    this.done.set(false);
    this.chosenSlot = '';
    this.chosenStaff = '';
    this.loadAvailability();
  }

  async share(): Promise<void> {
    const s = this.site();
    if (!s) return;
    const url = `${location.origin}/${this.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: s.name, text: `Pide tu turno en ${s.name}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.toast.set('Link copiado. ¡Compártelo!');
    } catch {
      /* el usuario canceló */
    }
  }

  coverBg(): string {
    const b = this.site()?.branding;
    return `linear-gradient(120deg, ${b?.primaryColor ?? '#3458E8'}, ${b?.secondaryColor ?? '#203CB3'})`;
  }

  mapsUrl(): string {
    const s = this.site();
    if (s?.location) return `https://www.google.com/maps/search/?api=1&query=${s.location.lat},${s.location.lng}`;
    const q = [s?.branding?.address, s?.city].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  instagramHandle(): string {
    const raw = this.site()?.branding?.instagram ?? '';
    const m = /instagram\.com\/([^/?#]+)/i.exec(raw);
    return '@' + (m ? m[1] : raw.replace(/^@/, ''));
  }

  instagramUrl(): string {
    return `https://instagram.com/${this.instagramHandle().slice(1)}`;
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  }

  private restorePending(s: PublicSite): void {
    const p = this.readPending();
    if (!p) return;
    const svc = s.services.find((x) => x.id === p.serviceId);
    if (!svc || p.date < this.today) { this.clearPending(); return; }
    this.date = p.date;
    this.pendingSlot = { staffId: p.staffId, slot: p.slot };
    this.pickService(svc);
  }

  private savePending(p: PendingBooking): void {
    try { sessionStorage.setItem(`${PENDING_KEY}:${this.slug}`, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
  }
  private readPending(): PendingBooking | null {
    try {
      const raw = sessionStorage.getItem(`${PENDING_KEY}:${this.slug}`);
      return raw ? (JSON.parse(raw) as PendingBooking) : null;
    } catch { return null; }
  }
  private clearPending(): void {
    try { sessionStorage.removeItem(`${PENDING_KEY}:${this.slug}`); } catch { /* sin almacenamiento */ }
  }

  private isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private buildDays(n: number): { iso: string; weekday: string; day: number; month: string }[] {
    const out = [];
    const base = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      out.push({
        iso: this.isoDate(d),
        weekday: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''),
        day: d.getDate(),
        month: d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
      });
    }
    return out;
  }
}
