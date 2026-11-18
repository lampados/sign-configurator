import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getFont, heightGlyphOf } from '../src/fonts/registry';
import { loadFont, type FontBytesReader } from '../src/fonts/loadFont';
import { loadShaper, scriptRuns } from '../src/fonts/shaper';
import { squaredDistanceTo } from '../src/geometry/distance';
import { buildGraph } from '../src/geometry/graph';
import { measureFontMetrics, rasterize, rasterizeText } from '../src/geometry/rasterize';
import { skeletonize } from '../src/geometry/skeleton';
import { DEFAULT_CUSTOMER, type SignOrderV4 } from '../src/order/schema';
import { generateSign } from '../src/worker/generate';

const readPublic: FontBytesReader = async (file) => {
  const b = await readFile(`public/${file}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const FONT_ID = 'poppins';
const draw = (text: string, heightMm = 200) => rasterize({ text, fontId: FONT_ID, heightMm }, readPublic);
/** The groups (syllables) the page sees, from left to right. */
const groups = async (text: string) => (await draw(text)).glyphs.map((g) => g.char).filter((c) => c !== null);

/** Stroke width on the skeleton pixels (spread between the deciles), topology and pieces of the graph. */
async function strokeSpread(text: string, heightMm: number) {
  const raster = await draw(text, heightMm);
  const skel = skeletonize(raster.data, raster.width, raster.height);
  const d2 = squaredDistanceTo(raster.data, raster.width, raster.height, 0);
  const widths: number[] = [];
  for (let i = 0; i < skel.length; i++) if (skel[i]) widths.push(2 * Math.sqrt(d2[i]!) - 1);
  widths.sort((a, b) => a - b);
  const at = (p: number) => widths[Math.min(widths.length - 1, Math.floor((widths.length - 1) * p))]!;
  const median = at(0.5);
  const graph = buildGraph(raster);
  const degrees = [...graph.nodes].reduce((acc, node) => acc.set(node.degree, (acc.get(node.degree) ?? 0) + 1), new Map<number, number>());
  const root = graph.nodes.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
  for (const edge of graph.edges) root[find(edge.a)] = find(edge.b);
  return {
    spread: Math.max(at(0.9) / median - 1, 1 - at(0.1) / median),
    topology: `${graph.edges.length}/${[...degrees].sort((a, b) => a[0] - b[0]).join(',')}`,
    pieces: new Set(graph.nodes.map((_, i) => find(i))).size,
    missing: raster.missing,
  };
}

function order(text: string, heightMm: number): SignOrderV4 {
  return {
    schemaVersion: 4,
    generatorVersion: 'test',
    pricingVersion: null,
    source: { kind: 'text', text, fontId: FONT_ID },
    heightMm,
    sizePreset: null,
    color: '#ff2fd6',
    params: {},
    paths: null,
    crossings: [],
    customer: { ...DEFAULT_CUSTOMER },
    plate: null,
  };
}

describe('Hindi, Devanagari font (SPEC §4ter)', () => {
  it('poppins: Devanagari, shaped by harfbuzz, height on क, small file that is preloaded', () => {
    const entry = getFont(FONT_ID)!;
    expect(entry.script).toBe('devanagari');
    expect(entry.shaper).toBe('harfbuzz');
    expect(heightGlyphOf(entry)).toBe('क');
    expect(entry.lazy).toBeFalsy();
    expect(entry.stripMode).toBe('centerline');
    expect(entry.sample).toBe('नमस्ते');
  });

  it('the registry measurements match the file; letters with a full headline hang from the same height', async () => {
    const entry = getFont(FONT_ID)!;
    const font = await loadFont(FONT_ID, readPublic);
    expect(measureFontMetrics(font, 'क')).toEqual({ capHeight: entry.capHeightMeasured, xHeight: entry.xHeightMeasured });
    for (const ch of 'नमसतहदपरयलवगजबचडण') expect(measureFontMetrics(font, ch).capHeight, ch).toBe(entry.capHeightMeasured);
  });

  it('the other fonts do not load harfbuzz', async () => {
    expect(await loadShaper('sacramento', readPublic)).toBeNull();
    expect(await loadShaper('comfortaa', readPublic)).toBeNull();
  });

  it('consonants fuse: a syllable is a single group', async () => {
    expect(await groups('नमस्ते')).toEqual(['न', 'म', 'स्ते']);
    expect(await groups('प्रेम')).toEqual(['प्रे', 'म']);
    expect(await groups('शक्ति')).toEqual(['श', 'क्ति']);
    // Fused: स + ् + त is a single glyph, plus the vowel sign. Without shaping there would be 6 glyphs with a visible virama.
    expect((await draw('नमस्ते')).glyphs).toHaveLength(4);
  });

  it('the vowel sign ि is drawn before the consonant that precedes it in the text', async () => {
    const font = await loadFont(FONT_ID, readPublic);
    const { glyphs } = await draw('कि');
    expect(glyphs).toHaveLength(2);
    const ka = glyphs.find((g) => g.glyphIndex === font.charToGlyph('क').index)!;
    const matra = glyphs.find((g) => g !== ka)!;
    expect(matra.x).toBeLessThan(ka.x);
    expect(matra.char).toBe('कि');
  });

  it('without a shaper the font refuses, instead of giving unjoined letters', async () => {
    const font = await loadFont(FONT_ID, readPublic);
    expect(() => rasterizeText(font, getFont(FONT_ID)!, { text: 'नमस्ते', heightMm: 200 })).toThrow(/harfbuzz/);
  });

  it('Hindi and Latin on the same line: each run with the rules of its script', async () => {
    expect(scriptRuns('Ciao नमस्ते 2026').map((run) => [run.start, run.end, run.devanagari])).toEqual([
      [0, 5, false],
      [5, 16, true],
    ]);
    expect(await groups('Ciao नमस्ते')).toEqual(['C', 'i', 'a', 'o', 'न', 'म', 'स्ते']);
    const mixed = await draw('Ciao नमस्ते');
    const hindi = await draw('नमस्ते');
    expect(mixed.missing).toEqual([]);
    expect(mixed.advanceMm).toBeGreaterThan(hindi.advanceMm);
  });

  it('Hindi digits, danda and ZWJ are not missing characters; a lone vowel sign gets no dotted circle', async () => {
    expect((await draw('प्यार १२३।')).missing).toEqual([]);
    expect((await draw('क्‍ष')).missing).toEqual([]);
    expect((await draw('ि')).glyphs).toHaveLength(1);
    expect((await draw('नमस्ते 中')).warnings.join(' ')).toMatch(/U\+4E2D.* missing from Poppins/);
  });

  it('the headline joins the word: a single piece, stroke width constant within 25 %', async () => {
    for (const sample of ['नमस्ते', 'हिन्दी', 'प्रेम', 'शक्ति']) {
      const { spread, pieces, missing } = await strokeSpread(sample, 200);
      expect(missing, `«${sample}»`).toEqual([]);
      expect(spread, `«${sample}»`).toBeLessThan(0.25);
      // श has its curl detached from the stem: two pieces. The other words are one continuous stroke.
      expect(pieces, `«${sample}»`).toBe(sample === 'शक्ति' ? 2 : 1);
    }
  }, 180_000);

  it('the topology does not change between 200 and 400 mm, and the bitmap is the same on every run', async () => {
    const small = await strokeSpread('नमस्ते', 200);
    const large = await strokeSpread('नमस्ते', 400);
    expect(small.topology).toBe(large.topology);
    const [a, b] = [await draw('हिन्दी'), await draw('हिन्दी')];
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  }, 180_000);

  it('"नमस्ते" at 30 cm goes through the whole pipeline and gives a printable part', async () => {
    const result = await generateSign(order('नमस्ते', 300), readPublic);
    expect(result.housingMesh.triVerts.length).toBeGreaterThan(0);
    expect(result.lightPoints.length).toBeGreaterThan(100);
    expect(result.bom.assembly.segments).toBeGreaterThanOrEqual(8);
    expect(result.warnings.join(' ')).not.toMatch(/not manifold|missing from/);
  }, 180_000);
});
