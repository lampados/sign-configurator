// Tutte le misure in millimetri, gli angoli in gradi (SPEC §1-§3).

export const GENERATOR_VERSION = '0.2.0';
export const ORDER_SCHEMA_VERSION = 4 as const;

/** Margine lastra, mm (SPEC §13). Il cliente sta fra min e max. */
export const PLATE_MARGIN = 20;
export const PLATE_MARGIN_MIN = 10;
export const PLATE_MARGIN_MAX = 60;
/** Raggio angoli di `rect`, mm (SPEC §13). */
export const PLATE_CORNER_R = 8;
export const PLATE_CORNER_R_MIN = 0;
export const PLATE_CORNER_R_MAX = 50;
/**
 * Piano utile del laser, mm. `null` finché non misurato: il vincolo di §12.4 non scatta.
 */
export const PLATE_MAX_W: number | null = null;
export const PLATE_MAX_H: number | null = null;
/** Fori di fissaggio allineati agli ancoraggi, mm. */
export const PLATE_FIX_HOLE_D = 3.4;
/** Fori di montaggio a parete, mm. */
export const PLATE_MOUNT_HOLE_D = 5.0;
/** Distanza dei fori di montaggio dal bordo, mm. */
export const PLATE_MOUNT_INSET = 10;
/** Fori passanti sotto asole e cavo. `false` lascia la lastra chiusa (SPEC §13). */
export const PLATE_WIRE_HOLES = true;
/** Diametro dei passaggi dei fili sotto asole e tasche d'angolo, mm. */
export const PLATE_WIRE_HOLE_D = 6;
/** Aria minima fra un foro di montaggio e la sagoma dell'insegna, mm. */
export const PLATE_MOUNT_CLEARANCE = 3;
/** Spessore lastra per materiale, mm. Segnaposto finché non si compra il foglio. */
export const PLATE_T = Object.freeze({ clear: 3, black: 3, wood: 4 });
/** Kerf laser per materiale, mm. `null` finché non si misura (DA TARARE). */
export const PLATE_KERF: Readonly<Record<keyof typeof PLATE_T, number | null>> = Object.freeze({
  clear: null,
  black: null,
  wood: null,
});

/** Tensioni della striscia che il configuratore conosce (SPEC §2). */
export const STRIP_VOLTAGES: readonly number[] = [5, 12, 24];

/** Un controller WLED che il configuratore sa dimensionare (SPEC §2, Controller). */
export interface ControllerSpec {
  id: string;
  brand: string;
  name: string;
  model: string;
  /** Tensione d'ingresso, V DC: uguale a quella della striscia. */
  minV: number;
  maxV: number;
  /** Corrente totale continua attraverso la scheda, A. */
  maxA: number;
  /** LED (IC) gestibili con un frame rate decente. */
  maxIcs: number;
  outputs: number;
  /** L × W × H, mm; null se il costruttore non la dà. */
  sizeMm: [number, number, number] | null;
  url: string;
  /** Nota per la pagina parts. */
  note?: string;
}

/**
 * Controller WLED disponibili. Il primo è quello standard, montato dietro l'insegna.
 * GLEDOPTO Ultra Mini: dalle schede dei rivenditori, 5–24 V, 10 A, 2 uscite, 800 IC (il dato
 * «10 A per canale» non torna con i 240 W dichiarati: per prudenza 10 A in totale).
 * GL-C-618WL: 15 A in totale, 10 A per uscita, 4 uscite. QuinLED: dalle pagine quinled.info.
 * Dove il costruttore non dà un limite di LED: circa 600 per uscita, la soglia che WLED
 * suggerisce per un buon frame rate. Gli IC si contano come i LED.
 */
