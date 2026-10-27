import { Component, inject, OnInit } from '@angular/core';
import { ContentProtectionDirective } from './content-protection.directive';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from './api.service';
import { PortfolioThemeService } from './portfolio-theme.service';
import { Portfolio } from './models';
import { ExternalLinkDialog } from './external-link.component';
import { SceneComponent } from './scene.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ExternalLinkDialog],
  template: '<router-outlet /><app-external-dialog />',
  hostDirectives: [ContentProtectionDirective],
})
export class AppComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        let path = event.urlAfterRedirects.split(/[?#]/)[0];
        if (path.startsWith('/f/')) path = '/f/[key]';
        if (path.startsWith('/go/')) path = '/go/[key]';
        void this.api.send('POST', '/events/page', { path }).catch(() => {});
      }
    });
  }
}

@Component({
  selector: 'app-admin',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SceneComponent],
  template: ` @let p = theme.portfolio();
    <app-scene [portfolio]="p" />
    <div class="admin-shell">
      <header class="admin-header">
        <a routerLink="/" class="wordmark">chris-g<span>.dev</span></a
        ><span class="badge">Verwaltung</span>
      </header>
      <nav class="admin-nav" aria-label="Administration">
        @for (item of nav; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
            >{{ item.label }}</a
          >
        }
        <button class="logout" (click)="logout()">Abmelden</button>
      </nav>
      @if (error) {
        <p class="error" role="alert">{{ error }}</p>
      }
      <main>
        <router-outlet />
      </main>
    </div>`,
})
export class AdminComponent implements OnInit {
  api = inject(ApiService);
  router = inject(Router);
  error = '';
  theme = inject(PortfolioThemeService);

  async ngOnInit() {
    try {
      this.theme.portfolio.set(await this.api.get<Portfolio | null>('/portfolio'));
    } catch (error) {
      this.error = this.api.message(error);
    }
  }

  nav = [
    { path: '/admin', label: 'Übersicht' },
    {
      path: '/admin/portfolio',
      label: 'Portfolio & Links',
    },
    { path: '/admin/files', label: 'Dateien' },
    { path: '/admin/shortlinks', label: 'Kurzlinks' },
    {
      path: '/admin/stats',
      label: 'Statistiken',
    },
    { path: '/admin/security', label: 'Sicherheit' },
    { path: '/admin/logs', label: 'Logs' },
  ];

  async logout() {
    try {
      await this.api.send('POST', '/auth/logout', {});
      await this.api.refreshAuth();
      await this.router.navigateByUrl('/login');
    } catch (error) {
      this.error = this.api.message(error);
    }
  }
}
