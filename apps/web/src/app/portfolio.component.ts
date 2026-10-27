import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ApiService } from './api.service';
import { Portfolio, Link } from './models';
import { PlatformIconComponent } from './platform-icon.component';
import { PLATFORMS, linkAppearance } from '../../../../shared/platforms';
import { profileContent } from '../../../../shared/portfolio';
import { PortfolioThemeService } from './portfolio-theme.service';
import { BACKGROUNDS, ANIMATIONS, CURSORS } from '../../../../shared/appearance';
import { StoredFile } from './models';
import { CursorComponent } from './cursor.component';
import { TITLE_EFFECTS, TAB_EFFECTS } from '../../../../shared/titles';
import { AnimatedTitleComponent } from './animated-title.component';

interface DiscordProfile {
  badges?: { id: string; label: string; symbol: string; color: string }[];
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  bannerUrl: string;
  accentColor: string | null;
}

@Component({
  selector: 'app-portfolio',
  imports: [FormsModule, PlatformIconComponent, CursorComponent, AnimatedTitleComponent],
  templateUrl: './portfolio.component.html',
})
export class PortfolioComponent implements OnInit, OnDestroy {
  section = signal('profile');
  sections = [
    { id: 'profile', label: 'Profil', hint: 'Name & Bilder', icon: '◉' },
    { id: 'links', label: 'Social-Links', hint: 'Plattformen & Verbindungen', icon: '↗' },
    { id: 'content', label: 'Inhalte', hint: 'Buttons & Leistungen', icon: '▤' },
    { id: 'design', label: 'Design', hint: 'Hintergrund, Cursor & Titel', icon: '✧' },
    { id: 'music', label: 'Musik', hint: 'Spotify & eigener Player', icon: '♫' },
    { id: 'discord', label: 'Discord', hint: 'Profil synchronisieren', icon: '◎' },
    { id: 'seo', label: 'Suchvorschau', hint: 'Suchmaschinen & Teilen', icon: '⌕' },
  ];
  private savedDraft = '';

  private draftSnapshot() {
    return JSON.stringify({
      form: this.form,
      content: this.content,
      servicesText: this.servicesText,
    });
  }

  get hasChanges() {
    return !!this.savedDraft && this.draftSnapshot() !== this.savedDraft;
  }

  get activeSection() {
    return this.sections.find((item) => item.id === this.section()) || this.sections[0];
  }

  get sectionNumber() {
    return this.sections.findIndex((item) => item.id === this.section()) + 1;
  }

  selectSection(id: string) {
    this.section.set(id);
  }

