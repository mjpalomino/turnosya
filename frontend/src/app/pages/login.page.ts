import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { AuthShowcaseComponent } from '../ui/auth-showcase.component';
import { BrandLockupComponent } from '../ui/brand-lockup.component';
import { UiIconComponent } from '../ui/icon.component';

/**
 * Login para todos los roles. Redirige según el rol o al destino pedido (?returnUrl=).
 * Ofrece crear cuenta como cliente final o registrar un negocio.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthShowcaseComponent, BrandLockupComponent, UiIconComponent],
  template: `
    <div class="auth-page">
      <div class="auth-layout">
        <app-auth-showcase />
        <main class="auth-main">
          <div class="auth-form-shell">
            <div class="auth-mobile-brand"><app-brand-lockup /></div>
            <a routerLink="/" class="auth-back"><app-ui-icon name="arrow-left" /> Explorar negocios</a>
            <div class="auth-form-heading">
              <span class="eyebrow">{{ returnUrl() ? 'Inicia sesión para continuar' : 'Bienvenido de nuevo' }}</span>
              <h1>{{ returnUrl() ? 'Ingresa para pedir tu turno.' : 'Qué gusto verte otra vez.' }}</h1>
              <p>{{ returnUrl() ? 'Usa tu cuenta o créala gratis en un minuto. Volverás al negocio enseguida.' : 'Accede a tu cuenta para continuar con tus reservas o tu negocio.' }}</p>
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
                @else { Ingresar <app-ui-icon name="arrow-right" /> }
              </button>
            </form>

            <div class="auth-divider"><span>¿Aún no tienes cuenta?</span></div>
            <div class="signup-options">
              <a class="signup-option" routerLink="/registro" [queryParams]="returnQuery()">
                <span class="signup-icon"><app-ui-icon name="user" /></span>
                <span class="signup-text"><strong>Soy cliente</strong><small>Crea tu cuenta para pedir turnos en cualquier negocio</small></span>
                <app-ui-icon name="chevron-right" />
              </a>
              <a class="signup-option" routerLink="/registro-negocio">
                <span class="signup-icon signup-icon-alt"><app-ui-icon name="store" /></span>
                <span class="signup-text"><strong>Tengo un negocio</strong><small>Regístralo y recibe reservas · 2 meses gratis</small></span>
                <app-ui-icon name="chevron-right" />
              </a>
            </div>
            <p class="auth-smallprint"><app-ui-icon name="shield" /> Un espacio seguro para gestionar tus reservas.</p>
          </div>
        </main>
      </div>
    </div>
  `,
})
export class LoginPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  email = '';
  password = '';
  loading = signal(false);
  error = signal('');
  returnUrl = signal<string | null>(null);
  returnQuery = computed(() => (this.returnUrl() ? { returnUrl: this.returnUrl() } : {}));

  ngOnInit(): void {
    this.returnUrl.set(this.auth.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
  }

  submit(): void {
    if (!this.email || !this.password) { this.error.set('Ingresa tu correo y contraseña'); return; }
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        const back = this.returnUrl();
        // El destino solicitado aplica a clientes (reservar) o si coincide con su panel.
        const home = this.auth.homeFor(res.user.role);
        const target = back && (res.user.role === 'customer' || back.startsWith(home)) ? back : home;
        void this.router.navigateByUrl(target);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Correo o contraseña incorrectos');
      },
    });
  }
}
