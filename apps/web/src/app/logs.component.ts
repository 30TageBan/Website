import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from './api.service';
interface LogEvent {
  id: string;
  type: string;
  label: string;
  time: string;
  path: string;
  method: string;
  status: number;
  actor: string;
  level: string;
  page: string;
  ip: string;
  browser: string;
  os: string;
  device: string;
}
interface LogState {
  configured: boolean;
  channelId: string;
  queued: number;
  dropped: number;
  lastSentAt: string | null;
  lastError: string;
  events: LogEvent[];
}
@Component({
  selector: 'app-logs',
  imports: [DatePipe, FormsModule],
  template: `
    <header class="page-heading">
      <span class="eyebrow">Ereignisse & Zustellung</span>
      <h1>Website-Logs</h1>
      <p class="muted">Seitenaufrufe, Anmeldungen, Admin-Aktionen und Fehler.</p>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (state(); as s) {
      <section class="panel">
        <div class="log-heading">
          <h2>
            Discord
            <span class="badge" [class.enabled]="s.configured">{{
              s.configured ? 'Konfiguriert' : 'Nicht konfiguriert'
            }}</span>
          </h2>
          <div class="inline-actions">
            <button (click)="load()" [disabled]="busy()">Aktualisieren</button
            ><button (click)="test()" [disabled]="busy() || !s.configured">
              Testnachricht senden
            </button>
          </div>
        </div>
        <p class="muted small">
          {{
            s.configured
              ? 'Kanal: ' + s.channelId
              : 'DISCORD_LOG_CHANNEL_ID und Bot-Token serverseitig setzen.'
          }}
          · Warteschlange: {{ s.queued }} · Nicht zugestellt/verworfen: {{ s.dropped }}
        </p>
        <p class="muted small">
          Letzte Zustellung:
          {{ s.lastSentAt ? (s.lastSentAt | date: 'dd.MM.yyyy HH:mm:ss') : 'Noch keine' }}
        </p>
        @if (s.lastError) {
          <p class="error" role="status">{{ s.lastError }}</p>
        }
        <p class="muted small">
          Die letzten 100 Ereignisse liegen im Arbeitsspeicher und werden bei einem Serverneustart
          geleert. Discord enthält zugestellte Logs inklusive Seite, IP-Adresse, Browser und Gerät.
          Passwörter, Tokens und Formularinhalte werden nicht protokolliert.
        </p>
      </section>
      <section class="panel">
        <div class="log-heading">
          <h2>Letzte Ereignisse</h2>
          <label
            >Filter<select [(ngModel)]="filter">
              <option value="all">Alle</option>
              <option value="errors">Fehler & fehlgeschlagene Logins</option>
              <option value="visits">Seitenaufrufe</option>
              <option value="admin">Admin-Aktionen</option>
              <option value="auth">Anmeldung & Sicherheit</option>
            </select></label
          >
        </div>
        @for (event of filtered(); track event.id) {
          <div
            class="log-row"
            [class.log-error]="event.level === 'error' || event.level === 'warn'"
          >
            <div>
              <strong>{{ event.label }}</strong>
              <p class="muted small">
                Seite: {{ event.page || event.path }}<br />
                {{ event.method }} {{ event.path }} · {{ event.status || '–' }} · {{ event.actor }}
              </p>
              <p class="muted small">
                IP: {{ event.ip || 'Unbekannt' }} · {{ event.browser || 'Unbekannt' }}<br />
                {{ event.device || 'Unbekannt' }} · {{ event.os || 'Unbekannt' }}
              </p>
            </div>
            <time class="muted small">{{ event.time | date: 'dd.MM. HH:mm:ss' }}</time>
          </div>
        } @empty {
          <p class="empty">Keine passenden Ereignisse.</p>
        }
      </section>
    }
  `,
})
export class LogsComponent implements OnInit {
  api = inject(ApiService);
  state = signal<LogState | null>(null);
  error = signal('');
  busy = signal(false);
  filter = 'all';
  ngOnInit() {
    void this.load();
  }
  filtered() {
    return (this.state()?.events || []).filter(
      (e) =>
        this.filter === 'all' ||
        (this.filter === 'errors' && (e.level === 'warn' || e.level === 'error')) ||
        (this.filter === 'visits' && (e.type === 'page.view' || e.type === 'portfolio.enter')) ||
        (this.filter === 'admin' && e.type === 'admin.action') ||
        (this.filter === 'auth' &&
          (/^(login|auth)\./.test(e.type) || e.path.includes('/security'))),
    );
  }
  async load() {
    this.busy.set(true);
    this.error.set('');
    try {
      this.state.set(await this.api.get<LogState>('/admin/logs'));
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
  async test() {
    this.busy.set(true);
    this.error.set('');
    try {
      this.state.set(await this.api.send<LogState>('POST', '/admin/logs/test'));
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}
