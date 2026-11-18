// Texts of the customer page (SPEC §12.2): as little as possible, in short English. Icons, numbers and
// units (mm, cm, V, A, LED/m) do the rest. The labels of the bend-test page stay in Italian.
// Generator warnings are in English but technical (they serve whoever produces): `customerMessage`
// reduces them to a few sentences for the customer and discards everything else.

export const S = {
  pageTitle: 'Ciao, a WYSIWYG Sign Configurator',
  /** Top left on the preview: name, version and author, invitation to contribute. */
  brand: {
    /** Short name: phone. Long name: desktop, browser tab, link previews. */
    name: 'Ciao Configurator',
    longName: 'Ciao, a WYSIWYG Sign Configurator',
    byline: 'v 0.2 designed by Davide Gomba',
    contribute: 'Contribute to this project on GitHub',
    repo: 'https://github.com/lampados/sign-configurator',
  },
  /** Link to the parts page: the open list of strips, controllers, power supplies and boxes. */
  parts: {
    url: 'parts.html',
    priceLead: 'Prices come from the open',
    techLead: 'Strips, controllers, power supplies and boxes are in the open',
    link: 'parts list',
    tail: 'Know a better part or price? Add it there.',
  },
  /** Credit to WLED, the firmware of the controllers. Ciao is a separate project: say both. */
  wled: {
    url: 'https://kno.wled.ge/',
    name: 'WLED',
    brandLead: 'Lights run on',
    noteLead: 'The controller runs',
    note: 'the open-source LED firmware: colours and effects are set from your phone. Ciao is an independent project, not affiliated with or endorsed by WLED.',
  },
  /** Line-by-line price in the Order panel (SPEC §12.5): every line is an `id` of `priceOrder`. */
  price: {
    title: 'Price',
    lines: {
      controller: 'Controller',
      strip: (metres: string) => `LED strip · ${metres} m`,
      print: '3D printing',
      segments: (minutes: number) => `Assembly · ${minutes} min`,
      joints: 'Soldering',
      supply: 'Power supply',
      box: 'Box',
      plate: 'Backdrop',
      margin: (percent: number) => `Margin ${percent} %`,
      rounding: 'Rounding',
      minimum: 'Minimum order',
    },
    total: 'Total, excl. VAT',
    totalNoStrip: 'Total without the strip, excl. VAT',
    shipping: 'Shipping (estimate)',
    toQuote: 'to be quoted',
    note: 'This is only an estimate. We confirm the price, with shipping, within 24 hours of your request.',
    /** Labels without quantity, for the estimate that goes to the shop: the quantity is in the detail. */
    plain: { strip: 'LED strip', segments: 'Assembly', margin: 'Margin' },
    detail: {
      strip: (name: string, metres: string) => `${name} · ${metres} m`,
      print: (parts: number) => (parts > 1 ? `${parts} parts` : 'One piece'),
      margin: (percent: number) => `${percent} %`,
    },
    eur: (amount: number) => `€${Number.isInteger(amount) ? amount : amount.toFixed(2)}`,
  },
  /** Invitation to offer a coffee: under the name and, in the Order panel, under "Download STL". */
  support: {
    brand: '☕ Offer me a coffee',
    lead: 'Printing it yourself?',
    link: 'Offer me a coffee',
    /** The three sizes are chosen on the donation page: here they are only named. */
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
  /** Guided tour: it starts at the first visit and from the "?" button. Colour is not in it: it is only aesthetics. */
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
  color: {
    free: 'Custom',
    effectAria: 'Effect',
    fixed: 'Solid',
    rainbow: 'Rainbow',
    /** Names as in WLED, so the customer finds the same effect on the controller. */
    breathe: 'Breathe',
    chase: 'Chase',
    twinkle: 'Twinkle',
    effectNote: 'A preview of the effects. The sign plays them, and many more, with any colour.',
  },
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
    /** Pill: model, voltage and nominal current. */
    pill: (model: string, volts: number, amps: number) => `${model} · ${volts} V · ${amps} A`,
    /** No catalogue model is enough: only what is needed. */
    bare: (volts: number, amps: number) => `${volts} V · ${amps} A`,
    title: (model: string, needA: number, volts: number) =>
      `Power supply: ${model}. The sign needs ${needA} A at ${volts} V (25 % margin). See all parts.`,
    none: (needA: number, volts: number) => `No listed power supply gives ${needA} A at ${volts} V. See all parts.`,
    value: (model: string, volts: number, amps: number, needA: number) => `${model} · ${volts} V ${amps} A (needs ${needA} A)`,
  },
  order: {
    send: 'Send request',
    sending: 'Sending…',
    /** Under the button: what happens next, and where the data ends up. */
    next: 'You will enter your contact and shipping details on our shop. We reply with the final price.',
    failed: 'Could not send the design. Check your connection and try again.',
    notFound: 'This design link has expired or is wrong.',
    download: 'Download STL',
    downloadParts: (parts: number) => `Download STL · ${parts} parts (.zip)`,
    blockedFallback: 'Fix the design before sending.',
    /** Row under the buttons: everyone's totals, not those of the viewer. */
    stats: {
      downloads: (n: number) => `${n} downloads`,
      requests: (n: number) => `${n} requests`,
      suffix: 'so far',
    },
  },
  status: {
    leds: (n: number) => `${n} LED`,
    noLeds: 'No LEDs',
    /** The × on the note next to the LED count. */
    dismiss: 'Hide this note',
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
    /** A joint falls on a channel: there the strip must be cut and resoldered. */
    printJoins: (joins: number) => `${joins} join${joins === 1 ? '' : 's'} across a lit channel`,
    assembly: 'Assembly',
    /** Cuts on bends and assembly time: "31 strip cuts · 5 h 10 min". */
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

/** Generator warning → sentence for the customer, or null if it does not concern them. */
export function customerMessage(warning: string): string | null {
  const rules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/curve too tight/, () => 'Some curves are too tight for the LED strip: make the sign bigger or choose a strip with more LEDs per metre.'],
    [/under the cut pitch/, () => 'A stroke is too short for the LED strip: make the sign bigger or choose a strip with more LEDs per metre.'],
    [/^Outlines merging/, () => 'Some strokes are very close and share a channel. Where two strips cannot sit side by side, one is cut and bridged with a jumper: see Assembly. A bigger sign or a thinner strip avoids it.'],
    [/^Character .* missing from /, () => 'This font lacks some of these letters, so they were left out: pick another one under Font.'],
    [/^Low-resolution image/, () => 'Low-resolution image for this size: upload a larger one.'],
    [/^Channel \S+ mm wide/, () => 'The channel is narrower than the LED strip: widen it under Tech.'],
    [/^Channel \S+ mm deep/, () => 'The channel is shallower than the LED strip: deepen it under Tech.'],
    [/uneven stroke/, () => 'Uneven stroke: try the Outline trace.'],
    [/^Dot too small|^Dot not lit/, () => 'The dot is too small to light at this size.'],
    [/^Dash outside/, () => 'The dash does not fit inside the dot.'],
    [/^Box (\S+) too small/, (m) => `The ${m[1]} box is too small for the power supply and controller.`],
    [/^No box in the catalogue/, () => 'No listed box fits the power supply and controller.'],
    [/controller takes (\d+)–(\d+) V/, (m) => `This controller takes ${m[1]}–${m[2]} V strips: pick another one under Tech.`],
    [/over the (\d+) A of the/, (m) => `Over the controller's ${m[1]} A: needs power injection or a second controller.`],
    [/over the limit of (\d+) ICs/, (m) => `Over the controller's ${m[1]} LEDs: needs a second controller.`],
  ];
  for (const [pattern, phrase] of rules) {
    const match = warning.match(pattern);
    if (match) return phrase(match);
  }
  return null;
}

/** Simplified warnings, without duplicates; those the customer must not see disappear. */
export function customerMessages(warnings: readonly string[]): string[] {
  return [...new Set(warnings.map(customerMessage).filter((m): m is string => m !== null))];
}
