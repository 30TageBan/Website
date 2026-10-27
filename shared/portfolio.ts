import { appearanceSettings, type AppearanceSettings } from './appearance.ts';
export interface ProfileButton {
  label: string;
  url: string;
}
export interface ContentSection {
  title: string;
  text: string;
  items: string[];
  buttons: ProfileButton[];
}
export interface ProfileContent {
  sections: ContentSection[];
  showLinkText: boolean;
  motion: 'subtle' | 'lively' | 'none';
  buttons: ProfileButton[];
  servicesTitle: string;
  services: string[];
  spotifyAutoplay: boolean;
  appearance: AppearanceSettings;
  audio: { url: string; title: string; autoplay: boolean };
  titleEffect: string;
  tabTitleEffect: string;
  discord: {
    userId: string;
    syncAvatar: boolean;
    syncBanner: boolean;
    syncName: boolean;
    showBadges?: boolean;
  };
}

export function profileContent(input: unknown): ProfileContent {
  const value = (input && typeof input === 'object' ? input : {}) as Partial<ProfileContent>;
  return {
    sections: value.sections ?? [],
    showLinkText: value.showLinkText ?? false,
    motion: value.motion ?? 'lively',
    buttons: value.buttons ?? [
      { label: 'Homepage', url: '/' },
      { label: 'Services', url: '#services' },
    ],
    servicesTitle: value.servicesTitle ?? 'Services',
    services: value.services ?? [
      'Next.js / Angular / React',
      'APIs / Automatisierung',
      'Docker / Deployments',
    ],
    spotifyAutoplay: value.spotifyAutoplay ?? false,
    appearance: appearanceSettings(value.appearance),
    audio: value.audio ?? { url: '', title: 'Meine Musik', autoplay: false },
    titleEffect: value.titleEffect ?? 'none',
    tabTitleEffect: value.tabTitleEffect ?? 'none',
    discord: {
      userId: '',
      syncAvatar: false,
      syncBanner: false,
      syncName: false,
      showBadges: true,
      ...value.discord,
    },
  };
}

export function safeButtonUrl(value: string): boolean {
  if (value !== value.trim() || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^#[\w-]+$/.test(value)) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
