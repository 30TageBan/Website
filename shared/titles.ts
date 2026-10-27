export const TITLE_EFFECTS: Record<string, string> = {
  none: 'Keine',
  gradient: 'Fließender Farbverlauf',
  glow: 'Leuchtender Titel',
  shimmer: 'Lichtschimmer',
  float: 'Schwebend',
  typewriter: 'Schreibmaschine',
};
export const TAB_EFFECTS: Record<string, string> = {
  none: 'Keine',
  typewriter: 'Schreibmaschine',
  scroll: 'Lauftext',
};
export function tabTitleFrame(text: string, mode: string, frame: number): string {
  const chars = Array.from(text);
  if (mode === 'typewriter') {
    const step = frame % (chars.length + 12);
    return chars.slice(0, Math.max(1, Math.min(step + 1, chars.length))).join('');
  }
  if (mode === 'scroll') {
    const full = Array.from(text + '   ·   '),
      offset = frame % full.length;
    return [...full.slice(offset), ...full.slice(0, offset)].join('');
  }
  return text;
}
