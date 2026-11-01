import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { PlatformService } from '../core/platform.service';

interface ContactForm {
  contactEmail: string | null; contactPhone: string | null; contactWhatsapp: string | null;
  contactAddress: string | null; contactCity: string | null; supportHours: string | null;
  instagram: string | null; facebook: string | null; tiktok: string | null; website: string | null;
}

/** Datos de contacto del sitio principal (pie de página y soporte). */
@Component({
  selector: 'app-admin-contact',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (c(); as f) {
      <section class="card form-stack form-panel" aria-labelledby="pc-title">
        <div class="panel-head"><div><h3 id="pc-title">Contacto del sitio principal</h3><p class="muted">Se muestra en el pie de página para negocios y clientes. Deja vacío lo que no quieras publicar.</p></div></div>
        <div class="form-columns">
          <div class="field"><label for="pc-wa">WhatsApp de soporte</label><input id="pc-wa" class="input" type="tel" [(ngModel)]="f.contactWhatsapp" placeholder="57 300 123 4567" /><span class="input-hint">Con indicativo del país.</span></div>
          <div class="field"><label for="pc-phone">Teléfono</label><input id="pc-phone" class="input" type="tel" [(ngModel)]="f.contactPhone" /></div>
        </div>
        <div class="form-columns">
          <div class="field"><label for="pc-email">Correo de contacto</label><input id="pc-email" class="input" type="email" [(ngModel)]="f.contactEmail" /></div>
          <div class="field"><label for="pc-hours">Horario de atención</label><input id="pc-hours" class="input" [(ngModel)]="f.supportHours" maxlength="120" placeholder="Lun a vie, 8:00 a. m. - 6:00 p. m." /></div>
        </div>
        <div class="form-columns">
          <div class="field"><label for="pc-address">Dirección</label><input id="pc-address" class="input" [(ngModel)]="f.contactAddress" maxlength="200" /></div>
          <div class="field"><label for="pc-city">Ciudad</label><input id="pc-city" class="input" [(ngModel)]="f.contactCity" maxlength="80" /></div>
        </div>
        <div class="form-columns">
          <div class="field"><label for="pc-ig">Instagram</label><input id="pc-ig" class="input" [(ngModel)]="f.instagram" placeholder="&#64;turnosyapp" /></div>
          <div class="field"><label for="pc-fb">Facebook</label><input id="pc-fb" class="input" [(ngModel)]="f.facebook" placeholder="https://facebook.com/…" /></div>
        </div>
        <div class="form-columns">
          <div class="field"><label for="pc-tt">TikTok</label><input id="pc-tt" class="input" [(ngModel)]="f.tiktok" placeholder="&#64;turnosyapp" /></div>
          <div class="field"><label for="pc-web">Sitio web</label><input id="pc-web" class="input" type="url" [(ngModel)]="f.website" placeholder="https://" /></div>
        </div>
        <div class="form-actions-row"><button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save()">Guardar contacto</button></div>
      </section>
    } @else { <div class="loading-state" role="status"><span class="spinner"></span> Cargando…</div> }
  `,
})
export class AdminContactComponent implements OnInit {
  private api = inject(ApiService);
  private platform = inject(PlatformService);
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();
  c = signal<ContactForm | null>(null);
  busy = signal(false);

  ngOnInit(): void {
    this.api.get<ContactForm>('/admin/settings/contact').subscribe({
      next: (c) => this.c.set(c),
      error: () => this.notify.emit({ message: 'No se pudo cargar el contacto.', type: 'error' }),
    });
  }

  save(): void {
    const c = this.c();
    if (!c) return;
    this.busy.set(true);
    this.api.put('/admin/settings/contact', c).subscribe({
      next: () => { this.busy.set(false); this.platform.loadContact(true); this.notify.emit({ message: 'Datos de contacto actualizados.', type: 'ok' }); },
      error: (e) => {
        this.busy.set(false);
        const d = e?.error?.details?.properties;
        const field = d ? Object.keys(d)[0] : null;
        this.notify.emit({ message: field ? `Revisa el campo: ${field}` : e?.error?.error ?? 'No se pudo guardar.', type: 'error' });
      },
    });
  }
}
