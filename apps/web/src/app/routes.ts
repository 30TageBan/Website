import { inject } from '@angular/core';
import { Routes, Router, CanActivateFn } from '@angular/router';
import { ApiService } from './api.service';
import { AdminComponent } from './app.component';
import { HomeComponent } from './home.component';
import { AuthComponent } from './auth.component';
import { PortfolioComponent } from './portfolio.component';
import { FilesComponent, FileViewerComponent } from './files.component';
import { ShortlinksComponent, GoComponent } from './shortlinks.component';
import { OverviewComponent, StatsComponent } from './stats.component';
import { LogsComponent } from './logs.component';
import { SecurityComponent } from './security.component';

const adminGuard: CanActivateFn = async () => {
  const api = inject(ApiService),
    router = inject(Router);
  try {
    await api.refreshAuth();
  } catch {
    return router.parseUrl('/login');
  }
  return api.auth().loggedIn || router.parseUrl(api.auth().setupComplete ? '/login' : '/setup');
};
const authGuard: CanActivateFn = (route) => {
  const api = inject(ApiService),
    router = inject(Router);
  if (api.auth().loggedIn) return router.parseUrl('/admin');
  if (route.routeConfig?.path === 'setup' && api.auth().setupComplete)
    return router.parseUrl('/login');
  if (route.routeConfig?.path === 'login' && !api.auth().setupComplete)
    return router.parseUrl('/setup');
  return true;
};
export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: AuthComponent, canActivate: [authGuard] },
  { path: 'setup', component: AuthComponent, canActivate: [authGuard] },
  {
    path: 'admin',
    component: AdminComponent,
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    children: [
      { path: '', component: OverviewComponent },
      { path: 'portfolio', component: PortfolioComponent },
      { path: 'files', component: FilesComponent },
      { path: 'shortlinks', component: ShortlinksComponent },
      { path: 'logs', component: LogsComponent },
      { path: 'stats', component: StatsComponent },
      { path: 'security', component: SecurityComponent },
    ],
  },
  { path: 'f/:key', component: FileViewerComponent },
  { path: 'go/:key', component: GoComponent },
  { path: '**', redirectTo: '' },
];
