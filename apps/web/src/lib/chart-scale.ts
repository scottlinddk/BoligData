/** Round tick values covering [min, max], about `target` of them. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const rawStep = (max - min) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  // Stop at the first tick at or above max, so the top of the data is never cut off.
  for (let i = 0; ; i++) {
    const value = Math.round((start + i * step) / step) * step;
    ticks.push(value);
    if (value >= max) break;
  }
  return ticks;
}

/** Linear map from a data domain to a pixel range. A flat domain maps to the middle. */
export function linearScale(domain: [number, number], range: [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 === d1) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/** Index of the nearest of `count` evenly spaced points for a pixel x inside [left, right]. */
export function nearestIndex(x: number, left: number, right: number, count: number): number {
  if (count <= 1 || right <= left) return 0;
  const ratio = (x - left) / (right - left);
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
}
