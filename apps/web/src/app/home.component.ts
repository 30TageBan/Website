import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { ApiService } from './api.service';
import { PortfolioThemeService } from './portfolio-theme.service';
import { Portfolio } from './models';
import { PlatformIconComponent } from './platform-icon.component';
import { linkAppearance } from '../../../../shared/platforms';
import { profileContent } from '../../../../shared/portfolio';
import { SpotifyComponent } from './spotify.component';
import { SceneComponent } from './scene.component';
import { CursorComponent } from './cursor.component';
import { ExternalLinks } from './external-link.component';
import { AudioPlayerComponent } from './audio-player.component';
import { AnimatedTitleComponent } from './animated-title.component';
import { MotionSurfaceDirective } from './motion-surface.directive';
import { tabTitleFrame } from '../../../../shared/titles';

@Component({
  selector: 'app-home',
  imports: [
    MotionSurfaceDirective,
    PlatformIconComponent,
    SpotifyComponent,
    SceneComponent,
    CursorComponent,
    AudioPlayerComponent,
    AnimatedTitleComponent,
  ],
  template: ` <main class="profile-page">
    <app-scene [portfolio]="portfolio()" />
    <app-cursor [mode]="content().appearance.cursor" [color]="content().appearance.accent" />
    @if (!entered()) {
      <div class="entry-gate" [attr.data-motion]="content().motion">
        <div class="entry-magnet" appMotionSurface="entry" [motionLevel]="content().motion">
          <button (click)="enter()">
            <span class="entry-symbol" aria-hidden="true"
              ><svg viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="15" />
                <path d="m18 14 9 6-9 6z" /></svg></span
            ><span class="entry-label">Click to enter …</span>
          </button>
        </div>
      </div>
    }
    @if (entered()) {
      @if (error()) {
        <section class="panel">
          <h1>Portfolio nicht erreichbar</h1>
          <p class="error">{{ error() }}</p>
          <button (click)="load()">Erneut versuchen</button>
        </section>
      } @else if (loading()) {
        <p class="muted" role="status">Portfolio wird geladen…</p>
      } @else {
        @let p = portfolio();
        <div class="portfolio-float" [attr.data-motion]="content().motion">
          <div class="card-motion-surface" appMotionSurface="card" [motionLevel]="content().motion">
            <div class="card-motion-target">
              <article
                class="profile-card compact-profile"
                [attr.data-motion]="content().motion"
                [style.--profile-accent]="content().appearance.accent"
              >
                <div class="profile-banner-wrap">
                  <span class="profile-views" aria-label="Portfolio-Aufrufe"
                    ><svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {{ portfolio()?.viewsCount || 0 }}</span
                  >
                  @if (p?.bannerUrl) {
                    <img class="banner" [src]="p!.bannerUrl" alt="Profilbanner" />
                  } @else {
                    <div
                      class="banner-placeholder"
                      [style.background]="p?.discordAccentColor || null"
                    ></div>
                  }
                </div>
                <div class="profile-content">
                  <header class="profile-heading">
                    @if (p?.avatarUrl) {
                      <img class="avatar" [src]="p!.avatarUrl" [alt]="p!.title" />
                    } @else {
                      <div class="avatar initials">{{ (p?.title || 'C').slice(0, 1) }}</div>
                    }
                    <div>
                      <app-animated-title
                        [text]="p?.title || 'chris-g.dev'"
                        [effect]="content().titleEffect"
                        [accent]="content().appearance.accent"
                      />
                      <p class="muted">{{ p?.subtitle || 'Portfolio' }}</p>
                      @if (p?.discordBadges?.length) {
                        <div class="discord-badges" aria-label="Discord-Abzeichen">
                          @for (badge of p!.discordBadges!; track badge.id) {
                            <span
                              class="discord-badge"
                              [style.--badge-color]="badge.color"
                              [title]="badge.label"
                              [attr.aria-label]="badge.label"
                              >{{ badge.symbol }}</span
                            >
                          }
                        </div>
                      }
                    </div>
                  </header>
                  @if (content().audio.url) {
                    <app-audio-player
                      [url]="content().audio.url"
                      [title]="content().audio.title"
                      [autoplay]="content().audio.autoplay"
                    />
                  } @else if (p?.spotifyTrackId) {
                    <app-spotify
                      [trackId]="p!.spotifyTrackId"
                      [autoplay]="content().spotifyAutoplay"
                    />
                  }
                  <div class="social-links" [class.icons-only]="!content().showLinkText">
                    @for (link of p?.links || []; track link.id) {
                      @let style = appearance(link);
                      <a
                        class="social-link"
                        [attr.aria-label]="link.label || style.label"
                        [title]="link.label || style.label"
                        [href]="link.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        (click)="external.request($event, link.url, true)"
                        (auxclick)="external.request($event, link.url, true)"
                        [style.--platform-color]="style.color"
                      >
                        <app-platform-icon [type]="style.type" />
                        @if (content().showLinkText) {
                          <span>{{ link.label || style.label }}</span>
                        }
                      </a>
                    }
                  </div>
                  @if (content().buttons.length) {
                    <div class="profile-actions">
                      @for (button of content().buttons; track $index) {
                        <a
                          [href]="button.url"
                          (click)="external.request($event, button.url)"
                          (auxclick)="external.request($event, button.url)"
                          class="button"
                          ><span class="action-link-icon" aria-hidden="true">↗</span
                          >{{ button.label }}</a
                        >
                      }
                    </div>
                  }
                  @if (content().services.length) {
                    <section id="services" class="services">
                      <span class="eyebrow">{{ content().servicesTitle }}</span>
                      <ul>
                        @for (service of content().services; track $index) {
                          <li>{{ service }}</li>
                        }
                      </ul>
                    </section>
                  }
                  @for (block of content().sections; track $index) {
                    <section
                      class="services custom-content-section"
                      [id]="'section-' + ($index + 1)"
                    >
                      <span class="eyebrow">{{ block.title }}</span>
                      @if (block.text) {
                        <p class="section-body">{{ block.text }}</p>
                      }
                      @if (block.items.length) {
                        <ul>
                          @for (item of block.items; track $index) {
                            <li>{{ item }}</li>
                          }
                        </ul>
                      }
                      @if (block.buttons.length) {
                        <div class="profile-actions">
                          @for (button of block.buttons; track $index) {
                            <a
                              class="button"
                              [href]="button.url"
                              (click)="external.request($event, button.url)"
                              (auxclick)="external.request($event, button.url)"
                              >{{ button.label }}</a
                            >
                          }
                        </div>
                      }
                    </section>
                  }
                  @if (external.skip()) {
                    <button class="reset-link-warning" (click)="external.reset()">
                      Link-Rückfragen wieder aktivieren
                    </button>
                  }
                </div>
              </article>
              <div class="card-pointer-light" aria-hidden="true"></div>
            </div>
          </div>
        </div>
      }
    }
  </main>`,
})
export class HomeComponent implements OnInit, OnDestroy {
  api = inject(ApiService);
  private theme = inject(PortfolioThemeService);
  title = inject(Title);
  meta = inject(Meta);
  external = inject(ExternalLinks);
  portfolio = signal<Portfolio | null>(null);
  error = signal('');
  loading = signal(true);
  entered = signal(false);
  appearance = linkAppearance;
  content = computed(() => profileContent(this.portfolio()?.content));
  private tabTimer?: ReturnType<typeof setInterval>;
  private canonicalTitle = 'chris-g.dev';
  private motion = matchMedia('(prefers-reduced-motion:reduce)');
  private motionChanged = () => this.animateTab();

