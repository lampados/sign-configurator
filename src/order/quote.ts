// From the generator's result to the line-by-line price (SPEC §12.5): it gathers the measurements from the
// bill of materials and the prices from the catalogues (strips, controllers, power supplies, boxes), then calls
// `priceOrder`. Pure module: used by the customer page and exercised by the tests in Node.
import { ASSEMBLY_MIN_PER_CUT, controllerOf, stripProfileOf } from '../config';
import type { Bom } from '../export/bom';
import type { PlateBom } from '../geometry/plate';
import { BOXES } from '../parts/boxes';
import { SUPPLIES } from '../parts/supplies';
import { midEur, priceOrder, STRIP_WASTE_FACTOR, type PriceQuote } from '../pricing';

export interface QuoteInput {
  bom: Bom & { plate: PlateBom | null };
  /** Width of the sign (without backdrop), mm. */
  widthMm: number;
  /** Ids from `STRIP_PROFILES` and `CONTROLLERS`; absent: the standard ones. */
  stripId?: string;
  controllerId?: string;
}

export interface SignQuote extends PriceQuote {
  /** Metres of strip to buy: the path plus the waste. */
  stripM: number;
  /** Assembly minutes counted in the price. */
  assemblyMin: number;
  /**
   * `false`: the chosen strip has no price per metre yet. Its line counts 0 and the total
   * does not include it: the page says so instead of showing a total that looks complete.
   */
  stripPriced: boolean;
}

export function quoteSign(input: QuoteInput): SignQuote {
  const { bom } = input;
  const assembly = bom.assembly;
  const strip = stripProfileOf(input.stripId);
  const stripMm = bom.segments.reduce((sum, segment) => sum + segment.cutLengthMm, 0);
  const family = SUPPLIES.find((f) => f.id === assembly.supply?.family);
  const box = BOXES.find((b) => b.id === assembly.box?.id);
  const quote = priceOrder({
    outlineMm2: 0,
    widthMm: input.widthMm,
    stripMm,
    stripEurPerM: strip.eurPerM ?? 0,
    // A cut on a bend or a jumper is 10 minutes: the same minutes as the summary.
    segments: assembly.assemblyMin / ASSEMBLY_MIN_PER_CUT,
    solderJoints: assembly.solderJoints,
    // Without LEDs there is nothing to power or to control.
    controllerEur: assembly.totalLeds > 0 ? controllerOf(input.controllerId).priceEur : 0,
    supplyEur: family ? midEur(family.priceEur) : 0,
    boxEur: box ? midEur(box.priceEur) : 0,
    ...(bom.plate ? { plate: { material: bom.plate.material, areaMm2: bom.plate.areaMm2 } } : {}),
  });
  return {
    ...quote,
    stripM: Math.round((stripMm / 1000) * STRIP_WASTE_FACTOR * 100) / 100,
    assemblyMin: assembly.assemblyMin,
    stripPriced: strip.eurPerM !== null,
  };
}
