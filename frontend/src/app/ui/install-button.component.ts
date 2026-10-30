import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { InstallService } from '../core/install.service';
import { PlatformService } from '../core/platform.service';
import { UiIconComponent } from './icon.component';

const DISMISS_KEY = 'turnosya_install_dismissed';

/**
 * Botón "Instalar app" (PWA) en tres formatos:
 *  - header: compacto en la barra superior
 *  - band: botón grande dentro de una sección
 *  - floating: barra inferior en celulares, se puede cerrar
 * Solo aparece si el navegador permite instalar (o en iPhone, con instrucciones).
 */
@Component({
  selector: 'app-install-button',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (install.canInstall()) {
      @switch (variant) {
        @case ('header') {
          <button type="button" class="btn btn-secondary btn-sm install-header" (click)="install.install()">
            <app-ui-icon name="download" /> <span class="install-label">Instalar app</span>
          </button>
        }
        @case ('band') {
          <button type="button" class="btn btn-primary btn-lg" (click)="install.install()"><app-ui-icon name="download" /> Instalar la app</button>
        }
        @case ('floating') {
          @if (!dismissed()) {
            <div class="install-float" role="region" aria-label="Instalar la aplicación">
              <span class="install-float-icon"><app-ui-icon name="smartphone" /></span>
              <span class="install-float-text"><strong>Instala {{ platform.branding().brandName }}</strong><small>Pide turnos más rápido desde tu celular</small></span>
              <button type="button" class="btn btn-primary btn-sm" (click)="install.install()">Instalar</button>
              <button type="button" class="feedback-close" aria-label="Cerrar" (click)="dismiss()">×</button>
            </div>
          }
        }
      }
    } @else if (variant === 'band' && install.installed()) {
      <span class="badge badge-ok"><app-ui-icon name="check" /> App instalada</span>
    } @else if (variant === 'band') {
      <span class="install-hint">Ábrela desde el navegador de tu celular para instalarla.</span>
    }
  `,
})
export class InstallButtonComponent {
  install = inject(InstallService);
  platform = inject(PlatformService);
  @Input() variant: 'header' | 'band' | 'floating' = 'header';
  dismissed = signal(this.readDismissed());

  dismiss(): void {
    this.dismissed.set(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sin almacenamiento */ }
  }

  /** Se vuelve a mostrar a los 7 días. */
  private readDismissed(): boolean {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      return Date.now() - at < 7 * 24 * 3600 * 1000;
    } catch {
      return false;
    }
  }
}

/** Instrucciones para iPhone/iPad (Safari no ofrece instalación automática). */
@Component({
  selector: 'app-ios-install-help',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (install.showIosHelp()) {
      <div class="sheet-backdrop" (click)="install.showIosHelp.set(false)"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ios-help-title">
        <div class="panel-head"><h2 id="ios-help-title">Instalar en tu iPhone</h2><button type="button" class="feedback-close" aria-label="Cerrar" (click)="install.showIosHelp.set(false)">×</button></div>
        <ol class="sheet-steps">
          <li><span>1</span> Abre esta página en <strong>Safari</strong>.</li>
          <li><span>2</span> Toca el botón <strong>Compartir</strong> <app-ui-icon name="share" /> en la barra inferior.</li>
          <li><span>3</span> Elige <strong>Agregar a inicio</strong> y confirma.</li>
        </ol>
        <button type="button" class="btn btn-primary btn-block" (click)="install.showIosHelp.set(false)">Entendido</button>
      </div>
    }
  `,
})
export class IosInstallHelpComponent {
  install = inject(InstallService);
}
