import { ApplicationConfig, LOCALE_ID, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { routes } from './app.routes';

import { provideServiceWorker } from '@angular/service-worker';
import { authInterceptor } from './core/auth.interceptor';
import { PlatformService } from './core/platform.service';
import { InstallService } from './core/install.service';

// Fechas y números en español de Colombia (ej. "viernes 30 oct", "25.000").
registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // Marca de la plataforma y captura temprana del evento de instalación de la PWA.
    provideAppInitializer(() => {
      inject(InstallService);
      void inject(PlatformService).load();
    }),
  ],
};
