/**
 * Botón "Instalar app" (PWA).
 *  - Android/Chrome/Edge: guarda el evento beforeinstallprompt y lo dispara al pulsar.
 *  - iPhone/iPad (Safari no tiene ese evento): muestra instrucciones "Compartir → Agregar a inicio".
 *  - Si la app ya está instalada (modo standalone), el botón no se muestra.
 */
import { Injectable, computed, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class InstallService {
  private deferred: BeforeInstallPromptEvent | null = null;
  private readonly promptReady = signal(false);
  readonly installed = signal(this.isStandalone());
  readonly isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  /** Mostrar el botón: hay prompt nativo, o es iOS (instrucciones manuales). */
  readonly canInstall = computed(() => !this.installed() && (this.promptReady() || this.isIos));
  readonly showIosHelp = signal(false);

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
    if (this.isIos) this.showIosHelp.set(true);
  }

  private isStandalone(): boolean {
    return window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }
}
