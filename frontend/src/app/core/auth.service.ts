/** Estado de autenticación con signals. Guarda el JWT en localStorage. */
import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type { AuthUser, LoginResponse, Role } from './models';

const TOKEN_KEY = 'turnosya_token';
const USER_KEY = 'turnosya_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<AuthUser | null>(this.loadUser());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly role = computed<Role | null>(() => this._user()?.role ?? null);

  constructor(private http: HttpClient) {}

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap((res) => this.persist(res)));
  }

  registerBusiness(payload: {
    businessName: string;
    ownerName: string;
    email: string;
    password: string;
    phone?: string;
    categoryId?: string;
    city?: string;
  }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/register-business`, payload)
      .pipe(tap((res) => this.persist(res)));
  }

  /** Cuenta de cliente global: sirve para pedir turno en cualquier negocio. */
  registerCustomerGlobal(payload: { fullName: string; email: string; password: string; phone?: string }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/register-customer`, payload)
      .pipe(tap((res) => this.persist(res)));
  }

  /** Página de inicio según el rol. */
  homeFor(role: Role | null): string {
    switch (role) {
      case 'superadmin': return '/admin';
      case 'owner': return '/panel';
      case 'staff': return '/mi-agenda';
      case 'customer': return '/mis-citas';
      default: return '/';
    }
  }

  /** Solo se aceptan rutas internas como destino después del login (evita redirecciones abiertas). */
  safeReturnUrl(url: string | null | undefined): string | null {
    if (!url || !url.startsWith('/') || url.startsWith('//') || url.includes('://')) return null;
    return url;
  }

  registerCustomer(
    slug: string,
    payload: { fullName: string; email: string; password: string; phone?: string },
  ): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/customer/register/${slug}`, payload)
      .pipe(tap((res) => this.persist(res)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
  }

  private persist(res: LoginResponse): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this._user.set(res.user);
  }

  private loadUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  }
}
