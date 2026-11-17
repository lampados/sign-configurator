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

describe('font cirillico (SPEC §4ter)', () => {
  it('comfortaa: scrittura cirillica, altezza sulla «H», file piccolo che si precarica', () => {
    const entry = getFont(FONT_ID)!;
    expect(entry.script).toBe('cyrillic');
    expect(heightGlyphOf(entry)).toBe('H');
    expect(entry.lazy).toBeFalsy();
    expect(entry.stripMode).toBe('centerline');
    expect(entry.sample).toBe('Привет');
  });

  it('le maiuscole cirilliche sono alte quanto la «H»: l\'altezza chiesta vale per entrambe', async () => {
    const font = await loadFont(FONT_ID, readPublic);
    expect(measureFontMetrics(font, 'П').capHeight).toBe(getFont(FONT_ID)!.capHeightMeasured);
  });

  it('ha tutto l\'alfabeto russo e le lettere delle altre lingue slave', async () => {
    const font = await loadFont(FONT_ID, readPublic);
    const absent = [...RUSSIAN, ...OTHER_SLAVIC].filter((ch) => !font.hasChar(ch));
    expect(absent.join('')).toBe('');
  });

  it('tratto costante entro il 25 %, in cirillico e in latino', async () => {
    for (const sample of ['Привет', 'Жёлтый щит', 'Добрий день', 'Ciao']) {
      const { spread, missing } = await strokeSpread(sample, 200);
      expect(missing, `«${sample}»`).toEqual([]);
      expect(spread, `«${sample}»`).toBeLessThan(0.25);
    }
  }, 120_000);

  it('la topologia non cambia fra 200 e 400 mm', async () => {
    const small = await strokeSpread('Привет', 200);
    const large = await strokeSpread('Привет', 400);
    expect(small.topology).toBe(large.topology);
  }, 120_000);

  it('«Привет» a 25 cm passa tutta la pipeline e dà un pezzo stampabile', async () => {
    const result = await generateSign(order('Привет', 250), readPublic);
    expect(result.housingMesh.triVerts.length).toBeGreaterThan(0);
    expect(result.lightPoints.length).toBeGreaterThan(10);
    expect(result.bom.assembly.segments).toBeGreaterThanOrEqual(6);
    expect(result.warnings.join(' ')).not.toMatch(/non manifold|non presente/);
  }, 180_000);

  it('latino e cirillico nella stessa insegna, con lo stesso font', async () => {
    const result = await generateSign(order('Ciao Привет', 250), readPublic);
    expect(result.housingMesh.triVerts.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).not.toMatch(/non presente/);
  }, 180_000);

  it('un font senza cirillico lo dice: errore riconoscibile se manca tutto, avviso se manca una parte', async () => {
    const sacramento = (text: string): SignOrderV4 => ({ ...order(text, 250), source: { kind: 'text', text, fontId: 'sacramento' } });
    await expect(generateSign(sacramento('Привет'), readPublic)).rejects.toThrow(NO_LETTERS);
    const mixed = await generateSign(sacramento('Ciao Привет'), readPublic);
    expect(mixed.warnings.filter((warning) => /^Carattere .* non presente in Sacramento/.test(warning))).toHaveLength(6);
    expect(mixed.housingMesh.triVerts.length).toBeGreaterThan(0);
  }, 180_000);
});
