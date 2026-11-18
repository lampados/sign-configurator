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
/** I gruppi (sillabe) che la pagina vede, da sinistra a destra. */
const groups = async (text: string) => (await draw(text)).glyphs.map((g) => g.char).filter((c) => c !== null);

/** Larghezza del tratto sui pixel dello scheletro (scarto fra i decili), topologia e pezzi del grafo. */
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

describe('hindi, font devanagari (SPEC §4ter)', () => {
  it('poppins: devanagari, composto da harfbuzz, altezza su क, file piccolo che si precarica', () => {
    const entry = getFont(FONT_ID)!;
    expect(entry.script).toBe('devanagari');
    expect(entry.shaper).toBe('harfbuzz');
    expect(heightGlyphOf(entry)).toBe('क');
    expect(entry.lazy).toBeFalsy();
    expect(entry.stripMode).toBe('centerline');
    expect(entry.sample).toBe('नमस्ते');
  });

  it('le misure del registro sono quelle del file; le lettere con la linea piena pendono dalla stessa quota', async () => {
    const entry = getFont(FONT_ID)!;
    const font = await loadFont(FONT_ID, readPublic);
    expect(measureFontMetrics(font, 'क')).toEqual({ capHeight: entry.capHeightMeasured, xHeight: entry.xHeightMeasured });
    for (const ch of 'नमसतहदपरयलवगजबचडण') expect(measureFontMetrics(font, ch).capHeight, ch).toBe(entry.capHeightMeasured);
  });

  it('gli altri font non caricano harfbuzz', async () => {
    expect(await loadShaper('sacramento', readPublic)).toBeNull();
    expect(await loadShaper('comfortaa', readPublic)).toBeNull();
  });

  it('le consonanti si fondono: una sillaba è un gruppo solo', async () => {
    expect(await groups('नमस्ते')).toEqual(['न', 'म', 'स्ते']);
    expect(await groups('प्रेम')).toEqual(['प्रे', 'म']);
    expect(await groups('शक्ति')).toEqual(['श', 'क्ति']);
    // Fuse: स + ् + त è un glifo solo, più la vocale. Senza composizione sarebbero 6 glifi con il virama a vista.
    expect((await draw('नमस्ते')).glyphs).toHaveLength(4);
  });

  it('la vocale ि si disegna prima della consonante, che nel testo la precede', async () => {
    const font = await loadFont(FONT_ID, readPublic);
    const { glyphs } = await draw('कि');
    expect(glyphs).toHaveLength(2);
    const ka = glyphs.find((g) => g.glyphIndex === font.charToGlyph('क').index)!;
    const matra = glyphs.find((g) => g !== ka)!;
    expect(matra.x).toBeLessThan(ka.x);
    expect(matra.char).toBe('कि');
  });

  it('senza compositore il font si rifiuta, invece di dare lettere staccate', async () => {
    const font = await loadFont(FONT_ID, readPublic);
    expect(() => rasterizeText(font, getFont(FONT_ID)!, { text: 'नमस्ते', heightMm: 200 })).toThrow(/harfbuzz/);
  });

  it('hindi e latino nella stessa riga: ogni tratto con le regole della sua scrittura', async () => {
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

  it('cifre hindi, danda e ZWJ non sono caratteri mancanti; una vocale sola non porta il cerchio tratteggiato', async () => {
    expect((await draw('प्यार १२३।')).missing).toEqual([]);
    expect((await draw('क्‍ष')).missing).toEqual([]);
    expect((await draw('ि')).glyphs).toHaveLength(1);
    expect((await draw('नमस्ते 中')).warnings.join(' ')).toMatch(/U\+4E2D.* non presente in Poppins/);
  });

  it('la linea in alto unisce la parola: un pezzo solo, tratto costante entro il 25 %', async () => {
    for (const sample of ['नमस्ते', 'हिन्दी', 'प्रेम', 'शक्ति']) {
      const { spread, pieces, missing } = await strokeSpread(sample, 200);
      expect(missing, `«${sample}»`).toEqual([]);
      expect(spread, `«${sample}»`).toBeLessThan(0.25);
      // श ha il ricciolo staccato dall'asta: due pezzi. Le altre parole sono un tratto continuo.
      expect(pieces, `«${sample}»`).toBe(sample === 'शक्ति' ? 2 : 1);
    }
  }, 180_000);

  it('la topologia non cambia fra 200 e 400 mm, e la bitmap è la stessa a ogni giro', async () => {
    const small = await strokeSpread('नमस्ते', 200);
    const large = await strokeSpread('नमस्ते', 400);
    expect(small.topology).toBe(large.topology);
    const [a, b] = [await draw('हिन्दी'), await draw('हिन्दी')];
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  }, 180_000);

  it('«नमस्ते» a 30 cm passa tutta la pipeline e dà un pezzo stampabile', async () => {
    const result = await generateSign(order('नमस्ते', 300), readPublic);
    expect(result.housingMesh.triVerts.length).toBeGreaterThan(0);
    expect(result.lightPoints.length).toBeGreaterThan(100);
    expect(result.bom.assembly.segments).toBeGreaterThanOrEqual(8);
    expect(result.warnings.join(' ')).not.toMatch(/non manifold|non presente/);
  }, 180_000);
});
