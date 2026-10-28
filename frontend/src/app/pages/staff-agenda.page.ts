import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Router } from '@angular/router';
import QRCode from 'qrcode';
import type { Appointment } from '../core/models';

interface ScheduleSlot { weekday: number; startTime: string; endTime: string; }
interface TimeOff { id: string; startsAt: string; endsAt: string; reason?: string; }

/**
 * Panel del empleado. Tres pestañas:
 *  - Agenda: sus citas del día, marca estado, genera QR de fidelización.
 *  - Mi horario: su horario semanal (solo lectura; lo define el dueño).
 *  - Bloqueos: ver y crear bloqueos de sus horas libres.
 */
@Component({
  selector: 'app-staff-agenda',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <header class="topbar">
      <div class="container row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0;color:#fff">Mi agenda</h2>
        <button class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.4)" (click)="logout()">Salir</button>
      </div>
    </header>

    <div class="container stack">
      <nav class="tabs">
        <button class="tab" [class.active]="tab()==='agenda'" (click)="tab.set('agenda')">Agenda</button>
        <button class="tab" [class.active]="tab()==='schedule'" (click)="tab.set('schedule'); loadSchedule()">Mi horario</button>
        <button class="tab" [class.active]="tab()==='timeoff'" (click)="tab.set('timeoff'); loadTimeOff()">Bloqueos</button>
      </nav>

      <!-- AGENDA -->
      @if (tab()==='agenda') {
        <div class="row" style="align-items:center">
          <input class="input" style="max-width:200px" type="date" [value]="date" (change)="onDate($event)" />
          <button class="btn btn-primary" (click)="genQr()">Generar QR fidelización</button>
        </div>

        @if (qrToken()) {
          <div class="card" style="max-width:320px;text-align:center">
            <p class="muted">Pide al cliente que escanee este código. Caduca en 5 min.</p>
            <img [src]="qrImage()" alt="QR" style="width:220px;height:220px" />
          </div>
        }

        @if (loading()) { <p class="muted">Cargando…</p> }
        @if (!loading() && appts().length === 0) { <p class="muted">Sin citas este día.</p> }

        <div class="stack">
          @for (a of appts(); track a.id) {
            <div class="card row" style="justify-content:space-between;align-items:center">
              <div>
                <strong>{{ a.startsAt | date: 'HH:mm' }} – {{ a.endsAt | date: 'HH:mm' }}</strong>
                <div>{{ a.serviceName }} · {{ a.customerName }}</div>
                @if (a.customerPhone) { <div class="muted">{{ a.customerPhone }}</div> }
                <span class="badge" [class]="badgeClass(a.status)">{{ label(a.status) }}</span>
              </div>
              @if (a.status === 'booked' || a.status === 'confirmed') {
                <div class="row">
                  <button class="btn btn-ghost" (click)="setStatus(a, 'completed')">Atendido</button>
                  <button class="btn btn-ghost" (click)="setStatus(a, 'no_show')">No vino</button>
                  <button class="btn btn-danger" (click)="setStatus(a, 'cancelled')">Cancelar</button>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- MI HORARIO -->
      @if (tab()==='schedule') {
        @if (schedule().length === 0) {
          <p class="muted">Tu dueño aún no define tu horario semanal.</p>
        }
        <div class="stack">
          @for (s of schedule(); track s.weekday + s.startTime) {
            <div class="card row" style="justify-content:space-between">
              <strong>{{ dayName(s.weekday) }}</strong>
              <span>{{ s.startTime }} – {{ s.endTime }}</span>
            </div>
          }
        </div>
      }

      <!-- BLOQUEOS -->
      @if (tab()==='timeoff') {
        <div class="card stack" style="max-width:440px">
          <h3>Bloquear mis horas</h3>
          <div class="row">
            <div class="field"><label>Desde</label><input class="input" type="datetime-local" [(ngModel)]="offStart" /></div>
            <div class="field"><label>Hasta</label><input class="input" type="datetime-local" [(ngModel)]="offEnd" /></div>
          </div>
          <div class="field"><label>Motivo (opcional)</label><input class="input" [(ngModel)]="offReason" /></div>
          <button class="btn btn-primary" (click)="addTimeOff()">Bloquear</button>
          @if (offError()) { <p class="error">{{ offError() }}</p> }
        </div>
        <div class="stack">
          @for (t of timeOff(); track t.id) {
            <div class="card">
              {{ t.startsAt | date: 'd MMM HH:mm' }} – {{ t.endsAt | date: 'd MMM HH:mm' }}
              @if (t.reason) { <span class="muted"> · {{ t.reason }}</span> }
            </div>
          }
          @if (timeOff().length === 0) { <p class="muted">Sin bloqueos próximos.</p> }
        </div>
      }
    </div>
  `,
})
export class StaffAgendaPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  tab = signal<'agenda' | 'schedule' | 'timeoff'>('agenda');
  date = new Date().toISOString().slice(0, 10);
  appts = signal<Appointment[]>([]);
  loading = signal(false);
  qrToken = signal('');
  qrImage = signal('');

  schedule = signal<ScheduleSlot[]>([]);
  timeOff = signal<TimeOff[]>([]);
  offStart = '';
  offEnd = '';
  offReason = '';
  offError = signal('');

  ngOnInit(): void { this.load(); }

  onDate(e: Event): void {
    this.date = (e.target as HTMLInputElement).value;
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const from = `${this.date}T00:00:00.000Z`;
    const to = `${this.date}T23:59:59.999Z`;
    this.api.get<Appointment[]>('/agenda/me', { from, to }).subscribe({
      next: (rows) => { this.appts.set(rows); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadSchedule(): void {
    this.api.get<ScheduleSlot[]>('/agenda/schedule').subscribe({ next: (r) => this.schedule.set(r) });
  }

  loadTimeOff(): void {
    this.api.get<TimeOff[]>('/agenda/time-off').subscribe({ next: (r) => this.timeOff.set(r) });
  }

  addTimeOff(): void {
    this.offError.set('');
    if (!this.offStart || !this.offEnd) { this.offError.set('Indica desde y hasta'); return; }
    this.api
      .post('/agenda/time-off', {
        startsAt: new Date(this.offStart).toISOString(),
        endsAt: new Date(this.offEnd).toISOString(),
        reason: this.offReason || undefined,
      })
      .subscribe({
        next: () => { this.offStart = this.offEnd = this.offReason = ''; this.loadTimeOff(); },
        error: (e) => this.offError.set(e?.error?.error ?? 'No se pudo bloquear'),
      });
  }

  setStatus(a: Appointment, status: Appointment['status']): void {
    this.api.post(`/agenda/appointments/${a.id}/status`, { status }).subscribe({ next: () => this.load() });
  }

  genQr(): void {
    this.api.post<{ token: string }>('/loyalty/token', {}).subscribe({
      next: async (res) => {
        this.qrToken.set(res.token);
        const payload = `${location.origin}/fidelizacion?t=${res.token}`;
        try {
          const dataUrl = await QRCode.toDataURL(payload, { width: 220, margin: 1 });
          this.qrImage.set(dataUrl);
        } catch {
          this.qrImage.set('');
          alert('No se pudo generar el QR');
        }
      },
      error: (e) => alert(e?.error?.error ?? 'No se pudo generar el QR'),
    });
  }

  dayName(w: number): string {
    return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][w] ?? '';
  }
  label(s: Appointment['status']): string {
    return { booked: 'Reservada', confirmed: 'Confirmada', completed: 'Atendida', no_show: 'No vino', cancelled: 'Cancelada' }[s];
  }
  badgeClass(s: Appointment['status']): string {
    if (s === 'completed' || s === 'confirmed') return 'badge-ok';
    if (s === 'no_show' || s === 'cancelled') return 'badge-danger';
    return 'badge-warn';
  }

  logout(): void { this.auth.logout(); this.router.navigate(['/login']); }
}
