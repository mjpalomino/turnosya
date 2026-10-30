import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { UiIconComponent } from '../ui/icon.component';
import { BrandLockupComponent } from '../ui/brand-lockup.component';
import type { Appointment, LoyaltyCard } from '../core/models';

/** Panel del cliente: sus citas y su tarjeta de fidelización. */
@Component({
  selector: 'app-customer-appointments',
  standalone: true,
  imports: [DatePipe, RouterLink, UiIconComponent, BrandLockupComponent],
  template: `
    <a class="skip-link" href="#main-content">Saltar al contenido</a>
    <header class="topbar"><div class="container topbar-inner"><a routerLink="/" class="topbar-brand" aria-label="Ir al inicio"><app-brand-lockup subtitle="Tus reservas" /></a><div class="topbar-actions"><span class="role-badge">Cliente</span><button class="btn btn-subtle btn-sm" (click)="logout()"><app-ui-icon name="logout" /> Salir</button></div></div></header>
    <main id="main-content" class="container page-shell section-stack">
      <div class="page-hero"><div><span class="eyebrow">Mi espacio personal</span><h1>Tus citas, siempre a mano.</h1><p>Consulta tus reservas, califica tus experiencias y disfruta tus beneficios.</p></div></div>
      <div class="customer-cta card">
        <span class="metric-icon"><app-ui-icon name="compass" /></span>
        <div><strong>¿Necesitas otro turno?</strong><p class="muted">Explora los negocios de la comunidad y reserva en segundos.</p></div>
        <a class="btn btn-primary" routerLink="/">Explorar negocios <app-ui-icon name="arrow-right" /></a>
      </div>
      @for (c of cards(); track c.tenantId) {
        <section class="card loyalty-card section-stack" [attr.aria-label]="'Tarjeta de fidelización de ' + c.businessName" style="gap:.85rem">
          <div class="panel-head"><div><span class="eyebrow">Tarjeta de fidelización</span><h2 style="font-size:1.25rem;margin-top:.35rem">{{ c.businessName }}</h2><p class="muted" style="margin-top:.35rem">Acumula {{ c.threshold }} sellos para {{ c.rewardLabel }}.</p></div><span class="metric-icon"><app-ui-icon name="gift" /></span></div>
          <div class="loyalty-progress" [attr.aria-label]="c.stickers + ' de ' + c.threshold + ' sellos acumulados'" role="img">
            @for (i of range(c.threshold); track i) { <span class="sticker" [class.filled]="i < c.stickers" aria-hidden="true"><app-ui-icon name="star" /></span> }
          </div>
          <div class="data-pair"><span class="badge badge-neutral">{{ c.stickers }} / {{ c.threshold }} sellos</span><a [routerLink]="['/', c.businessSlug]">Pedir turno aquí <app-ui-icon name="arrow-right" /></a></div>
          @if (c.stickers >= c.threshold) { <div><button class="btn btn-primary" (click)="redeem(c)"><app-ui-icon name="gift" /> Canjear {{ c.rewardLabel }}</button></div> }
        </section>
      }
      <section class="section-stack" aria-labelledby="customer-appts-title">
        <div class="section-heading"><div><h2 id="customer-appts-title">Historial de reservas</h2><p>Próximas y pasadas, todas en un lugar.</p></div><span class="badge badge-neutral">{{ appts().length }} citas</span></div>
        <div class="record-list">
          @for (a of appts(); track a.id) {
            <article class="card section-stack" style="gap:1rem">
              <div class="record-card" style="padding:0;border:0;box-shadow:none">
                <div class="record-main">@if (a.businessName) { <a class="record-business" [routerLink]="['/', a.businessSlug]"><app-ui-icon name="store" /> {{ a.businessName }}</a> }<strong class="record-title">{{ a.serviceName }}</strong><span class="record-meta"><app-ui-icon name="calendar" /> {{ a.startsAt | date:'EEE d MMM, HH:mm' }}</span>@if (a.staffName) { <span class="record-meta">Con {{ a.staffName }}</span> }<span class="badge" [class]="badgeClass(a.status)">{{ label(a.status) }}</span></div>
                @if (a.status === 'booked' || a.status === 'confirmed') { <button class="btn btn-outline-danger btn-sm" (click)="cancel(a)">Cancelar cita</button> }
              </div>
              @if (a.status === 'completed' && !reviewed().has(a.id)) {
                <div class="review">
                  <span class="field-label">¿Cómo te fue?</span>
                  <div class="rating-group" role="group" [attr.aria-label]="'Calificación para ' + a.serviceName">
                    @for (star of [1,2,3,4,5]; track star) {
                      <button class="star" type="button" [class.on]="(ratingFor()[a.id] ?? 0) >= star" [attr.aria-pressed]="ratingFor()[a.id] === star" [attr.aria-label]="star + ' estrella' + (star === 1 ? '' : 's')" (click)="setRating(a.id, star)"><app-ui-icon name="star" /></button>
                    }
                  </div>
                  <label class="sr-only" [for]="'review-' + a.id">Comentario opcional sobre la cita</label>
                  <input class="input review-input" [id]="'review-' + a.id" placeholder="Comentario (opcional)" [value]="commentFor()[a.id] ?? ''" (input)="setComment(a.id, $event)" />
                  <button class="btn btn-secondary btn-sm" (click)="sendReview(a)">Enviar reseña</button>
                </div>
              }
              @if (reviewed().has(a.id)) { <span class="badge badge-ok" role="status"><app-ui-icon name="check-circle" /> ¡Gracias por tu reseña!</span> }
            </article>
          }
          @if (appts().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="calendar" /></span><h3>Todavía no tienes citas</h3><p>Tus próximas reservas aparecerán aquí.</p><a class="btn btn-primary" style="margin-top:1rem" routerLink="/">Buscar un negocio</a></div> }
        </div>
      </section>
      @if (feedback(); as f) {
        <div class="feedback-toast" [class.feedback-error]="f.type === 'error'" [class.feedback-success]="f.type === 'ok'" [attr.role]="f.type === 'error' ? 'alert' : 'status'">
          <app-ui-icon [name]="f.type === 'error' ? 'alert' : 'check-circle'" />
          <span>{{ f.message }}</span>
          <button type="button" class="feedback-close" aria-label="Cerrar notificación" (click)="feedback.set(null)">×</button>
        </div>
      }
    </main>
  `,
})
export class CustomerAppointmentsPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  appts = signal<Appointment[]>([]);
  cards = signal<LoyaltyCard[]>([]);
  reviewed = signal<Set<string>>(new Set());
  ratingFor = signal<Record<string, number>>({});
  commentFor = signal<Record<string, string>>({});
  feedback = signal<{ type: 'error' | 'ok'; message: string } | null>(null);

  ngOnInit(): void {
    this.load();
    this.loadCards();
  }

  load(): void {
    this.api.get<Appointment[]>('/customer/appointments').subscribe({ next: (r) => this.appts.set(r) });
  }

  cancel(a: Appointment): void {
    this.api.post(`/customer/appointments/${a.id}/cancel`, {}).subscribe({
      next: () => this.load(),
      error: (e) => this.notify(e?.error?.error ?? 'No se pudo cancelar.'),
    });
  }

  loadCards(): void {
    this.api.get<LoyaltyCard[]>('/loyalty/cards').subscribe({ next: (c) => this.cards.set(c) });
  }

  redeem(c: LoyaltyCard): void {
    this.api.post('/loyalty/redeem-reward', { tenantId: c.tenantId }).subscribe({
      next: () => { this.notify('¡Premio canjeado! Muéstralo en el negocio.', 'ok'); this.loadCards(); },
      error: (e) => this.notify(e?.error?.error ?? 'No se pudo canjear.'),
    });
  }

  setRating(id: string, star: number): void {
    this.ratingFor.update((m) => ({ ...m, [id]: star }));
  }
  setComment(id: string, e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this.commentFor.update((m) => ({ ...m, [id]: val }));
  }
  sendReview(a: Appointment): void {
    const rating = this.ratingFor()[a.id] ?? 0;
    if (rating < 1) { this.notify('Elige de 1 a 5 estrellas.'); return; }
    this.api
      .post(`/customer/appointments/${a.id}/review`, { rating, comment: this.commentFor()[a.id] || undefined })
      .subscribe({
        next: () => this.reviewed.update((s) => new Set(s).add(a.id)),
        error: (e) => this.notify(e?.error?.error ?? 'No se pudo enviar la reseña.'),
      });
  }

  label(s: Appointment['status']): string {
    return { booked: 'Reservada', confirmed: 'Confirmada', completed: 'Atendida', no_show: 'No vino', cancelled: 'Cancelada' }[s];
  }
  badgeClass(s: Appointment['status']): string {
    if (s === 'completed' || s === 'confirmed') return 'badge-ok';
    if (s === 'no_show' || s === 'cancelled') return 'badge-danger';
    return 'badge-warn';
  }

  range(n: number): number[] { return Array.from({ length: n }, (_, i) => i); }
  private notify(message: string, type: 'error' | 'ok' = 'error'): void { this.feedback.set({ message, type }); }

  logout(): void { this.auth.logout(); this.router.navigate(['/']); }
}
