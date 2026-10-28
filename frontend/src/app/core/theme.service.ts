import { Injectable } from '@angular/core';

/**
 * Applies tenant colors only while their public booking page is shown.
 * Determines a readable foreground for the custom primary brand color.
 * The account dashboards keep the neutral TurnosYa design language.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  apply(primary?: string | null, secondary?: string | null): void {
    const root = document.documentElement;
    if (primary) {
      root.style.setProperty('--brand-primary', primary);
      const foreground = this.foregroundFor(primary);
      if (foreground) root.style.setProperty('--brand-primary-contrast', foreground);
      const ink = this.inkFor(primary);
      if (ink) root.style.setProperty('--brand-ink', ink);
    }
    if (secondary) root.style.setProperty('--brand-secondary', secondary);
  }

  reset(): void {
    const root = document.documentElement;
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-secondary');
    root.style.removeProperty('--brand-primary-contrast');
    root.style.removeProperty('--brand-ink');
  }

  /** Convert #RGB / #RRGGBB to channels for contrast calculations. */
  private channels(value: string): number[] | null {
    const hex = value.trim().replace(/^#/, '');
    if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex)) return null;
    const expanded = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((index) => parseInt(expanded.slice(index, index + 2), 16));
  }

  private luminance(rgb: number[]): number {
    const [r, g, b] = rgb.map((c) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** The foreground for a solid button always reaches 4.5:1. */
  private foregroundFor(value: string): string | null {
    const channels = this.channels(value);
    if (!channels) return null;
    const luminance = this.luminance(channels);
    return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
  }

  /** Keep the tenant hue while darkening link/label text enough for a white surface. */
  private inkFor(value: string): string | null {
    let channels = this.channels(value);
    if (!channels) return null;
    for (let i = 0; i < 32 && 1.05 / (this.luminance(channels) + 0.05) < 4.5; i++) {
      channels = channels.map((c) => Math.floor(c * 0.90));
    }
    return '#' + channels.map((c) => c.toString(16).padStart(2, '0')).join('');
  }
}
