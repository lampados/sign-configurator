// Text shaping with harfbuzzjs (SPEC §4ter), for fonts with `shaper: "harfbuzz"`.
// opentype.js lays out one glyph per character: not enough for Devanagari, because consonants
// fuse into conjuncts (स + ् + त) and the vowel sign ि is drawn before the consonant that precedes it in the
// text. harfbuzz decides which glyphs to use and where; the contours stay those read by opentype.js
// from the same file. No DOM: it runs in the main thread, in the worker and in Node.
import { fetchFontBytes, type FontBytesReader } from './loadFont';
import { getFont } from './registry';

/** A shaped glyph. Advances and offsets in font units, Y pointing up. */
export interface ShapedGlyph {
  glyphIndex: number;
  /** Index (UTF-16) in the text of the first character of the group the glyph belongs to. */
  cluster: number;
  xAdvance: number;
  xOffset: number;
  yOffset: number;
}

/** Text on one line → glyphs in visual order, from left to right. */
export type Shaper = (text: string) => ShapedGlyph[];

type Run = { start: number; end: number; devanagari: boolean };

/** Devanagari, Devanagari Extended and Vedic marks. */
const isDevanagari = (cp: number): boolean =>
  (cp >= 0x0900 && cp <= 0x097f) || (cp >= 0xa8e0 && cp <= 0xa8ff) || (cp >= 0x1cd0 && cp <= 0x1cff);

/** Spaces, digits, punctuation and the two joining characters (ZWNJ, ZWJ): they stay in the current run. */
const isNeutral = (cp: number): boolean =>
  cp === 0x200c || cp === 0x200d || !/\p{L}|\p{M}/u.test(String.fromCodePoint(cp));

/**
 * harfbuzz shapes one run at a time, with a single script: "Ciao नमस्ते" must be split, otherwise
 * the Hindi part would be shaped with the Latin rules, that is not shaped.
 */
export function scriptRuns(text: string): Run[] {
  const runs: Run[] = [];
  let i = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const last = runs[runs.length - 1];
    const devanagari = isDevanagari(cp);
    if (last && (isNeutral(cp) || last.devanagari === devanagari)) last.end = i + ch.length;
    else runs.push({ start: i, end: i + ch.length, devanagari });
    i += ch.length;
  }
  return runs;
}

type HarfBuzz = typeof import('harfbuzzjs');
let engine: Promise<HarfBuzz> | undefined;
const cache = new Map<string, Promise<Shaper>>();

/**
 * The shaper of a registry font, or `null` if the font does not ask for one. The harfbuzzjs
 * module (WASM, 440 KB) is downloaded at the first request, not with the page.
 */
export function loadShaper(id: string, read: FontBytesReader = fetchFontBytes): Promise<Shaper | null> {
  const entry = getFont(id);
  if (!entry) return Promise.reject(new Error(`Unknown font: "${id}"`));
  if (entry.shaper !== 'harfbuzz') return Promise.resolve(null);
  let shaper = cache.get(id);
  if (!shaper) {
    shaper = (async () => {
      engine ??= import('harfbuzzjs');
      const [hb, bytes] = await Promise.all([engine, read(entry.file)]);
      const font = new hb.Font(new hb.Face(new hb.Blob(bytes)));
      return (text: string): ShapedGlyph[] => {
        const out: ShapedGlyph[] = [];
        for (const run of scriptRuns(text)) {
          const buffer = new hb.Buffer();
          buffer.addText(text, run.start, run.end - run.start);
          if (run.devanagari) {
            buffer.setDirection(hb.Direction.LTR);
            buffer.setScript('Deva');
            buffer.setLanguage('hi');
          } else {
            buffer.guessSegmentProperties();
          }
          // A vowel sign without a consonant gets no dotted circle: on a sign it is not a letter.
          buffer.setFlags(hb.BufferFlag.DO_NOT_INSERT_DOTTED_CIRCLE);
          hb.shape(font, buffer);
          const infos = buffer.getGlyphInfos();
          const positions = buffer.getGlyphPositions();
          infos.forEach((info, k) => {
            const p = positions[k]!;
            out.push({
              glyphIndex: info.codepoint,
              cluster: info.cluster,
              xAdvance: p.xAdvance,
              xOffset: p.xOffset,
              yOffset: p.yOffset,
            });
          });
        }
        return out;
      };
    })();
    shaper.catch(() => cache.delete(id));
    cache.set(id, shaper);
  }
  return shaper;
}
