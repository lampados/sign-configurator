## 4ter. Non-Latin scripts

Draft, to be pasted into `SPEC.md` after §4bis. For these four scripts it replaces the entry
"scripts not covered" of §12.8 (custom quote): Chinese, Japanese, Arabic and Hebrew enter
the configurator.

**Status**: Chinese and Japanese are **measured and integrated** (14 November 2026). **Cyrillic** has been
integrated since 17 November 2026: see "Cyrillic" below. **Hindi** (Devanagari) has been integrated since
18 November 2026, and is the first script that goes through harfbuzzjs: see "Hindi" below.

**Arabic and Hebrew are postponed.** Fonts are not enough: Arabic changes the shape of every letter
according to its position in the word, and in both scripts the visual order must be computed
(bidirectional algorithm). The shaping engine is already there, for Hindi (`src/fonts/shaper.ts`);
what is missing is right-to-left order and the rules on dots and vowel marks. It blocks nothing: until then those scripts stay with the
custom quote (§12.8). What follows about them is an outline, not yet a decision.

Phase 0, variation of the stroke width on the skeleton (limit 25 %):

| Font | Variation | Outcome |
|---|---|---|
| M PLUS Rounded 1c Light | 7–10 % | adopted for Japanese |
| Noto Sans SC Light | 6–9 % | adopted for Chinese |
| LXGW WenKai Light | 30–37 % | **rejected**: the brush modulates the stroke too much |
| Comfortaa Light | 6–11 % | adopted for Cyrillic |
| Poppins Light | within 25 % (test) | adopted for Hindi |
| Mukta ExtraLight | — | **rejected**: teardrop terminals, they leave hooks in the skeleton |

The files are subsets (GB 2312 and Shift-JIS) of about 2.5 MB each, instead of 18 and 27 MB: see
`public/fonts/README.md`. They must be **static instances**: opentype.js ignores the axes of variable
fonts and would read the wrong master.

### Fonts

One font per script, all SIL OFL, all `kind: "outline"`, `stripMode: "centerline"`,
`hollowTubes: false`. The **Light** weight is used: thin, constant stroke, the skeleton [B] is clean.

| Script | `id` | Font | Why | Fallback |
|---|---|---|---|---|
| Chinese (simplified) | `noto-sans-sc` | **Noto Sans SC** Light | uniform stroke, covers all everyday Chinese, pairs with M PLUS Rounded | — |
| Cyrillic | `comfortaa` | **Comfortaa** Light | geometric, round terminals, constant stroke; it also has Latin | Neucha (handwritten) |
| Hindi (Devanagari) | `poppins` | **Poppins** Light | geometric, constant stroke, clean terminals; it also has Latin | — |
| Japanese (kana + kanji) | `mplus-rounded` | **M PLUS Rounded 1c** Light | round terminals and constant stroke: it already is the shape of a tube | Klee One (pen) |
| Arabic | `playpen-arabic` | **Playpen Sans Arabic** Light | handwriting, monoline, it also has Latin | Lemonada |
| Hebrew | `playpen-hebrew` | **Playpen Sans Hebrew** Light | handwritten cursive, same family as the Arabic | Varela Round |

- The TTFs go in `public/fonts/` with their `OFL.txt`. Reserved names: the original file is
  distributed, without changes to the design.
- Playpen Sans is a variable font: a **static** Light **instance** (a file of its own) is used, not the `wght` axis
  read at runtime. Its shuffler of alternate glyphs stays **off**: every letter always has
  the same shape (determinism, §6).
- For Chinese the starting point was LXGW WenKai, which is brush writing and would have followed the spirit
  of the Latin cursives. Measurement rejected it: the stroke width varies by 30–37 %, beyond the
  25 % limit. The channel has a fixed width anyway, so the thin/thick of the brush would have been
  lost all the same.

### Registry (`src/fonts/registry.ts`)

New fields, with defaults that leave the four Latin fonts unchanged:

| Field | Default | Meaning |
|---|---|---|
| `script` | `"latin"` | `"latin"` \| `"han"` \| `"japanese"` \| `"cyrillic"` \| `"devanagari"` \| `"arabic"` \| `"hebrew"` |
| `direction` | `"ltr"` | `"ltr"` \| `"rtl"` |
| `shaper` | `"opentype"` | `"opentype"` (as today) \| `"harfbuzz"` |
| `heightGlyph` | `"H"` | glyph that defines the height the customer asks for |
| `lazy` | `false` | `true`: the file is downloaded only when the font is chosen |

### Cyrillic

It asks nothing new of the pipeline: it is written left to right, printed letters do not
join, one glyph per character. A font that has the glyphs is enough.

- **Font**: Comfortaa Light, original static file (125 KB, reserved name: no subset).
  It covers Russian, Ukrainian, Belarusian, Bulgarian, Serbian and Macedonian, plus all of Latin: "Ciao Привет"
  is a single sign in a single font.
