// All measurements in millimetres, angles in degrees (SPEC §1-§3).

export const GENERATOR_VERSION = '0.2.0';
export const ORDER_SCHEMA_VERSION = 4 as const;

/** Plate margin, mm (SPEC §13). The customer stays between min and max. */
export const PLATE_MARGIN = 20;
export const PLATE_MARGIN_MIN = 10;
export const PLATE_MARGIN_MAX = 60;
/** Corner radius of `rect`, mm (SPEC §13). */
export const PLATE_CORNER_R = 8;
export const PLATE_CORNER_R_MIN = 0;
export const PLATE_CORNER_R_MAX = 50;
/**
 * Usable bed of the laser, mm. `null` until measured: the constraint of §12.4 does not trigger.
 */
export const PLATE_MAX_W: number | null = null;
export const PLATE_MAX_H: number | null = null;
/** Fixing holes aligned with the anchors, mm. */
export const PLATE_FIX_HOLE_D = 3.4;
/** Wall mounting holes, mm. */
export const PLATE_MOUNT_HOLE_D = 5.0;
/** Distance of the mounting holes from the edge, mm. */
export const PLATE_MOUNT_INSET = 10;
/** Through holes under slots and cable. `false` leaves the plate closed (SPEC §13). */
export const PLATE_WIRE_HOLES = true;
/**
 * Diameter of the wire passages under slots and corner pockets, mm. Under a round hole
 * of the housing (`WIRE_HOLE_D`, `PATH_HOLE_D`) the backdrop has an equal hole instead, at the same point.
 */
export const PLATE_WIRE_HOLE_D = 6;
/** The backdrop also carries the small holes along the path. `false`: only those at the ends. */
export const PLATE_PATH_HOLES = true;
/** Minimum air between a mounting hole and the outline of the sign, mm. */
export const PLATE_MOUNT_CLEARANCE = 3;
/** Plate thickness per material, mm. Placeholder until the sheet is bought. */
export const PLATE_T = Object.freeze({ clear: 3, black: 3, wood: 4 });
/** Laser kerf per material, mm. `null` until measured (TO BE CALIBRATED). */
export const PLATE_KERF: Readonly<Record<keyof typeof PLATE_T, number | null>> = Object.freeze({
  clear: null,
  black: null,
  wood: null,
});

/** Strip voltages the configurator knows (SPEC §2). */
export const STRIP_VOLTAGES: readonly number[] = [5, 12, 24];

/** A WLED controller the configurator can size (SPEC §2, Controller). */
export interface ControllerSpec {
  id: string;
  brand: string;
  name: string;
  model: string;
  /** Input voltage, V DC: the same as the strip. */
  minV: number;
  maxV: number;
  /** Total continuous current through the board, A. */
  maxA: number;
  /** Maximum current at a specific voltage, when it is lower than `maxA` (V → A). */
  ampsAt?: Readonly<Record<number, number>>;
  /** LEDs (ICs) that can be driven at a decent frame rate. */
  maxIcs: number;
  outputs: number;
  /** L × W × H, mm; null if the maker does not give it. */
  sizeMm: [number, number, number] | null;
  /** Price of one piece, €, excluding VAT: it enters the price of the sign (SPEC §12.5). */
  priceEur: number;
  url: string;
  /** Note for the parts page. */
  note?: string;
}

