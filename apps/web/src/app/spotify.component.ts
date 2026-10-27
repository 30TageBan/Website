import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ExternalLinks } from './external-link.component';

interface SpotifyController {
  play(): void;
  destroy(): void;
  addListener(event: string, listener: () => void): void;
}
interface SpotifyApi {
  createController(
    element: HTMLElement,
    options: { uri: string; width: string; height: number },
    callback: (controller: SpotifyController) => void,
  ): void;
}
declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyApi) => void;
  }
}
let apiPromise: Promise<SpotifyApi> | undefined;
function loadSpotifyApi(): Promise<SpotifyApi> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<SpotifyApi>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      script.remove();
      reject(new Error('Spotify API timeout'));
    }, 20000);
    window.onSpotifyIframeApiReady = (api) => {
      clearTimeout(timeout);
      resolve(api);
    };
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error('Spotify API unavailable'));
    };
    document.body.append(script);
  }).catch((error) => {
    apiPromise = undefined;
    throw error;
  });
  return apiPromise;
}

@Component({
  selector: 'app-spotify',
  template: ` <section class="spotify">
    <span class="eyebrow">Aktuell auf Spotify</span>
    <div #slot [hidden]="!autoplay || fallback()"></div>
    @if (!autoplay || fallback()) {
      <iframe
        title="Spotify Track"
        [src]="url"
        width="100%"
        height="152"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      ></iframe>
    }
    @if (autoplay && !fallback()) {
      <div class="inline-actions spotify-controls">
        <button [disabled]="!ready()" (click)="play()">
          {{ ready() ? 'Wiedergabe starten' : 'Spotify wird geladen…' }}</button
        ><span class="muted small">{{
          started()
            ? 'Wiedergabe gestartet.'
            : 'Falls Autoplay blockiert wird, starte die Wiedergabe im Player.'
        }}</span>
      </div>
    }
    <p class="muted small spotify-help">
      Nur eine Vorschau? Die vollständige Wiedergabe hängt von Spotify und deiner Browsersitzung ab.
      <a
        [href]="'https://open.spotify.com/track/' + trackId"
        (click)="external.request($event, 'https://open.spotify.com/track/' + trackId, true)"
        (auxclick)="external.request($event, 'https://open.spotify.com/track/' + trackId, true)"
        target="_blank"
        rel="noopener noreferrer"
        >In Spotify öffnen ↗</a
      >
    </p>
  </section>`,
})
export class SpotifyComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) trackId = '';
  @Input() autoplay = false;
  @ViewChild('slot', { static: true }) slot!: ElementRef<HTMLElement>;
  sanitizer = inject(DomSanitizer);
  url: SafeResourceUrl = '';
  fallback = signal(false);
  ready = signal(false);
  started = signal(false);
  external = inject(ExternalLinks);
  private controller?: SpotifyController;
  private destroyed = false;
  ngOnChanges() {
    this.url = this.sanitizer.bypassSecurityTrustResourceUrl(
      'https://open.spotify.com/embed/track/' + encodeURIComponent(this.trackId),
    );
  }
  async ngAfterViewInit() {
    if (!this.autoplay) return;
    try {
      const api = await loadSpotifyApi();
      if (this.destroyed) return;
      api.createController(
        this.slot.nativeElement,
        { uri: 'spotify:track:' + this.trackId, width: '100%', height: 152 },
        (controller) => {
          if (this.destroyed) {
            controller.destroy();
            return;
          }
          this.controller = controller;
          controller.addListener('ready', () => {
            if (this.destroyed) return;
            this.ready.set(true);
            this.play();
          });
          controller.addListener('playback_started', () => {
            if (!this.destroyed) this.started.set(true);
          });
        },
      );
    } catch {
      if (!this.destroyed) this.fallback.set(true);
    }
  }
  play() {
    try {
      this.controller?.play();
    } catch {
      /* Der eingebettete Player bleibt bedienbar. */
    }
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.controller?.destroy();
  }
}
