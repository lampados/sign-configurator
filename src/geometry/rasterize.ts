// [A] Rasterization (SPEC §5): text path from opentype.js → polygons → binary bitmap.
// Pure module, without DOM or canvas: hand-written scanline, nonzero and evenodd rules, one sample
// at the centre of every pixel, no antialiasing. Same input → same bytes, in browser, worker and Node.
import type { Font, PathCommand } from 'opentype.js';
import { loadShaper, type Shaper } from '../fonts/shaper';
import { getFont, type FontEntry, type StripMode } from '../fonts/registry';
import { loadFont, type FontBytesReader } from '../fonts/loadFont';
import { layoutStroke } from './strokeLayout';
export const DEFAULT_PX_PER_MM = 10;
export const FLATTEN_TOLERANCE_MM = 0.02;
export const RASTER_MARGIN_PX = 5;
export const MAX_RASTER_PIXELS = 40_000_000;

/** Point in mm, Y pointing up (plane of the sign, SPEC §1). */
export type Point = [number, number];
/** Implicitly closed contour. */
export type Contour = Point[];

export interface BBoxMm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * px → mm transform. Continuous pixel coordinates: column i covers [i, i+1), row j covers
 * [j, j+1), with rows going down. xMm = originX + px·mmPerPx, yMm = originY − py·mmPerPx.
 */
export interface PxToMm {
  mmPerPx: number;
  originX: number;
  originY: number;
}

export interface Raster {
  /** 1 = filled, 0 = empty; row by row from the top, `width` bytes per row. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Effective resolution (reduced if MAX_RASTER_PIXELS is exceeded). */
  pxPerMm: number;
  pxToMm: PxToMm;
  warnings: string[];
}

export interface GlyphInfo {
  glyphIndex: number;
  /** Character of the glyph, if the font declares it (ligatures may not have one). */
  char: string | null;
  /** Origin of the glyph on the baseline, in mm. */
  x: number;
  bbox: BBoxMm | null;
}

/** Measurements of the tube (registry) at the scale of the text, for pairing the lines in [B]/[C]. */
export interface TubeMm {
  lineWidthMm: number;
  gapMm: number;
}

export interface TextRaster extends Raster {
  text: string;
  fontSizeMm: number;
  /** = requested height: measured top of the "H" glyph (registry, capHeightMeasured). */
  capHeightMm: number;
  /** Measured top of the "x" glyph. */
  xHeightMm: number;
  /** Real footprint of the ink (from the contours), mm, Y up, baseline at y = 0. */
  bbox: BBoxMm | null;
  /** Total advance (with kerning), mm. */
  advanceMm: number;
  glyphs: GlyphInfo[];
  /** Characters without a glyph in the font, ignored. */
  missing: string[];
  /** Hollow-tube font: the bitmap has two lines per tube and the gap is not filled. */
  hollowTubes: boolean;
  tube: TubeMm | null;
  /** centerline: the skeleton is the strip. walls: every wall of the tube is a strip. */
  stripMode: StripMode;
  /** Single stroke: the font lines, instead of the bitmap. `null` for outline fonts. */
  strokes: Point[][] | null;
}

export interface RasterizeInput {
  text: string;
  fontId: string;
  heightMm: number;
  pxPerMm?: number;
}

export interface RasterOptions {
  pxPerMm?: number;
  marginPx?: number;
  maxPixels?: number;
  /** Default `nonzero`. SVG areas can ask for `evenodd` (SPEC §4bis). */
  fillRule?: 'nonzero' | 'evenodd';
  /** Widens the grid beyond the contours, for example for strokes next to areas. */
  bounds?: BBoxMm;
}

/** A group of contours with its own fill rule. Several groups are joined with OR. */
export interface ContourLayer {
  contours: readonly Contour[];
  fillRule?: 'nonzero' | 'evenodd';
}

export function pxToMm(t: PxToMm, px: number, py: number): Point {
  return [t.originX + px * t.mmPerPx, t.originY - py * t.mmPerPx];
}

export function mmToPx(t: PxToMm, x: number, y: number): Point {
  return [(x - t.originX) / t.mmPerPx, (t.originY - y) / t.mmPerPx];
}

// ---------------------------------------------------------------- flattening

/**
 * Number of segments for a curve with |B''| ≤ m: the error of the uniform polyline is ≤ m / (8n²).
 */
const segmentsFor = (m: number, tol: number): number => Math.max(1, Math.ceil(Math.sqrt(m / (8 * tol))));