/**
 * Available WLED controllers. The first is the standard one, mounted behind the sign.
 * GLEDOPTO Ultra Mini: from the resellers' sheets, 5–24 V, 10 A, 2 outputs, 800 ICs (the figure
 * "10 A per channel" does not agree with the declared 240 W: to be safe, 10 A in total); size
 * 40 × 40 × 20 mm.
 * GL-C-616WL: from the resellers' sheets, 15 A in total, 10 A per output, 2 outputs, Wi-Fi and
 * Ethernet; size and LED limit not published.
 * QuinLED: from the quinled.info pages. Seeed: from the wiki and the resellers' sheets, 3 A at 5 V and
 * 2 A at 12 V, size with the XIAO mounted.
 * Where the maker gives no LED limit: about 600 per output, the threshold WLED
 * suggests for a good frame rate. ICs are counted like LEDs.
 * Prices: one piece, excluding VAT, November 2026.
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
    sizeMm: [40, 40, 20],
    priceEur: 35,
    url: 'https://www.gledopto.com/',
    note: 'Small enough to hide behind the sign.',
  },
  {
    id: 'gl-c-616wl',
    brand: 'GLEDOPTO',
    name: 'GLEDOPTO ESP32 Ethernet',
    model: 'GL-C-616WL',
    minV: 5,
    maxV: 24,
    maxA: 15,
    maxIcs: 1200,
    outputs: 2,
    sizeMm: null,
    priceEur: 40,
    url: 'https://www.gledopto.com/',
    note: '10 A per output, 15 A total. Wi-Fi and Ethernet.',
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
    priceEur: 35,
    url: 'https://quinled.info/quinled-dig-uno-pre-assembled-v3-1-specifications/',
    note: 'Onboard fuse, screw terminals.',
  },
  {
    id: 'xiao-led-driver',
    brand: 'Seeed Studio',
    name: 'Seeed Studio XIAO LED Driver Board',
    model: 'LED Driver Board for XIAO + XIAO ESP32',
    minV: 5,
    maxV: 12,
    maxA: 3,
    ampsAt: { 12: 2 },
    maxIcs: 600,
    outputs: 1,
    sizeMm: [63, 30, 14.4],
    priceEur: 18,
    url: 'https://wiki.seeedstudio.com/led_driver_board/',
    note: 'Two boards: the driver and the XIAO ESP32 that plugs into it; you flash WLED. 3 A at 5 V, 2 A at 12 V. For small signs.',
  },
]);

/** The standard controller. */
export const CONTROLLER: ControllerSpec = CONTROLLERS[0]!;

/** Current the controller holds at the strip voltage, A. */
export function controllerAmps(c: ControllerSpec, volts: number): number {
  return c.ampsAt?.[volts] ?? c.maxA;
}

/** Controller by id; the standard one if the id is unknown. */
export function controllerOf(id: string | undefined): ControllerSpec {
  return CONTROLLERS.find((c) => c.id === id) ?? CONTROLLER;
}

/**
 * Public counter (SPEC §14): under the buttons of the Order panel a total appears only from here
 * up. Under the threshold nothing is shown.
 */
export const STATS_MIN_SHOWN = 10;

/** Customer page: offers the download of housing.stl and, if on, diffuser.stl (SPEC §5). */
export const CUSTOMER_STL_DOWNLOAD = true;

/** WooCommerce shop that receives the requests, and the generic product it attaches the design to. */
export interface Shop {
  url: string;
  productId: number;
}

/** Reads the shop from the two variables: null if one is missing or invalid. */
export function shopOf(url: string | undefined, productId: string | undefined): Shop | null {
  const id = Number((productId ?? '').trim());
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const parsed = new URL((url ?? '').trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return { url: `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`, productId: id };
  } catch {
    return null;
  }
}

// Outside Vite (Pages Functions) `import.meta.env` does not exist.
const BUILD_ENV = (import.meta.env ?? {}) as Record<string, string | undefined>;

/**
 * The shop is not written in the code: it comes from the build variables VITE_SHOP_URL and
 * VITE_SHOP_PRODUCT_ID (SPEC §15; on Cloudflare Pages: Settings → Variables and secrets; locally:
 * `.env.local`, see `.env.example`). "Send request" saves the design and takes the customer to the cart
 * of that shop, where they enter their details. Without the variables SHOP is null: the button does not
 * appear and the download stays. This way a fork does not send its customers to someone else's shop.
 */
export const SHOP: Shop | null = shopOf(BUILD_ENV.VITE_SHOP_URL, BUILD_ENV.VITE_SHOP_PRODUCT_ID);

/** Address of the cart with the design attached; null without a shop. */
export function shopCartUrl(code: string, shop: Shop | null = SHOP): string | null {
  if (!shop) return null;
  return `${shop.url}/?add-to-cart=${shop.productId}&design=${encodeURIComponent(code)}`;
}

