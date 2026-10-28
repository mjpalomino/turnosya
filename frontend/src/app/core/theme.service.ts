/**
 * Aplica el color del negocio a variables CSS en :root, para que el sitio
 * público se vea con la marca del dueño (personalización de colores).
 */
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  apply(primary?: string | null, secondary?: string | null): void {
    const root = document.documentElement;
    if (primary) root.style.setProperty('--brand-primary', primary);
    if (secondary) root.style.setProperty('--brand-secondary', secondary);
  }

  reset(): void {
    const root = document.documentElement;
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-secondary');
  }
}
