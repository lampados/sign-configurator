// Customer price, excluding VAT (SPEC §12.5). Pure module: the component lines come from the
// caller (strip from the profile, power supply and box from the parts average). Shipping separate.

export const PRICING_VERSION = '2026-11-17';

// Length of strip to buy compared with the path, +20%
export const STRIP_WASTE_FACTOR = 1.2;
// 3D printing per piece: flat, based on the width of the sign (mm)
export const PRINT_EUR_NARROW = 7;
export const PRINT_EUR_WIDE = 14;
export const PRINT_WIDE_FROM_MM = 700;
// Labour: €1/min, 10 min per strip cut; soldering included
export const EUR_PER_SEGMENT = 10;
export const EUR_PER_JOINT = 0;
// Backdrop: laser €15 fixed per job; acrylic €50/m²; wood sheet €3
export const PLATE_LASER_EUR = 15;
export const PLATE_EUR_PER_M2: Partial<Record<'clear' | 'wood' | 'black', number>> = { clear: 50 };
export const PLATE_WOOD_SHEET_EUR = 3;
// Black acrylic: €10 flat
export const PLATE_BLACK_FLAT_EUR = 10;
// Markup on cost (15%)
export const MARGIN = 1.15;
// Rounding up and minimum (values to be confirmed)
export const PRICE_MIN = 25;
export const PRICE_STEP = 5;
// Shipping: estimate on a separate row, it does not enter the total
export const SHIPPING_EUR = 20;

export interface PriceMeasure {
  outlineMm2: number;
  /** Width of the sign, mm: above 700 mm printing costs more. */
  widthMm: number;
  /** Sum of the cutLengthMm of the path, mm (before the +20%). */
  stripMm: number;
  /** €/m of strip from the profile chosen in the menu. */
  stripEurPerM: number;
  /** Number of strip cuts (one cut = one segment of labour). */
  segments: number;
  solderJoints: number;
  /** Chosen controller: `priceEur` from `CONTROLLERS` (€35 the standard one). */
  controllerEur: number;
  /** Power supply: average of the parts prices (min+max)/2 of the chosen model. */
  supplyEur: number;
  /** Box: average of the parts prices of the chosen model; 0 if none. */
  boxEur: number;
  /** Backdrop, if present: material and area in mm². */
  plate?: { material: 'clear' | 'wood' | 'black'; areaMm2: number };
}

export interface PriceLine {
  id: string;
  label: string;
  amount: number;
}

export interface PriceQuote {
  /** Product, excluding VAT, excluding shipping. */
  total: number;
  /** Shipping estimate, separate row. */
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

/** Average of a price range [min, max] from parts. */
export function midEur(range: readonly [number, number]): number {
  return (range[0] + range[1]) / 2;
}

/** Signed ring area, mm². Sum the rings: holes, if wound the other way, are subtracted. */
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
 * Customer price. Same input and same PRICING_VERSION → same result.
 */
export function priceOrder(measure: PriceMeasure): PriceQuote {
  const printEur = measure.widthMm > PRINT_WIDE_FROM_MM ? PRINT_EUR_WIDE : PRINT_EUR_NARROW;
  const stripM = (Math.max(0, measure.stripMm) / 1000) * STRIP_WASTE_FACTOR;

  const lines: PriceLine[] = [
    { id: 'controller', label: 'Controller', amount: cents(Math.max(0, measure.controllerEur)) },
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