  ngOnInit() {
    this.motion.addEventListener('change', this.motionChanged);
    void this.load();
  }

  @HostListener('window:pageshow', ['$event']) pageShown(event: PageTransitionEvent) {
    if (event.persisted) this.entered.set(false);
  }

  private destroyed = false;
  private viewCounted = false;

  enter() {
    this.entered.set(true);
    void this.countView();
  }

  private async countView() {
    if (this.viewCounted || !this.portfolio()) return;
    this.viewCounted = true;
    try {
      await this.api.refreshAuth();
      const result = await this.api.send<{ viewsCount: number }>('POST', '/portfolio/view');
      this.portfolio.update((p) => (p ? { ...p, viewsCount: result.viewsCount } : p));
    } catch {
      this.viewCounted = false;
    }
  }

  private animateTab() {
    clearInterval(this.tabTimer);
    this.title.setTitle(this.canonicalTitle);
    const effect = this.content().tabTitleEffect;
    if (effect === 'none' || this.motion.matches) return;
    let frame = 0;
    this.tabTimer = setInterval(
      () => this.title.setTitle(tabTitleFrame(this.canonicalTitle, effect, frame++)),
      250,
    );
  }

  ngOnDestroy() {
    this.destroyed = true;
    clearInterval(this.tabTimer);
    this.motion.removeEventListener('change', this.motionChanged);
    this.title.setTitle(this.canonicalTitle);
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const p = await this.api.get<Portfolio | null>('/portfolio');
      if (this.destroyed) return;
      this.portfolio.set(p);
      this.theme.portfolio.set(p);
      if (this.entered()) void this.countView();
      this.canonicalTitle = p?.seoTitle || p?.title || 'chris-g.dev';
      this.animateTab();
      this.meta.updateTag({
        name: 'description',
        content: p?.seoDescription || p?.subtitle || 'Portfolio',
      });
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.loading.set(false);
    }
  }
}