/** Address of the page to support the project: http(s) only, otherwise null. */
export function supportOf(url: string | undefined): string | null {
  try {
    const parsed = new URL((url ?? '').trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Donation page (Ko-fi, Buy Me a Coffee, ...): it comes from the build variable
 * VITE_SUPPORT_URL, like the shop (SPEC §16). Without it, the two invitations do not appear: a fork does not
 * collect donations for someone else.
 */
export const SUPPORT_URL: string | null = supportOf(BUILD_ENV.VITE_SUPPORT_URL);

/** Maximum long side of an uploaded bitmap, before the threshold (SPEC §4bis). */
export const IMAGE_MAX_PX = 4096;

/** Tolerance of the segment → Bézier fit when the editor opens (SPEC §5bis). */
export const EDIT_FIT_TOL = 0.3;

/** Minimum distance between two consecutive nodes while dragging (SPEC §5bis). */
export const EDIT_MIN_NODE_DIST = 0.5;

/** Profile of the top edge of the wall (SPEC §3). */
export type EdgeProfile = 'square' | 'outer' | 'inner' | 'both';

/** warn: the cusp stays an error; split: the segment is cut at the cusp. */
export type CuspMode = 'warn' | 'split';

/** omit: the loop is excluded; dash: dash; dot: segment with holes; unlit: raised shape with no strip. */
export type IDotMode = 'omit' | 'dash' | 'dot' | 'unlit';

/**
 * Measurements of the LED strip. R_MIN and MIN_LETTER_H are not here: they are derived from the profile.
 * Strips are added to STRIP_PROFILES; DEFAULT_STRIP is the standard one.
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
   * The strip follows the curves of the sign by bending **sideways**, in its own plane. Only strips
   * made for it can: those with notches on the edges (COB) and S-shaped serpentine ones. A
   * normal strip on a flexible circuit cannot: the copper of the outer edge would have to stretch, and
   * crumples instead. With `false` every curve must be cut and resoldered.
   */
  sideBend: boolean;
  /**
   * How far a joint between two cut units bends sideways **without cutting**, in degrees. Beyond that,
   * the strip is cut there and reconnected. For a strip that follows curves (`sideBend`) it is not
   * used: it is never cut in order to bend.
   */
  cutBendDeg: number;
  /** `false`: catalogue measurements, still to be confirmed with the caliper. */
  measured: boolean;
  /** Price per metre, €, excluding VAT (5 m reel divided by 5). `null`: not yet surveyed. */
  eurPerM: number | null;
  notes: string;
}

/**
 * Air between the strip and the channel walls: `CHANNEL_W = STRIP_W + CHANNEL_CLEARANCE`.
 * It holds for every profile, and the interface uses it to make the channel follow the strip.
 */
export const CHANNEL_CLEARANCE = 0.4;

/**
 * Air between the face of the LEDs and the diffuser: `CHANNEL_DEPTH = STRIP_T + LED_AIR`. It is the sigma of the
 * gaussian in the preview: the more there is, the more the light of the single LEDs blends.
 */
export const LED_AIR = 6;

/**
 * Sideways bend of a joint without cutting, for a stiff strip or one with a short joint: it is the
 * flex the circuit holds by itself. It applies to sleeved strips (IP65).
 */
export const CUT_BEND_STIFF_DEG = 10;

/**
 * Sideways bend of a joint of the unsleeved WS2812B, at every density (144 included, by
 * Davide's choice: not yet tried): the circuit ripples
 * on the copper pads and rotates. Tried by Davide on 15 November 2026 on a 10 mm 60 LED/m strip:
 * 90° in four joints, on the table. To be confirmed inside a printed channel.
 */
export const CUT_BEND_FLEX_DEG = 30;

/** Assembly minutes for each of the first cuts: cut, orient the piece, resolder three pads. */
export const ASSEMBLY_MIN_PER_CUT = 10;
/** Cuts counted at the full time. After these the work is a routine and goes faster. */
export const ASSEMBLY_FULL_CUTS = 5;
/** Assembly minutes for every cut after the first `ASSEMBLY_FULL_CUTS`. */
export const ASSEMBLY_MIN_PER_EXTRA_CUT = 4;

/**
 * Assembly minutes for `cuts` cuts (cuts on bends and jumpers together): the first
 * `ASSEMBLY_FULL_CUTS` at `ASSEMBLY_MIN_PER_CUT`, the others at `ASSEMBLY_MIN_PER_EXTRA_CUT`.
 * Davide's choice of 18 November 2026: a flat 10 minutes per cut priced cursive signs out of the market.
 */
export function assemblyMinutes(cuts: number): number {
  const count = Math.max(0, Math.floor(cuts));
  const full = Math.min(count, ASSEMBLY_FULL_CUTS);
  return full * ASSEMBLY_MIN_PER_CUT + (count - full) * ASSEMBLY_MIN_PER_EXTRA_CUT;
}

/**
 * Classic WS2812B family on a flexible circuit: 10 mm wide, 2 mm thick, one LED
 * per cut unit. **It does not bend sideways**, but it can be cut at every LED: on a bend it becomes a chain
 * of short straight pieces one cut unit long, reconnected to each other. So there is no bend
 * limit of the strip: every cut costs assembly time (`assemblyMinutes`). Catalogue
 * measurements (SK6812/WS2812B 5050, 10 mm), to be confirmed with the caliper.
 */
/**
 * WS2812B on a flexible circuit. `width` is the width of the circuit: 10 mm is the common strip
 * (5050 LEDs), the narrow 8, 5 and 4 mm ones (5050 or 3535 LEDs) fit closer strokes.
 */
function ws2812b(ledPerM: number, ip: 'IP20' | 'IP65', thickness: number, width = 10.0): StripProfile {
  const narrow = width < 10;
  return {
    id: `ws2812b-${ledPerM}${ip === 'IP65' ? '-ip65' : ''}${narrow ? `-${width}mm` : ''}`,
    name: `WS2812B ${ledPerM} LED/m ${narrow ? `${width} mm` : ip}`,
    STRIP_W: width,
    STRIP_T: thickness,
    CHANNEL_W: Math.round((width + CHANNEL_CLEARANCE) * 100) / 100,
    // The "hinge" here is the cut: one straight piece per cut unit, and between two pieces the angle
    // that is needed. 90° is the geometric limit of two pieces side by side in the channel, not of the strip.
    HINGE_PITCH: Math.round((1000 / ledPerM) * 100) / 100,
    HINGE_MAX_DEG: 90,
    CUT_PITCH: Math.round((1000 / ledPerM) * 100) / 100,
    LED_PER_M: ledPerM,
    sideBend: false,
    // Unsleeved, it bends the same at every density: the 144 like the adhesive 60 (decided by Davide on 17 November 2026).
    cutBendDeg: ip === 'IP20' ? CUT_BEND_FLEX_DEG : CUT_BEND_STIFF_DEG,
    measured: false,
    eurPerM: null,
    notes: 'Misure di catalogo. Piega di lato sulle piazzole fino a un certo angolo per giunto: oltre si taglia e si ricollega.',
  };
}

export const WS2812B_30: StripProfile = Object.freeze(ws2812b(30, 'IP20', 2.0));
// 5 m reel at €25.98 excluding VAT (16 November 2026).
export const WS2812B_60: StripProfile = Object.freeze({ ...ws2812b(60, 'IP20', 2.0), eurPerM: 5.2 });
// €20 per metre, excluding VAT (17 November 2026).
export const WS2812B_144: StripProfile = Object.freeze({ ...ws2812b(144, 'IP20', 2.0), eurPerM: 20 });
export const WS2812B_60_IP65: StripProfile = Object.freeze(ws2812b(60, 'IP65', 2.2));
/** Narrow strips, 60 LED/m: 8 and 5 mm with 5050 LEDs, 4 mm with 3535 LEDs (lower). */
export const WS2812B_60_8MM: StripProfile = Object.freeze(ws2812b(60, 'IP20', 2.0, 8.0));
export const WS2812B_60_5MM: StripProfile = Object.freeze(ws2812b(60, 'IP20', 2.0, 5.0));
export const WS2812B_60_4MM: StripProfile = Object.freeze(ws2812b(60, 'IP20', 1.8, 4.0));
/** Narrow and dense: 7 mm pieces, it fits the curls of cursives. Many cuts on bends. */
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
  // Notches on the edges every ~1 cm: on part B of the bend test it follows up to 45°, 40° is the margin.
  sideBend: true,
  cutBendDeg: 0,
  measured: true,
  // 5 m reel at €25.69 excluding VAT (16 November 2026).
  eurPerM: 5.14,
  notes: 'Misurata sul campione stampato: segue le curve fino a 45°, al 90° va tagliata.',
});

