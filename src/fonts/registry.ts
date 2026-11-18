// Extensible font registry (SPEC §4): to add one, the TTF in public/fonts and an entry here are enough.
// Measurements are in font units (font.unitsPerEm per em) and are taken once per font with
// measureFontMetrics (rasterize.ts) and measureTubes (tubes.ts); test/rasterize.test.ts checks that
// they match the TTF.

export interface TubeGeometry {
  /** Thickness of one line of the tube. */
  lineWidth: number;
  /** Inner gap of the tube, median: it varies a lot along the tube. */
  gap: number;
}

/**
 * centerline: the skeleton already is the line of the strip (Sacramento).
 * walls: every wall of the tube is a strip of its own (Neonderthaw). Pairing into
 * a median is disabled: small counters do not pair reliably.
 */
export type StripMode = 'centerline' | 'walls';

/** outline: TTF, pipeline [A]–[B]. stroke: single stroke, entering at [C]. */
export type FontKind = 'outline' | 'stroke';

/** Script of the font (SPEC §4ter): it decides the glyph that gives the height the customer asks for. */
export type FontScript = 'latin' | 'han' | 'japanese' | 'cyrillic' | 'devanagari';

export interface FontEntry {
  id: string;
  name: string;
  kind: FontKind;
  /** Path relative to `public/` */
  file: string;
  defaultTracking: number;
  /**
   * Top of `heightGlyph` above the baseline: it is the height the customer asks for.
   * The declared metrics (OS/2) are not used: on cursives they are unreliable.
   */
  capHeightMeasured: number;
  /** Top of the "x" glyph. */
  xHeightMeasured: number;
  /** Letters drawn as hollow tubes: the bitmap has two lines and the gap is not filled. */
  hollowTubes: boolean;
  /** Required with `hollowTubes`. */
  tube?: TubeGeometry;
  /** How the skeleton becomes the strip. See `StripMode`. */
  stripMode: StripMode;
  /** Script. Absent: Latin. */
  script?: FontScript;
  /**
   * Who lays out the glyphs. Absent: opentype.js, one glyph per character. `harfbuzz` for
   * scripts that fuse and reorder letters (Devanagari): see `src/fonts/shaper.ts`.
   */
  shaper?: 'harfbuzz';
  /**
   * Glyph that defines the height. Absent: "H" (fallback "I"). For Chinese and Japanese it is 永, the
   * reference character of CJK fonts: the "H" there is a service Latin glyph. For Hindi it is क:
   * its top is the horizontal line (shirorekha) from which all the letters hang.
   */
  heightGlyph?: string;
  /**
   * The file is downloaded only when the customer picks the font, and does not enter the preloading
   * of the page: CJK fonts weigh a few MB even as a subset.
   */
  lazy?: boolean;
  /** Text of the thumbnail when the Latin sample would say nothing about the font. */
  sample?: string;
  notes: string;
}

/** The glyph from which the height of the font is measured. */
export function heightGlyphOf(entry: Pick<FontEntry, 'heightGlyph'>): string {
  return entry.heightGlyph ?? 'H';
}