export const CONTROLLERS: readonly ControllerSpec[] = Object.freeze([
  {
    id: 'gl-c-309wl',
    brand: 'GLEDOPTO',
    name: 'GLEDOPTO ESP32 Ultra Mini',
    model: 'GL-C-309WL',
    minV: 5,
    maxV: 24,
    maxA: 10,
    maxIcs: 800,
    outputs: 2,
    sizeMm: null,
    url: 'https://www.gledopto.com/',
    note: 'Small enough to hide behind the sign.',
  },
  {
    id: 'gl-c-618wl',
    brand: 'GLEDOPTO',
    name: 'GLEDOPTO ESP32 Ethernet',
    model: 'GL-C-618WL',
    minV: 5,
    maxV: 24,
    maxA: 15,
    maxIcs: 2400,
    outputs: 4,
    sizeMm: null,
    url: 'https://www.gledopto.com/',
    note: '10 A per output, 15 A total. Wi-Fi and Ethernet, microphone.',
  },
  {
    id: 'quinled-dig-uno',
    brand: 'QuinLED',
    name: 'QuinLED Dig-Uno',
    model: 'Dig-Uno v3.1',
    minV: 5,
    maxV: 24,
    maxA: 15,
    maxIcs: 1200,
    outputs: 2,
    sizeMm: [50, 40, 25],
    url: 'https://quinled.info/quinled-dig-uno-pre-assembled-v3-1-specifications/',
    note: 'Onboard fuse, screw terminals.',
  },
  {
    id: 'quinled-dig-next-2',
    brand: 'QuinLED',
    name: 'QuinLED Dig-Next-2',
    model: 'Dig-Next-2',
    minV: 5,
    maxV: 48,
    maxA: 20,
    maxIcs: 1200,
    outputs: 2,
    sizeMm: null,
    url: 'https://quinled.info/dig-next-2-specifications/',
    note: 'Plastic case. Power outputs 2 × 5 A + 10 A, each fused.',
  },
  {
    id: 'quinled-dig-quad',
    brand: 'QuinLED',
    name: 'QuinLED Dig-Quad',
    model: 'Dig-Quad v4',
    minV: 5,
    maxV: 24,
    maxA: 30,
    maxIcs: 2400,
    outputs: 4,
    sizeMm: [100, 50, 25],
    url: 'https://quinled.info/quinled-dig-quad-pre-assembled-v4-specifications/',
    note: '30 A continuous, fused outputs for power injection.',
  },
]);

/** Il controller standard. */
export const CONTROLLER: ControllerSpec = CONTROLLERS[0]!;

/** Controller dall'id; quello standard se l'id è sconosciuto. */
export function controllerOf(id: string | undefined): ControllerSpec {
  return CONTROLLERS.find((c) => c.id === id) ?? CONTROLLER;
}

/** Pagina cliente: offre il download di housing.stl e, se attivo, diffuser.stl (SPEC §5). */
export const CUSTOMER_STL_DOWNLOAD = true;

/**
 * Negozio che riceve le richieste: «Send request» salva il design e porta il cliente al carrello,
 * dove inserisce i suoi dati. Il prodotto è quello generico a cui il negozio aggancia il design.
 * Chi fa un fork cambia questi due valori, o mette SHOP_URL a '' per non avere un negozio.
 */
export const SHOP_URL = 'https://officine.cc';
export const SHOP_PRODUCT_ID = 1637;

/** Indirizzo del carrello con il design agganciato. */
export function shopCartUrl(code: string): string {
  return `${SHOP_URL}/?add-to-cart=${SHOP_PRODUCT_ID}&design=${encodeURIComponent(code)}`;
}

/** Lato lungo massimo di una bitmap caricata, prima della soglia (SPEC §4bis). */
export const IMAGE_MAX_PX = 4096;

/** Tolleranza del fit spezzone → Bézier all'apertura dell'editor (SPEC §5bis). */
export const EDIT_FIT_TOL = 0.3;

/** Distanza minima fra due nodi consecutivi durante il trascinamento (SPEC §5bis). */
export const EDIT_MIN_NODE_DIST = 0.5;

/** Profilo dello spigolo superiore della parete (SPEC §3). */
export type EdgeProfile = 'square' | 'outer' | 'inner' | 'both';

/** warn: lo spigolo resta un errore; split: lo spezzone si taglia nello spigolo. */
export type CuspMode = 'warn' | 'split';

/** omit: l'anello si esclude; dash: trattino; dot: spezzone con fori; unlit: rilievo senza striscia. */
export type IDotMode = 'omit' | 'dash' | 'dot' | 'unlit';

/**
 * Misure della striscia LED. R_MIN e MIN_LETTER_H non stanno qui: si ricavano dal profilo.
 * Le strisce si aggiungono a STRIP_PROFILES; DEFAULT_STRIP è quella standard.
 */