export const STRIP_PROFILES: readonly StripProfile[] = Object.freeze([
  WS2812B_144,
  WS2812B_144_5MM,
  WS2812B_60,
  WS2812B_60_8MM,
  WS2812B_60_5MM,
  WS2812B_60_4MM,
  WS2812B_30,
  WS2812B_60_IP65,
  COB_5MM,
]);

/**
 * The strip Davide uses and offers by preference: WS2812B 144 LED/m, 10 mm wide (choice of
 * 17 November 2026). **It does not bend sideways**: on a bend it must be cut and reconnected, and the bill of materials counts
 * the cuts and the assembly time. Whoever wants fewer solder joints picks the COB.
 */
export const DEFAULT_STRIP: StripProfile = WS2812B_144;

export function stripProfileOf(id: string | undefined): StripProfile {
  return STRIP_PROFILES.find((profile) => profile.id === id) ?? DEFAULT_STRIP;
}

export interface Params {
  // Hardware (SPEC §2): copied from the strip profile
  STRIP_W: number;
  /** TO BE MEASURED */
  STRIP_T: number;
  /**
   * Bending sample, part D: length of the linear transition of the tilt
   * before and after every arc. It does not enter the sign pipeline yet.
   */
  BANK_TRANSITION_L: number;
  HINGE_PITCH: number;
  /** Maximum angle per hinge. The strip follows up to 45°; 40° is the margin. */
  HINGE_MAX_DEG: number;
  CUT_PITCH: number;
  LED_PER_M: number;
  /** Current of one LED at full white at 5 V, mA. Used for the power supply estimate. */
  LED_MAX_MA: number;
  /**
   * Strip voltage, V: 5, 12 or 24 (`STRIP_VOLTAGES`). For the same power per LED
   * the current scales as 5 / STRIP_V.
   */
  STRIP_V: number;
  /** WLED controller, id from `CONTROLLERS`. It only changes the limits of the bill of materials. */
  CONTROLLER_ID: string;
  /** Chosen strip model: an id from STRIP_PROFILES. It sets the measurements, unless explicitly overridden. */
  STRIP_ID: string;
  /** Electronics box: 'auto' (the smallest that is enough), 'none' or the id from `BOXES`. */
  BOX_ID: string;

