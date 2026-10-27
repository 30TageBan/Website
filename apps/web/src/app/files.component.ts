import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from './api.service';
import { StoredFile } from './models';

@Component({
  selector: 'app-files',
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: ` <header class="page-heading">
      <span class="eyebrow">Teilen & verwalten</span>
      <h1>Dateien</h1>
      <p class="muted">Bilder, Videos, Musik und Texte – öffentlich oder nur für dich.</p>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (notice()) {
      <p class="notice" role="status">{{ notice() }}</p>
    }
    <form class="panel" (ngSubmit)="upload()" #uploadForm="ngForm">
      <h2>Datei hochladen</h2>
      <div class="form-grid three">
        <label
          >Datei (max. 50 MB)<input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,text/plain,audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/x-wav,audio/mp4"
            (change)="choose($event)"
            required
            #fileInput
        /></label>
        <label
          >Key (optional)<input
            name="key"
            [(ngModel)]="key"
            placeholder="Wird automatisch vergeben"
            pattern="[A-Za-z0-9_-]{3,64}"
        /></label>
        <label
          >Sichtbarkeit<select name="public" [(ngModel)]="isPublic">
            <option [ngValue]="true">Öffentlich</option>
            <option [ngValue]="false">Privat</option>
          </select></label
        >
      </div>
      <button class="primary" [disabled]="busy() || !file || uploadForm.invalid">
        {{ busy() ? 'Bitte warten…' : 'Hochladen' }}
      </button>
    </form>
    <section class="panel">
      <h2>Gespeicherte Dateien</h2>
      @if (loading()) {
        <p role="status">Dateien werden geladen…</p>
      }
      @for (item of files(); track item.id) {
        <div class="file-row">
          <div class="grow">
            <h3 class="break">{{ item.originalName }}</h3>
            <p class="muted small break">
              {{ item.key }} · {{ item.sizeBytes / 1024 | number: '1.0-0' }} KB ·
              {{ item.viewsCount }} Aufrufe ·
              <span [class.private]="!item.isPublic">{{
                item.isPublic ? 'Öffentlich' : 'Privat'
              }}</span>
            </p>
            <p class="muted small">
              Zuletzt aufgerufen:
              {{
                item.lastAccessedAt ? (item.lastAccessedAt | date: 'dd.MM.yyyy HH:mm') : 'Noch nie'
              }}
            </p>
            <div class="inline-actions">
              <a [href]="'/f/' + item.key" target="_blank" rel="noopener">Ansehen ↗</a
              ><a [href]="'/f/' + item.key + '/raw'" target="_blank" rel="noopener">Original ↗</a>
            </div>
          </div>
          <div class="inline-actions">
            <button [disabled]="busy()" (click)="toggle(item)">
              {{ item.isPublic ? 'Privat setzen' : 'Veröffentlichen' }}</button
            ><button class="danger" [disabled]="busy()" (click)="remove(item)">Löschen</button>
          </div>
        </div>
      } @empty {
        @if (!loading()) {
          <p class="empty">Noch keine Dateien hochgeladen.</p>
        }
      }
    </section>`,
})
export class FilesComponent implements OnInit {
  api = inject(ApiService);
  files = signal<StoredFile[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  file: File | null = null;
  key = '';
  isPublic = true;
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      this.files.set(await this.api.get<StoredFile[]>('/admin/files'));
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.loading.set(false);
    }
  }
  choose(event: Event) {
    this.file = (event.target as HTMLInputElement).files?.[0] || null;
  }
  async run(action: () => Promise<unknown>, notice: string) {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action();
      await this.load();
      this.notice.set(notice);
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  upload() {
    if (!this.file || this.busy()) return;
    if (this.file.size > 50 * 1024 * 1024) {
      this.error.set('Maximal 50 MB pro Datei.');
      return;
    }
    const body = new FormData();
    body.set('file', this.file);
    body.set('key', this.key);
    body.set('isPublic', String(this.isPublic));
    return this.run(() => this.api.send('POST', '/admin/files', body), 'Datei hochgeladen.');
  }
  toggle(file: StoredFile) {
    return this.run(
      () => this.api.send('PATCH', '/admin/files/' + file.id, { isPublic: !file.isPublic }),
      'Sichtbarkeit geändert.',
    );
  }
  remove(file: StoredFile) {
    if (confirm('Datei „' + file.originalName + '“ endgültig löschen?'))
      return this.run(() => this.api.send('DELETE', '/admin/files/' + file.id), 'Datei gelöscht.');
    return;
  }
}

interface Viewer {
  key: string;
  originalName: string;
  mimeType: string;
  text?: string;
}
@Component({
  selector: 'app-file-viewer',
  template: ` <main class="viewer">
    <header>
      <h1>{{ file()?.originalName || 'Datei' }}</h1>
      @if (file()) {
        <a [href]="rawUrl" target="_blank" rel="noopener">Original öffnen ↗</a>
      }
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (file()) {
      @let f = file()!;
      @if (f.mimeType.startsWith('image/')) {
        <img [src]="rawUrl" [alt]="f.originalName" />
      } @else if (f.mimeType === 'video/mp4') {
        <video controls [src]="rawUrl"></video>
      } @else if (f.mimeType.startsWith('audio/')) {
        <audio controls [src]="rawUrl"></audio>
      } @else if (f.mimeType === 'text/plain') {
        <pre>{{ f.text }}</pre>
      }
    } @else if (!error()) {
      <p role="status">Datei wird geladen…</p>
    }
  </main>`,
})
export class FileViewerComponent implements OnInit {
  api = inject(ApiService);
  route = inject(ActivatedRoute);
  file = signal<Viewer | null>(null);
  error = signal('');
  rawUrl = '';
  async ngOnInit() {
    const key = encodeURIComponent(this.route.snapshot.paramMap.get('key') || '');
    this.rawUrl = '/f/' + key + '/raw';
    try {
      this.file.set(await this.api.get<Viewer>('/files/' + key));
    } catch (error) {
      this.error.set(this.api.message(error));
    }
  }
}
