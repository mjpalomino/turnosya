import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import type { Appointment, LoyaltyCard } from '../core/models';

/** Panel del cliente: sus citas y su tarjeta de fidelización. */
@Component({
  selector: 'app-customer-appointments',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <header class="topbar">
      <div class="container row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0;color:#fff">Mis citas</h2>
        <button class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.4)" (click)="logout()">Salir</button>
      </div>
    </header>

    <div class="container stack">
      @if (card(); as c) {
        @if (c.enabled) {
          <div class="card">
            <h3>Tu tarjeta de fidelización</h3>
            <p>{{ c.stickers }} / {{ c.threshold }} sellos para {{ c.rewardLabel }}</p>
            <div class="stickers">
              @for (i of range(c.threshold); track i) {
                <span class="sticker" [class.filled]="i < c.stickers">★</span>
              }
            </div>
            @if (c.stickers >= c.threshold) {
              <button class="btn btn-primary" style="margin-top:.8rem" (click)="redeem()">Canjear {{ c.rewardLabel }}</button>
            }
            <p class="muted" style="margin-top:.6rem"><a routerLink="/fidelizacion">Escanear QR para sumar un sello</a></p>
          </div>
        }
      }

      <h3>Próximas y pasadas</h3>
      @for (a of appts(); track a.id) {
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:center">
            <div>
              <strong>{{ a.startsAt | date: 'EEE d MMM, HH:mm' }}</strong>
              <div>{{ a.serviceName }} · {{ a.staffName }}</div>
              <span class="badge" [class]="badgeClass(a.status)">{{ label(a.status) }}</span>
            </div>
            @if (a.status === 'booked' || a.status === 'confirmed') {
              <button class="btn btn-danger" (click)="cancel(a)">Cancelar</button>
            }
          </div>

          <!-- Reseña: solo en citas atendidas que no se han calificado -->
          @if (a.status === 'completed' && !reviewed().has(a.id)) {
            <div class="review">
              <span class="muted">Califica:</span>
              @for (star of [1,2,3,4,5]; track star) {
                <span class="star" [class.on]="(ratingFor()[a.id] ?? 0) >= star" (click)="setRating(a.id, star)">★</span>
              }
              <input class="input review-input" placeholder="Comentario (opcional)" [value]="commentFor()[a.id] ?? ''"
                     (input)="setComment(a.id, $event)" />
              <button class="btn btn-ghost" (click)="sendReview(a)">Enviar</button>
            </div>
          }
          @if (reviewed().has(a.id)) { <span class="badge badge-ok" style="margin-top:.5rem">¡Gracias por tu reseña!</span> }
        </div>
      }
      @if (appts().length === 0) { <p class="muted">Aún no tienes citas.</p> }
    </div>
  `,
  styles: [`
    .topbar { background: var(--brand-primary); padding: 1rem 0; }
    .stickers { display:flex; gap:.3rem; flex-wrap:wrap; font-size:1.6rem; color: var(--border); }
    .sticker.filled { color: var(--brand-primary); }
    .review { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; margin-top:.8rem; }
    .star { cursor:pointer; font-size:1.4rem; color: var(--border); }
    .star.on { color: var(--warn); }
    .review-input { max-width:220px; }
  `],
})
export class CustomerAppointmentsPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  appts = signal<Appointment[]>([]);
  card = signal<LoyaltyCard | null>(null);
  reviewed = signal<Set<string>>(new Set());
  ratingFor = signal<Record<string, number>>({});
  commentFor = signal<Record<string, string>>({});

  ngOnInit(): void {
    this.load();
    this.api.get<LoyaltyCard>('/loyalty/card').subscribe({ next: (c) => this.card.set(c) });
  }

  load(): void {
    this.api.get<Appointment[]>('/customer/appointments').subscribe({ next: (r) => this.appts.set(r) });
  }

  cancel(a: Appointment): void {
    this.api.post(`/customer/appointments/${a.id}/cancel`, {}).subscribe({
      next: () => this.load(),
      error: (e) => alert(e?.error?.error ?? 'No se pudo cancelar'),
    });
  }

  redeem(): void {
    this.api.post('/loyalty/redeem-reward', {}).subscribe({
      next: () => this.api.get<LoyaltyCard>('/loyalty/card').subscribe({ next: (c) => this.card.set(c) }),
      error: (e) => alert(e?.error?.error ?? 'No se pudo canjear'),
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
    if (rating < 1) { alert('Elige de 1 a 5 estrellas'); return; }
    this.api
      .post(`/customer/appointments/${a.id}/review`, { rating, comment: this.commentFor()[a.id] || undefined })
      .subscribe({
        next: () => this.reviewed.update((s) => new Set(s).add(a.id)),
        error: (e) => alert(e?.error?.error ?? 'No se pudo enviar la reseña'),
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
  logout(): void { this.auth.logout(); this.router.navigate(['/login']); }
}
