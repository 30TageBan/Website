export const BACKGROUNDS: Record<string, string> = {
  default: 'Default',
  nebula: 'Nebula',
  midnight: 'Midnight',
  sunset: 'Sunset',
  aurora: 'Aurora',
  crimson: 'Crimson',
  ocean: 'Ocean',
  forest: 'Forest',
  galaxy: 'Galaxy',
  synthwave: 'Synthwave',
  ember: 'Ember',
  ice: 'Ice',
};
export const ANIMATIONS: Record<string, string> = {
  none: 'Keine',
  drift: 'Fließende Farben',
  aurora: 'Polarlichter',
  stars: 'Sternenfeld',
  rain: 'Regen',
  snow: 'Schnee',
  grid: 'Neon-Raster',
  fireflies: 'Glühwürmchen',
  particles: 'Partikelnetz',
  constellation: 'Sternbilder',
  bubbles: 'Schwebende Blasen',
  embers: 'Glühende Funken',
  meteors: 'Meteorschauer',
  waves: 'Lichtwellen',
  matrix: 'Digitaler Regen',
};
export const CURSORS: Record<string, string> = {
  none: 'Standard',
  glow: 'Leuchtender Schein',
  ring: 'Folgender Ring',
  trail: 'Punktspur',
  sparkles: 'Sternenstaub',
  ripple: 'Klick-Wellen',
};
export interface AppearanceSettings {
  density?: 'low' | 'normal' | 'high';
  interactive?: boolean;
  animation: string;
  speed: 'slow' | 'normal' | 'fast';
  cursor: string;
  accent: string;
  mediaType: 'none' | 'image' | 'video';
  mediaUrl: string;
}
export function appearanceSettings(value?: Partial<AppearanceSettings>): AppearanceSettings {
  return {
    density: value?.density ?? 'normal',
    interactive: value?.interactive ?? true,
    animation: value?.animation ?? 'none',
    speed: value?.speed ?? 'normal',
    cursor: value?.cursor ?? 'none',
    accent: value?.accent ?? '#a78bfa',
    mediaType: value?.mediaType ?? 'none',
    mediaUrl: value?.mediaUrl ?? '',
  };
}
