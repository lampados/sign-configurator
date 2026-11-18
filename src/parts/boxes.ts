// Boxes for the electronics (SPEC §2, Box): catalogue and choice based on the footprints of
// power supply and controller. Inner measurements in mm; indicative prices for one piece, excluding VAT,
// November 2026. Pure module.

/** Distance between a component and the wall, mm. */
export const BOX_WALL_GAP_MM = 5;
/** Distance between two components side by side, mm. */
export const BOX_ITEM_GAP_MM = 10;
/** Air above the tallest component, for the cables on the terminals, mm. */
export const BOX_TOP_GAP_MM = 10;
/** Indicative footprint of a controller whose maker does not publish the measurements. */
export const CONTROLLER_FALLBACK_MM: [number, number, number] = [60, 35, 20];

export interface BoxSpec {
  id: string;
  brand: string;
  model: string;
  /** Inside L × W × H, mm. */
  innerMm: [number, number, number];
  /** Outside L × W × H, mm; null if we do not have it from a source. */
  outerMm: [number, number, number] | null;
  ip: string;
  material: string;
  priceEur: [number, number];
  url: string;
  /** Inside estimated from the outside (walls and lid), not declared by the maker. */
  innerEstimated?: boolean;
}

/** Hammond gives the outer measurements: inside estimated with 2.5 mm walls and 7 mm between floor and lid. */
function hammond(model: string, outer: [number, number, number], price: [number, number]): BoxSpec {
  return {
    id: model.toLowerCase(),
    brand: 'Hammond',
    model,
    innerMm: [outer[0] - 5, outer[1] - 5, outer[2] - 7],
    outerMm: outer,
    ip: 'IP54',
    material: 'Black ABS',
    priceEur: price,
    url: 'https://www.hammfg.com/electronics/small-case/plastic/1591',
    innerEstimated: true,
  };
}

/** Gewiss 44 CE series: the code gives the inner measurements. */
function gewiss(model: string, inner: [number, number, number], outer: [number, number, number] | null, price: [number, number], ip = 'IP56'): BoxSpec {
  return {
    id: model.toLowerCase(),
    brand: 'Gewiss',
    model,
    innerMm: inner,
    outerMm: outer,
    ip,
    material: 'Grey thermoplastic',
    priceEur: price,
    url: `https://www.gewiss.com/content/gewiss/ww/en/search.html?q=${model}`,
  };
}

export const BOXES: readonly BoxSpec[] = [
  hammond('1591XXLSBK', [86, 56, 36], [8, 10]),
  hammond('1591XXGSBK', [122, 94, 36], [10, 12]),
  hammond('1591XXTSBK', [123, 83, 60], [5, 10]),
  gewiss('GW44204', [100, 100, 50], null, [6, 8]),
  gewiss('GW44205', [120, 80, 50], null, [6, 8]),
  gewiss('GW44206', [150, 110, 70], null, [9, 12]),
  gewiss('GW44207', [190, 140, 70], null, [15, 20]),
  gewiss('GW44208', [240, 190, 90], [254, 200, 98], [17, 32]),
  gewiss('GW44209', [300, 220, 120], [316, 236, 128], [29, 58], 'IP55'),
];

/** Choice in the menu: the smallest that is enough, no box, or a specific box. */
export const BOX_AUTO = 'auto';
export const BOX_NONE = 'none';

export interface BoxItem {
  /** Name for the warnings. */
  label: string;
  sizeMm: [number, number, number];
}

const volume = (b: BoxSpec): number => b.innerMm[0] * b.innerMm[1] * b.innerMm[2];

/**
 * The minimum inner measurements for `items` side by side: in a row along L or along W, with
 * BOX_WALL_GAP_MM to the walls, BOX_ITEM_GAP_MM between one component and the next, BOX_TOP_GAP_MM above.
 */
export function boxNeeds(items: readonly BoxItem[]): [number, number, number][] {
  if (items.length === 0) return [];
  const gaps = 2 * BOX_WALL_GAP_MM + (items.length - 1) * BOX_ITEM_GAP_MM;
  const sumL = items.reduce((s, i) => s + i.sizeMm[0], 0);
  const sumW = items.reduce((s, i) => s + i.sizeMm[1], 0);
  const maxL = Math.max(...items.map((i) => i.sizeMm[0]));
  const maxW = Math.max(...items.map((i) => i.sizeMm[1]));
  const h = Math.max(...items.map((i) => i.sizeMm[2])) + BOX_TOP_GAP_MM;
  return [
    [sumL + gaps, maxW + 2 * BOX_WALL_GAP_MM, h],
    [maxL + 2 * BOX_WALL_GAP_MM, sumW + gaps, h],
  ];
}

/** The components fit, in one of the two rows and with the box rotated as needed. */
export function boxFits(box: BoxSpec, items: readonly BoxItem[]): boolean {
  if (items.length === 0) return true;
  const [bl, bw, bh] = box.innerMm;
  return boxNeeds(items).some(
    ([l, w, h]) => h <= bh && ((l <= bl && w <= bw) || (l <= bw && w <= bl)),
  );
}

/** Ids of the boxes that hold `items`, smallest first. */
export function boxesThatFit(items: readonly BoxItem[]): string[] {
  return [...BOXES].sort((a, b) => volume(a) - volume(b)).filter((b) => boxFits(b, items)).map((b) => b.id);
}

export interface BoxPick {
  box: BoxSpec | null;
  /** The chosen box holds them all; always true without a box or without components. */
  fits: boolean;
  /** Automatic choice: the smallest that is enough. */
  auto: boolean;
}

/**
 * Box for `items`. `choice`: BOX_AUTO (the smallest that is enough, by inner volume),
 * BOX_NONE, or the id of a box (even if too small: `fits` says so).
 */
export function pickBox(items: readonly BoxItem[], choice: string = BOX_AUTO): BoxPick {
  if (choice === BOX_NONE || items.length === 0) return { box: null, fits: true, auto: choice !== BOX_NONE };
  const chosen = BOXES.find((b) => b.id === choice);
  if (chosen) return { box: chosen, fits: boxFits(chosen, items), auto: false };
  const box = [...BOXES].sort((a, b) => volume(a) - volume(b)).find((b) => boxFits(b, items)) ?? null;
  return { box, fits: box !== null, auto: true };
}