- **Height**: it stays the "H". Cyrillic capitals (П) have the same top, checked in the tests.
- **Loading**: it is not `lazy`. The file is small, it is preloaded with the Latin ones and its thumbnail is
  drawn in the font itself, with the sample "Привет".
- **Already covered elsewhere**: M PLUS Rounded 1c, Noto Sans SC and Pecita have the Russian glyphs and
  draw them, but they are chosen for other scripts; the other Latin fonts do not have them.
- **Out**: joined Russian handwriting (letters connected as by hand) waits for the shaping engine,
  like Arabic.

### Hindi

It is written left to right, but letters do not sit one per box: consonants without a vowel
fuse into conjuncts (स + ् + त) and the vowel sign ि is drawn **before** the consonant that precedes it in the
text. `forEachGlyph` of opentype.js would give unjoined letters, a visible virama and the ि
in the wrong place.

- **Font**: Poppins Light, original static file (162 KB), with its Latin: "Ciao नमस्ते" is a
  single sign in a single font.
- **Shaping** (`src/fonts/shaper.ts`): `shaper: "harfbuzz"` in the registry. harfbuzzjs decides
  which glyphs to use and where (index, advance, offset, in font units); the contours are read
  from the same file with opentype.js, and from there [A] continues unchanged. The module (WASM, 440 KB) is
  loaded with a dynamic `import()` at the first request of a font that asks for it: the other fonts do not
  download it. It runs in the main thread, in the worker and in Node; it is deterministic.
- **Runs per script**: harfbuzz shapes one run with a single script. The line is split into
  Devanagari runs (script `Deva`, language `hi`) and others; spaces, digits, punctuation, ZWNJ and ZWJ
  stay in the current run.
- **Without a shaper** `rasterizeText` refuses with an error: unjoined letters would be
  a wrong sign that looks right.
- **Vowel sign without a consonant**: no dotted circle (`DO_NOT_INSERT_DOTTED_CIRCLE`).
- **Height**: `heightGlyph` क. Its top is the horizontal line above (shirorekha), from which
  the letters hang. Vowel signs above the line (े, ि, ी) rise by about another 35 %: the real
  footprint is that of the bbox. The Latin "H" of Poppins is 6 % lower.
- **Groups**: `glyphs[].char` is the text of the syllable ("स्ते"), on the leftmost glyph of the group;
  the coverage per letter (§5) becomes coverage per syllable.
- **Geometry**: the line above joins the whole word into one continuous stroke. Every stem that
  comes down from it is a T junction, hence many segments: "नमस्ते" has 11–13. Anusvara and nukta are
  small components and follow `I_DOT_MODE`.
- **Known limit**: where a vowel sign above the line meets it at a narrow angle (े) validation
  reports "outlines merging" with a minimum height that grows together with the height. It is a
  crossing, not two close strokes: the warning does not block, but the height suggested there is not reliable.
- **Loading**: it is not `lazy`; the thumbnail is drawn in the font itself ("नमस्ते"), shaped by the
  browser.

### Text shaping

- **Normalization**: the text of the order is NFC, in **logical order** (as it was typed).
  The visual order is computed by the pipeline, never the saved order.
- **Arabic**: letters change shape according to position (initial, medial, final, isolated) and
  join. `forEachGlyph` of opentype.js is not enough. With `shaper: "harfbuzz"` the line goes through
  **harfbuzzjs**, as Hindi already does: it returns glyphs, advances and offsets; the contours are
  then read from the same TTF.
- **Hebrew**: no joining, only right-to-left direction and final forms already in the text.
  Same `shaper`, to have a single RTL path.
- **Bidi**: a line can contain numbers or Latin words inside an RTL text. The visual order follows
  the Unicode bidirectional algorithm (levels from harfbuzz or from `bidi-js`). The base direction is that
  of the chosen font.
- **Chinese and Japanese**: `shaper: "opentype"`, one glyph per character, horizontal from left to
  right. Vertical writing: out of scope.
- **Missing character**: the rule of §5 [A] stays (warning with U+XXXX, character skipped). No automatic
  fallback font: a sign with two different fonts is not generated silently.

### Height

The height the customer asks for cannot be the top of the "H". `heightGlyph` per script:

| Script | `heightGlyph` | The height is |
|---|---|---|
| Chinese, Japanese | 永 | the height of the character box (from the lowest to the highest point) |
| Hindi | क | from the baseline to the top of the horizontal line above |
| Arabic | ا (isolated alef) | from the baseline to the top of the alef |
| Hebrew | ה | from the baseline to the top of the letter |

`capHeightMeasured` holds that measurement; `xHeightMeasured` can be `null`. The real footprint
(Arabic descenders, the Hebrew lamed that rises) stays that of the bbox, already shown to the customer.

