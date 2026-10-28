import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { AuthShowcaseComponent } from '../ui/auth-showcase.component';
import { UiIconComponent } from '../ui/icon.component';
import type { Role } from '../core/models';

/** Pantalla de login para todos los roles. Redirige según el rol. */
@Component({
  selector: 'app-login',
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
            <div class="auth-form-heading">
              <span class="eyebrow">Bienvenido de nuevo</span>
              <h1>Qué gusto verte otra vez.</h1>
              <p>Accede a tu cuenta para continuar gestionando tu agenda.</p>
            </div>
            <form class="auth-form" (ngSubmit)="submit()">
              <div class="field">
                <label for="login-email">Correo electrónico</label>
                <input id="login-email" name="email" class="input" type="email" [(ngModel)]="email"
                       autocomplete="username" placeholder="nombre&#64;ejemplo.com" required
                       [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'login-error' : null" />
              </div>
              <div class="field">
                <label for="login-pass">Contraseña</label>
                <input id="login-pass" name="password" class="input" type="password" [(ngModel)]="password"
                       autocomplete="current-password" placeholder="Ingresa tu contraseña" required
                       [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'login-error' : null" />
              </div>
              @if (error()) { <p id="login-error" class="error" role="alert">{{ error() }}</p> }
              <button type="submit" class="btn btn-primary btn-lg btn-block auth-submit" [disabled]="loading()" [attr.aria-busy]="loading()">
                @if (loading()) { <span class="spinner" aria-hidden="true"></span> Ingresando… }
                @else { Ingresar a mi cuenta <app-ui-icon name="arrow-right" /> }
              </button>
            </form>
            <p class="auth-links">¿Tienes un negocio? <a routerLink="/registro-negocio">Crea tu cuenta gratis</a></p>
            <p class="auth-smallprint"><app-ui-icon name="shield" /> Un espacio seguro para gestionar tus reservas.</p>
          </div>
        </main>
      </div>
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  email = '';
  password = '';
  loading = signal(false);
  error = signal('');

  submit(): void {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.router.navigate([this.home(res.user.role)]);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Correo o contraseña incorrectos');
      },
    });
  }

  private home(role: Role): string {
    switch (role) {
      case 'superadmin': return '/admin';
      case 'owner': return '/panel';
      case 'staff': return '/mi-agenda';
      default: return '/mis-citas';
    }
  }
}
