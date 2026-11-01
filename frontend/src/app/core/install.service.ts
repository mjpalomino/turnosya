/**
 * Botón "Instalar app" (PWA) para todos los navegadores.
 *
 *  - Chrome, Edge, Samsung Internet (Android y PC): si el navegador ofrece su aviso
 *    (evento beforeinstallprompt), el botón lo abre directamente.
 *  - Si el navegador NO ofrece el aviso (Safari, Chrome en iPhone, o Chrome/Edge cuando
 *    el usuario ya lo rechazó antes y el navegador lo bloquea por un tiempo), el botón
 *    muestra los pasos manuales correctos para ESE navegador.
 *  - Si la app ya está instalada (modo standalone), el botón no se muestra.
 */
import { Injectable, computed, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Navegador detectado, para elegir las instrucciones manuales. */
export type InstallKind =
  | 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-samsung' | 'android-firefox'
  | 'desktop-chrome' | 'desktop-edge' | 'mac-safari' | 'in-app' | 'none';

/** Detecta el navegador a partir del user agent (función pura, probada aparte). */
export function detectInstallKind(ua: string, platform = '', maxTouchPoints = 0): InstallKind {
  const ios = /iphone|ipad|ipod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  if (/FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly/i.test(ua)) return 'in-app';
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/android/i.test(ua)) {
    if (/SamsungBrowser/i.test(ua)) return 'android-samsung';
    if (/Firefox/i.test(ua)) return 'android-firefox';
    if (/Chrome|EdgA/i.test(ua)) return 'android-chrome';
    return 'none';
  }
  if (/Edg\//i.test(ua)) return 'desktop-edge';
  if (/Chrome\//i.test(ua) && !/OPR\//i.test(ua)) return 'desktop-chrome';
  if (/Macintosh/i.test(ua) && /Safari\//i.test(ua) && !/Chrome|Firefox/i.test(ua)) return 'mac-safari';
  return 'none'; // p. ej. Firefox de escritorio: no instala apps web
}

@Injectable({ providedIn: 'root' })
export class InstallService {
  private deferred: BeforeInstallPromptEvent | null = null;
  private readonly promptReady = signal(false);
  readonly installed = signal(this.isStandalone());
  readonly kind: InstallKind = detectInstallKind(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  /** Compatibilidad con código anterior. */
  readonly isIos = this.kind === 'ios-safari' || this.kind === 'ios-other';
  /** Mostrar el botón: hay aviso nativo o hay pasos manuales para este navegador. */
  readonly canInstall = computed(() => !this.installed() && (this.promptReady() || this.kind !== 'none'));
  readonly showHelp = signal(false);

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.promptReady.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.promptReady.set(false);
      this.installed.set(true);
      this.showHelp.set(false);
    });
  }

  async install(): Promise<void> {
    if (this.deferred) {
      await this.deferred.prompt();
      const choice = await this.deferred.userChoice;
      if (choice.outcome === 'accepted') this.installed.set(true);
      this.deferred = null;
      this.promptReady.set(false);
      return;
    }
    // Sin aviso del navegador: pasos manuales.
    this.showHelp.set(true);
  }

  private isStandalone(): boolean {
    return window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }
}
