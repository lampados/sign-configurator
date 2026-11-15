// Disegno sommario della striscia scelta, vista dall'alto, in scala: larghezza, LED, punti di taglio.
// Modulo puro: restituisce una stringa SVG, nessun DOM.

import type { StripProfile } from '../config';

/** Tratto di striscia disegnato, in mm: abbastanza per due LED anche a 30 LED/m. */
export const STRIP_SVG_LENGTH = 70;

const PAD_TOP = 9;
const PAD_BOTTOM = 8;
const PAD_LEFT = 14;
const PAD_RIGHT = 2;

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export interface StripSvgStats {
  leds: number;
  cuts: number;
}

/** Quanti LED e quanti punti di taglio cadono nel tratto disegnato. */
export function stripSvgStats(strip: StripProfile): StripSvgStats {
  const ledPitch = 1000 / strip.LED_PER_M;
  return {
    leds: Math.floor((STRIP_SVG_LENGTH - ledPitch / 2) / ledPitch) + 1,
    cuts: Math.ceil(STRIP_SVG_LENGTH / strip.CUT_PITCH) - 1,
  };
}

export function stripSvg(strip: StripProfile): string {
  const w = strip.STRIP_W;
  const len = STRIP_SVG_LENGTH;
  const ledPitch = 1000 / strip.LED_PER_M;
  const stats = stripSvgStats(strip);
  const parts: string[] = [];
  const y0 = PAD_TOP;
  const x0 = PAD_LEFT;

  // Circuito flessibile. Il bordo destro resta aperto: la striscia continua.
  parts.push(`<rect class="strip-pcb" x="${n(x0)}" y="${n(y0)}" width="${n(len)}" height="${n(w)}" rx="0.4"/>`);

  // Punti di taglio: linea tratteggiata e tre piazzole di rame per lato (+, dati, massa).
  const padW = Math.min(1.2, strip.CUT_PITCH / 6);
  const padH = w / 5;
  for (let i = 1; i <= stats.cuts; i += 1) {
    const x = x0 + i * strip.CUT_PITCH;
    for (let k = 0; k < 3; k += 1) {
      const y = y0 + (w * (k + 0.5)) / 3 - padH / 2;
      parts.push(`<rect class="strip-pad" x="${n(x - padW - 0.15)}" y="${n(y)}" width="${n(padW)}" height="${n(padH)}"/>`);
      parts.push(`<rect class="strip-pad" x="${n(x + 0.15)}" y="${n(y)}" width="${n(padW)}" height="${n(padH)}"/>`);
    }
    parts.push(`<line class="strip-cut" data-cut x1="${n(x)}" y1="${n(y0 - 1.5)}" x2="${n(x)}" y2="${n(y0 + w + 1.5)}"/>`);
    // Intagli sui bordi: è da lì che la striscia piega di lato.
    if (strip.sideBend) {
      const d = Math.min(1, w / 5);
      parts.push(`<path class="strip-notch" d="M${n(x - d)} ${n(y0)}L${n(x)} ${n(y0 + d)}L${n(x + d)} ${n(y0)}Z"/>`);
      parts.push(`<path class="strip-notch" d="M${n(x - d)} ${n(y0 + w)}L${n(x)} ${n(y0 + w - d)}L${n(x + d)} ${n(y0 + w)}Z"/>`);
    }
  }

  // LED: la COB è una fascia continua di fosforo sopra i chip, le altre hanno un LED 5050 per passo.
  const led = Math.min(5, w * 0.5, ledPitch * 0.6);
  if (strip.sideBend) {
    parts.push(`<rect class="strip-phosphor" x="${n(x0)}" y="${n(y0 + w * 0.25)}" width="${n(len)}" height="${n(w * 0.5)}" rx="${n(w * 0.25)}"/>`);
    for (let i = 0; i < stats.leds; i += 1) {
      const cx = x0 + ledPitch / 2 + i * ledPitch;
      parts.push(`<circle class="strip-chip" data-led cx="${n(cx)}" cy="${n(y0 + w / 2)}" r="${n(Math.min(0.9, ledPitch / 5))}"/>`);
    }
  } else {
    for (let i = 0; i < stats.leds; i += 1) {
      const cx = x0 + ledPitch / 2 + i * ledPitch;
      parts.push(`<rect class="strip-led" data-led x="${n(cx - led / 2)}" y="${n(y0 + w / 2 - led / 2)}" width="${n(led)}" height="${n(led)}" rx="0.5"/>`);
      parts.push(`<circle class="strip-lens" cx="${n(cx)}" cy="${n(y0 + w / 2)}" r="${n(led * 0.32)}"/>`);
    }
  }

  // Quote: larghezza a sinistra, passo di taglio sopra.
  const xd = x0 - 3;
  parts.push(`<path class="strip-dim" d="M${n(xd)} ${n(y0)}V${n(y0 + w)}M${n(xd - 1)} ${n(y0)}H${n(xd + 1)}M${n(xd - 1)} ${n(y0 + w)}H${n(xd + 1)}"/>`);
  parts.push(`<text class="strip-label" x="${n(xd - 1.5)}" y="${n(y0 + w / 2)}" text-anchor="end" dominant-baseline="middle">${n(w)}</text>`);
  if (stats.cuts >= 1) {
    const xa = x0;
    const xb = x0 + strip.CUT_PITCH;
    const yd = y0 - 3.5;
    parts.push(`<path class="strip-dim" d="M${n(xa)} ${n(yd)}H${n(xb)}M${n(xa)} ${n(yd - 1)}V${n(yd + 1)}M${n(xb)} ${n(yd - 1)}V${n(yd + 1)}"/>`);
    parts.push(`<text class="strip-label" x="${n((xa + xb) / 2)}" y="${n(yd - 1.5)}" text-anchor="middle">${n(strip.CUT_PITCH)}</text>`);
  }
  const caption = `${strip.LED_PER_M} LED/m · ${n(strip.STRIP_W)} × ${n(strip.STRIP_T)} mm · cut every ${n(strip.CUT_PITCH)} mm`;
  parts.push(`<text class="strip-label" x="${n(x0)}" y="${n(y0 + w + 6.5)}">${strip.sideBend ? 'bends sideways' : 'rigid sideways: cut at bends'}</text>`);

  const width = PAD_LEFT + len + PAD_RIGHT;
  const height = PAD_TOP + w + PAD_BOTTOM;
  return `<svg class="strip-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" role="img" aria-label="${strip.name}: ${caption}"><title>${strip.name}: ${caption}</title>${parts.join('')}</svg>`;
}
