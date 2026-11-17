// Testi della pagina cliente (SPEC §12.2): il meno possibile, in inglese breve. Icone, numeri e
// unità (mm, cm, V, A, LED/m) fanno il resto. Admin, debug e bend test restano in italiano.
// Gli avvisi del generatore sono in italiano (servono all'admin): `customerMessage` li traduce in
// poche frasi per il cliente e scarta tutto il resto.

export const S = {
  pageTitle: 'Ciao, a WYSIWYG Sign Configurator',
  /** In alto a sinistra sull'anteprima: nome, versione e autore, invito a contribuire. */
  brand: {
    /** Nome corto: telefono. Nome lungo: desktop, scheda del browser, anteprime dei link. */
    name: 'Ciao Configurator',
    longName: 'Ciao, a WYSIWYG Sign Configurator',
    byline: 'v 0.2 designed by Davide Gomba',
    contribute: 'Contribute to this project on GitHub',
    repo: 'https://github.com/lampados/sign-configurator',
  },
  /** Invito a offrire un caffè: sotto il nome e, nel pannello Order, sotto «Download STL». */
  support: {
    brand: '☕ Offer me a coffee',
    lead: 'Printing it yourself?',
    link: 'Offer me a coffee',
    /** I tre tagli si scelgono sulla pagina delle offerte: qui sono solo nominati. */
    sizes: 'espresso, doppio or corretto.',
  },
  tools: {
    text: 'Text',
    font: 'Font',
    size: 'Size',
    color: 'Color',
    image: 'Image',
    plate: 'Backdrop',
    tech: 'Tech',
    more: 'More',
  },
  sections: {
    text: 'Text',
    font: 'Font',
    size: 'Size',
    color: 'Color',
    image: 'Image',
    plate: 'Backdrop',
    tech: 'Technical settings',
    more: 'More',
  },
  sheet: { configure: 'Configure', request: 'Order', done: 'Done', aria: 'Tools' },
  view: { aria: 'View', on: 'On', off: 'Off' },
  rotate: 'Rotate screen',
  /** Giro guidato: parte alla prima visita e dal tasto «?». Il colore non c'è: è solo estetica. */
  tour: {
    help: 'Help',
    aria: 'Guided tour',
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    done: 'Start',
    welcome: {
      title: 'Ciao!',
      body: 'This tool makes 3D light signs. Design yours here, then print it yourself or order it online.',
    },
    text: { title: 'Write', body: 'Type your word. The sign updates as you write.' },
    shape: { title: 'Font and size', body: 'Pick a handwriting and a letter height. The arrows on the preview show the real size.' },
    backdrop: { title: 'Backdrop', body: 'Add a plate behind the sign: clear or black acrylic, or wood. Or leave it bare.' },
    view: { title: 'Look at it', body: 'Switch it off, or remove the diffuser: what you see is what gets printed.' },
    order: { title: 'Get it', body: 'Send a request and we reply with the price within 24 hours, or download the STL files and print it yourself.' },
  },
  diffuser: { aria: 'Diffuser', on: 'Diffuser', off: 'No diffuser' },
  frame: { label: 'Wall thickness' },
  request: 'Order',
  generating: 'Building…',
  heightStepDown: 'Minus 10 mm',
  heightStepUp: 'Plus 10 mm',
  heightAria: 'Height in millimetres',
  textAria: 'Text',
  color: { free: 'Custom', effectAria: 'Effect', fixed: 'Solid', rainbow: 'Rainbow' },
  image: {
    upload: 'Upload an image',
    hint: 'SVG · PNG · JPG',
    trace: 'Trace',
    centerline: 'Centerline',
    outline: 'Outline',
    threshold: 'Threshold',
    invert: 'Invert',
    backToText: 'Back to text',
  },
  plate: {
    materialAria: 'Backdrop material',
    shapeAria: 'Backdrop shape',
    none: 'None',
    margin: 'Margin',
    corner: 'Corner radius',
    size: (w: string, h: string, holes: number) => `${w} × ${h} cm · ${holes} holes`,
  },
  tech: {
    note: 'These change the printed parts: preview, STL files and order.',
    reset: 'Reset',
    density: 'LED density',
    voltage: 'Strip voltage',
    profile: 'Edge profile',
    strip: 'LED strip',
    controller: 'Controller',
    box: 'Box',
    tooSmall: 'too small',
  },
  size: {
    letter: 'Letter height',
    overall: (size: string) => `Whole sign: ${size}`,
    parts: (parts: number) => `prints in ${parts} parts`,
    width: (mm: number) => `width ${mm} mm`,
    height: (mm: number) => `height ${mm} mm`,
  },
  more: {
    editPaths: 'Edit paths',
    doneEditing: 'Done editing',
    restorePaths: 'Restore original',
    share: 'Save or share',
    downloadDesign: 'Download design (.json)',
    loadDesign: 'Load a design',
    startOver: 'Start over',
    copied: 'Link copied. Opening it brings this design back.',
    copyPrompt: 'Copy this link:',
    tooBig: 'This design is too large for a link. Use “Download design”.',
    badLink: 'Could not open this link.',
    badFile: 'This file is not a design.',
    adjusted: 'Design opened. Some values were adjusted.',
    replace: 'Loading a design replaces your path edits. Continue?',
    startOverConfirm: 'Start over? The current design is cleared from this browser.',
  },
  plug: {
    label: 'Plug',
    aria: 'Power supply plug',
    title: (country: string) => `Power supply plug: ${country}. Universal input 100–240 V.`,
  },
  supply: {
    /** Pillola: modello, tensione e corrente nominale. */
    pill: (model: string, volts: number, amps: number) => `${model} · ${volts} V · ${amps} A`,
    /** Nessun modello del catalogo basta: solo quanto serve. */
    bare: (volts: number, amps: number) => `${volts} V · ${amps} A`,
    title: (model: string, needA: number, volts: number) =>
      `Power supply: ${model}. The sign needs ${needA} A at ${volts} V (25 % margin). See all parts.`,
    none: (needA: number, volts: number) => `No listed power supply gives ${needA} A at ${volts} V. See all parts.`,
    value: (model: string, volts: number, amps: number, needA: number) => `${model} · ${volts} V ${amps} A (needs ${needA} A)`,
  },
  order: {
    send: 'Send request',
    sending: 'Sending…',
    /** Sotto il pulsante: che cosa succede dopo, e dove finiscono i dati. */
    next: 'You will enter your contact and shipping details on our shop. We reply with the final price.',
    failed: 'Could not send the design. Check your connection and try again.',
    notFound: 'This design link has expired or is wrong.',
    download: 'Download STL',
    downloadParts: (parts: number) => `Download STL · ${parts} parts (.zip)`,
    blockedFallback: 'Fix the design before sending.',
    /** Riga sotto i pulsanti: i totali di tutti, non quelli di chi guarda. */
    stats: {
      downloads: (n: number) => `${n} downloads`,
      requests: (n: number) => `${n} requests`,
      suffix: 'so far',
    },
  },
  status: {
    leds: (n: number) => `${n} LED`,
    noLeds: 'No LEDs',
    needHeight: 'Enter a height.',
    needText: 'Enter a text and a height.',
    needImage: 'Upload an SVG, PNG or JPG file.',
    fileTooBig: 'File over 10 MB.',
    noInk: 'Nothing left at this threshold.',
    failed: 'Could not build this sign.',
    noLetters: 'This font has none of these letters: pick another one under Font.',
  },
  discard: 'Changing text, font or image discards your path edits. Continue?',
  editorBlocked: 'Fix or undo the marked paths.',
  summary: {
    image: 'Image',
    text: 'Text',
    font: 'Font',
    size: 'Size',
    letter: 'Letter height',
    print: 'Printing',
    printOne: 'One piece',
    printParts: (parts: number, bedW: number, bedH: number) => `${parts} parts for a ${bedW} × ${bedH} mm plate`,
    /** Un giunto cade su un canale: lì la striscia va tagliata e risaldata. */
    printJoins: (joins: number) => `${joins} join${joins === 1 ? '' : 's'} across a lit channel`,
    assembly: 'Assembly',
    /** Tagli in curva e tempo di montaggio: «31 strip cuts · 5 h 10 min». */
    assemblyValue: (cuts: number, minutes: number, jumpers = 0) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const time = h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
      const parts = [`${cuts} strip cut${cuts === 1 ? '' : 's'}`];
      if (jumpers > 0) parts.push(`${jumpers} jumper${jumpers === 1 ? '' : 's'}`);
      return `${parts.join(' · ')} · ${time}`;
    },
    assemblyNone: 'No strip cuts at bends',
    color: 'Color',
    effect: 'Effect',
    diffuser: 'Diffuser',
    yes: 'Yes',
    no: 'No',
    frame: 'Wall thickness',
    plate: 'Backdrop',
    plateValue: (shape: string, material: string, margin: number) => `${shape} · ${material} · ${margin} mm margin`,
    density: 'LED density',
    controller: 'Controller',
    plug: 'Plug',
    plugValue: (country: string) => `${country} · 100–240 V`,
    supply: 'Power supply',
    box: 'Box',
    boxValue: (name: string, inner: string, auto: boolean) => `${name} · ${inner} mm inside${auto ? ' (auto)' : ''}`,
    noBox: 'No box',
    warning: 'Warning',
    profile: 'Edge profile',
    voltage: 'Strip voltage',
  },
};

