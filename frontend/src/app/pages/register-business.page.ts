import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthShowcaseComponent } from '../ui/auth-showcase.component';
import { UiIconComponent } from '../ui/icon.component';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { BrandLockupComponent } from '../ui/brand-lockup.component';
import type { Category } from '../core/models';

/** Alta de un negocio nuevo. Incluye el mensaje de 2 meses gratis. */
@Component({
  selector: 'app-register-business',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthShowcaseComponent, BrandLockupComponent, UiIconComponent],
  template: `
    <div class="auth-page">
      <div class="auth-layout">
        <app-auth-showcase />
        <main class="auth-main">
          <div class="auth-form-shell">
            <div class="auth-mobile-brand"><app-brand-lockup /></div>
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
                <div class="field"><label for="business-category">Tipo de negocio</label>
                  <select id="business-category" name="categoryId" class="input" [(ngModel)]="categoryId">
                    <option value="">Elige una categoría</option>
                    @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
                  </select></div>
                <div class="field"><label for="business-city">Ciudad</label><input id="business-city" name="city" class="input" [(ngModel)]="city" autocomplete="address-level2" placeholder="Ej. Medellín" /></div>
              </div>
              <div class="form-columns">
                <div class="field"><label for="owner-name">Tu nombre</label><input id="owner-name" name="ownerName" class="input" [(ngModel)]="ownerName" autocomplete="name" required /></div>
                <div class="field"><label for="business-phone">Teléfono (opcional)</label><input id="business-phone" name="phone" class="input" type="tel" [(ngModel)]="phone" autocomplete="tel" /></div>
              </div>
              <div class="field"><label for="business-email">Correo electrónico</label><input id="business-email" name="email" class="input" type="email" [(ngModel)]="email" autocomplete="email" placeholder="nombre&#64;ejemplo.com" required /></div>
              <div class="field"><label for="business-password">Contraseña</label><input id="business-password" name="password" class="input" type="password" [(ngModel)]="password" autocomplete="new-password" minlength="6" required /><span class="input-hint">Mínimo 6 caracteres.</span></div>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              <button type="submit" class="btn btn-primary btn-block btn-lg" [disabled]="loading()" [attr.aria-busy]="loading()">
                @if (loading()) { <span class="spinner" aria-hidden="true"></span> Creando tu cuenta… }
                @else { Crear mi sitio <app-ui-icon name="arrow-right" /> }
              </button>
            </form>
            <p class="auth-links">¿Ya tienes una cuenta? <a routerLink="/login">Inicia sesión</a></p>
            <p class="auth-smallprint">¿Solo quieres pedir turnos? <a routerLink="/registro">Crea una cuenta de cliente</a></p>
          </div>
        </main>
      </div>
    </div>
  `,
})
export class RegisterBusinessPage implements OnInit {
  private api = inject(ApiService);
  categories = signal<Category[]>([]);
  categoryId = '';
  city = '';
  private auth = inject(AuthService);
  private router = inject(Router);
  businessName = '';
  ownerName = '';
  email = '';
  phone = '';
  password = '';
  loading = signal(false);
  error = signal('');

  ngOnInit(): void {
    this.api.get<Category[]>('/directory/categories').subscribe({ next: (c) => this.categories.set(c) });
  }

  submit(): void {
    if (!this.businessName || !this.ownerName || !this.email || !this.password) {
      this.error.set('Completa los campos requeridos');
      return;
    }
    if (this.password.length < 6) { this.error.set('La contraseña debe tener al menos 6 caracteres'); return; }
    this.loading.set(true);
    this.error.set('');
    this.auth
      .registerBusiness({
        businessName: this.businessName,
        ownerName: this.ownerName,
        email: this.email,
        password: this.password,
        phone: this.phone || undefined,
        categoryId: this.categoryId || undefined,
        city: this.city.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/panel'], { queryParams: { tab: 'business', bienvenida: 1 } });
        },
        error: (e) => {
          this.loading.set(false);
          this.error.set(e?.error?.error ?? 'No se pudo crear el sitio');
        },
      });
  }
}
