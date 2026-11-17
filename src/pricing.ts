// Prezzo cliente, IVA esclusa (SPEC §12.5). Modulo puro: le voci dei componenti vengono dal
// chiamante (striscia dal profilo, alimentatore e scatola dalla media di parts). Spedizione a parte.

export const PRICING_VERSION = '2026-11-16';

// Controller GLEDOPTO, € (voce "Base")
export const CONTROLLER_EUR = 35;
// Lunghezza di striscia da acquistare rispetto al tracciato, +20%
export const STRIP_WASTE_FACTOR = 1.2;
// Stampa 3D a pezzo: flat, in base alla larghezza dell'insegna (mm)
export const PRINT_EUR_NARROW = 7;
export const PRINT_EUR_WIDE = 14;
export const PRINT_WIDE_FROM_MM = 700;
// Manodopera: 1 €/min, 10 min per taglio di striscia; saldature incluse
export const EUR_PER_SEGMENT = 10;
export const EUR_PER_JOINT = 0;
// Fondale: laser 15 € fisso a lavoro; plexiglass 50 €/m²; foglio di legno 3 €
export const PLATE_LASER_EUR = 15;
export const PLATE_EUR_PER_M2: Partial<Record<'clear' | 'wood' | 'black', number>> = { clear: 50 };
export const PLATE_WOOD_SHEET_EUR = 3;
// Plexiglass nero: 10 € flat
export const PLATE_BLACK_FLAT_EUR = 10;
// Ricarico sul costo (15%)
export const MARGIN = 1.15;
// Arrotondamento per eccesso e minimo (valori da confermare)
export const PRICE_MIN = 25;
export const PRICE_STEP = 5;
// Spedizione: stima a riga separata, non entra nel totale
export const SHIPPING_EUR = 20;

export interface PriceMeasure {
  outlineMm2: number;
  /** Larghezza dell'insegna, mm: sopra 700 mm la stampa costa di più. */
  widthMm: number;
  /** Somma dei cutLengthMm del tracciato, mm (prima del +20%). */
  stripMm: number;
  /** €/m di striscia dal profilo scelto nel menu. */
  stripEurPerM: number;
  /** Numero di tagli di striscia (un taglio = un segmento di manodopera). */
  segments: number;
  solderJoints: number;
  /** Alimentatore: media dei prezzi di parts (min+max)/2 del modello scelto. */
  supplyEur: number;
  /** Scatola: media dei prezzi di parts del modello scelto; 0 se nessuna. */
  boxEur: number;
  /** Fondale, se presente: materiale e area in mm². */
  plate?: { material: 'clear' | 'wood' | 'black'; areaMm2: number };
}

export interface PriceLine {
  id: string;
  label: string;
  amount: number;
}

export interface PriceQuote {
  /** Prodotto, IVA esclusa, spedizione esclusa. */
  total: number;
  /** Stima di spedizione, riga separata. */
  shipping: number;
  breakdown: PriceLine[];
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundUpStep(value: number, step: number): number {
  if (!(step > 0)) return cents(value);
  const stepCents = Math.round(step * 100);
  const valueCents = Math.round(value * 100);
  return (Math.ceil(valueCents / stepCents) * stepCents) / 100;
}

/** Media di una fascia di prezzo [min, max] da parts. */
export function midEur(range: readonly [number, number]): number {
  return (range[0] + range[1]) / 2;
}

/** Ring area con segno, mm². Sommare gli anelli: i buchi, se girano al contrario, si sottraggono. */
export function ringAreaMm2(ring: readonly (readonly [number, number])[]): number {
  let signed = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    signed += a[0] * b[1] - b[0] * a[1];
  }
  return signed / 2;
}

function plateEur(plate: NonNullable<PriceMeasure['plate']>): number {
  const area = Math.max(0, plate.areaMm2);
  if (plate.material === 'wood') return PLATE_LASER_EUR + PLATE_WOOD_SHEET_EUR;
  if (plate.material === 'black') return PLATE_LASER_EUR + PLATE_BLACK_FLAT_EUR;
  const perM2 = PLATE_EUR_PER_M2[plate.material];
  return PLATE_LASER_EUR + (area / 1e6) * (perM2 ?? 0);
}

/**
 * Prezzo cliente. Stesso ingresso e stessa PRICING_VERSION → stesso risultato.
 */
export function priceOrder(measure: PriceMeasure): PriceQuote {
  const printEur = measure.widthMm > PRINT_WIDE_FROM_MM ? PRINT_EUR_WIDE : PRINT_EUR_NARROW;
  const stripM = (Math.max(0, measure.stripMm) / 1000) * STRIP_WASTE_FACTOR;

  const lines: PriceLine[] = [
    { id: 'controller', label: 'Controller', amount: cents(CONTROLLER_EUR) },
    { id: 'strip', label: 'Striscia', amount: cents(stripM * measure.stripEurPerM) },
    { id: 'print', label: 'Stampa', amount: cents(printEur) },
    { id: 'segments', label: 'Montaggio', amount: cents(Math.max(0, measure.segments) * EUR_PER_SEGMENT) },
    { id: 'joints', label: 'Saldature', amount: cents(Math.max(0, measure.solderJoints) * EUR_PER_JOINT) },
    { id: 'supply', label: 'Alimentatore', amount: cents(measure.supplyEur) },
    { id: 'box', label: 'Scatola', amount: cents(measure.boxEur) },
    { id: 'plate', label: 'Fondale', amount: measure.plate ? cents(plateEur(measure.plate)) : 0 },
  ];
  const raw = lines.reduce((sum, line) => sum + line.amount, 0);
  const margined = raw * MARGIN;
  const rounded = roundUpStep(margined, PRICE_STEP);
  const total = Math.max(PRICE_MIN, rounded);
  lines.push(
    { id: 'margin', label: 'Margine', amount: cents(margined - raw) },
    { id: 'rounding', label: 'Arrotondamento', amount: cents(rounded - margined) },
    { id: 'minimum', label: 'Minimo', amount: cents(total - rounded) },
  );
  return { total: cents(total), shipping: SHIPPING_EUR, breakdown: lines };
}