/** Avviso del generatore → frase per il cliente, oppure null se non lo riguarda. */
export function customerMessage(warning: string): string | null {
  const rules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/curva troppo stretta/, () => 'Some curves are too tight for the LED strip: make the sign bigger or choose a strip with more LEDs per metre.'],
    [/sotto il passo di taglio/, () => 'A stroke is too short for the LED strip: make the sign bigger or choose a strip with more LEDs per metre.'],
    [/^Sagome che si fondono/, () => 'Some strokes are very close and share a channel. Where two strips cannot sit side by side, one is cut and bridged with a jumper: see Assembly. A bigger sign or a thinner strip avoids it.'],
    [/^Carattere .* non presente in /, () => 'This font lacks some of these letters, so they were left out: pick another one under Font.'],
    [/bassa risoluzione/, () => 'Low-resolution image for this size: upload a larger one.'],
    [/^Canale largo/, () => 'The channel is narrower than the LED strip: widen it under Tech.'],
    [/^Canale profondo/, () => 'The channel is shallower than the LED strip: deepen it under Tech.'],
    [/tratto non uniforme/, () => 'Uneven stroke: try the Outline trace.'],
    [/^Puntino troppo piccolo|^Puntino non/, () => 'The dot is too small to light at this size.'],
    [/^Trattino fuori/, () => 'The dash does not fit inside the dot.'],
    [/^Scatola (\S+) troppo piccola/, (m) => `The ${m[1]} box is too small for the power supply and controller.`],
    [/^Nessuna scatola del catalogo/, () => 'No listed box fits the power supply and controller.'],
    [/oltre i (\d+) A del controller/, (m) => `Over the controller's ${m[1]} A: needs power injection or a second controller.`],
    [/oltre (?:gli|il limite di) (\d+) IC del controller/, (m) => `Over the controller's ${m[1]} LEDs: needs a second controller.`],
  ];
  for (const [pattern, phrase] of rules) {
    const match = warning.match(pattern);
    if (match) return phrase(match);
  }
  return null;
}

/** Avvisi tradotti, senza doppioni; quelli che il cliente non deve vedere spariscono. */
export function customerMessages(warnings: readonly string[]): string[] {
  return [...new Set(warnings.map(customerMessage).filter((m): m is string => m !== null))];
}
