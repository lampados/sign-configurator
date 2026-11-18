// Measurements of hollow-tube fonts (SPEC §4): line thickness and inner gap of the tube, from a
// reference bitmap. They are used to fill in the registry, once per font; the pairing
// of the two lines of every tube happens in [B]/[C] (SPEC §5).

import { squaredDistanceTo } from './distance';

/** Widths (px) measured on the axis of the pixels with value `value`, sorted. */
function ridgeWidths(data: Uint8Array, width: number, height: number, value: 0 | 1): number[] {
  const d2 = squaredDistanceTo(data, width, height, value === 1 ? 0 : 1);
  const out: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (data[i] !== value) continue;
      const di = d2[i]!;
      if (
        d2[i - 1]! > di || d2[i + 1]! > di || d2[i - width]! > di || d2[i + width]! > di ||
        d2[i - width - 1]! > di || d2[i - width + 1]! > di || d2[i + width - 1]! > di || d2[i + width + 1]! > di
      ) {
        continue;
      }
      // Distance between pixel centres: a stroke n px wide has its axis at (n + 1) / 2 from the opposite edge.
      out.push(2 * Math.sqrt(di) - 1);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Line thickness = mode of the widths on the axis of the solid strokes; tube gap = median
 * of the widths on the axis of the voids between 0.5 and 4 thicknesses (wider voids are counters and
 * spaces). The gap varies a lot along the tube (in Neonderthaw from about 1.3 to 4 thicknesses).
 */
export function measureTubes(data: Uint8Array, width: number, height: number): { lineWidthPx: number; gapPx: number } {
  const counts = new Map<number, number>();
  for (const v of ridgeWidths(data, width, height, 1)) counts.set(Math.round(v), (counts.get(Math.round(v)) ?? 0) + 1);
  let lineWidthPx = 0;
  let best = -1;
  for (const [k, c] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (c > best) {
      best = c;
      lineWidthPx = k;
    }
  }
  const gaps = ridgeWidths(data, width, height, 0).filter((v) => v >= 0.5 * lineWidthPx && v <= 4 * lineWidthPx);
  return { lineWidthPx, gapPx: gaps.length ? gaps[Math.floor(gaps.length / 2)]! : 0 };
}