export interface StripProfile {
  id: string;
  name: string;
  STRIP_W: number;
  STRIP_T: number;
  CHANNEL_W: number;
  HINGE_PITCH: number;
  HINGE_MAX_DEG: number;
  CUT_PITCH: number;
  LED_PER_M: number;
  /**
   * La striscia segue le curve dell'insegna piegandosi **di lato**, nel proprio piano. Ci riescono
   * solo le strisce fatte apposta: quelle con gli intagli sui bordi (COB) e le serpentine a S. Una
   * striscia normale su circuito flessibile no: il rame del bordo esterno dovrebbe allungarsi, e
   * invece si accartoccia. Con `false` ogni curva va tagliata e risaldata.
   */
  sideBend: boolean;
  /**
   * Fin dove un giunto fra due unità di taglio piega di lato **senza tagliare**, in gradi. Oltre,
   * lì la striscia si taglia e si ricollega. Per una striscia che segue le curve (`sideBend`) non
   * si usa: non si taglia mai per piegare.
   */
  cutBendDeg: number;
  /** `false`: misure di catalogo, ancora da confermare col calibro. */
  measured: boolean;
  notes: string;
}

/**
 * Aria fra la striscia e le pareti del canale: `CHANNEL_W = STRIP_W + CHANNEL_CLEARANCE`.
 * Vale per ogni profilo, e l'interfaccia la usa per far seguire il canale alla striscia.
 */
export const CHANNEL_CLEARANCE = 0.4;

/**
 * Aria fra la faccia dei LED e il diffusore: `CHANNEL_DEPTH = STRIP_T + LED_AIR`. È la sigma della
 * gaussiana in anteprima: più ce n'è, più la luce dei singoli LED si fonde.
 */
export const LED_AIR = 6;

/**
 * Piega di lato di un giunto senza tagliare, per una striscia rigida o dal giunto corto: è la
 * flessione che il circuito regge da sé. Vale per le strisce con guaina (IP65) e per le 144 LED/m,
 * dove fra un LED e l'altro restano pochi millimetri.
 */
export const CUT_BEND_STIFF_DEG = 10;

/**
 * Piega di lato di un giunto della WS2812B senza guaina a 60 o 30 LED/m: il circuito si increspa
 * sulle piazzole di rame e ruota. Provato da Davide il 15 novembre 2026 su una 60 LED/m da 10 mm:
 * 90° in quattro giunti, sul tavolo. Da confermare dentro un canale stampato.
 */
export const CUT_BEND_FLEX_DEG = 30;

/** Minuti di montaggio per ogni taglio in curva: tagliare, orientare il pezzo, risaldare tre piazzole. */
export const ASSEMBLY_MIN_PER_CUT = 10;

/**
 * Famiglia WS2812B classica su circuito flessibile: 10 mm di larghezza, 2 mm di spessore, un LED
 * per unità di taglio. **Non piega di lato**, ma si taglia a ogni LED: in curva diventa una catena
 * di pezzetti dritti lunghi un'unità di taglio, ricollegati fra loro. Non c'è quindi un limite di
 * piega della striscia: ogni taglio costa tempo di montaggio (`ASSEMBLY_MIN_PER_CUT`). Misure di
 * catalogo (SK6812/WS2812B 5050, 10 mm), da confermare col calibro.
 */
/**
 * WS2812B su circuito flessibile. `width` è la larghezza del circuito: 10 mm è la striscia comune
 * (LED 5050), quelle strette da 8, 5 e 4 mm (LED 5050 o 3535) entrano in tratti più vicini.
 */
function ws2812b(ledPerM: number, ip: 'IP20' | 'IP65', thickness: number, width = 10.0): StripProfile {
  const narrow = width < 10;
  return {
    id: `ws2812b-${ledPerM}${ip === 'IP65' ? '-ip65' : ''}${narrow ? `-${width}mm` : ''}`,
    name: `WS2812B ${ledPerM} LED/m ${narrow ? `${width} mm` : ip}`,
    STRIP_W: width,
    STRIP_T: thickness,
    CHANNEL_W: Math.round((width + CHANNEL_CLEARANCE) * 100) / 100,
    // La «cerniera» qui è il taglio: un pezzo dritto per unità di taglio, e fra due pezzi l'angolo
    // che serve. 90° è il limite geometrico di due pezzi accostati nel canale, non della striscia.
    HINGE_PITCH: Math.round((1000 / ledPerM) * 100) / 100,
    HINGE_MAX_DEG: 90,
    CUT_PITCH: Math.round((1000 / ledPerM) * 100) / 100,
    LED_PER_M: ledPerM,
    sideBend: false,
    cutBendDeg: ip === 'IP20' && ledPerM <= 60 ? CUT_BEND_FLEX_DEG : CUT_BEND_STIFF_DEG,
    measured: false,
    notes: 'Misure di catalogo. Piega di lato sulle piazzole fino a un certo angolo per giunto: oltre si taglia e si ricollega.',
  };
}