  // Geometry (SPEC §3)
  CHANNEL_W: number;
  CHANNEL_DEPTH: number;
  WALL: number;
  /** Under this thickness the inner wall is not thinned: the extra sagitta produces a warning. */
  WALL_MIN: number;
  /** Air between two outlines that do not touch. Under it, non-adjacent strokes merge. */
  MIN_GAP: number;
  FLOOR: number;
  ANCHOR_HOLE_D: number;
  ANCHOR_HOLE_DEPTH: number;
  ANCHOR_SPACING: number;
  ANCHOR_MIN_PER_SEGMENT: number;
  ANCHOR_BOSS: boolean;
  ANCHOR_BOSS_D: number;
  ANCHOR_BOSS_H: number;
  /** Wire slot: width, by default equal to the channel */
  WIRE_SLOT_W: number;
  /** Wire slot: last mm of the segment, flush with the rounded end */
  WIRE_SLOT_L: number;
  /** 45° chamfer on the inner lip of the slot, segment side, where the strip goes down */
  SLOT_LIP_CHAMFER: number;
  /**
   * Round wire hole at each end of a segment, instead of the slot: diameter, mm. It sits
   * inside the channel (at most as wide as the channel), halfway along the last `WIRE_SLOT_L`, and does not
   * touch the foot of the walls: the part stays in one piece. 0: the rectangular slot of before.
   */
  WIRE_HOLE_D: number;
  /**
   * Small holes along the whole path, in the channel floor: diameter, mm. Where the strip is
   * cut on a curve, the wires go through the nearest hole. 0: none.
   */
  PATH_HOLE_D: number;
  /** Pitch of the holes along the path, mm: they are spread at equal distances, close to this. */
  PATH_HOLE_PITCH: number;
  CABLE_HOLE_D: number;
  CROSSING_GAP: number;
  DIFFUSER_T: number;
  DIFFUSER_CLEARANCE: number;
  /**
   * Width of the step the diffuser rests on, mm: the top `DIFFUSER_T` of the channel is this much wider
   * on every side, and the diffuser with it. 0: no step, the diffuser is held by friction alone.
   */
  DIFFUSER_LEDGE: number;
  EDGE_PROFILE: EdgeProfile;
  /** Vertical height of the chamfer; ≤ CHANNEL_DEPTH */
  CHAMFER_SIZE: number;
  /** Angle of the chamfer from the horizontal, in degrees */
  CHAMFER_ANGLE: number;
  /** Height of the slices of the stepped chamfer (= print layer height) */
  LAYER_STEP: number;
  /** Derived: 2·R_MIN, diameter of the tightest bend. `resolveParams` recomputes it. */
  MIN_LETTER_H: number | null;
  /** Cusps of font or skeleton: warning, or cutting the segment. */
  CUSP_MODE: CuspMode;
  /** Under this distance neighbouring DIN/DOUT slots become a corner pocket. */
  CORNER_MERGE_DIST: number;
  /** Dots and loops under R_MIN. */
  I_DOT_MODE: IDotMode;
  /** Through hole under each pad of the dot, instead of the slots. */
  DOT_WIRE_HOLE_D: number;
  /** How far the pill, wall included, may stick out of the footprint of the dot. */
  DOT_OVERHANG_MM: number;
  /** Under this fraction of lit centreline, the letter warns. */
  COVERAGE_MIN: number;
  /** Print bed, mm: beyond it, housing and diffuser are split into pieces (SPEC §14). */
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
  /** Strip thickness plus LED_AIR: the air between the LEDs and the diffuser. */
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
  WIRE_HOLE_D: 8.0,
  PATH_HOLE_D: 4.0,
  PATH_HOLE_PITCH: 12.0,
  CABLE_HOLE_D: 6.0,
  CROSSING_GAP: 3.0,
  DIFFUSER_T: 1.2,
  DIFFUSER_CLEARANCE: 0.15,
  DIFFUSER_LEDGE: 0,
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
  // Bambu Lab H2D: 350 × 320 mm bed.
  BED_W: 350,
  BED_H: 320,
});

