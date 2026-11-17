// Dal risultato del generatore al prezzo voce per voce (SPEC §12.5): raccoglie le misure dalla
// distinta e i prezzi dai cataloghi (strisce, controller, alimentatori, scatole), poi chiama
// `priceOrder`. Modulo puro: lo usa la pagina cliente e lo provano i test in Node.
import { ASSEMBLY_MIN_PER_CUT, controllerOf, stripProfileOf } from '../config';
import type { Bom } from '../export/bom';
import type { PlateBom } from '../geometry/plate';
import { BOXES } from '../parts/boxes';
import { SUPPLIES } from '../parts/supplies';
import { midEur, priceOrder, STRIP_WASTE_FACTOR, type PriceQuote } from '../pricing';

export interface QuoteInput {
  bom: Bom & { plate: PlateBom | null };
  /** Larghezza dell'insegna (senza fondale), mm. */
  widthMm: number;
  /** Id di `STRIP_PROFILES` e di `CONTROLLERS`; assenti: quelli standard. */
  stripId?: string;
  controllerId?: string;
}

export interface SignQuote extends PriceQuote {
  /** Metri di striscia da comprare: il tracciato più lo sfrido. */
  stripM: number;
  /** Minuti di montaggio contati nel prezzo. */
  assemblyMin: number;
  /**
   * `false`: la striscia scelta non ha ancora un prezzo al metro. La sua voce vale 0 e il totale
   * non la comprende: la pagina lo dice invece di mostrare un totale che sembra completo.
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
    // Un taglio in curva o un ponticello sono 10 minuti: gli stessi minuti del riepilogo.
    segments: assembly.assemblyMin / ASSEMBLY_MIN_PER_CUT,
    solderJoints: assembly.solderJoints,
    // Senza LED non c'è niente da alimentare né da comandare.
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
