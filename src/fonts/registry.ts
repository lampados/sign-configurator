// Registro estendibile dei font (SPEC §4): per aggiungerne uno basta il TTF in public/fonts e una voce qui.
// Le misure sono in unità del font (font.unitsPerEm per em) e si ricavano una volta per font con
// measureFontMetrics (rasterize.ts) e measureTubes (tubes.ts); test/rasterize.test.ts verifica che
// corrispondano al TTF.

export interface TubeGeometry {
  /** Spessore di una linea del tubo. */
  lineWidth: number;
  /** Luce interna del tubo, mediana: varia molto lungo il tubo. */
  gap: number;
}

/**
 * centerline: lo scheletro è già la linea della striscia (Sacramento).
 * walls: ogni parete del tubo è una striscia a sé (Neonderthaw). L'accoppiamento in
 * una mediana è disattivato: gli occhielli piccoli non si accoppiano in modo affidabile.
 */
export type StripMode = 'centerline' | 'walls';

/** outline: TTF, pipeline [A]–[B]. stroke: tratto singolo, si entra in [C]. */
export type FontKind = 'outline' | 'stroke';

/** Scrittura del font (SPEC §4ter): decide il glifo che dà l'altezza chiesta dal cliente. */
export type FontScript = 'latin' | 'han' | 'japanese' | 'cyrillic' | 'devanagari';

export interface FontEntry {
  id: string;
  name: string;
  kind: FontKind;
  /** Percorso relativo a `public/` */
  file: string;
  defaultTracking: number;
  /**
   * Sommità di `heightGlyph` sopra la linea di base: è l'altezza richiesta dal cliente.
   * Le metriche dichiarate (OS/2) non si usano: sui corsivi sono inaffidabili.
   */
  capHeightMeasured: number;
  /** Sommità del glifo "x". */
  xHeightMeasured: number;
  /** Lettere disegnate come tubi cavi: la bitmap ha due linee e la luce non si riempie. */
  hollowTubes: boolean;
  /** Obbligatorio con `hollowTubes`. */
  tube?: TubeGeometry;
  /** Come lo scheletro diventa la striscia. Vedi `StripMode`. */
  stripMode: StripMode;
  /** Scrittura. Assente: latina. */
  script?: FontScript;
  /**
   * Chi mette in fila i glifi. Assente: opentype.js, un glifo per carattere. `harfbuzz` per le
   * scritture che fondono e riordinano le lettere (devanagari): vedi `src/fonts/shaper.ts`.
   */
  shaper?: 'harfbuzz';
  /**
   * Glifo che definisce l'altezza. Assente: "H" (ripiego "I"). Per cinese e giapponese è 永, il
   * carattere di riferimento dei font CJK: la "H" lì è un glifo latino di servizio. Per l'hindi è क:
   * la sua sommità è la linea orizzontale (shirorekha) da cui pendono tutte le lettere.
   */
  heightGlyph?: string;
  /**
   * Il file si scarica solo quando il cliente sceglie il font, e non entra nel precaricamento
   * della pagina: i font CJK pesano qualche MB anche da sottoinsieme.
   */
  lazy?: boolean;
  /** Testo della miniatura quando il campione latino non direbbe nulla del font. */
  sample?: string;
  notes: string;
}

/** Il glifo da cui si misura l'altezza del font. */
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
 * Errore del generatore quando nessuna lettera del testo è nel font scelto. La pagina cliente lo
 * riconosce da questo messaggio e dice di cambiare font.
 */
export const NO_LETTERS = 'Nessuna lettera del testo è presente nel font.';

export function getFont(id: string): FontEntry | undefined {
  return FONTS.find((f) => f.id === id);
}