export const WS2812B_30: StripProfile = Object.freeze(ws2812b(30, 'IP20', 2.0));
export const WS2812B_60: StripProfile = Object.freeze(ws2812b(60, 'IP20', 2.0));
export const WS2812B_144: StripProfile = Object.freeze(ws2812b(144, 'IP20', 2.0));
export const WS2812B_60_IP65: StripProfile = Object.freeze(ws2812b(60, 'IP65', 2.2));
/** Strisce strette, 60 LED/m: 8 e 5 mm con LED 5050, 4 mm con LED 3535 (più basso). */
export const WS2812B_60_8MM: StripProfile = Object.freeze(ws2812b(60, 'IP20', 2.0, 8.0));
export const WS2812B_60_5MM: StripProfile = Object.freeze(ws2812b(60, 'IP20', 2.0, 5.0));
export const WS2812B_60_4MM: StripProfile = Object.freeze(ws2812b(60, 'IP20', 1.8, 4.0));
/** Stretta e fitta: pezzi da 7 mm, entra nei riccioli dei corsivi. Tanti tagli in curva. */
export const WS2812B_144_5MM: StripProfile = Object.freeze(ws2812b(144, 'IP20', 2.0, 5.0));

/** TOPAI WS2812B COB 5 mm, 160 LED/m (SPEC §2). */
export const COB_5MM: StripProfile = Object.freeze({
  id: 'cob-5mm',
  name: 'TOPAI WS2812B COB 5 mm',
  STRIP_W: 5.0,
  STRIP_T: 2.0,
  CHANNEL_W: 5.4,
  HINGE_PITCH: 10.0,
  HINGE_MAX_DEG: 40,
  CUT_PITCH: 10.0,
  LED_PER_M: 160,
  // Intagli sui bordi ogni ~1 cm: sul pezzo B del bend test segue fino a 45°, 40° è il margine.
  sideBend: true,
  cutBendDeg: 0,
  measured: true,
  notes: 'Misurata sul campione stampato: segue le curve fino a 45°, al 90° va tagliata.',
});

export const STRIP_PROFILES: readonly StripProfile[] = Object.freeze([
  WS2812B_60,
  WS2812B_60_8MM,
  WS2812B_60_5MM,
  WS2812B_60_4MM,
  WS2812B_144_5MM,
  WS2812B_30,
  WS2812B_144,
  WS2812B_60_IP65,
  COB_5MM,
]);

/**
 * La striscia più comune e più economica. **Non piega di lato**: in curva va tagliata e ricollegata,
 * e la distinta conta i tagli e il tempo di montaggio. Chi vuole meno saldature sceglie la COB.
 */
export const DEFAULT_STRIP: StripProfile = WS2812B_60;

export function stripProfileOf(id: string | undefined): StripProfile {
  return STRIP_PROFILES.find((profile) => profile.id === id) ?? DEFAULT_STRIP;
}

export interface Params {
  // Hardware (SPEC §2): copiati dal profilo striscia
  STRIP_W: number;
  /** DA MISURARE */
  STRIP_T: number;
  /**
   * Campione di piegatura, pezzo D: lunghezza della transizione lineare dell'inclinazione
   * prima e dopo ogni arco. Non entra ancora nella pipeline dell'insegna.
   */
  BANK_TRANSITION_L: number;
  HINGE_PITCH: number;
  /** Angolo massimo per cerniera. La striscia segue fino a 45°; 40° è il margine. */
  HINGE_MAX_DEG: number;
  CUT_PITCH: number;
  LED_PER_M: number;
  /** Corrente di un LED a bianco pieno a 5 V, mA. Serve alla stima dell'alimentatore. */
  LED_MAX_MA: number;
  /**
   * Tensione della striscia, V: 5, 12 o 24 (`STRIP_VOLTAGES`). A parità di potenza per LED
   * la corrente scala come 5 / STRIP_V.
   */
  STRIP_V: number;
  /** Controller WLED, id di `CONTROLLERS`. Cambia solo i limiti della distinta. */
  CONTROLLER_ID: string;
  /** Modello di striscia scelto: un id di STRIP_PROFILES. Detta le misure, salvo override espliciti. */
  STRIP_ID: string;
  /** Scatola dell'elettronica: 'auto' (la più piccola che basta), 'none' o l'id di `BOXES`. */
  BOX_ID: string;

