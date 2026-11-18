import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getFont, heightGlyphOf, NO_LETTERS } from '../src/fonts/registry';
import { loadFont, type FontBytesReader } from '../src/fonts/loadFont';
import { squaredDistanceTo } from '../src/geometry/distance';
import { buildGraph } from '../src/geometry/graph';
import { measureFontMetrics, rasterizeText } from '../src/geometry/rasterize';
import { skeletonize } from '../src/geometry/skeleton';
import { DEFAULT_CUSTOMER, type SignOrderV4 } from '../src/order/schema';
import { generateSign } from '../src/worker/generate';

const readPublic: FontBytesReader = async (file) => {
  const b = await readFile(`public/${file}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const FONT_ID = 'comfortaa';
const RUSSIAN = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
// Lettere che il russo non ha: ucraino, bielorusso, serbo e macedone, bulgaro.
const OTHER_SLAVIC = 'ҐґЄєІіЇїЎўЂђЈјЉљЊњЋћЏџЃѓЅѕЌќ';

/** Larghezza del tratto sui pixel dello scheletro (scarto fra i decili) e topologia del grafo. */
async function strokeSpread(text: string, heightMm: number) {
  const entry = getFont(FONT_ID)!;
  const font = await loadFont(FONT_ID, readPublic);
  const raster = rasterizeText(font, entry, { text, heightMm });
  const skel = skeletonize(raster.data, raster.width, raster.height);
  const d2 = squaredDistanceTo(raster.data, raster.width, raster.height, 0);
  const widths: number[] = [];
  for (let i = 0; i < skel.length; i++) if (skel[i]) widths.push(2 * Math.sqrt(d2[i]!) - 1);
  widths.sort((a, b) => a - b);
  const at = (p: number) => widths[Math.min(widths.length - 1, Math.floor((widths.length - 1) * p))]!;
  const median = at(0.5);
  const graph = buildGraph(raster);
  const degrees = [...graph.nodes].reduce((acc, node) => acc.set(node.degree, (acc.get(node.degree) ?? 0) + 1), new Map<number, number>());
  return {
    spread: Math.max(at(0.9) / median - 1, 1 - at(0.1) / median),
    topology: `${graph.edges.length}/${[...degrees].sort((a, b) => a[0] - b[0]).join(',')}`,
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

describe('Cyrillic font (SPEC §4ter)', () => {
  it('comfortaa: Cyrillic script, height on the "H", small file that is preloaded', () => {
    const entry = getFont(FONT_ID)!;
    expect(entry.script).toBe('cyrillic');
    expect(heightGlyphOf(entry)).toBe('H');
    expect(entry.lazy).toBeFalsy();
    expect(entry.stripMode).toBe('centerline');
    expect(entry.sample).toBe('Привет');
  });

  it('Cyrillic capitals are as tall as the "H": the requested height holds for both', async () => {
    const font = await loadFont(FONT_ID, readPublic);
    expect(measureFontMetrics(font, 'П').capHeight).toBe(getFont(FONT_ID)!.capHeightMeasured);
  });

  it('has the whole Russian alphabet and the letters of the other Slavic languages', async () => {
    const font = await loadFont(FONT_ID, readPublic);
    const absent = [...RUSSIAN, ...OTHER_SLAVIC].filter((ch) => !font.hasChar(ch));
    expect(absent.join('')).toBe('');
  });

  it('stroke width constant within 25 %, in Cyrillic and in Latin', async () => {
    for (const sample of ['Привет', 'Жёлтый щит', 'Добрий день', 'Ciao']) {
      const { spread, missing } = await strokeSpread(sample, 200);
      expect(missing, `«${sample}»`).toEqual([]);
      expect(spread, `«${sample}»`).toBeLessThan(0.25);
    }
  }, 120_000);

  it('the topology does not change between 200 and 400 mm', async () => {
    const small = await strokeSpread('Привет', 200);
    const large = await strokeSpread('Привет', 400);
    expect(small.topology).toBe(large.topology);
  }, 120_000);

  it('"Привет" at 25 cm goes through the whole pipeline and gives a printable part', async () => {
    const result = await generateSign(order('Привет', 250), readPublic);
    expect(result.housingMesh.triVerts.length).toBeGreaterThan(0);
    expect(result.lightPoints.length).toBeGreaterThan(10);
    expect(result.bom.assembly.segments).toBeGreaterThanOrEqual(6);
    expect(result.warnings.join(' ')).not.toMatch(/non manifold|non presente/);
  }, 180_000);

  it('Latin and Cyrillic in the same sign, with the same font', async () => {
    const result = await generateSign(order('Ciao Привет', 250), readPublic);
    expect(result.housingMesh.triVerts.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).not.toMatch(/non presente/);
  }, 180_000);

  it('a font without Cyrillic says so: recognizable error if everything is missing, warning if part is', async () => {
    const sacramento = (text: string): SignOrderV4 => ({ ...order(text, 250), source: { kind: 'text', text, fontId: 'sacramento' } });
    await expect(generateSign(sacramento('Привет'), readPublic)).rejects.toThrow(NO_LETTERS);
    const mixed = await generateSign(sacramento('Ciao Привет'), readPublic);
    expect(mixed.warnings.filter((warning) => /^Carattere .* non presente in Sacramento/.test(warning))).toHaveLength(6);
    expect(mixed.housingMesh.triVerts.length).toBeGreaterThan(0);
  }, 180_000);
});
