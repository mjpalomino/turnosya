import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

/** Alta de un negocio nuevo. Incluye el mensaje de 2 meses gratis. */
@Component({
  selector: 'app-register-business',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="container-narrow" style="padding-top:2rem">
      <div class="card stack">
        <div style="text-align:center">
          <h1 style="color:var(--brand-primary)">Crea tu sitio de citas</h1>
          <p class="badge badge-ok">2 meses gratis · sin tarjeta</p>
        </div>
        <div class="field">
          <label>Nombre del negocio</label>
          <input class="input" [(ngModel)]="businessName" placeholder="Ej. Barbería Fígaro" />
        </div>
        <div class="field">
          <label>Tu nombre</label>
          <input class="input" [(ngModel)]="ownerName" />
        </div>
        <div class="field">
          <label>Correo</label>
          <input class="input" type="email" [(ngModel)]="email" />
        </div>
        <div class="field">
          <label>Teléfono / WhatsApp (opcional)</label>
          <input class="input" [(ngModel)]="phone" />
        </div>
        <div class="field">
          <label>Contraseña</label>
          <input class="input" type="password" [(ngModel)]="password" />
        </div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" [disabled]="loading()" (click)="submit()">
          {{ loading() ? 'Creando…' : 'Crear mi sitio' }}
        </button>
        <p class="muted" style="text-align:center">
          ¿Ya tienes cuenta? <a routerLink="/login">Ingresa</a>
        </p>
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
