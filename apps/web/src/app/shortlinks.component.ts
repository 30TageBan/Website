import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from './api.service';
import { ShortLink } from './models';

interface Draft {
  id?: string;
  key: string;
  destinationUrl: string;
  expiresInDays?: number;
  maxViews: number;
  requireClick: boolean;
  countdownSeconds: number;
}
const emptyDraft = (): Draft => ({
  key: '',
  destinationUrl: '',
  expiresInDays: 0,
  maxViews: 0,
  requireClick: false,
  countdownSeconds: 0,
});

@Component({
  selector: 'app-shortlinks',
  imports: [FormsModule, DatePipe],
  template: ` <header class="page-heading">
      <span class="eyebrow">Kurze Wege</span>
      <h1>Kurzlinks</h1>
      <p class="muted">Zieladresse, Ablaufdatum und Weiterleitung selbst bestimmen.</p>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (notice()) {
      <p class="notice" role="status">{{ notice() }}</p>
    }
    <form class="panel" (ngSubmit)="save()" #form="ngForm">
      <h2>{{ draft.id ? 'Kurzlink bearbeiten' : 'Neuer Kurzlink' }}</h2>
      <div class="form-grid three">
        <label
          >Ziel-URL<input
            type="url"
            name="destination"
            [(ngModel)]="draft.destinationUrl"
            required
            placeholder="https://…"
        /></label>
        <label
          >Key {{ draft.id ? '' : '(optional)'
          }}<input
            name="key"
            [(ngModel)]="draft.key"
            [required]="!!draft.id"
            pattern="[A-Za-z0-9_-]{3,32}"
            placeholder="Automatisch"
        /></label>
        <label
          >Ablauf in Tagen (0 = unbegrenzt)<input
            type="number"
            name="days"
            [(ngModel)]="draft.expiresInDays"
            min="0"
            max="3650"
            placeholder="Bisherigen Ablauf beibehalten"
        /></label>
        <label
          >Maximale Aufrufe (0 = unbegrenzt)<input
            type="number"
            name="views"
            [(ngModel)]="draft.maxViews"
            min="0"
            max="1000000"
            required
        /></label>
        <label
          >Wartezeit<select name="countdown" [(ngModel)]="draft.countdownSeconds">
            @for (seconds of [0, 3, 5, 10, 15]; track seconds) {
              <option [ngValue]="seconds">{{ seconds }} Sekunden</option>
            }
          </select></label
        >
        <label class="checkbox"
          ><input
            type="checkbox"
            name="requireClick"
            [(ngModel)]="draft.requireClick"
          />Weiterleitung per Klick bestätigen</label
        >
      </div>
      <div class="inline-actions">
        <button class="primary" [disabled]="busy() || form.invalid">
          {{ draft.id ? 'Änderungen speichern' : 'Kurzlink erstellen' }}
        </button>
        @if (draft.id) {
          <button type="button" (click)="cancel()">Abbrechen</button>
        }
      </div>
    </form>
    <section class="panel">
      <h2>Deine Kurzlinks</h2>
      @if (loading()) {
        <p role="status">Kurzlinks werden geladen…</p>
      }
      @for (link of links(); track link.id) {
        <div class="file-row">
          <div class="grow">
            <h3>
              <a [href]="'/s/' + link.key" target="_blank" rel="noopener">/s/{{ link.key }} ↗</a>
            </h3>
            <p class="muted break">{{ link.destinationUrl }}</p>
            <p class="small muted">
              {{ link.viewsCount }} Aufrufe {{ link.maxViews ? '/ ' + link.maxViews : '' }} ·
              {{ link.countdownSeconds }}s Wartezeit ·
              {{ link.requireClick ? 'Klick erforderlich' : 'Automatisch' }} · Ablauf:
              {{ link.expiresAt ? (link.expiresAt | date: 'dd.MM.yyyy HH:mm') : 'Unbegrenzt' }}
            </p>
          </div>
          <div class="inline-actions">
            <button (click)="edit(link)">Bearbeiten</button
            ><button class="danger" [disabled]="busy()" (click)="remove(link)">Löschen</button>
          </div>
        </div>
      } @empty {
        @if (!loading()) {
          <p class="empty">Noch keine Kurzlinks erstellt.</p>
        }
      }
    </section>`,
})
export class ShortlinksComponent implements OnInit {
  api = inject(ApiService);
  links = signal<ShortLink[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  draft = emptyDraft();
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      this.links.set(await this.api.get<ShortLink[]>('/admin/shortlinks'));
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.loading.set(false);
    }
  }
  edit(link: ShortLink) {
    this.draft = {
      id: link.id,
      key: link.key,
      destinationUrl: link.destinationUrl,
      maxViews: link.maxViews || 0,
      requireClick: link.requireClick,
      countdownSeconds: link.countdownSeconds,
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  cancel() {
    this.draft = emptyDraft();
  }
  async save() {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const { id, ...input } = this.draft;
      if (input.expiresInDays === null) delete input.expiresInDays;
      await this.api.send(id ? 'PUT' : 'POST', '/admin/shortlinks' + (id ? '/' + id : ''), input);
      this.cancel();
      await this.load();
      this.notice.set('Kurzlink gespeichert.');
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  async remove(link: ShortLink) {
    if (!confirm('Kurzlink /s/' + link.key + ' löschen?')) return;
    this.busy.set(true);
    try {
      await this.api.send('DELETE', '/admin/shortlinks/' + link.id);
      await this.load();
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'app-go',
  template: `<main class="auth-page">
    <section class="panel auth-panel">
      <span class="eyebrow">Weiterleitung</span>
      <h1>Gleich geht’s weiter.</h1>
      <p class="muted">
        {{ loading() ? 'Link wird vorbereitet…' : 'Bestätige, um den geteilten Link zu öffnen.' }}
      </p>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <button
        class="primary full"
        [disabled]="loading() || seconds() > 0 || !!error()"
        (click)="go()"
      >
        {{ seconds() > 0 ? 'Weiter in ' + seconds() + 's' : 'Weiter zum Link' }}
      </button>
    </section>
  </main>`,
})
export class GoComponent implements OnInit, OnDestroy {
  api = inject(ApiService);
  route = inject(ActivatedRoute);
  seconds = signal(0);
  error = signal('');
  loading = signal(true);
  timer?: ReturnType<typeof setInterval>;
  key = '';
  ticket = '';
  async ngOnInit() {
    this.key = encodeURIComponent(this.route.snapshot.paramMap.get('key') || '');
    this.ticket = this.route.snapshot.queryParamMap.get('ticket') || '';
    try {
      const result = await this.api.get<{ seconds: number; requireClick: boolean }>(
        '/resolve/' + this.key + '?ticket=' + encodeURIComponent(this.ticket),
      );
      this.seconds.set(result.seconds);
      const tick = () => {
        this.seconds.update((s) => Math.max(0, s - 1));
        if (this.seconds() === 0) {
          clearInterval(this.timer);
          if (!result.requireClick) void this.go();
        }
      };
      this.loading.set(false);
      if (result.seconds > 0) this.timer = setInterval(tick, 1000);
      else if (!result.requireClick) await this.go();
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.loading.set(false);
    }
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  async go() {
    this.loading.set(true);
    try {
      const result = await this.api.send<{ destinationUrl: string }>(
        'POST',
        '/resolve/' + this.key,
        { ticket: this.ticket },
      );
      window.location.assign(result.destinationUrl);
    } catch (error) {
      this.error.set(this.api.message(error));
      this.loading.set(false);
    }
  }
}
