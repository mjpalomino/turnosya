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
 * Aparece si el navegador ofrece instalar o si hay pasos manuales para ese navegador.
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
      <span class="install-hint">Ábrela desde Chrome, Edge o Safari para instalarla.</span>
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

/** Pasos manuales de instalación según el navegador (cuando no hay aviso nativo). */
@Component({
  selector: 'app-install-help',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (install.showHelp()) {
      <div class="sheet-backdrop" (click)="install.showHelp.set(false)"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="install-help-title">
        <div class="panel-head"><h2 id="install-help-title">{{ title() }}</h2><button type="button" class="feedback-close" aria-label="Cerrar" (click)="install.showHelp.set(false)">×</button></div>
        <ol class="sheet-steps">
          @switch (install.kind) {
            @case ('ios-safari') {
              <li><span>1</span><p>Toca el botón <strong>Compartir</strong> <app-ui-icon name="ios-share" /> en la barra de Safari.</p></li>
              <li><span>2</span><p>Desliza y elige <strong>Agregar a inicio</strong>.</p></li>
              <li><span>3</span><p>Toca <strong>Agregar</strong>.</p></li>
            }
            @case ('ios-other') {
              <li><span>1</span><p>Toca el botón <strong>Compartir</strong> <app-ui-icon name="ios-share" /> junto a la barra de direcciones.</p></li>
              <li><span>2</span><p>Elige <strong>Agregar a pantalla de inicio</strong>.</p></li>
              <li><span>3</span><p>Toca <strong>Agregar</strong>. Si no aparece la opción, actualiza tu iPhone (iOS 16.4 o superior) o abre la página en Safari.</p></li>
            }
            @case ('android-chrome') {
              <li><span>1</span><p>Toca el menú <strong>⋮</strong> arriba a la derecha.</p></li>
              <li><span>2</span><p>Elige <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>.</p></li>
              <li><span>3</span><p>Confirma con <strong>Instalar</strong>.</p></li>
            }
            @case ('android-samsung') {
              <li><span>1</span><p>Toca el menú <strong>☰</strong> en la barra inferior.</p></li>
              <li><span>2</span><p>Elige <strong>Agregar página a</strong> › <strong>Pantalla de inicio</strong>.</p></li>
              <li><span>3</span><p>Confirma con <strong>Agregar</strong>.</p></li>
            }
            @case ('android-firefox') {
              <li><span>1</span><p>Toca el menú <strong>⋮</strong>.</p></li>
              <li><span>2</span><p>Elige <strong>Instalar</strong> o <strong>Agregar a la pantalla de inicio</strong>.</p></li>
              <li><span>3</span><p>Confirma.</p></li>
            }
            @case ('desktop-chrome') {
              <li><span>1</span><p>Haz clic en el ícono <strong>Instalar</strong> <app-ui-icon name="download" /> al final de la barra de direcciones.</p></li>
              <li><span>2</span><p>Si no lo ves: menú <strong>⋮</strong> › <strong>Transmitir, guardar y compartir</strong> › <strong>Instalar página como app</strong>.</p></li>
              <li><span>3</span><p>Confirma con <strong>Instalar</strong>.</p></li>
            }
            @case ('desktop-edge') {
              <li><span>1</span><p>Haz clic en el ícono <strong>Aplicación disponible</strong> en la barra de direcciones.</p></li>
              <li><span>2</span><p>Si no lo ves: menú <strong>…</strong> › <strong>Aplicaciones</strong> › <strong>Instalar este sitio como aplicación</strong>.</p></li>
              <li><span>3</span><p>Confirma con <strong>Instalar</strong>.</p></li>
            }
            @case ('mac-safari') {
              <li><span>1</span><p>En la barra de menú elige <strong>Archivo</strong>.</p></li>
              <li><span>2</span><p>Haz clic en <strong>Agregar al Dock</strong> (macOS Sonoma o superior).</p></li>
              <li><span>3</span><p>Confirma con <strong>Agregar</strong>.</p></li>
            }
            @case ('in-app') {
              <li><span>1</span><p>Estás dentro de una red social, que no permite instalar apps.</p></li>
              <li><span>2</span><p>Toca el menú <strong>⋮</strong> o <strong>…</strong> y elige <strong>Abrir en el navegador</strong> (Chrome o Safari).</p></li>
              <li><span>3</span><p>Allí toca <strong>Instalar app</strong>.</p></li>
            }
          }
        </ol>
        @if (install.kind === 'android-chrome' || install.kind === 'desktop-chrome' || install.kind === 'desktop-edge') {
          <p class="muted">Si ya la instalaste, búscala en tus aplicaciones. Si antes cerraste el aviso de instalación, el navegador lo oculta por un tiempo, pero estos pasos funcionan igual.</p>
        }
        <button type="button" class="btn btn-primary btn-block" (click)="install.showHelp.set(false)">Entendido</button>
      </div>
    }
  `,
})
export class InstallHelpComponent {
  install = inject(InstallService);
  title(): string {
    const k = this.install.kind;
    return k.startsWith('ios') ? 'Instalar en tu iPhone' : k.startsWith('android') ? 'Instalar en tu celular'
      : k === 'in-app' ? 'Abre la página en tu navegador' : 'Instalar en tu computador';
  }
}
