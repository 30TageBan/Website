export const PLATFORMS: Record<string, { label: string; color: string; icon: string }> = {
  twitch: { label: 'Twitch', color: '#9146FF', icon: 'twitch' },
  discord: { label: 'Discord', color: '#5865F2', icon: 'discord' },
  youtube: { label: 'YouTube', color: '#FF0033', icon: 'youtube' },
  spotify: { label: 'Spotify', color: '#1DB954', icon: 'spotify' },
  github: { label: 'GitHub', color: '#F0F6FC', icon: 'github' },
  x: { label: 'X', color: '#FFFFFF', icon: 'x' },
  instagram: { label: 'Instagram', color: '#E4405F', icon: 'instagram' },
  tiktok: { label: 'TikTok', color: '#25F4EE', icon: 'tiktok' },
  website: { label: 'Website', color: '#94A3B8', icon: 'website' },
  custom: { label: 'Eigener Link', color: '#CBD5E1', icon: 'custom' },
};

export function normalizeLinkType(type: string = ''): string {
  const value = type.trim().toLowerCase();
  return value === 'twitter' ? 'x' : Object.hasOwn(PLATFORMS, value) ? value : 'custom';
}

export function detectLinkType(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const domains: Record<string, string[]> = {
      twitch: ['twitch.tv'],
      discord: ['discord.gg', 'discord.com'],
      youtube: ['youtube.com', 'youtu.be'],
      spotify: ['spotify.com'],
      github: ['github.com'],
      x: ['x.com', 'twitter.com'],
      instagram: ['instagram.com'],
      tiktok: ['tiktok.com'],
    };
    for (const [type, hosts] of Object.entries(domains)) {
      if (hosts.some((domain) => host === domain || host.endsWith('.' + domain))) return type;
    }
  } catch {
    /* Noch unvollständige Eingabe. */
  }
  return 'website';
}

export function linkAppearance(link: { type?: string; url?: string; color?: string | null }) {
  const type =
    link.type && link.type !== 'auto'
      ? normalizeLinkType(link.type)
      : detectLinkType(link.url ?? '');
  const platform = PLATFORMS[type];
  const color = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(link.color ?? '')
    ? link.color!
    : platform.color;
  return { ...platform, type, color };
}
