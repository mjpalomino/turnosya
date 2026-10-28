import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import type { PublicSite } from '../core/models';

/** Registro del cliente final dentro de un negocio: /registro/:slug */
@Component({
  selector: 'app-register-customer',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="container-narrow" style="padding-top:2.5rem">
      <div class="card stack">
        <div style="text-align:center">
          <h1 style="color:var(--brand-primary)">Crea tu cuenta</h1>
          @if (siteName()) { <p class="muted">en {{ siteName() }}</p> }
        </div>
        <div class="field"><label>Nombre</label><input class="input" [(ngModel)]="fullName" /></div>
        <div class="field"><label>Correo</label><input class="input" type="email" [(ngModel)]="email" /></div>
        <div class="field"><label>Teléfono (opcional)</label><input class="input" [(ngModel)]="phone" /></div>
        <div class="field"><label>Contraseña</label><input class="input" type="password" [(ngModel)]="password" /></div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" [disabled]="loading()" (click)="submit()">
          {{ loading() ? 'Creando…' : 'Crear cuenta' }}
        </button>
        <p class="muted" style="text-align:center">
          ¿Ya tienes cuenta? <a routerLink="/login">Ingresa</a> ·
          <a [routerLink]="['/sitio', slug]">Ver el sitio</a>
        </p>
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
