import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import type { Availability, PublicSite, Service } from '../core/models';

/**
 * Sitio público del negocio en /sitio/:slug.
 * Aplica la marca del dueño (colores/logo) y permite reservar paso a paso:
 * 1) elegir servicio  2) elegir día  3) elegir hora  4) datos  5) confirmar.
 */
@Component({
  selector: 'app-public-site',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, RouterLink],
  template: `
    @if (site(); as s) {
      <header class="site-header">
        <div class="container row" style="align-items:center;justify-content:space-between">
          <div class="row" style="align-items:center">
            @if (s.branding?.logoUrl) {
              <img [src]="s.branding!.logoUrl" alt="logo" style="height:44px;border-radius:8px" />
            }
            <h1 style="margin:0;color:#fff">{{ s.name }}</h1>
          </div>
          <div class="row">
            <a class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.4)"
               [routerLink]="['/registro', slug]">Crear cuenta</a>
            @if (s.branding?.whatsappNumber) {
              <a class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.4)"
                 [href]="'https://wa.me/' + s.branding!.whatsappNumber" target="_blank">WhatsApp</a>
            }
          </div>
        </div>
      </header>

      <div class="container stack">
        @if (s.branding?.about) { <p class="muted">{{ s.branding!.about }}</p> }

        <h2>Reserva tu cita</h2>

        <!-- Paso 1: servicio -->
        <div class="grid">
          @for (svc of s.services; track svc.id) {
            <div class="card service-card" [class.selected]="selectedService()?.id === svc.id"
                 (click)="pickService(svc)">
              <h3>{{ svc.name }}</h3>
              <p class="muted">{{ svc.durationMinutes }} min · {{ svc.priceCop | number }} COP</p>
              @if (svc.description) { <p class="muted" style="font-size:.85rem">{{ svc.description }}</p> }
            </div>
          }
        </div>

        <!-- Paso 2: día -->
        @if (selectedService()) {
          <div class="field" style="max-width:260px">
            <label>Elige el día</label>
            <input class="input" type="date" [min]="today" [(ngModel)]="date" (change)="loadAvailability()" />
          </div>
        }

        <!-- Paso 3: horas -->
        @if (loadingSlots()) { <p class="muted">Buscando horarios…</p> }
        @if (availability(); as av) {
          @if (av.options.length === 0) {
            <p class="muted">No hay horarios libres ese día. Prueba otra fecha.</p>
          }
          @for (opt of av.options; track opt.staffId) {
            <div class="stack">
              <div class="slots">
                @for (slot of opt.slots; track slot) {
                  <button class="btn btn-ghost slot" [class.selected]="chosenSlot === slot"
                          (click)="chooseSlot(opt.staffId, slot)">
                    {{ slot | date: 'HH:mm' }}
                  </button>
                }
              </div>
            </div>
          }
        }

        <!-- Paso 4: datos + confirmar -->
        @if (chosenSlot) {
          <div class="card stack" style="max-width:420px">
            <h3>Tus datos</h3>
            <div class="field"><label>Nombre</label><input class="input" [(ngModel)]="customerName" /></div>
            <div class="field"><label>Teléfono</label><input class="input" [(ngModel)]="customerPhone" /></div>
            @if (error()) { <p class="error">{{ error() }}</p> }
            @if (done()) {
              <p class="badge badge-ok">¡Cita reservada! Te esperamos.</p>
            } @else {
              <button class="btn btn-primary" [disabled]="booking()" (click)="book()">
                {{ booking() ? 'Reservando…' : 'Confirmar cita' }}
              </button>
            }
          </div>
        }
      </div>
    } @else {
      <div class="container"><p class="muted">Cargando sitio…</p></div>
    }
  `,
  styles: [`
    .site-header { background: var(--brand-primary); padding: 1rem 0; box-shadow: var(--shadow); }
    .service-card { cursor: pointer; transition: box-shadow .15s, border-color .15s; }
    .service-card:hover { box-shadow: var(--shadow-lg); }
    .service-card.selected { border-color: var(--brand-primary); box-shadow: var(--shadow-lg); }
    .slots { display: flex; flex-wrap: wrap; gap: .5rem; }
    .slot.selected { background: var(--brand-primary); color: #fff; border-color: var(--brand-primary); }
  `],
})
export class PublicSitePage implements OnInit {
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

  chosenStaff = '';
  chosenSlot = '';
  customerName = '';
  customerPhone = '';

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.api.get<PublicSite>(`/public/${this.slug}`).subscribe({
      next: (s) => {
        this.site.set(s);
        this.theme.apply(s.branding?.primaryColor, s.branding?.secondaryColor);
      },
    });
  }

  pickService(svc: Service): void {
    this.selectedService.set(svc);
    this.availability.set(null);
    this.chosenSlot = '';
    this.loadAvailability();
  }

  loadAvailability(): void {
    const svc = this.selectedService();
    if (!svc) return;
    this.loadingSlots.set(true);
    this.chosenSlot = '';
    this.api
      .get<Availability>(`/public/${this.slug}/availability`, { serviceId: svc.id, date: this.date })
      .subscribe({
        next: (av) => { this.availability.set(av); this.loadingSlots.set(false); },
        error: () => this.loadingSlots.set(false),
      });
  }

  chooseSlot(staffId: string, slot: string): void {
    this.chosenStaff = staffId;
    this.chosenSlot = slot;
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
