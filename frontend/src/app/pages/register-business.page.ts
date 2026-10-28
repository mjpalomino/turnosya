import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthShowcaseComponent } from '../ui/auth-showcase.component';
import { UiIconComponent } from '../ui/icon.component';
import { AuthService } from '../core/auth.service';

/** Alta de un negocio nuevo. Incluye el mensaje de 2 meses gratis. */
@Component({
  selector: 'app-register-business',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthShowcaseComponent, UiIconComponent],
  template: `
    <div class="auth-page">
      <div class="auth-layout">
        <app-auth-showcase />
        <main class="auth-main">
          <div class="auth-form-shell">
            <div class="auth-mobile-brand">
              <span class="brand-mark"><app-ui-icon name="calendar-check" /></span>
              <span class="brand-wordmark">Turnos<span>Ya</span></span>
            </div>
            <a routerLink="/login" class="auth-back"><app-ui-icon name="arrow-left" /> Volver a ingresar</a>
            <div class="auth-form-heading">
              <span class="eyebrow">Empieza hoy</span>
              <h1>Un nuevo comienzo para tu negocio.</h1>
              <p>Configura tu cuenta y empieza a organizar tus reservas desde un solo lugar.</p>
              <span class="auth-promo"><app-ui-icon name="check-circle" /> 2 meses gratis · sin tarjeta</span>
            </div>
            <form class="auth-form" (ngSubmit)="submit()">
              <div class="field"><label for="business-name">Nombre del negocio</label>
                <input id="business-name" name="businessName" class="input" [(ngModel)]="businessName" placeholder="Ej. Barbería Fígaro" autocomplete="organization" required /></div>
              <div class="form-columns">
                <div class="field"><label for="owner-name">Tu nombre</label><input id="owner-name" name="ownerName" class="input" [(ngModel)]="ownerName" autocomplete="name" required /></div>
                <div class="field"><label for="business-phone">Teléfono (opcional)</label><input id="business-phone" name="phone" class="input" type="tel" [(ngModel)]="phone" autocomplete="tel" /></div>
              </div>
              <div class="field"><label for="business-email">Correo electrónico</label><input id="business-email" name="email" class="input" type="email" [(ngModel)]="email" autocomplete="email" placeholder="nombre&#64;ejemplo.com" required /></div>
              <div class="field"><label for="business-password">Contraseña</label><input id="business-password" name="password" class="input" type="password" [(ngModel)]="password" autocomplete="new-password" required /></div>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              <button type="submit" class="btn btn-primary btn-block btn-lg" [disabled]="loading()" [attr.aria-busy]="loading()">
                @if (loading()) { <span class="spinner" aria-hidden="true"></span> Creando tu cuenta… }
                @else { Crear mi sitio <app-ui-icon name="arrow-right" /> }
              </button>
            </form>
            <p class="auth-links">¿Ya tienes una cuenta? <a routerLink="/login">Inicia sesión</a></p>
          </div>
        </main>
      </div>
    </div>
  `,
})
export class RegisterBusinessPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  businessName = '';
  ownerName = '';
  email = '';
  phone = '';
  password = '';
  loading = signal(false);
  error = signal('');

  submit(): void {
    if (!this.businessName || !this.ownerName || !this.email || !this.password) {
      this.error.set('Completa los campos requeridos');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.auth
      .registerBusiness({
        businessName: this.businessName,
        ownerName: this.ownerName,
        email: this.email,
        password: this.password,
        phone: this.phone || undefined,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/panel']);
        },
        error: (e) => {
          this.loading.set(false);
          this.error.set(e?.error?.error ?? 'No se pudo crear el sitio');
        },
      });
  }
}