export const FONTS: readonly FontEntry[] = [
  {
    id: 'sacramento',
    name: 'Sacramento',
    kind: 'outline',
    file: 'fonts/Sacramento/Sacramento-Regular.ttf',
    defaultTracking: 0,
    capHeightMeasured: 1523,
    xHeightMeasured: 627,
    hollowTubes: false,
    stripMode: 'centerline',
    notes: 'SIL OFL. Tratto pieno, monolinea.',
  },
  {
    id: 'neonderthaw',
    name: 'Neonderthaw',
    kind: 'outline',
    file: 'fonts/Neonderthaw/Neonderthaw-Regular.ttf',
    defaultTracking: 0,
    capHeightMeasured: 789,
    xHeightMeasured: 391,
    hollowTubes: true,
    tube: { lineWidth: 19, gap: 41 },
    stripMode: 'walls',
    notes: 'SIL OFL. Tubi neon cavi: ogni parete è una striscia. L\'accoppiamento in mediana è disattivato.',
  },
  {
    id: 'hershey-script-simplex',
    name: 'Hershey Script Simplex',
    kind: 'stroke',
    file: 'fonts/HersheyScriptSimplex/HersheyScript1.svg',
    defaultTracking: 0,
    capHeightMeasured: 662,
    xHeightMeasured: 284,
    hollowTubes: false,
    stripMode: 'centerline',
    notes:
      'Hershey Script 1-stroke. Uso commerciale consentito con attribuzione (Hershey, National Bureau of Standards; formato di James Hurt). Vedi LICENSE.txt.',
  },
  {
    id: 'ems-allure',
    name: 'EMS Allure',
    kind: 'stroke',
    file: 'fonts/EMSAllure/EMSAllure.svg',
    defaultTracking: 0,
    capHeightMeasured: 699,
    xHeightMeasured: 346,
    hollowTubes: false,
    stripMode: 'centerline',
    notes: 'SIL OFL. Tratto singolo, derivato di Allura (nome riservato non usato). SVG di Sheldon B. Michaels e Windell H. Oskay.',
  },
  {
    id: 'beon',
    name: 'Beon',
    kind: 'outline',
    file: 'fonts/Beon/Beon-Regular.ttf',
    defaultTracking: 0,
    capHeightMeasured: 730,
    xHeightMeasured: 582,
    hollowTubes: false,
    stripMode: 'centerline',
    notes: 'SIL OFL, NoirBlancRouge. Stencil disegnato come un neon: le interruzioni sono volute, ogni tratto è uno spezzone. Tratto costante entro il 7 %.',
  },
  {
    id: 'pecita',
    name: 'Pecita',
    kind: 'outline',
    file: 'fonts/Pecita/Pecita.otf',
    defaultTracking: 0,
    capHeightMeasured: 550,
    xHeightMeasured: 320,
    hollowTubes: false,
    stripMode: 'centerline',
    notes: 'SIL OFL, Philippe Cochy. Corsivo a mano legato, tratto costante entro il 12 %. Il file pesa 860 KB (4760 glifi): il nome è riservato, quindi niente sottoinsieme.',
  },
  {
    id: 'compagnon-italic',
    name: 'Compagnon Italic',
    kind: 'outline',
    file: 'fonts/Compagnon/Compagnon-LightItalic.otf',
    defaultTracking: 0,
    capHeightMeasured: 590.3999938964844,
    xHeightMeasured: 442,
    hollowTubes: false,
    stripMode: 'centerline',
    notes: 'SIL OFL, Valentin Papon (EESAB Rennes). Corsivo da macchina da scrivere, peso Light, tratto costante entro il 14 %.',
  },
  {
    id: 'primer-print',
    name: 'Primer Print',
    kind: 'outline',
    file: 'fonts/PrimerPrint/PrimerPrint.otf',
    defaultTracking: 0,
    capHeightMeasured: 675,
    xHeightMeasured: 382,
    hollowTubes: false,
    stripMode: 'centerline',
    notes: 'CC0, Ray Larabie. Stampatello scolastico, tratto costante entro il 9 %.',
  },
  {
    id: 'wire-one',
    name: 'Wire One',
    kind: 'outline',
    file: 'fonts/WireOne/WireOne.ttf',
    defaultTracking: 0,
    capHeightMeasured: 1454,
    xHeightMeasured: 1044,
    hollowTubes: false,
    stripMode: 'centerline',
    notes: 'SIL OFL, Cyreal. Stretto e alto, tratto costante entro l\'8 %. Le lettere sono vicine: a misure piccole i canali si toccano.',
  },
  {
    id: 'comfortaa',
    name: 'Comfortaa',
    kind: 'outline',
    file: 'fonts/Comfortaa/Comfortaa-Light.ttf',
    defaultTracking: 0,
    capHeightMeasured: 781,
    xHeightMeasured: 547,
    hollowTubes: false,
    stripMode: 'centerline',
    script: 'cyrillic',
    sample: 'Привет',
    notes:
      'SIL OFL, Johan Aakerlund. Cirillico (russo, ucraino e gli altri alfabeti slavi) e latino con lo ' +
      'stesso disegno: geometrico, terminali tondi, peso Light, tratto costante entro il 12 %. Le ' +
      'maiuscole cirilliche sono alte quanto la "H", quindi l\'altezza si misura lì. File statico ' +
      'originale: il nome è riservato, niente sottoinsieme né istanza ricavata dal variabile.',
  },
  {
    id: 'noto-sans-sc',
    name: 'Noto Sans SC',
    kind: 'outline',
    file: 'fonts/NotoSansSC/NotoSansSC-Light.ttf',
    defaultTracking: 0,
    capHeightMeasured: 833,
    xHeightMeasured: 534,
    hollowTubes: false,
    stripMode: 'centerline',
    script: 'han',
    heightGlyph: '永',
    lazy: true,
    sample: '中文',
    notes:
      'SIL OFL. Cinese semplificato. Istanza statica Light: opentype.js ignora gli assi dei font ' +
      'variabili e leggerebbe il master Thin. Tratto costante entro il 9 %. Sottoinsieme GB 2312, ' +
      'vedi public/fonts/README.md.',
  },
  {
    id: 'mplus-rounded',
    name: 'M PLUS Rounded 1c',
    kind: 'outline',
    file: 'fonts/MPLUSRounded1c/MPLUSRounded1c-Light.ttf',
    defaultTracking: 0,
    capHeightMeasured: 811.375,
    xHeightMeasured: 520,
    hollowTubes: false,
    stripMode: 'centerline',
    script: 'japanese',
    heightGlyph: '永',
    lazy: true,
    sample: '日本語',
    notes:
      'SIL OFL. Giapponese, peso Light: terminali tondi e tratto costante entro il 10 %, cioè già ' +
      'la forma di un tubo. Sottoinsieme Shift-JIS, vedi public/fonts/README.md.',
  },
  {
    id: 'poppins',
    name: 'Poppins',
    kind: 'outline',
    file: 'fonts/Poppins/Poppins-Light.ttf',
    defaultTracking: 0,
    capHeightMeasured: 740,
    xHeightMeasured: 546,
    hollowTubes: false,
    stripMode: 'centerline',
    script: 'devanagari',
    shaper: 'harfbuzz',
    heightGlyph: 'क',
    sample: 'नमस्ते',
    notes:
      'SIL OFL, Indian Type Foundry. Hindi (devanagari) e latino con lo stesso disegno: geometrico, ' +
      'peso Light, tratto costante. Le lettere si fondono e si riordinano, quindi il testo passa da ' +
      'harfbuzz. L\'altezza è quella della linea orizzontale in alto, misurata su क: la "H" latina ' +
      'è più bassa del 6 %. File statico originale.',
  },
];

/**
 * Generator error when no letter of the text is in the chosen font. The customer page
 * recognizes it by this message and says to change font.
 */
export const NO_LETTERS = 'None of the letters in the text is in the font.';

export function getFont(id: string): FontEntry | undefined {
  return FONTS.find((f) => f.id === id);
}
