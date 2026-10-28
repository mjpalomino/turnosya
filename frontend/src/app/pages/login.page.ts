import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import type { Role } from '../core/models';

/** Pantalla de login para todos los roles. Redirige según el rol. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="container-narrow" style="padding-top:3rem">
      <div class="card stack">
        <div style="text-align:center">
          <h1 style="color:var(--brand-primary)">TurnosYa</h1>
          <p class="muted">Ingresa a tu cuenta</p>
        </div>
        <div class="field">
          <label>Correo</label>
          <input class="input" type="email" [(ngModel)]="email" autocomplete="email" />
        </div>
        <div class="field">
          <label>Contraseña</label>
          <input class="input" type="password" [(ngModel)]="password" autocomplete="current-password" />
        </div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" [disabled]="loading()" (click)="submit()">
          {{ loading() ? 'Ingresando…' : 'Ingresar' }}
        </button>
        <p class="muted" style="text-align:center">
          ¿Tienes un negocio? <a routerLink="/registro-negocio">Regístralo gratis</a>
        </p>
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
