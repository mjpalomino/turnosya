import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiIconComponent } from './icon.component';
import { BrandLockupComponent } from './brand-lockup.component';

/** A product illustration, not real appointment data. Shared by sign-in and registrations. */
@Component({
  selector: 'app-auth-showcase',
  standalone: true,
  imports: [UiIconComponent, BrandLockupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="auth-showcase" aria-label="Presentación de la plataforma">
      <div class="showcase-top"><a href="/" class="showcase-home" aria-label="Ir al inicio"><app-brand-lockup [light]="true" /></a></div>
      <div class="showcase-body">
        <span class="showcase-eyebrow"><span class="showcase-dot"></span> Tu agenda, a otro nivel</span>
        <h2>Más tiempo para lo que realmente importa.</h2>
        <p>Organiza reservas, horarios y clientes en un espacio simple, ágil y hecho para tu negocio.</p>
        <div class="showcase-visual" aria-label="Vista ilustrativa de una agenda organizada">
          <div class="visual-card" aria-hidden="true">
            <div class="visual-header">
              <div><span class="visual-caption">VISTA DE EJEMPLO</span><strong>Agenda del día</strong></div>
              <span class="visual-icon"><app-ui-icon name="calendar" /></span>
            </div>
            <div class="visual-line"><span class="visual-time">09:00</span><span class="visual-appointment"><span class="visual-avatar">A</span><span class="visual-detail"><strong>Primera reserva</strong><small>Agenda confirmada</small></span><span class="visual-check"><app-ui-icon name="check" /></span></span></div>
            <div class="visual-line"><span class="visual-time">11:30</span><span class="visual-appointment"><span class="visual-avatar visual-avatar-alt">M</span><span class="visual-detail"><strong>Siguiente reserva</strong><small>Todo en un lugar</small></span><span class="visual-check"><app-ui-icon name="check" /></span></span></div>
            <div class="visual-bottom"><span class="visual-status-dot"></span> Tu día, bajo control <app-ui-icon name="sparkles" /></div>
          </div>
        </div>
      </div>
      <div class="showcase-bottom"><app-ui-icon name="shield" /> Tu espacio de trabajo, siempre organizado.</div>
    </aside>
  `,
})
export class AuthShowcaseComponent {}
