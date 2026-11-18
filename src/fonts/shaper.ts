// Composizione del testo con harfbuzzjs (SPEC §4ter), per i font con `shaper: "harfbuzz"`.
// opentype.js mette in fila un glifo per carattere: al devanagari non basta, perché le consonanti
// si fondono in legature (स + ् + त) e la vocale ि si disegna prima della consonante che segue nel
// testo. harfbuzz decide quali glifi usare e dove; i contorni restano quelli letti da opentype.js
// dallo stesso file. Niente DOM: gira nel main thread, nel worker e in Node.
import { fetchFontBytes, type FontBytesReader } from './loadFont';
import { getFont } from './registry';

/** Un glifo composto. Avanzamenti e spostamenti in unità font, Y verso l'alto. */
export interface ShapedGlyph {
  glyphIndex: number;
  /** Indice (UTF-16) nel testo del primo carattere del gruppo a cui il glifo appartiene. */
  cluster: number;
  xAdvance: number;
  xOffset: number;
  yOffset: number;
}

/** Testo su una riga → glifi in ordine visivo, da sinistra a destra. */
export type Shaper = (text: string) => ShapedGlyph[];

type Run = { start: number; end: number; devanagari: boolean };

/** Devanagari, Devanagari esteso e segni vedici. */
const isDevanagari = (cp: number): boolean =>
  (cp >= 0x0900 && cp <= 0x097f) || (cp >= 0xa8e0 && cp <= 0xa8ff) || (cp >= 0x1cd0 && cp <= 0x1cff);

/** Spazi, cifre, punteggiatura e i due caratteri di legatura (ZWNJ, ZWJ): restano nel tratto in corso. */
const isNeutral = (cp: number): boolean =>
  cp === 0x200c || cp === 0x200d || !/\p{L}|\p{M}/u.test(String.fromCodePoint(cp));

/**
 * harfbuzz compone un tratto alla volta, con una sola scrittura: «Ciao नमस्ते» va diviso, altrimenti
 * la parte hindi verrebbe composta con le regole latine, cioè non composta.
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
 * Il compositore di un font del registro, o `null` se il font non lo chiede. Il modulo
 * harfbuzzjs (WASM, 440 KB) si scarica alla prima richiesta, non con la pagina.
 */
export function loadShaper(id: string, read: FontBytesReader = fetchFontBytes): Promise<Shaper | null> {
  const entry = getFont(id);
  if (!entry) return Promise.reject(new Error(`Font sconosciuto: "${id}"`));
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
          // Una vocale senza consonante non riceve il cerchio tratteggiato: su un'insegna non è una lettera.
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
