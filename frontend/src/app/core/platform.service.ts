/** Marca global de la plataforma (nombre, logo, colores) definida por el superadmin. */
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { ThemeService } from './theme.service';
import type { PlatformBranding } from './models';

const DEFAULT_BRANDING: PlatformBranding = {
  brandName: 'TurnosYa',
  logoUrl: null,
  primaryColor: '#3458E8',
  secondaryColor: '#203CB3',
  tagline: null,
};
const CACHE_KEY = 'turnosya_platform';

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private api = inject(ApiService);
  private theme = inject(ThemeService);

  readonly branding = signal<PlatformBranding>(this.cached() ?? DEFAULT_BRANDING);

  constructor() {
    this.applyToDocument(this.branding());
  }

  /** Se llama al iniciar la app. Nunca bloquea si el API falla. */
  async load(): Promise<void> {
    try {
      const b = await firstValueFrom(this.api.get<PlatformBranding>('/platform/branding'));
      this.set(b);
    } catch {
      /* se mantiene la marca por defecto o la última conocida */
    }
  }

  /** Aplica una marca nueva (por ejemplo, al guardar desde el panel del superadmin). */
  set(b: PlatformBranding): void {
    const merged = { ...DEFAULT_BRANDING, ...b, brandName: b.brandName || DEFAULT_BRANDING.brandName };
    this.branding.set(merged);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch { /* sin almacenamiento */ }
    this.applyToDocument(merged);
  }

  private applyToDocument(b: PlatformBranding): void {
    this.theme.setPlatform(b.primaryColor, b.secondaryColor);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', b.primaryColor);
  }

  private cached(): PlatformBranding | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as PlatformBranding) : null;
    } catch {
      return null;
    }
  }
}
