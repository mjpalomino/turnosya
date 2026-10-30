import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthShowcaseComponent } from '../ui/auth-showcase.component';
import { BrandLockupComponent } from '../ui/brand-lockup.component';
import { UiIconComponent } from '../ui/icon.component';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import type { PublicSite } from '../core/models';

/**
 * Registro del cliente final. Una sola cuenta sirve para todos los negocios.
 *  - /registro                 desde el sitio principal o el login
 *  - /registro/:slug           desde el link de un negocio (vuelve a ese negocio)
 *  - ?returnUrl=/...           vuelve a donde estaba (por ejemplo, a terminar una reserva)
 */
@Component({
  selector: 'app-register-customer',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthShowcaseComponent, BrandLockupComponent, UiIconComponent],
  template: `
    <div class="auth-page">
      <div class="auth-layout">
        <app-auth-showcase />
        <main class="auth-main">
          <div class="auth-form-shell">
            <div class="auth-mobile-brand"><app-brand-lockup /></div>
            <a [routerLink]="backLink()" class="auth-back"><app-ui-icon name="arrow-left" /> {{ slug ? 'Volver al negocio' : 'Volver' }}</a>
            <div class="auth-form-heading">
              <span class="eyebrow">Cuenta de cliente</span>
              <h1>Tu próxima cita comienza aquí.</h1>
              <p>Crea tu cuenta gratis{{ siteName() ? ' para reservar en ' + siteName() : '' }}. Te sirve para pedir turno en todos los negocios de la comunidad.</p>
            </div>
            <form class="auth-form" (ngSubmit)="submit()">
              <div class="field"><label for="customer-name">Nombre completo</label><input id="customer-name" name="fullName" class="input" [(ngModel)]="fullName" autocomplete="name" required /></div>
              <div class="field"><label for="customer-email">Correo electrónico</label><input id="customer-email" name="email" class="input" type="email" [(ngModel)]="email" autocomplete="email" placeholder="nombre&#64;ejemplo.com" required /></div>
              <div class="field"><label for="customer-phone">Celular (opcional)</label><input id="customer-phone" name="phone" class="input" type="tel" [(ngModel)]="phone" autocomplete="tel" placeholder="Para recordatorios de tus citas" /></div>
              <div class="field"><label for="customer-password">Contraseña</label><input id="customer-password" name="password" class="input" type="password" [(ngModel)]="password" autocomplete="new-password" minlength="6" required /><span class="input-hint">Mínimo 6 caracteres.</span></div>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="loading()" [attr.aria-busy]="loading()">
                @if (loading()) { <span class="spinner" aria-hidden="true"></span> Creando cuenta… }
                @else { Crear mi cuenta <app-ui-icon name="arrow-right" /> }
              </button>
            </form>
            <p class="auth-links">¿Ya tienes una cuenta? <a routerLink="/login" [queryParams]="loginQuery()">Inicia sesión</a></p>
            <p class="auth-smallprint">¿Tienes un negocio? <a routerLink="/registro-negocio">Regístralo aquí</a></p>
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
  returnUrl = signal<string | null>(null);
  fullName = '';
  email = '';
  phone = '';
  password = '';
  loading = signal(false);
  error = signal('');

  backLink = computed(() => (this.slug ? `/${this.slug}` : (this.returnUrl() ?? '/')));
  loginQuery = computed(() => {
    const target = this.returnUrl() ?? (this.slug ? `/${this.slug}` : null);
    return target ? { returnUrl: target } : {};
  });

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.returnUrl.set(this.auth.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
    if (this.slug) {
      this.api.get<PublicSite>(`/public/${this.slug}`).subscribe({ next: (s) => this.siteName.set(s.name) });
    }
  }

  submit(): void {
    if (!this.fullName.trim() || !this.email || !this.password) {
      this.error.set('Completa los campos requeridos');
      return;
    }
    if (this.password.length < 6) { this.error.set('La contraseña debe tener al menos 6 caracteres'); return; }
    this.loading.set(true);
    this.error.set('');
    const payload = {
      fullName: this.fullName.trim(),
      email: this.email.trim(),
      password: this.password,
      phone: this.phone.trim() || undefined,
    };
    const req$ = this.slug ? this.auth.registerCustomer(this.slug, payload) : this.auth.registerCustomerGlobal(payload);
    req$.subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl(this.returnUrl() ?? (this.slug ? `/${this.slug}` : '/'));
      },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.error ?? 'No se pudo crear la cuenta'); },
    });
  }
}