  submitProfile(form: NgForm) {
    if (form.invalid) {
      form.form.markAllAsTouched();
      const name = Object.keys(form.controls).find((key) => form.controls[key].invalid) || 'title';
      const target = name.startsWith('discord')
        ? 'discord'
        : name.startsWith('seo')
          ? 'seo'
          : name.startsWith('audio') || name === 'spotifyTrackId'
            ? 'music'
            : name.startsWith('block') || name.startsWith('button') || name.startsWith('services')
              ? 'content'
              : ['title', 'subtitle', 'avatarUrl', 'bannerUrl'].includes(name)
                ? 'profile'
                : 'design';
      this.section.set(target);
      this.error.set(
        'Bitte prüfe die markierten Angaben im Bereich „' + this.activeSection.label + '“.',
      );
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLInputElement>('#portfolio-settings-form [name="' + name + '"]')
          ?.focus(),
      );
      return;
    }
    void this.save();
  }

  api = inject(ApiService);
  links = signal<Link[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  theme = inject(PortfolioThemeService);
  content = profileContent(null);
  servicesText = this.content.services.join('\n');
  editingId: string | null = null;
  previewing = signal(false);
  private savedPortfolio: Portfolio | null = null;
  form = {
    title: 'Chris',
    subtitle: 'Fullstack Developer',
    avatarUrl: '',
    bannerUrl: '',
    seoTitle: '',
    seoDescription: '',
    seoOgImageUrl: '',
    spotifyTrackId: '',
    backgroundPreset: 'default',
    overlayOpacity: 0.55,
    blur: 18,
    vignette: 0.35,
  };
  link = { type: 'auto', label: '', url: '', sortOrder: 0 };
  customColor = false;
  customHex = '#9146ff';
  platforms = Object.entries(PLATFORMS).map(([key, value]) => ({ key, ...value }));
  appearance = linkAppearance;
  backgrounds = Object.entries(BACKGROUNDS).map(([key, label]) => ({ key, label }));
  animations = Object.entries(ANIMATIONS).map(([key, label]) => ({ key, label }));
  cursors = Object.entries(CURSORS).map(([key, label]) => ({ key, label }));
  titleEffects = Object.entries(TITLE_EFFECTS).map(([key, label]) => ({ key, label }));
  tabEffects = Object.entries(TAB_EFFECTS).map(([key, label]) => ({ key, label }));
  discordConfigured = signal(false);
  discordPreview = signal<DiscordProfile | null>(null);

  get preview() {
    return linkAppearance({ ...this.link, color: this.customColor ? this.customHex : '' });
  }

  ngOnInit() {
    void this.load();
    void this.api
      .get<{
        configured: boolean;
      }>('/admin/discord')
      .then((value) => this.discordConfigured.set(value.configured))
      .catch(() => {});
  }

  async load(refreshProfile = true) {
    try {
      const [p, publicProfile] = await Promise.all([
        this.api.get<Portfolio | null>('/admin/portfolio'),
        this.api.get<Portfolio | null>('/portfolio'),
      ]);
      if (p) {
        this.savedPortfolio = p;
        this.previewing.set(false);
        this.links.set(p.links);
        this.theme.portfolio.set(publicProfile);
        if (refreshProfile) {
          this.form = { ...this.form, ...p, ...p.backgroundSettings };
          this.content = structuredClone(profileContent(p.content));
          this.servicesText = this.content.services.join('\n');
          this.savedDraft = this.draftSnapshot();
        }
      }
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.loading.set(false);
    }
  }

  async run(action: () => Promise<unknown>, notice: string, refreshProfile = true) {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action();
      await this.load(refreshProfile);
      this.notice.set(notice);
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }

  addSection() {
    this.content.sections.push({ title: 'Neuer Bereich', text: '', items: [], buttons: [] });
  }

  setSectionItems(index: number, value: string) {
    this.content.sections[index].items = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  moveSection(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= this.content.sections.length) return;
    [this.content.sections[index], this.content.sections[target]] = [
      this.content.sections[target],
      this.content.sections[index],
    ];
  }

  moveButton(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= this.content.buttons.length) return;
    [this.content.buttons[index], this.content.buttons[target]] = [
      this.content.buttons[target],
      this.content.buttons[index],
    ];
  }

  previewEffects() {
    if (!this.savedPortfolio) return;
    this.theme.portfolio.set({
      ...this.savedPortfolio,
      backgroundPreset: this.form.backgroundPreset,
      backgroundSettings: {
        overlayOpacity: this.form.overlayOpacity,
        blur: this.form.blur,
        vignette: this.form.vignette,
      },
      content: structuredClone(this.content),
    });
    this.previewing.set(true);
  }

  resetPreview() {
    this.previewing.set(false);
    this.theme.portfolio.set(this.savedPortfolio);
  }

  ngOnDestroy() {
    this.resetPreview();
  }

  async loadDiscord() {
    this.busy.set(true);
    this.error.set('');
    try {
      this.discordPreview.set(
        await this.api.get<DiscordProfile>(
          '/admin/discord/' + encodeURIComponent(this.content.discord.userId),
        ),
      );
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }

  importDiscord() {
    const p = this.discordPreview();
    if (!p) return;
    this.form.avatarUrl = p.avatarUrl;
    this.form.bannerUrl = p.bannerUrl;
    this.form.title = p.displayName;
    this.notice.set('Discord-Werte übernommen. Zum Übernehmen das Portfolio speichern.');
  }

  async uploadAudio(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      this.error.set('Maximal 50 MB pro Audiodatei.');
      input.value = '';
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('isPublic', 'true');
      const uploaded = await this.api.send<StoredFile>('POST', '/admin/files', body);
      this.content.audio.url = '/f/' + uploaded.key + '/raw';
      if (this.content.audio.title === 'Meine Musik')
        this.content.audio.title = file.name.replace(/\.[^.]+$/, '');
      this.notice.set('Audio hochgeladen. Portfolio speichern, um den Player zu übernehmen.');
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }

  save() {
    return this.run(
      () =>
        this.api.send('PUT', '/admin/portfolio', {
          ...this.form,
          content: {
            ...this.content,
            services: this.servicesText
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean),
          },
        }),
      'Portfolio gespeichert.',
    );
  }

  edit(link: Link) {
    this.editingId = link.id;
    this.link = {
      type: link.type,
      label: link.label || '',
      url: link.url,
      sortOrder: link.sortOrder,
    };
    this.customColor = !!link.color;
    this.customHex = link.color ? this.expandHex(link.color) : '#9146ff';
    this.error.set('');
  }

  expandHex(color: string) {
    return /^#[0-9a-f]{3}$/i.test(color)
      ? '#' +
          color
            .slice(1)
            .split('')
            .map((c) => c + c)
            .join('')
      : color;
  }

  cancelEdit() {
    this.editingId = null;
    this.link = { type: 'auto', label: '', url: '', sortOrder: 0 };
    this.customColor = false;
  }

  add() {
    const editing = this.editingId;
    return this.run(
      async () => {
        await this.api.send(
          editing ? 'PUT' : 'POST',
          '/admin/links' + (editing ? '/' + editing : ''),
          {
            ...this.link,
            color: this.customColor ? this.customHex : '',
          },
        );
        this.cancelEdit();
      },
      editing ? 'Link gespeichert.' : 'Link hinzugefügt.',
      false,
    );
  }

  remove(id: string) {
    return this.run(
      async () => {
        await this.api.send('DELETE', '/admin/links/' + id);
        if (this.editingId === id) this.cancelEdit();
      },
      'Link entfernt.',
      false,
    );
  }
}