/** Applies the overrides of `order.params` to the defaults and recomputes MIN_LETTER_H from the profile. */
export function resolveParams(overrides: Partial<Params> = {}): Params {
  // The strip model sets its measurements; a value typed by hand in the order wins all the same.
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

/** Minimum bend radius: R_MIN = HINGE_PITCH / (2·sin(HINGE_MAX_DEG/2)). */
export function rMin(p: Pick<StripProfile, 'HINGE_PITCH' | 'HINGE_MAX_DEG'>): number {
  const halfRad = (p.HINGE_MAX_DEG * Math.PI) / 360;
  return p.HINGE_PITCH / (2 * Math.sin(halfRad));
}

/** Minimum letter height derived from the profile: diameter of the tightest bend. */
export function minLetterH(p: Pick<StripProfile, 'HINGE_PITCH' | 'HINGE_MAX_DEG'>): number {
  return 2 * rMin(p);
}

/**
 * Does the strip fit in the channel? Warnings like the generator's others: a channel
 * narrower or shallower than the strip describes a part that cannot be assembled.
 */
export function stripFitWarnings(p: Pick<Params, 'STRIP_W' | 'STRIP_T' | 'CHANNEL_W' | 'CHANNEL_DEPTH'>): string[] {
  const out: string[] = [];
  if (p.CHANNEL_W < p.STRIP_W) {
    out.push(`Channel ${p.CHANNEL_W} mm wide: the ${p.STRIP_W} mm strip does not fit.`);
  }
  if (p.CHANNEL_DEPTH < p.STRIP_T) {
    out.push(`Channel ${p.CHANNEL_DEPTH} mm deep: the strip is ${p.STRIP_T} mm thick.`);
  }
  return out;
}

/** Total height of the body: FLOOR + CHANNEL_DEPTH. */
export function totalHeight(p: Pick<Params, 'FLOOR' | 'CHANNEL_DEPTH'>): number {
  return p.FLOOR + p.CHANNEL_DEPTH;
}
