/** Map a pointer to the full viewport, rather than to an element's hover bounds. */
export function viewportMotion(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
  kind: 'entry' | 'card',
  level: string,
): Record<string, string> {
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const x = clamp((clientX / Math.max(1, width)) * 2 - 1);
  const y = clamp((clientY / Math.max(1, height)) * 2 - 1);
  const strength = level === 'none' ? 0 : level === 'subtle' ? 0.4 : 1;
  const entry = kind === 'entry';
  const travelX = Math.min(width * (entry ? 0.035 : 0.02), entry ? 54 : 32);
  const travelY = Math.min(height * (entry ? 0.035 : 0.02), entry ? 36 : 24);

  return {
    '--move-x': `${x * travelX * strength}px`,
    '--move-y': `${y * travelY * strength}px`,
    '--tilt-x': `${-y * (entry ? 5 : 10) * strength}deg`,
    '--tilt-y': `${x * (entry ? 7 : 13) * strength}deg`,
    '--pointer-x': `${(x + 1) * 50}%`,
    '--pointer-y': `${(y + 1) * 50}%`,
  };
}