  // Geometria (SPEC §3)
  CHANNEL_W: number;
  CHANNEL_DEPTH: number;
  WALL: number;
  /** Sotto questo spessore la parete interna non si assottiglia: la freccia in più genera un avviso. */
  WALL_MIN: number;
  /** Aria fra due sagome che non si toccano. Sotto, i tratti non contigui si fondono. */
  MIN_GAP: number;
  FLOOR: number;
  ANCHOR_HOLE_D: number;
  ANCHOR_HOLE_DEPTH: number;
  ANCHOR_SPACING: number;
  ANCHOR_MIN_PER_SEGMENT: number;
  ANCHOR_BOSS: boolean;
  ANCHOR_BOSS_D: number;
  ANCHOR_BOSS_H: number;
  /** Asola fili: larghezza, di default uguale al canale */
  WIRE_SLOT_W: number;
  /** Asola fili: ultimi mm dello spezzone, a filo della terminazione arrotondata */
  WIRE_SLOT_L: number;
  /** Smusso a 45° sul labbro interno dell'asola, lato spezzone, dove la striscia scende */
  SLOT_LIP_CHAMFER: number;
  CABLE_HOLE_D: number;
  CROSSING_GAP: number;
  DIFFUSER_T: number;
  DIFFUSER_CLEARANCE: number;
  EDGE_PROFILE: EdgeProfile;
  /** Altezza verticale dello smusso; ≤ CHANNEL_DEPTH */
  CHAMFER_SIZE: number;
  /** Angolo dello smusso rispetto all'orizzontale, in gradi */
  CHAMFER_ANGLE: number;
  /** Altezza delle fette dello smusso a gradini (= altezza layer di stampa) */
  LAYER_STEP: number;
  /** Derivato: 2·R_MIN, diametro della piega più stretta. `resolveParams` lo ricalcola. */
  MIN_LETTER_H: number | null;
  /** Spigoli di font o scheletro: avviso, oppure taglio dello spezzone. */
  CUSP_MODE: CuspMode;
  /** Sotto questa distanza le asole DIN/DOUT vicine diventano una tasca d'angolo. */
  CORNER_MERGE_DIST: number;
  /** Puntini e anelli sotto R_MIN. */
  I_DOT_MODE: IDotMode;
  /** Foro passante sotto ciascuna piazzola del puntino, al posto delle asole. */
  DOT_WIRE_HOLE_D: number;
  /** Di quanto la pillola, parete compresa, può uscire dall'ingombro del puntino. */
  DOT_OVERHANG_MM: number;
  /** Sotto questa frazione di linea centrale illuminata, la lettera avvisa. */
  COVERAGE_MIN: number;
  /** Piatto di stampa, mm: oltre, housing e diffusore si dividono in pezzi (SPEC §14). */
  BED_W: number;
  BED_H: number;
}

export const DEFAULT_PARAMS: Readonly<Params> = Object.freeze({
  STRIP_W: DEFAULT_STRIP.STRIP_W,
  STRIP_T: DEFAULT_STRIP.STRIP_T,
  BANK_TRANSITION_L: 25,
  HINGE_PITCH: DEFAULT_STRIP.HINGE_PITCH,
  HINGE_MAX_DEG: DEFAULT_STRIP.HINGE_MAX_DEG,
  CUT_PITCH: DEFAULT_STRIP.CUT_PITCH,
  LED_PER_M: DEFAULT_STRIP.LED_PER_M,
  LED_MAX_MA: 60,
  STRIP_V: 5,
  CONTROLLER_ID: 'gl-c-309wl',
  STRIP_ID: DEFAULT_STRIP.id,
  BOX_ID: 'auto',

  CHANNEL_W: DEFAULT_STRIP.CHANNEL_W,
  /** Spessore della striscia più LED_AIR: l'aria fra i LED e il diffusore. */
  CHANNEL_DEPTH: DEFAULT_STRIP.STRIP_T + LED_AIR,
  WALL: 2.2,
  WALL_MIN: 1.2,
  MIN_GAP: 1.0,
  FLOOR: 4.0,
  ANCHOR_HOLE_D: 3.2,
  ANCHOR_HOLE_DEPTH: 3.0,
  ANCHOR_SPACING: 70,
  ANCHOR_MIN_PER_SEGMENT: 2,
  ANCHOR_BOSS: false,
  ANCHOR_BOSS_D: 8,
  ANCHOR_BOSS_H: 6,
  WIRE_SLOT_W: DEFAULT_STRIP.CHANNEL_W,
  WIRE_SLOT_L: 6.0,
  SLOT_LIP_CHAMFER: 1.0,
  CABLE_HOLE_D: 6.0,
  CROSSING_GAP: 3.0,
  DIFFUSER_T: 1.2,
  DIFFUSER_CLEARANCE: 0.15,
  EDGE_PROFILE: 'square',
  CHAMFER_SIZE: 1.5,
  CHAMFER_ANGLE: 45,
  LAYER_STEP: 0.2,
  MIN_LETTER_H: minLetterH(DEFAULT_STRIP),
  CUSP_MODE: 'split',
  CORNER_MERGE_DIST: 4,
  I_DOT_MODE: 'dot',
  DOT_WIRE_HOLE_D: 2.5,
  DOT_OVERHANG_MM: 1.5,
  COVERAGE_MIN: 0.85,
  // Bambu Lab H2D: piatto da 350 × 320 mm.
  BED_W: 350,
  BED_H: 320,
});

