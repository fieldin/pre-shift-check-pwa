import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

// Debug: Log service worker registration status
function initializeServiceWorker(): () => Promise<void> {
  return () => new Promise<void>((resolve) => {
    console.log('[SW] isDevMode:', isDevMode());
    console.log('[SW] Service worker supported:', 'serviceWorker' in navigator);
    
    if ('serviceWorker' in navigator && !isDevMode()) {
      // Manual registration as backup
      navigator.serviceWorker.register('/ngsw-worker.js')
        .then(registration => {
          console.log('[SW] Service worker registered successfully:', registration.scope);
        })
        .catch(error => {
          console.error('[SW] Service worker registration failed:', error);
        });
    }
    resolve();
  });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    // Manual service worker initialization for debugging
    {
      provide: APP_INITIALIZER,
      useFactory: initializeServiceWorker,
      multi: true
    },
    provideServiceWorker('ngsw-worker.js', {
      // Force enable - the build is always production when deployed
      enabled: true,
      // Register immediately for faster offline support
      registrationStrategy: 'registerImmediately'
    })
  ]
};
