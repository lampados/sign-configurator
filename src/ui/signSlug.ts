// File name of the customer's STLs (SPEC §5). Lowercase, ASCII, hyphens, at most 40 characters.

const SLUG_MAX = 40;

/** "Ciao Torino" → `ciao-torino`. Empty or without letters → `sign`. */
export function signSlug(value: string): string {
  const ascii = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = ascii.slice(0, SLUG_MAX).replace(/-+$/g, '');
  return cut || 'sign';
}

export function stlFileName(source: string, heightMm: number, part: 'housing' | 'diffuser' | 'backdrop'): string {
  return `${signSlug(source)}-${heightMm}mm-${part}.stl`;
}

/** Piece `index` of `count` (from 1) when the sign is split for the print bed (SPEC §14). */
export function partFileName(source: string, heightMm: number, part: 'housing' | 'diffuser', index: number, count: number): string {
  return `${signSlug(source)}-${heightMm}mm-${part}-${index}of${count}.stl`;
}

/** Archive with all the files of a sign split into pieces. */
export function zipFileName(source: string, heightMm: number): string {
  return `${signSlug(source)}-${heightMm}mm.zip`;
}

/** Laser cutting file of the backdrop (SPEC §13): same name as the STL, in SVG. */
export function plateSvgFileName(source: string, heightMm: number): string {
  return `${signSlug(source)}-${heightMm}mm-backdrop.svg`;
}