### Geometry: what changes

- **Chinese and Japanese**: a character is made of many separate strokes, often straight and with sharp
  cusps. Every stroke is a segment, with its two slots: 永 is about 5 segments, a dense character
  has 15–20. Consequences, all already foreseen by the pipeline but with much higher numbers:
  - the minimum height is set by the distance between strokes (`CHANNEL_W + 2·WALL + MIN_GAP`), not by the
    curves: a minimum of 250–400 mm is expected for dense characters;
  - `COVERAGE_MIN` (0.85) is easily violated: slots and cut leftovers weigh on short strokes;
  - solder joints, segments and price (§12.5) grow with the number of strokes; the controller limits
    (§2) are reached sooner.
  An understandable constraint is added (§12.4): "This character needs at least N cm".
- **Arabic dots** (nuqta) and **the dot of the yod / inner Hebrew dots**: they are small disconnected
  components, like the dot of the *i*. They follow `I_DOT_MODE` without a new case. In Arabic, however, dots
  distinguish letters (ب ت ث): `"omit"` is **forbidden** for `script: "arabic"`; if a dot is not
  lit it becomes `"unlit"` (raised shape), it never disappears.
- **Vowels and marks** (Arabic harakat, Hebrew niqqud): in v1 they are removed from the text before [A], with a
  warning to the customer. Shadda and hamza stay: they are part of the letter.
- **Joined Arabic**: the baseline that joins the letters is a continuous stroke, as in Sacramento.
  Letters that do not join to the left (ا د ذ ر ز و) break the word: they are separate segments.
- **Direction of the segments** (DIN → DOUT): it stays "smaller x, then smaller y" for RTL too. Direction is a
  matter of wiring, not of reading.
- **DXF from the back**: no change; the mirror in X holds as for Latin.

### Loading

CJK fonts weigh a few MB each (M PLUS Rounded 1c about 3 MB per weight; LXGW WenKai more: to be
measured). With `lazy: true`:

- the file is downloaded when the font is chosen, with a progress indicator; the page stays on "Ciao"
  until it is ready;
- it does not enter preloading or the thumbnails of the Font tool (static SVG thumbnail, generated
  once and saved in `public/fonts/thumbs/`);
- admin regenerates from the same file: no different subsets between customer and admin. If a
  subset is made to lighten it, it is **a single file** per font, with the list of characters in the registry.

### Customer page (§12)

- The Font tool shows the fonts grouped by script, with the name in the script itself
  (中文, 日本語, العربية, עברית).
- If the typed text contains characters of a script that the chosen font does not have, the page
  **suggests** the right font with one tap; it does not change it by itself.
- The text field has `dir="auto"`. The initial example changes with the font: 你好, こんにちは, مرحبا, שלום.
- The path editor (§5bis) works without changes: it works on segments, not on letters.
- §12.8: scripts not listed, vertical text and multiple lines stay with the custom quote.

### Order (§6)

No new field: `fontId` is enough, script and direction come from the registry. `generatorVersion`
goes up; no schema migration.

### Phases

0. **Trial on the pipeline**: for every font, in `debug.html`, the four sample words at 200 and
   400 mm. What to look at: stroke width (variation), spurious branches, number of segments, minimum
   height, coverage. Here the font is confirmed or the fallback is taken.
1. Extended registry + `heightGlyph` + `lazy` loading. Chinese and Japanese already work here.
2. `shaper: "harfbuzz"` + bidi. Hebrew, then Arabic.
3. Customer page: groups by script, font suggestion, constraints and messages.

### Tests

- Registry measurements equal to the TTF for `heightGlyph` (as today for "H").
- Arabic: "مرحبا" produces the expected joined forms (number of connected components of the bitmap = number
  of joined groups + dots), and the visual order goes from right to left.
- Hebrew: "שלום" has the final mem on the left; "שלום 2026" keeps the number in LTR order.
- 永 at 300 mm: 5 segments, no branch shorter than the stroke, same topology at 8, 10 and 12 px/mm.
- Byte-for-byte determinism of [A] for the four words, in Node and in the worker.
- Arabic dot under R_MIN: never `"omit"`.
- Smoke: choosing a `lazy` font the page gives no network errors and the 2D arrives.

### Open questions

- Weight of the CJK fonts on the first load from mobile: to be measured. harfbuzzjs weighs 440 KB and is
  downloaded only with a font that asks for it.
- Other languages in Devanagari (Marathi, Nepali, Sanskrit): the font covers them, but the language passed
  to harfbuzz is always `hi` and some local forms may differ. Not tried.
- Chinese: should the menu distinguish simplified and traditional, or is one font that covers both enough?
- Korean, Greek, Thai: outside this section. Playpen Sans already covers Greek and Thai with the
  same design, should they be needed. Comfortaa also has Greek: it is not tried.
