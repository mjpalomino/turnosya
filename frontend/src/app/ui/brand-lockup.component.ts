import { ChangeDetectionStrategy, Component, Input, computed, inject } from '@angular/core';
import { PlatformService } from '../core/platform.service';
import { UiIconComponent } from './icon.component';

/** Logo + nombre de la plataforma (lo que defina el superadmin). */
@Component({
  selector: 'app-brand-lockup',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="brand-lockup" [class.brand-lockup-light]="light">
      @if (b().logoUrl) {
        <img class="brand-logo-img" [src]="b().logoUrl" [alt]="''" />
      } @else {
        <span class="brand-mark" [class.brand-mark-light]="light"><app-ui-icon name="calendar-check" /></span>
      }
      <span class="brand-stack">
        @if (split()) {
          <span class="brand-wordmark" [class.brand-wordmark-light]="light">{{ split()![0] }}<span>{{ split()![1] }}</span></span>
        } @else {
          <span class="brand-wordmark" [class.brand-wordmark-light]="light">{{ b().brandName }}</span>
        }
        @if (subtitle) { <span class="brand-small">{{ subtitle }}</span> }
      </span>
    </span>
  `,
})
export class BrandLockupComponent {
  private platform = inject(PlatformService);
  @Input() subtitle = '';
  @Input() light = false;
  b = this.platform.branding;
  /** Mantiene el estilo bicolor "Turnos|Ya" cuando el nombre termina en "Ya". */
  split = computed<[string, string] | null>(() => {
    const m = /^(.+?)(Ya)$/.exec(this.b().brandName);
    return m ? [m[1]!, m[2]!] : null;
  });
}
