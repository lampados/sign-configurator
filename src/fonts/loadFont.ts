// Loading of the TTFs from public/fonts with opentype.js (SPEC §4).
// No DOM: it works in the main thread, in the worker and (with a different reader) in Node.
import { parse, type Font } from 'opentype.js';
import { getFont } from './registry';

/** Reads the bytes of a file relative to `public/`. */
export type FontBytesReader = (file: string) => Promise<ArrayBuffer>;

/** Browser and worker: `BASE_URL` is absolute, so the URL also works inside the worker. */
export const fetchFontBytes: FontBytesReader = async (file) => {
  const url = `${import.meta.env.BASE_URL}${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font not found: ${url} (HTTP ${res.status})`);
  return res.arrayBuffer();
};

const cache = new Map<string, Promise<Font>>();

/** Registry font by id, parsed only once per context (main thread or worker). */
export function loadFont(id: string, read: FontBytesReader = fetchFontBytes): Promise<Font> {
  let font = cache.get(id);
  if (!font) {
    const entry = getFont(id);
    if (!entry) return Promise.reject(new Error(`Unknown font: "${id}"`));
    font = read(entry.file).then((bytes) => parse(bytes));
    font.catch(() => cache.delete(id));
    cache.set(id, font);
  }
  return font;
}