/** opentype.js path → contours, with the curves flattened within `tol` (in the units of `map`). */
export function flattenCommands(
  commands: readonly PathCommand[],
  tol = FLATTEN_TOLERANCE_MM,
  map: (x: number, y: number) => Point = (x, y) => [x, y],
): Contour[] {
  const contours: Contour[] = [];
  let current: Contour = [];
  let start: Point = [0, 0];
  let pen: Point = [0, 0];

  const push = (p: Point): void => {
    const last = current[current.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) current.push(p);
  };
  const close = (): void => {
    const first = current[0];
    const last = current[current.length - 1];
    if (first && last && current.length > 1 && first[0] === last[0] && first[1] === last[1]) current.pop();
    if (current.length >= 3) contours.push(current);
    current = [];
  };

  for (const c of commands) {
    switch (c.type) {
      case 'M':
        close();
        pen = start = map(c.x, c.y);
        push(pen);
        break;
      case 'L':
        pen = map(c.x, c.y);
        push(pen);
        break;
      case 'Q': {
        const p0 = pen;
        const p1 = map(c.x1, c.y1);
        const p2 = map(c.x, c.y);
        const n = segmentsFor(2 * Math.hypot(p0[0] - 2 * p1[0] + p2[0], p0[1] - 2 * p1[1] + p2[1]), tol);
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          const u = 1 - t;
          push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
        }
        pen = p2;
        break;
      }
      case 'C': {
        const p0 = pen;
        const p1 = map(c.x1, c.y1);
        const p2 = map(c.x2, c.y2);
        const p3 = map(c.x, c.y);
        const d1 = Math.hypot(p0[0] - 2 * p1[0] + p2[0], p0[1] - 2 * p1[1] + p2[1]);
        const d2 = Math.hypot(p1[0] - 2 * p2[0] + p3[0], p1[1] - 2 * p2[1] + p3[1]);
        const n = segmentsFor(6 * Math.max(d1, d2), tol);
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          const u = 1 - t;
          const a = u * u * u;
          const b = 3 * u * u * t;
          const cc = 3 * u * t * t;
          const d = t * t * t;
          push([
            a * p0[0] + b * p1[0] + cc * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + cc * p2[1] + d * p3[1],
          ]);
        }
        pen = p3;
        break;
      }
      case 'Z':
        close();
        pen = start;
        break;
    }
  }
  close();
  return contours;
}

export function contoursBBox(contours: readonly Contour[]): BBoxMm | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of contours) {
    for (const [x, y] of c) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return minX <= maxX ? { minX, minY, maxX, maxY } : null;
}

// ---------------------------------------------------------------- fill

interface Edge {
  /** Row of the first and of the last pixel centre crossed. */
  rowStart: number;
  rowEnd: number;
  /** x (px) at the height of the centre of the first row, and increment per row. */
  x: number;
  dxPerRow: number;
  winding: 1 | -1;
}

function unionBox(a: BBoxMm | null, b: BBoxMm | null): BBoxMm | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Contours in mm → binary bitmap. The default `fillRule` is nonzero. Pixels are sampled at the centre. */
export function rasterizeContours(contours: readonly Contour[], options: RasterOptions = {}): Raster {
  const layer: ContourLayer = { contours };
  if (options.fillRule) layer.fillRule = options.fillRule;
  return rasterizeContourGroups([layer], options);
}

/**
 * Several groups of contours, each with its rule, on the same grid. The ink is joined:
 * a group does not erase pixels already filled.
 */
