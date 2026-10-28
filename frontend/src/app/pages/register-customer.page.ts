import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthShowcaseComponent } from '../ui/auth-showcase.component';
import { UiIconComponent } from '../ui/icon.component';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import type { PublicSite } from '../core/models';

/** Registro del cliente final dentro de un negocio: /registro/:slug */
@Component({
  selector: 'app-register-customer',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthShowcaseComponent, UiIconComponent],
  template: `
    <div class="auth-page">
      <div class="auth-layout">
        <app-auth-showcase />
        <main class="auth-main">
          <div class="auth-form-shell">
            <div class="auth-mobile-brand"><span class="brand-mark"><app-ui-icon name="calendar-check" /></span><span class="brand-wordmark">Turnos<span>Ya</span></span></div>
            <a [routerLink]="['/sitio', slug]" class="auth-back"><app-ui-icon name="arrow-left" /> Volver al sitio</a>
            <div class="auth-form-heading">
              <span class="eyebrow">Registro de cliente</span>
              <h1>Tu próxima cita comienza aquí.</h1>
              <p>Regístrate para gestionar tus reservas{{ siteName() ? ' en ' + siteName() : '' }}.</p>
            </div>
            <form class="auth-form" (ngSubmit)="submit()">
              <div class="field"><label for="customer-name">Nombre completo</label><input id="customer-name" name="fullName" class="input" [(ngModel)]="fullName" autocomplete="name" required /></div>
              <div class="field"><label for="customer-email">Correo electrónico</label><input id="customer-email" name="email" class="input" type="email" [(ngModel)]="email" autocomplete="email" placeholder="nombre&#64;ejemplo.com" required /></div>
              <div class="field"><label for="customer-phone">Teléfono (opcional)</label><input id="customer-phone" name="phone" class="input" type="tel" [(ngModel)]="phone" autocomplete="tel" /></div>
              <div class="field"><label for="customer-password">Contraseña</label><input id="customer-password" name="password" class="input" type="password" [(ngModel)]="password" autocomplete="new-password" required /></div>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="loading()" [attr.aria-busy]="loading()">
                @if (loading()) { <span class="spinner" aria-hidden="true"></span> Creando cuenta… }
                @else { Crear mi cuenta <app-ui-icon name="arrow-right" /> }
              </button>
            </form>
            <p class="auth-links">¿Ya tienes una cuenta? <a routerLink="/login">Inicia sesión</a></p>
          </div>
        </main>
      </div>
    </div>
  `,
})
export class RegisterCustomerPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private api = inject(ApiService);

  slug = '';
  siteName = signal('');
  fullName = '';
  email = '';
  phone = '';
  password = '';
  loading = signal(false);
  error = signal('');

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.api.get<PublicSite>(`/public/${this.slug}`).subscribe({
      next: (s) => this.siteName.set(s.name),
    });
  }

  submit(): void {
    if (!this.fullName || !this.email || !this.password) {
      this.error.set('Completa los campos requeridos');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.auth
      .registerCustomer(this.slug, {
        fullName: this.fullName,
        email: this.email,
        password: this.password,
        phone: this.phone || undefined,
      })
      .subscribe({
        next: () => { this.loading.set(false); this.router.navigate(['/mis-citas']); },
        error: (e) => { this.loading.set(false); this.error.set(e?.error?.error ?? 'No se pudo crear la cuenta'); },
      });
  }
}
