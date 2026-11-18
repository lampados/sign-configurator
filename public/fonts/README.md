# Fonts

Every font here is under the SIL Open Font License 1.1 and carries its own `OFL.txt`, except
`PrimerPrint` (CC0, see its `LICENSE.txt`) and `HersheyScriptSimplex` (see its `LICENSE.txt`).
These files keep their own licence: they are not covered by the GPL of the code around them.

A font enters this folder only with a licence that allows redistribution, stated by its author in
the download or inside the font file. "Free for commercial use" on a download site is not enough.

## Latin

All upstream files, unchanged.

| Folder | Font | Author | Licence |
|---|---|---|---|
| `Sacramento` | Sacramento | Astigmatic | OFL |
| `Neonderthaw` | Neonderthaw | Robert Leuschke | OFL |
| `EMSAllure` | EMS Allure (single stroke) | Sheldon B. Michaels, Windell H. Oskay | OFL |
| `HersheyScriptSimplex` | Hershey Script 1-stroke | A. V. Hershey; format by James Hurt | see `LICENSE.txt` |
| `Beon` | Beon | NoirBlancRouge (Bastien Sozeau) | OFL |
| `Pecita` | Pecita | Philippe Cochy | OFL, reserved name: no subset |
| `Compagnon` | Compagnon Light Italic | Valentin Papon, EESAB Rennes | OFL |
| `PrimerPrint` | Primer Print | Ray Larabie | CC0 |
| `WireOne` | Wire One | Cyreal | OFL |

## Cyrillic

One upstream file, unchanged. Comfortaa carries Latin and Cyrillic in the same design, so a sign
can mix them.

| Folder | Font | Author | Licence |
|---|---|---|---|
| `Comfortaa` | Comfortaa Light | Johan Aakerlund | OFL, reserved name: no subset |

It is the static `Comfortaa-Light.ttf` (version 3.103) from
[alexeiva/comfortaa](https://github.com/alexeiva/comfortaa), `fonts/TTF`. The Google Fonts release
is a variable file whose default master is Regular: because the name is reserved we cannot ship an
instance cut from it, and `opentype.js` would read the wrong weight (see below).

## Devanagari (Hindi)

One upstream file, unchanged. Poppins carries Latin and Devanagari in the same design, so a sign
can mix them.

| Folder | Font | Author | Licence |
|---|---|---|---|
| `Poppins` | Poppins Light | Indian Type Foundry | OFL |

It is the static `Poppins-Light.ttf` from
[google/fonts `ofl/poppins`](https://github.com/google/fonts/tree/main/ofl/poppins). Devanagari
letters fuse and reorder, so this font is laid out by `harfbuzzjs` (`src/fonts/shaper.ts`) and the
outlines are then read by `opentype.js` from the same file.

## CJK: subsets

The Chinese and Japanese fonts are **subsets** of the upstream releases, cut down to the everyday
character sets so the browser downloads about 2.5 MB instead of 18–27 MB. The design is untouched:
only glyphs outside the character set were dropped. Neither licence reserves the font name
(`Noto Sans SC` inherits Source Han Sans' reserved name `Source`, which we do not use).

A character outside the subset gets the usual "character missing from this font" warning, and the
sign goes to a custom quote.

| Folder | Upstream | Subset to | Size |
|---|---|---|---|
| `NotoSansSC` | [google/fonts `ofl/notosanssc`](https://github.com/google/fonts/tree/main/ofl/notosanssc), variable | GB 2312 (7540 chars), instanced at `wght=300` | 18 MB → 2.4 MB |
| `MPLUSRounded1c` | [google/fonts `ofl/mplusrounded1c`](https://github.com/google/fonts/tree/main/ofl/mplusrounded1c) | Shift-JIS (6974 chars) | 3.3 MB → 2.7 MB |

To rebuild one, with `fonttools` installed:

```sh
# Chinese: pick the Light instance first, then cut to GB 2312.
python -m fontTools.varLib.instancer "NotoSansSC[wght].ttf" wght=300 -o light.ttf
python -m fontTools.subset light.ttf --unicodes-file=gb2312.txt --layout-features='*' \
    --notdef-outline --name-IDs='*' --output-file=NotoSansSC-Light.ttf
```

`gb2312.txt` is the comma-separated `U+XXXX` list of everything `bytes([hi, lo]).decode('gb2312')`
yields, plus ASCII; for Japanese the same with `shift_jis`.

**The outlines must be static.** `opentype.js` ignores variable-font axes and reads the default
master, so a variable file would be rasterized at the wrong weight (Noto Sans SC's default is Thin).
