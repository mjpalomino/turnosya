import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { UiIconComponent } from '../ui/icon.component';
import type { Availability, PublicSite, Service } from '../core/models';

/**
 * Sitio público del negocio en /sitio/:slug.
 * Aplica la marca del dueño (colores/logo) y permite reservar paso a paso:
 * 1) elegir servicio  2) elegir día  3) elegir hora  4) datos  5) confirmar.
 */
@Component({
  selector: 'app-public-site',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, RouterLink, UiIconComponent],
  template: `
    @if (site(); as s) {
      <a class="skip-link" href="#main-content">Saltar al contenido</a>
      <header class="site-header">
        <div class="container">
          <div class="site-identity">
            @if (s.branding?.logoUrl) {
              <img class="site-logo" [src]="s.branding!.logoUrl" [alt]="'Logo de ' + s.name" />
            } @else {
              <span class="brand-mark"><app-ui-icon name="store" /></span>
            }
            <div><span class="brand-small">Reservas en línea</span><h1>{{ s.name }}</h1></div>
          </div>
          <nav class="site-actions" aria-label="Acciones del negocio">
            <a class="btn btn-secondary btn-sm" [routerLink]="['/registro', slug]"><app-ui-icon name="users" /> Crear cuenta</a>
            @if (s.branding?.whatsappNumber) {
              <a class="btn btn-primary btn-sm" [href]="'https://wa.me/' + s.branding!.whatsappNumber" target="_blank" rel="noopener noreferrer"><app-ui-icon name="phone" /> WhatsApp <span class="sr-only">(abre en una pestaña nueva)</span></a>
            }
          </nav>
        </div>
      </header>
      <main id="main-content" class="container">
        <div class="site-intro">
          <span class="eyebrow">Reserva en minutos</span>
          <h2>Encuentra tu próximo espacio.</h2>
          <p>{{ s.branding?.about || 'Elige el servicio, la fecha y el horario que mejor se adapten a ti. Así de sencillo.' }}</p>
        </div>
        <div class="booking-grid">
          <div class="booking-main">
            <section class="card booking-section" aria-labelledby="step-service">
              <div class="booking-step-header">
                <span class="step-number">01</span>
                <div><h3 id="step-service">Elige tu servicio</h3><p>Selecciona qué te gustaría reservar.</p></div>
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
                @if (s.services.length === 0) { <p class="booking-placeholder">Este negocio aún no tiene servicios disponibles.</p> }
              </div>
            </section>
            @if (selectedService()) {
              <section class="card booking-section" aria-labelledby="step-date">
                <div class="booking-step-header"><span class="step-number">02</span><div><h3 id="step-date">Elige fecha y hora</h3><p>Consulta los espacios disponibles para tu visita.</p></div></div>
                <div class="field" style="max-width:260px;margin-bottom:1.2rem">
                  <label for="booking-date">Fecha de la reserva</label>
                  <input id="booking-date" class="input" type="date" [min]="today" [(ngModel)]="date" (change)="loadAvailability()" />
                </div>
                @if (loadingSlots()) { <div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span> Buscando horarios disponibles…</div> }
                @if (slotError()) { <p class="error" role="alert">{{ slotError() }}</p> }
                @if (availability(); as av) {
                  @if (av.options.length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="calendar" /></span><h3>Sin horarios por ahora</h3><p>Prueba con otra fecha para encontrar disponibilidad.</p></div> }
                  @for (opt of av.options; track opt.staffId; let i = $index) {
                    @if (av.options.length > 1) { <p class="section-kicker" style="margin-bottom:.55rem">Profesional {{ i + 1 }}</p> }
                    <div class="slots" style="margin-bottom:.8rem">
                      @for (slot of opt.slots; track slot) {
                        <button type="button" class="btn btn-ghost slot" [class.selected]="chosenSlot === slot && chosenStaff === opt.staffId"
                                [attr.aria-pressed]="chosenSlot === slot && chosenStaff === opt.staffId"
                                [attr.aria-label]="'Elegir horario ' + (slot | date:'HH:mm')" (click)="chooseSlot(opt.staffId, slot)">{{ slot | date:'HH:mm' }}</button>
                      }
                    </div>
                  }
                }
              </section>
            }
            @if (chosenSlot) {
              <section class="card booking-section" aria-labelledby="step-confirm">
                <div class="booking-step-header"><span class="step-number">03</span><div><h3 id="step-confirm">Confirma tus datos</h3><p>Solo necesitamos unos datos para completar tu reserva.</p></div></div>
                <div class="form-stack">
                  <div class="field"><label for="booking-name">Nombre completo</label><input id="booking-name" class="input" [(ngModel)]="customerName" autocomplete="name" placeholder="¿Cómo te llamas?" [disabled]="done()" /></div>
                  <div class="field"><label for="booking-phone">Teléfono (opcional)</label><input id="booking-phone" class="input" type="tel" [(ngModel)]="customerPhone" autocomplete="tel" placeholder="Número de contacto" [disabled]="done()" /></div>
                  @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
                  @if (done()) {
                    <div class="booking-done" role="status"><app-ui-icon name="check-circle" /><div><strong>¡Cita reservada!</strong><small>Te esperamos en el horario seleccionado.</small></div></div>
                  } @else {
                    <button type="button" class="btn btn-primary btn-lg" [disabled]="booking()" [attr.aria-busy]="booking()" (click)="book()">
                      @if (booking()) { <span class="spinner" aria-hidden="true"></span> Reservando… }
                      @else { Confirmar cita <app-ui-icon name="arrow-right" /> }
                    </button>
                  }
                </div>
              </section>
            }
          </div>
          <aside class="booking-sidebar" aria-label="Resumen de la reserva">
            <div class="card">
              <div class="summary-title"><app-ui-icon name="calendar-check" /> Tu reserva</div>
              @if (selectedService(); as svc) {
                <div class="summary-line"><app-ui-icon name="layers" /><div><small>Servicio</small><strong>{{ svc.name }}</strong></div></div>
                <div class="summary-line"><app-ui-icon name="calendar" /><div><small>Fecha</small><strong>{{ date }}</strong></div></div>
                <div class="summary-line"><app-ui-icon name="clock" /><div><small>Hora</small><strong>{{ chosenSlot ? (chosenSlot | date:'HH:mm') : 'Por elegir' }}</strong></div></div>
                <div class="summary-total"><span>Total</span><strong>{{ svc.priceCop | number }} COP</strong></div>
              } @else {
                <p class="booking-placeholder">Selecciona un servicio para ver los detalles de tu cita aquí.</p>
              }
            </div>
          </aside>
        </div>
      </main>
    } @else {
      <main class="container" style="padding-top:3rem">
        @if (siteError()) {
          <div class="empty-state"><span class="empty-icon"><app-ui-icon name="alert" /></span><h2>No pudimos cargar este sitio</h2><p style="margin:.5rem 0 1.2rem">{{ siteError() }}</p><button class="btn btn-primary" (click)="loadSite()">Reintentar</button></div>
        } @else { <div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span> Cargando sitio…</div> }
      </main>
    }
  `,
})
export class PublicSitePage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private theme = inject(ThemeService);

  slug = '';
  today = new Date().toISOString().slice(0, 10);
  date = this.today;

  site = signal<PublicSite | null>(null);
  selectedService = signal<Service | null>(null);
  availability = signal<Availability | null>(null);
  loadingSlots = signal(false);
  booking = signal(false);
  done = signal(false);
  error = signal('');
  siteError = signal('');
  slotError = signal('');
  private availabilityRequest = 0;

  chosenStaff = '';
  chosenSlot = '';
  customerName = '';
  customerPhone = '';

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.loadSite();
  }

  ngOnDestroy(): void { this.theme.reset(); }

  loadSite(): void {
    this.siteError.set('');
    this.api.get<PublicSite>(`/public/${this.slug}`).subscribe({
      next: (s) => {
        this.site.set(s);
        this.theme.apply(s.branding?.primaryColor, s.branding?.secondaryColor);
      },
      error: () => this.siteError.set('Verifica la dirección o intenta nuevamente.'),
    });
  }

  pickService(svc: Service): void {
    this.selectedService.set(svc);
    this.availability.set(null);
    this.done.set(false);
    this.error.set('');
    this.chosenStaff = '';
    this.chosenSlot = '';
    this.loadAvailability();
  }

  loadAvailability(): void {
    const svc = this.selectedService();
    if (!svc) return;
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

  book(): void {
    const svc = this.selectedService();
    if (!svc || !this.chosenSlot || !this.customerName) {
      this.error.set('Completa tu nombre');
      return;
    }
    this.booking.set(true);
    this.error.set('');
    this.api
      .post(`/public/${this.slug}/book`, {
        serviceId: svc.id,
        staffId: this.chosenStaff,
        startsAt: this.chosenSlot,
        customerName: this.customerName,
        customerPhone: this.customerPhone || undefined,
      })
      .subscribe({
        next: () => { this.booking.set(false); this.done.set(true); },
        error: (e) => {
          this.booking.set(false);
          this.error.set(e?.error?.error ?? 'No se pudo reservar');
        },
      });
  }
}
