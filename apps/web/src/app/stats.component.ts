import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ApiService } from './api.service';
import { ShortLink, StoredFile } from './models';

@Component({
  selector: 'app-overview',
  imports: [RouterLink],
  template: ` <header class="page-heading">
      <span class="eyebrow">Alles im Blick</span>
      <h1>Deine Website</h1>
      <p class="muted">Verwalte dein Profil und teile, was dir wichtig ist.</p>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="dashboard-grid">
      <a routerLink="/admin/shortlinks" class="panel stat-card"
        ><span class="muted">Kurzlinks</span><strong>{{ overview()?.shortlinks ?? '…' }}</strong
        ><span>Links verwalten ↗</span></a
      ><a routerLink="/admin/files" class="panel stat-card"
        ><span class="muted">Dateien</span><strong>{{ overview()?.files ?? '…' }}</strong
        ><span>Dateien verwalten ↗</span></a
      >
    </div>
    <section class="panel">
      <h2>Dein öffentlicher Auftritt</h2>
      <p class="muted">
        Aktualisiere dein Profil, passe deinen Hintergrund an und füge deine Social-Links hinzu.
      </p>
      <a routerLink="/admin/portfolio" class="button primary">Portfolio bearbeiten</a>
      <a routerLink="/" class="button">Website ansehen ↗</a>
    </section>`,
})
export class OverviewComponent implements OnInit {
  api = inject(ApiService);
  overview = signal<{ shortlinks: number; files: number } | null>(null);
  error = signal('');

  async ngOnInit() {
    try {
      this.overview.set(
        await this.api.get<{ shortlinks: number; files: number }>('/admin/overview'),
      );
    } catch (error) {
      this.error.set(this.api.message(error));
    }
  }
}

@Component({
  selector: 'app-stats',
  imports: [DatePipe],
  template: `
    <header class="page-heading">
      <span class="eyebrow">Nutzung</span>
      <h1>Statistiken</h1>
      <p class="muted">Die meistbesuchten Links und Dateien.</p>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (stats()) {
      @let s = stats()!;
      <div class="dashboard-grid">
        <section class="panel">
          <h2>Top Kurzlinks</h2>
          @for (link of s.topShortlinks; track link.id) {
            <div class="list-row">
              <div class="grow break">
                <a [href]="'/s/' + link.key" target="_blank" rel="noopener">/s/{{ link.key }}</a>
                <p class="muted small">{{ link.destinationUrl }}</p>
              </div>
              <strong>{{ link.viewsCount }}</strong>
            </div>
          } @empty {
            <p class="empty">Noch keine Kurzlinks.</p>
          }
        </section>
        <section class="panel">
          <h2>Top Dateien</h2>
          @for (file of s.topFiles; track file.id) {
            <div class="list-row">
              <div class="grow break">
                <a [href]="'/f/' + file.key" target="_blank" rel="noopener">{{
                  file.originalName
                }}</a>
                <p class="muted small">{{ file.isPublic ? 'Öffentlich' : 'Privat' }}</p>
              </div>
              <strong>{{ file.viewsCount }}</strong>
            </div>
          } @empty {
            <p class="empty">Noch keine Dateien.</p>
          }
        </section>
      </div>
      <section class="panel">
        <h2>Zuletzt aufgerufen</h2>
        @for (file of s.lastFiles; track file.id) {
          <div class="list-row">
            <span class="grow break">{{ file.originalName }}</span
            ><span class="muted small">{{
              file.lastAccessedAt ? (file.lastAccessedAt | date: 'dd.MM.yyyy HH:mm') : 'Noch nie'
            }}</span>
          </div>
        } @empty {
          <p class="empty">Noch keine Aufrufe.</p>
        }
      </section>
    } @else if (!error()) {
      <p role="status">Statistiken werden geladen…</p>
    }
  `,
})
export class StatsComponent implements OnInit {
  api = inject(ApiService);
  stats = signal<{
    topShortlinks: ShortLink[];
    topFiles: StoredFile[];
    lastFiles: StoredFile[];
  } | null>(null);
  error = signal('');

  async ngOnInit() {
    try {
      this.stats.set(
        await this.api.get<{
          topShortlinks: ShortLink[];
          topFiles: StoredFile[];
          lastFiles: StoredFile[];
        }>('/admin/stats'),
      );
    } catch (error) {
      this.error.set(this.api.message(error));
    }
  }
}
