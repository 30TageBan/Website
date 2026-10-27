import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withXsrfConfiguration } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAppInitializer, inject, ErrorHandler } from '@angular/core';
import { WebsiteErrorHandler } from './app/website-error-handler';
import { AppComponent } from './app/app.component';
import { routes } from './app/routes';
import { ApiService } from './app/api.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: ErrorHandler, useClass: WebsiteErrorHandler },
    provideHttpClient(
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
    ),
    provideRouter(routes),
    provideAppInitializer(() =>
      inject(ApiService)
        .refreshAuth()
        .catch(() => {}),
    ),
  ],
}).catch(console.error);
