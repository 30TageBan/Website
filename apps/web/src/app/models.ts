import type { ProfileContent } from '../../../../shared/portfolio';
export interface Link {
  id: string;
  type: string;
  label: string | null;
  url: string;
  color: string | null;
  sortOrder: number;
}
export interface Portfolio {
  id: string;
  title: string;
  subtitle: string;
  avatarUrl: string;
  bannerUrl: string;
  seoTitle: string;
  seoDescription: string;
  seoOgImageUrl: string;
  backgroundPreset: string;
  backgroundSettings: { overlayOpacity: number; blur: number; vignette: number };
  spotifyTrackId: string;
  links: Link[];
  content?: Partial<ProfileContent>;
  viewsCount?: number;
  discordBadges?: { id: string; label: string; symbol: string; color: string }[];
  discordAccentColor?: string | null;
}
export interface StoredFile {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isPublic: boolean;
  viewsCount: number;
  lastAccessedAt: string | null;
}
export interface ShortLink {
  id: string;
  key: string;
  destinationUrl: string;
  expiresAt: string | null;
  maxViews: number | null;
  viewsCount: number;
  requireClick: boolean;
  countdownSeconds: number;
}
export interface Provisioning {
  base32: string;
  qrDataUrl: string;
  otpauthUrl: string;
}