/** Applica gli override di `order.params` ai default e ricalcola MIN_LETTER_H dal profilo. */
export function resolveParams(overrides: Partial<Params> = {}): Params {
  // Il modello di striscia detta le sue misure; un valore scritto a mano nell'ordine vince lo stesso.
  const profile = overrides.STRIP_ID === undefined ? null : stripProfileOf(overrides.STRIP_ID);
  const base: Params =
    profile === null || profile.id === DEFAULT_STRIP.id
      ? DEFAULT_PARAMS
      : {
          ...DEFAULT_PARAMS,
          STRIP_ID: profile.id,
          STRIP_W: profile.STRIP_W,
          STRIP_T: profile.STRIP_T,
          CHANNEL_W: profile.CHANNEL_W,
          CHANNEL_DEPTH: profile.STRIP_T + LED_AIR,
          WIRE_SLOT_W: profile.CHANNEL_W,
          HINGE_PITCH: profile.HINGE_PITCH,
          HINGE_MAX_DEG: profile.HINGE_MAX_DEG,
          CUT_PITCH: profile.CUT_PITCH,
          LED_PER_M: profile.LED_PER_M,
        };
  const merged = { ...base, ...overrides };
  merged.MIN_LETTER_H = minLetterH(merged);
  return merged;
}

/** Raggio minimo di piega: R_MIN = HINGE_PITCH / (2·sin(HINGE_MAX_DEG/2)). */
export function rMin(p: Pick<StripProfile, 'HINGE_PITCH' | 'HINGE_MAX_DEG'>): number {
  const halfRad = (p.HINGE_MAX_DEG * Math.PI) / 360;
  return p.HINGE_PITCH / (2 * Math.sin(halfRad));
}

/** Altezza minima di lettera derivata dal profilo: diametro della piega più stretta. */
export function minLetterH(p: Pick<StripProfile, 'HINGE_PITCH' | 'HINGE_MAX_DEG'>): number {
  return 2 * rMin(p);
}

/**
 * La striscia ci sta nel canale? Avvisi in italiano come gli altri del generatore: un canale più
 * stretto o meno profondo della striscia descrive un pezzo che non si può montare.
 */
export function stripFitWarnings(p: Pick<Params, 'STRIP_W' | 'STRIP_T' | 'CHANNEL_W' | 'CHANNEL_DEPTH'>): string[] {
  const out: string[] = [];
  if (p.CHANNEL_W < p.STRIP_W) {
    out.push(`Canale largo ${p.CHANNEL_W} mm: la striscia da ${p.STRIP_W} mm non ci entra.`);
  }
  if (p.CHANNEL_DEPTH < p.STRIP_T) {
    out.push(`Canale profondo ${p.CHANNEL_DEPTH} mm: la striscia è spessa ${p.STRIP_T} mm.`);
  }
  return out;
}

/** Altezza totale del corpo: FLOOR + CHANNEL_DEPTH. */
export function totalHeight(p: Pick<Params, 'FLOOR' | 'CHANNEL_DEPTH'>): number {
  return p.FLOOR + p.CHANNEL_DEPTH;
}
