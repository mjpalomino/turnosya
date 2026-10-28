import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Router } from '@angular/router';
import QRCode from 'qrcode';
import { UiIconComponent } from '../ui/icon.component';
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
  imports: [DatePipe, FormsModule, UiIconComponent],
  template: `
    <a class="skip-link" href="#main-content">Saltar al contenido</a>
    <header class="topbar"><div class="container topbar-inner"><div class="topbar-brand"><span class="brand-mark"><app-ui-icon name="calendar-check" /></span><div class="brand-stack"><span class="brand-wordmark">Turnos<span>Ya</span></span><span class="brand-small">Espacio de trabajo</span></div></div><div class="topbar-actions"><span class="role-badge">Colaborador</span><button class="btn btn-subtle btn-sm" (click)="logout()"><app-ui-icon name="logout" /> Salir</button></div></div></header>
    <main id="main-content" class="container page-shell section-stack">
      <div class="page-hero"><div><span class="eyebrow">Espacio del colaborador</span><h1>Tu agenda, bajo control.</h1><p>Consulta tus citas, revisa tu horario y administra tus bloqueos.</p></div></div>
      <nav class="tabs" aria-label="Secciones de tu agenda">
        <button class="tab" [class.active]="tab()==='agenda'" [attr.aria-pressed]="tab()==='agenda'" (click)="tab.set('agenda')"><app-ui-icon name="calendar" /> Agenda</button>
        <button class="tab" [class.active]="tab()==='schedule'" [attr.aria-pressed]="tab()==='schedule'" (click)="tab.set('schedule'); loadSchedule()"><app-ui-icon name="clock" /> Mi horario</button>
        <button class="tab" [class.active]="tab()==='timeoff'" [attr.aria-pressed]="tab()==='timeoff'" (click)="tab.set('timeoff'); loadTimeOff()"><app-ui-icon name="layers" /> Bloqueos</button>
      </nav>
      @if (tab()==='agenda') {
        <section class="section-stack" aria-labelledby="staff-appts-title">
          <div class="section-heading"><div><h2 id="staff-appts-title">Mis citas</h2><p>Visualiza las reservas y actualiza su estado.</p></div></div>
          <div class="card agenda-toolbar"><div class="field" style="width:min(100%,220px)"><label for="staff-date">Fecha de la agenda</label><input id="staff-date" class="input" type="date" [value]="date" (change)="onDate($event)" /></div><button class="btn btn-primary" (click)="genQr()"><app-ui-icon name="gift" /> Generar QR de fidelización</button></div>
          @if (qrToken()) {
            <div class="card qr-panel"><span class="metric-icon"><app-ui-icon name="gift" /></span><h3>QR de fidelización</h3><p class="muted">Pide al cliente que escanee este código. Caduca en 5 minutos.</p>
              @if (qrImage()) { <img class="qr-image" [src]="qrImage()" alt="Código QR temporal de fidelización" /> } @else { <div class="loading-state"><span class="spinner" aria-hidden="true"></span> Generando código…</div> }
            </div>
          }
          @if (loading()) { <div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span> Cargando las citas…</div> }
          @if (!loading()) {
            <div class="record-list">
              @for (a of appts(); track a.id) {
                <div class="card record-card"><div class="record-main"><strong class="record-title">{{ a.startsAt | date:'HH:mm' }} – {{ a.endsAt | date:'HH:mm' }}</strong><span class="record-title" style="font-weight:550">{{ a.serviceName }} · {{ a.customerName }}</span>@if (a.customerPhone) { <span class="record-meta">{{ a.customerPhone }}</span> }<span class="badge" [class]="badgeClass(a.status)">{{ label(a.status) }}</span></div>
                  @if (a.status === 'booked' || a.status === 'confirmed') { <div class="record-action"><button class="btn btn-secondary btn-sm" (click)="setStatus(a, 'completed')"><app-ui-icon name="check" /> Atendido</button><button class="btn btn-secondary btn-sm" (click)="setStatus(a, 'no_show')">No vino</button><button class="btn btn-outline-danger btn-sm" (click)="setStatus(a, 'cancelled')">Cancelar</button></div> }
                </div>
              }
              @if (appts().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="calendar" /></span><h3>Agenda libre</h3><p>No tienes citas programadas para este día.</p></div> }
            </div>
          }
        </section>
      }
      @if (tab()==='schedule') {
        <section class="section-stack" aria-labelledby="staff-schedule-title"><div class="section-heading"><div><h2 id="staff-schedule-title">Mi horario semanal</h2><p>Este horario lo configura el propietario de tu negocio.</p></div></div>
          <div class="record-list">
            @for (s of schedule(); track s.weekday + s.startTime) {
              <div class="card record-card"><div class="record-main"><strong class="record-title">{{ dayName(s.weekday) }}</strong></div><div class="data-pair"><app-ui-icon name="clock" /><strong>{{ s.startTime }} – {{ s.endTime }}</strong></div></div>
            }
            @if (schedule().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="clock" /></span><h3>Sin horario configurado</h3><p>El propietario aún no define tu horario semanal.</p></div> }
          </div>
        </section>
      }
      @if (tab()==='timeoff') {
        <section class="section-stack" aria-labelledby="timeoff-title"><div class="section-heading"><div><h2 id="timeoff-title">Bloqueos de disponibilidad</h2><p>Reserva espacios de tu agenda en los que no puedas atender.</p></div></div>
          <div class="card form-stack form-panel"><h3>Nuevo bloqueo</h3>
            <div class="form-columns"><div class="field"><label for="timeoff-start">Desde</label><input id="timeoff-start" class="input" type="datetime-local" [(ngModel)]="offStart" /></div><div class="field"><label for="timeoff-end">Hasta</label><input id="timeoff-end" class="input" type="datetime-local" [(ngModel)]="offEnd" /></div></div>
            <div class="field"><label for="timeoff-reason">Motivo (opcional)</label><input id="timeoff-reason" class="input" [(ngModel)]="offReason" placeholder="Ej. Cita personal" /></div>
            @if (offError()) { <p class="error" role="alert">{{ offError() }}</p> }
            <button class="btn btn-primary" (click)="addTimeOff()"><app-ui-icon name="plus" /> Bloquear horario</button>
          </div>
          <div class="section-heading"><div><h2>Mis bloqueos</h2></div></div>
          <div class="record-list">
            @for (t of timeOff(); track t.id) {
              <div class="card record-card"><div class="record-main"><strong class="record-title">{{ t.startsAt | date:'d MMM HH:mm' }} – {{ t.endsAt | date:'d MMM HH:mm' }}</strong>@if (t.reason) { <span class="record-meta">{{ t.reason }}</span> }</div><span class="badge badge-neutral">Bloqueado</span></div>
            }
            @if (timeOff().length === 0) { <div class="empty-state"><span class="empty-icon"><app-ui-icon name="clock" /></span><h3>Sin bloqueos próximos</h3><p>Los horarios bloqueados aparecerán aquí.</p></div> }
          </div>
        </section>
      }
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
  feedback = signal<{ type: 'error' | 'ok'; message: string } | null>(null);

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
      error: () => { this.loading.set(false); this.notify('No se pudieron cargar las citas.'); },
    });
  }

  loadSchedule(): void {
    this.api.get<ScheduleSlot[]>('/agenda/schedule').subscribe({ next: (r) => this.schedule.set(r), error: () => this.notify('No se pudo cargar el horario.') });
  }

  loadTimeOff(): void {
    this.api.get<TimeOff[]>('/agenda/time-off').subscribe({ next: (r) => this.timeOff.set(r), error: () => this.notify('No se pudieron cargar los bloqueos.') });
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
        next: () => { this.offStart = this.offEnd = this.offReason = ''; this.loadTimeOff(); this.notify('Horario bloqueado correctamente.', 'ok'); },
        error: (e) => this.offError.set(e?.error?.error ?? 'No se pudo bloquear'),
      });
  }

  setStatus(a: Appointment, status: Appointment['status']): void {
    this.api.post(`/agenda/appointments/${a.id}/status`, { status }).subscribe({
      next: () => { this.load(); this.notify('Estado de la cita actualizado.', 'ok'); },
      error: () => this.notify('No se pudo actualizar la cita.'),
    });
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
          this.notify('No se pudo generar el QR.');
        }
      },
      error: (e) => this.notify(e?.error?.error ?? 'No se pudo generar el QR.'),
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

  private notify(message: string, type: 'error' | 'ok' = 'error'): void { this.feedback.set({ message, type }); }

  logout(): void { this.auth.logout(); this.router.navigate(['/login']); }
}