export function rasterizeContourGroups(layers: readonly ContourLayer[], options: RasterOptions = {}): Raster {
  const margin = options.marginPx ?? RASTER_MARGIN_PX;
  const maxPixels = options.maxPixels ?? MAX_RASTER_PIXELS;
  const requested = options.pxPerMm ?? DEFAULT_PX_PER_MM;
  const warnings: string[] = [];
  let box: BBoxMm | null = options.bounds ?? null;
  for (const layer of layers) box = unionBox(box, contoursBBox(layer.contours));
  box ??= { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  // Grid aligned to the origin in mm: the baseline (y = 0) falls on a pixel edge.
  let res = requested;
  let ix0 = 0;
  let iy1 = 0;
  let width = 0;
  let height = 0;
  for (;;) {
    ix0 = Math.floor(box.minX * res);
    iy1 = Math.ceil(box.maxY * res);
    width = Math.ceil(box.maxX * res) - ix0 + 2 * margin;
    height = iy1 - Math.floor(box.minY * res) + 2 * margin;
    if (width * height <= maxPixels) break;
    res *= Math.sqrt(maxPixels / (width * height)) * 0.999;
  }
  if (res !== requested) {
    warnings.push(
      `Bitmap over ${(maxPixels / 1e6).toFixed(0)} Mpx: resolution reduced from ${requested} to ` +
        `${res.toFixed(3)} px/mm (${width} × ${height} px).`,
    );
  }

  const offX = ix0 - margin;
  const offY = iy1 + margin;
  const data = new Uint8Array(width * height);
  for (const layer of layers) {
    paintLayer(data, width, height, layer.contours, res, offX, offY, layer.fillRule ?? 'nonzero');
  }

  return {
    data,
    width,
    height,
    pxPerMm: res,
    pxToMm: { mmPerPx: 1 / res, originX: offX / res, originY: offY / res },
    warnings,
  };
}

/** Writes 1 on inner pixels. It does not clear the rest: several calls on the same bitmap are joined. */
function paintLayer(
  data: Uint8Array,
  width: number,
  height: number,
  contours: readonly Contour[],
  res: number,
  offX: number,
  offY: number,
  fillRule: 'nonzero' | 'evenodd',
): void {
  const edges: Edge[] = [];
  for (const contour of contours) {
    const n = contour.length;
    for (let i = 0; i < n; i++) {
      const a = contour[i]!;
      const b = contour[(i + 1) % n]!;
      const ax = a[0] * res - offX;
      const ay = offY - a[1] * res;
      const bx = b[0] * res - offX;
      const by = offY - b[1] * res;
      if (ay === by) continue;
      const [tx, ty, bx2, by2] = ay < by ? [ax, ay, bx, by] : [bx, by, ax, ay];
      // Rows whose centre cy = j + 0.5 is in [ty, by2): half-open ends, no double counting.
      const rowStart = Math.max(0, Math.ceil(ty - 0.5));
      const rowEnd = Math.min(height - 1, Math.ceil(by2 - 0.5) - 1);
      if (rowStart > rowEnd) continue;
      const slope = (bx2 - tx) / (by2 - ty);
      edges.push({
        rowStart,
        rowEnd,
        x: tx + (rowStart + 0.5 - ty) * slope,
        dxPerRow: slope,
        winding: by > ay ? 1 : -1,
      });
    }
  }
  edges.sort((e, f) => e.rowStart - f.rowStart);

  const evenodd = fillRule === 'evenodd';
  let active: Edge[] = [];
  let next = 0;
  const xs: number[] = [];
  const ws: number[] = [];
  const order: number[] = [];
  for (let row = 0; row < height; row++) {
    while (next < edges.length && edges[next]!.rowStart === row) active.push(edges[next++]!);
    if (active.length === 0) {
      if (next >= edges.length) break;
      continue;
    }
    xs.length = ws.length = order.length = 0;
    for (const e of active) {
      xs.push(e.x + (row - e.rowStart) * e.dxPerRow);
      ws.push(e.winding);
      order.push(order.length);
    }
    order.sort((i, j) => xs[i]! - xs[j]! || ws[i]! - ws[j]!);

    let winding = 0;
    const base = row * width;
    for (let k = 0; k < order.length - 1; k++) {
      winding += ws[order[k]!]!;
      const inside = evenodd ? (winding & 1) !== 0 : winding !== 0;
      if (!inside) continue;
      // Pixel i is filled if its centre i + 0.5 is in [xa, xb).
      const from = Math.max(0, Math.ceil(xs[order[k]!]! - 0.5));
      const to = Math.min(width, Math.ceil(xs[order[k + 1]!]! - 0.5));
      if (to > from) data.fill(1, base + from, base + to);
    }
    active = active.filter((e) => e.rowEnd > row);
  }
}

// ---------------------------------------------------------------- text

const describeChar = (ch: string): string =>
  `"${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`;

/** Height of the glyph of `ch` in font units, if it exists. */
function glyphTop(font: Font, ch: string): number | null {
  if (!font.hasChar(ch)) return null;
  const bb = font.charToGlyph(ch).getBoundingBox();
  return bb.y2 > 0 ? bb.y2 : null;
}

/**
 * Real measurements from the glyph outline, in font units: top of "H" (fallback "I") and of "x" above the
 * baseline. The declared metrics (OS/2) of script fonts are often unreliable. They are used to
 * fill in the registry, once per font.
 */
export function measureFontMetrics(
  font: Font,
  heightGlyph = 'H',
): { capHeight: number | null; xHeight: number | null } {
  return { capHeight: glyphTop(font, heightGlyph) ?? glyphTop(font, 'I'), xHeight: glyphTop(font, 'x') };
}

/**
 * Text on one line → bitmap. `heightMm` is the measured top of the "H" (registry). The bitmap is
 * faithful to the font: with `hollowTubes` it contains two lines per tube. With `stripMode` `"walls"`
 * each becomes a strip, without pairing them into a median.
 */
export function rasterizeText(
  font: Font,
  entry: FontEntry,
  input: Omit<RasterizeInput, 'fontId'>,
  shaper?: Shaper | null,
): TextRaster {
  const fontName = entry.name;
  const warnings: string[] = [];
  let text = input.text;
  if (/[\r\n]/.test(text)) {
    text = text.replace(/\r\n|[\r\n]/g, ' ');
    warnings.push('The text goes on a single line: line breaks became spaces.');
  }
  // Without a shaper a font like Poppins would give unjoined letters in the wrong order:
  // an unreadable sign, not a visible error. Better to stop.
  if (entry.shaper === 'harfbuzz' && !shaper) throw new Error(`${fontName} must be shaped with harfbuzz: the shaper is missing.`);

  // ZWNJ and ZWJ guide the joining and have no drawing: they are not missing characters.
  const invisible = (ch: string): boolean => /\s/.test(ch) || (shaper != null && /[\u200c\u200d]/.test(ch));
  const missing = [...new Set(Array.from(text).filter((ch) => !invisible(ch) && !font.hasChar(ch)))];
  for (const ch of missing) warnings.push(`Character ${describeChar(ch)} missing from ${fontName}: ignored.`);

  const mmPerUnit = input.heightMm / entry.capHeightMeasured;
  const fontSizeMm = font.unitsPerEm * mmPerUnit;
  const flip = (x: number, y: number): Point => [x, -y];
  const options = { kerning: true, letterSpacing: 0 };

  const contours: Contour[] = [];
  const glyphs: GlyphInfo[] = [];
  let advanceMm: number;
  if (shaper) {
    // Glyphs and positions from harfbuzz, contours from opentype.js (SPEC §4ter). A group (syllable) can
    // have several glyphs, or a single glyph for several characters: its name is the text of the group, on the
    // leftmost glyph.
    const shaped = shaper(text);
    const starts = [...new Set(shaped.map((g) => g.cluster))].sort((a, b) => a - b);
    const named = new Map<number, GlyphInfo>();
    let pen = 0;
    for (const g of shaped) {
      const gx = (pen + g.xOffset) * mmPerUnit;
      pen += g.xAdvance;
      if (g.glyphIndex === 0) continue; // .notdef: the character is already reported as missing
      const path = font.glyphs.get(g.glyphIndex).getPath(gx, -g.yOffset * mmPerUnit, fontSizeMm);
      const own = flattenCommands(path.commands, FLATTEN_TOLERANCE_MM, flip);
      if (own.length === 0) continue;
      contours.push(...own);
      const info: GlyphInfo = { glyphIndex: g.glyphIndex, char: null, x: gx, bbox: contoursBBox(own) };
      glyphs.push(info);
      const first = named.get(g.cluster);
      if (!first || info.x < first.x) named.set(g.cluster, info);
    }
    for (const [cluster, info] of named) {
      const next = starts[starts.indexOf(cluster) + 1] ?? text.length;
      info.char = text.slice(cluster, next).trim() || null;
    }
    advanceMm = pen * mmPerUnit;
  } else {
    advanceMm = font.forEachGlyph(text, 0, 0, fontSizeMm, options, (glyph, gx, gy, size) => {
      if (glyph.index === 0) return; // .notdef: the character is already reported as missing
      const own = flattenCommands(glyph.getPath(gx, gy, size, options, font).commands, FLATTEN_TOLERANCE_MM, flip);
      if (own.length === 0) return;
      contours.push(...own);
      glyphs.push({
        glyphIndex: glyph.index,
        char: glyph.unicode !== undefined ? String.fromCodePoint(glyph.unicode) : null,
        x: gx,
        bbox: contoursBBox(own),
      });
    });
  }

  const raster = rasterizeContours(contours, input.pxPerMm !== undefined ? { pxPerMm: input.pxPerMm } : {});
  warnings.push(...raster.warnings);
  const tube = entry.tube
    ? { lineWidthMm: entry.tube.lineWidth * mmPerUnit, gapMm: entry.tube.gap * mmPerUnit }
    : null;

  return {
    ...raster,
    warnings,
    text,
    fontSizeMm,
    capHeightMm: input.heightMm,
    xHeightMm: entry.xHeightMeasured * mmPerUnit,
    bbox: contoursBBox(contours),
    advanceMm,
    glyphs,
    missing,
    hollowTubes: entry.hollowTubes,
    tube,
    stripMode: entry.stripMode,
    strokes: null,
  };
}

/** Convenience for main thread and worker: loads the font from the registry and rasterizes. Single strokes have no bitmap. */
export async function rasterize(input: RasterizeInput, read?: FontBytesReader): Promise<TextRaster> {
  const entry = getFont(input.fontId);
  if (!entry) throw new Error(`Unknown font: "${input.fontId}"`);
  if (entry.kind === 'stroke') return (await layoutStroke(entry, input, read)).raster;
  const [font, shaper] = await Promise.all([loadFont(input.fontId, read), loadShaper(input.fontId, read)]);
  return rasterizeText(font, entry, input, shaper);
}
