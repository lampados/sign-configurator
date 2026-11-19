# SPEC — Neon LED sign configurator (browser)

Reference document of the project. Every prompt to Cursor recalls it with `@SPEC.md`.
If the code and this document diverge, the document is updated first.

## 1. Goal

A 100% client-side web app (static site, no backend for the geometry):

- **Customer**: types a text and picks the font, or uploads an image (SVG, PNG, JPG, §4bis); picks height, frame thickness (`WALL`, from 1.6 to 5 mm), colour and an optional backdrop (§13); can retouch the paths in the editor (§5bis); sees a 3D preview of the lit sign, sends the order and can download the STLs of the sign. Changing the thickness regenerates the preview.
- **Admin (Davide)**: from the same order JSON deterministically regenerates the production files:
  1. `housing.stl` — frame/channel to print in black
  2. `diffuser.stl` — optional diffuser cover (white/natural)
  3. `back.dxf` (+ `back.svg`) — holes on the back for the CNC, seen from the back
  4. `bom.json` — bill of materials: strip segments, LEDs, holes, lengths
  5. `plate.svg` (+ `plate.dxf`) — backdrop to laser cut, if chosen (§13)

Units: **millimetres** everywhere. XY plane = plane of the sign, Z towards the viewer. The back is at Z = 0.

## 2. Hardware (physical constraints)

Standard strip: **10 mm wide, 6 mm thick** (profile `strip-10mm`), addressable. The TOPAI WS2812B
COB 5 mm (RGBIC, 160 IC/m, 3-pin connectors) stays in the list: the bend test parts are designed
for it.

| Parameter | Value | Notes |
|---|---|---|
| `STRIP_W` | 10.0 | strip width (COB: 5.0) |
| `STRIP_T` | 6.0 | strip thickness (COB: 2.0) |
| `BANK_TRANSITION_L` | 25 | part D of the bending sample: linear transition of the tilt before and after the arc. Not used by [H]/[I] |
| `HINGE_PITCH` | 10.0 | notches on the edges every ~1 cm: a strip bent sideways behaves like a chain of rigid stretches. For the 10 mm strip **TO BE MEASURED** (today the COB value) |
| `HINGE_MAX_DEG` | 40 | on part B the strip follows up to 45° with slight tension; 40° is the generator's margin |
| `CUT_PITCH` | 10.0 | cut pitch (check whether it matches the notches) |
| `LED_PER_M` | 144 | 10 mm strip (COB: 160); the customer chooses among 30, 60, 74, 96, 144 |
| `LED_MAX_MA` | 60 | current of one LED at full white at 5 V, for the power supply estimate |
| `STRIP_V` | 5 | strip voltage: 5, 12 or 24 V (`STRIP_VOLTAGES`). For the same power per LED the current scales as 5 / `STRIP_V` |
| `BOX_ID` | `auto` | electronics box: `auto`, `none` or an id from `BOXES` (see Box) |
| `CONTROLLER_ID` | `gl-c-309wl` | WLED controller, id from `CONTROLLERS` (see Controller): changes the current and LED limits of the bill of materials |

Mounting: strip **flat on the channel floor, LEDs towards the viewer**, bent sideways using the hinges.

Controller (`CONTROLLER` in `src/config.ts`): **GLEDOPTO ESP32 Ultra Mini, GL-C-309WL**, WLED firmware,
behind the sign, 40 × 40 × 20 mm. From the resellers' sheets: 5–24 V DC input, 10 A, 2 data outputs, up to 800 ICs.
One reseller says "10 A per channel" and 240 W, which do not agree: 10 A in total is used until
it is checked against the manual. ICs are counted like LEDs (a 12 or 24 V strip with one IC every
3 LEDs uses fewer).

Minimum radius derived from the profile: `R_MIN = HINGE_PITCH / (2·sin(HINGE_MAX_DEG/2))` (≈ 14.6 mm at 40°).
Derived minimum letter height: `MIN_LETTER_H = 2·R_MIN`, the diameter of the tightest bend.

### Controller (`CONTROLLERS` in `src/config.ts`)

WLED controllers on ESP32; the input voltage is that of the strip. The standard one is the GLEDOPTO
ESP32 Ultra Mini (GL-C-309WL: 5–24 V, 10 A, 800 LEDs, 2 outputs). Optional, in the Tech menu
`CONTROLLER_ID`: GLEDOPTO GL-C-616WL (5–24 V, 15 A total, 10 A per output, 2 outputs, Wi-Fi and
Ethernet), QuinLED Dig-Uno v3.1 (5–24 V, 15 A, 2 outputs, 50 × 40 × 25 mm), Seeed
Studio LED Driver Board for XIAO with a XIAO ESP32 (5–12 V, 3 A at 5 V and 2 A at 12 V, 1 output,
63 × 30 × 14.4 mm with the XIAO mounted; WLED must be flashed). Every controller has a price (`priceEur`, one
piece, excluding VAT: €35, €40, €35 and €18) that enters the price of the sign (§12.5) and the parts page.
If the strip has a voltage the controller does not accept (24 V with the Seeed board) the bill of materials
warns; the current limit can depend on the voltage (`ampsAt`). Where the maker gives no LED limit: ~600 per output, the threshold WLED
suggests for a good frame rate. The controller only changes the warnings of the bill of materials (current and LEDs),
not the geometry; it goes into the order (`params.CONTROLLER_ID`) only if different from the standard, and an unknown
id in the link falls back to the standard with a warning.

### Box (`src/parts/boxes.ts`)

The box holds the controller and, if it is a panel type (LRS), the power supply; the plug-in adapter
(GST60A) stays outside and only its DC cable goes in. Catalogue `BOXES`: Hammond 1591XXLSBK,
1591XXGSBK, 1591XXTSBK (black ABS, IP54; outer measurements, inside estimated with 2.5 mm walls and 7 mm
between floor and lid) and Gewiss 44 CE series GW44204–GW44209 (grey technopolymer, IP56, IP55 for the
GW44209; inner measurements from the code), with an average price. Footprints (`boxNeeds`): the components side by side
in a row along L or along W, 5 mm from the walls (`BOX_WALL_GAP_MM`), 10 mm between them (`BOX_ITEM_GAP_MM`),
10 mm of air above for the cables (`BOX_TOP_GAP_MM`); the box can be rotated. A controller without
published measurements counts as 60 × 35 × 20 mm (`CONTROLLER_FALLBACK_MM`). Tech menu `BOX_ID`: `auto` (default,
the smallest by inner volume that is enough), `none` or the id of a box; after every generation
the boxes that are not enough are marked "too small". A chosen box that is too small, or none that is
enough in automatic mode, gives a warning in the summary. It goes into the order only if different from `auto`.

### Strip profile (`src/config.ts`)

`STRIP_W`, `STRIP_T`, `CHANNEL_W`, `HINGE_PITCH`, `HINGE_MAX_DEG`, `CUT_PITCH` and `LED_PER_M`
live in the strip profile: `strip-10mm` (standard, `DEFAULT_STRIP`) and `cob-5mm` (TOPAI WS2812B
COB 5 mm), the two entries of `STRIP_PROFILES`.
Other strips are added there, without a second list of numbers. `DEFAULT_PARAMS` copies
these fields from the default profile. `R_MIN` and `MIN_LETTER_H` are not set: `resolveParams`
recomputes `MIN_LETTER_H` from hinge and pitch.

## 3. Geometric parameters (all in `src/config.ts`, overridable)

| Parameter | Default | Meaning |
|---|---|---|
| `CHANNEL_W` | 10.4 | channel width on a straight (STRIP_W + 0.4 tolerance; COB: 5.4) |
| `CHANNEL_DEPTH` | 12.0 | channel depth: the strip (6) plus 6 mm between the LEDs and the diffuser, as with the COB (8 = 2 + 6) |
| `WALL` | 2.2 | wall thickness (the "frame") |
| `WALL_MIN` | 1.2 | minimum thickness of the inner wall: the sagitta does not thin it further |
| `MIN_GAP` | 1.0 | minimum air between two outlines that must not merge |
| `FLOOR` | 4.0 | floor thickness |
| `ANCHOR_HOLE_D` | 3.2 | anchor holes on the back (blind) |
| `ANCHOR_HOLE_DEPTH` | 3.0 | |
| `ANCHOR_SPACING` | 70 | target distance between holes along the path |
| `ANCHOR_MIN_PER_SEGMENT` | 2 | |
| `ANCHOR_BOSS` | false | if true: cylindrical standoffs on the back |
| `ANCHOR_BOSS_D` / `_H` | 8 / 6 | |
| `WIRE_SLOT_W` | 10.4 | wire slot width, by default = `CHANNEL_W`: the whole end of the channel |
| `WIRE_SLOT_L` | 6.0 | last mm of the segment taken by the slot, flush with the rounded end |
| `SLOT_LIP_CHAMFER` | 1.0 | 45° chamfer on the inner lip of the slot, segment side |
| `WIRE_HOLE_D` | 8.0 | large round hole at each end of a segment, instead of the slot; at most as wide as the channel. 0: the slot |
| `PATH_HOLE_D` | 4.0 | small holes along the whole path, in the channel floor. 0: none |
| `PATH_HOLE_PITCH` | 12.0 | pitch of the small holes: equal distances, close to this |
| `CORNER_MERGE_DIST` | 4.0 | under this distance two DIN/DOUT slots become a corner pocket |
| `CABLE_HOLE_D` | 6.0 | main cable entry |
| `CROSSING_GAP` | 3.0 | interruption of the strip per side at a crossing |
| `DIFFUSER_T` | 1.2 | diffuser thickness (press fit on top of the channel) |
| `DIFFUSER_CLEARANCE` | 0.15 | |
| `DIFFUSER_LEDGE` | 0 | width of the step the diffuser rests on: the top `DIFFUSER_T` of the channel, and the diffuser, are this much wider on every side. 0: no step, friction alone. The seat stays `MIN_TOP_WALL` (0.8) away from the outline and from the outer chamfer; with an inner chamfer it is ignored, with a warning. Tech menu "Diffuser ledge" |
| `MIN_LETTER_H` | `2·R_MIN` | derived from the strip profile: diameter of the tightest bend |
| `CUSP_MODE` | `"split"` | `"split"` cuts the segment at the cusp; `"warn"` only reports it |
| `I_DOT_MODE` | `"dot"` | dot under R_MIN: `"dot"` segment with two holes, `"dash"` dash with slots, `"omit"` excludes it, `"unlit"` raised shape with no strip |
| `DOT_WIRE_HOLE_D` | 2.5 | through hole under each pad of the dot |
| `DOT_OVERHANG_MM` | 1.5 | how far the pill, wall included, may stick out of the dot |
| `COVERAGE_MIN` | 0.85 | under this fraction of lit centreline, the letter warns |
| `EDGE_PROFILE` | `"square"` | profile of the top edge of the wall: `"square"` \| `"outer"` \| `"inner"` \| `"both"` |
| `CHAMFER_SIZE` | 1.5 | **vertical** height of the chamfer (≤ `CHANNEL_DEPTH`) |
| `CHAMFER_ANGLE` | 45 | angle of the chamfer from the horizontal (0° < α < 90°) |
| `LAYER_STEP` | 0.2 | height of the slices of the stepped chamfer (= print layer height) |
| `IMAGE_MAX_PX` | 4096 | maximum long side of an uploaded bitmap, after cropping (§4bis) |
| `EDIT_FIT_TOL` | 0.3 | tolerance of the segment → Bézier conversion when the editor opens (§5bis) |
| `EDIT_MIN_NODE_DIST` | 0.5 | minimum distance between two consecutive nodes in the editor |

Total height = `FLOOR + CHANNEL_DEPTH`.

The backdrop parameters (`PLATE_*`) are in §13.

### Edge profile (`src/geometry/edgeProfile.ts`)

- `"square"`: sharp edges, geometry unchanged.
- `"outer"`: chamfer on the outer top edge of the wall.
- `"inner"`: chamfer on the inner top edge, towards the channel: widens the opening.
- `"both"`: both.

The chamfer is `CHAMFER_SIZE` high and `run = CHAMFER_SIZE / tan(CHAMFER_ANGLE)` wide horizontally.
It is built in steps, with slices `LAYER_STEP` high: for each slice, an offset with rounded
joins (value taken at mid slice, growing upwards) of the outer profile inwards
and of the channel outwards; all the slices are joined to the body below with
**a single** union.

Validation (with a warning):
- `CHAMFER_SIZE` ≤ `CHANNEL_DEPTH`, otherwise reduced to `CHANNEL_DEPTH`.
- `"inner"` / `"both"`: the wall left on top (`WALL − run`, or `WALL − 2·run`) must be
  ≥ 0.8 mm, otherwise `CHAMFER_SIZE` is reduced until it is.
- `CHAMFER_ANGLE` outside (0°, 90°) or `LAYER_STEP` ≤ 0: chamfer ignored (`"square"` profile).

## 4. Fonts

- **Sacramento** and **Neonderthaw** (Google Fonts, SIL OFL), outline fonts (`kind: "outline"`). The TTFs go in `public/fonts/` together with `OFL.txt`.
- **Hershey Script Simplex** and **EMS Allure**, single-stroke fonts (`kind: "stroke"`). They are not rasterized: the glyph paths already are the line of the strip. The glyphs, however, are coarse polylines (the "S" of EMS Allure has 24 vertices): before the graph every stroke becomes a centripetal Catmull-Rom spline that passes through every vertex, sampled at 1 mm (`splineThroughPolyline` in `smooth.ts`). Turns beyond 75° (`STROKE_CORNER_DEG`) stay cusps, like the tip where the stroke goes up and comes back down. Hershey is public domain with an attribution requirement (`LICENSE.txt`). EMS Allure is an OFL derivative of Allura (`OFL.txt`); the reserved name Allura is not used.
- Outline fonts have a constant stroke: the centreline is obtained by skeletonization (section 5).
  - **Sacramento**: solid stroke, monoline; every letter is a single region (the *i* also has the dot).
  - **Neonderthaw**: draws the **hollow neon tube** and is the best fit for the product. Every tube is a
    **pair of parallel lines**, often separate contours (the *o* has 4), sometimes joined by a U curve
    at one end; the ends of the two lines are often staggered and the tube breaks where it "passes
    behind" another. Some elements are **single-line** (the bar of the *t*, the ring-shaped dot of
    the *i*). The space between neighbouring tubes is as wide as the inner gap: a width-only criterion on the
    bitmap cannot tell "inside the tube" from "between two tubes", so the gap **is not filled** in [A]
    (§5, [B]/[C]).
- The font registry (`src/fonts/registry.ts`) is extensible:
  `{ id, name, kind, file, defaultTracking, capHeightMeasured, xHeightMeasured, hollowTubes, tube?, stripMode, notes }`,
  with `file` relative to `public/`. `kind` is `"outline"` (TTF) or `"stroke"` (single stroke).
  To add a font, the file in `public/fonts/` and a registry entry are enough; the measurements are
  taken once per font and a test checks that they match the glyph.
- `src/fonts/loadFont.ts` parses the TTF with `opentype.parse`. `src/fonts/strokeFont.ts` reads the single
  strokes: SVG 1.1 `<font><glyph d="...">` (with `horiz-adv-x` advance and `hkern` kerning, if present)
  and JSON (glyphs with `advance`, or the Hershey `chars` array with advance `o` and Y pointing down).
  No DOM: it works in the main thread, in the worker and in Node. The bytes come from an injectable reader:
  `fetch` on `BASE_URL + file` in the browser, `fs` in the tests.
- **Height**: the declared metrics (OS/2) of script fonts are unreliable, so the height the customer
  asks for is the **real top of the "H" glyph** (fallback "I"), measured on the outline from the baseline
  to the highest point: `capHeightMeasured`. The **x-height** is the top of the "x" glyph: `xHeightMeasured`.
  This also holds for single strokes: the top is the highest point of the "H" path, not the declared
  `cap-height`. Values (font units): Sacramento 1523 / 627 (upm 2048), Neonderthaw 789 / 391 (upm 1000),
  Hershey Script Simplex 662 / 284, EMS Allure 699 / 346. The other
  capitals of the cursives can sit above or below the "H" (Neonderthaw: N ≈ +10 %).
- **`hollowTubes`**: `true` for Neonderthaw, `false` for Sacramento. With `hollowTubes` the registry carries
  `tube = { lineWidth, gap }` (font units), measured with `measureTubes` (`src/geometry/tubes.ts`) on
  capitals and lowercase: line thickness = mode of the widths on the axis of the solid strokes; gap =
  median of the widths on the axis of the voids between 0.5 and 4 thicknesses. Neonderthaw: line 19, gap 41
  (it varies from about 25 to 75 along the tube). The gap is not filled in [A].
- **`stripMode`**: `"centerline"` or `"walls"`. Sacramento is `"centerline"`: the skeleton already is the
  line of the strip. Neonderthaw is `"walls"`: every wall of the tube is a monoline and becomes
  a strip path, like Sacramento, from [B] to [D] without pairing.
- **Single stroke** (`src/geometry/strokeLayout.ts`, `strokeGraph.ts`): every sub-path of the glyph is
  a polyline. Advance and kerning, if the font has them, move the pen. Endpoints at most
  0.3 mm apart (joined letters, or an endpoint that lands on another stroke) become
  the same node. A crossing between two strokes becomes a degree-4 node. There are no spurious branches to
  prune. In debug the font lines take the place of the bitmap.

## 4bis. Image sources

Instead of text + font the customer can upload an image. Formats: **SVG**, **PNG**, **JPG**
(file ≤ 10 MB). The image does not leave the browser until the order is sent.

Principle: reading the file (DOM, decoding, colour management) can change from one browser
to another, so it happens **only once, in the main thread**, and produces a normalized form that
goes into the order (§6). The pipeline starts from that form, with pure modules: same order, same files.
The original image does not enter the order.

### Dimensions

- `heightMm` for an image is the **height of the bounding box** of the drawing (SVG paths or
  ink pixels), not the top of an "H". The width follows, with locked proportions.
- The origin is the bottom-left corner of the bounding box; Y points up, as in §5 [A].

### SVG (`src/sources/svgImport.ts` in the main thread, `src/sources/svgPaths.ts` pure)

- **Reading** (main thread, `DOMParser`): `path`, `line`, `polyline`, `polygon`, `rect`,
  `circle`, `ellipse` are collected, with the transforms (`transform` of element and groups, `viewBox`) applied
  and the coordinates brought to mm at `heightMm`. Every shape becomes an absolute `d` (only `M L C Q Z`),
  numbers rounded to 0.001 mm. `text`, `image`, `use` towards external files, masks and filters are
  ignored, with one warning per type.
- **Classification** per element, from the computed styles:
  - visible `stroke` and `fill` absent or `none` → **stroke** (`kind: "stroke"`): the path already is the
    line of the strip and enters [C] like the single-stroke fonts (§4), without [A] or [B].
    Endpoints within 0.3 mm become the same node. The thickness of the SVG stroke is ignored.
  - visible `fill` → **area** (`kind: "fill"`, with `fillRule` `nonzero` or `evenodd`): the flattened
    polygons (tolerance 0.02 mm) enter the rasterizer [A], which also accepts `evenodd`.
    From there it continues according to `trace` (below).
  - neither → ignored, with a warning.
- An SVG with strokes and areas together is valid: the two routes join in [C].

### PNG / JPG (`src/sources/rasterImport.ts` in the main thread, `src/sources/bitmapCodec.ts` pure)

- **Decoding** (main thread): `createImageBitmap`, then `getImageData` in `srgb`. Transparency is
  composited on white. Rec. 709 luminance.
- **Threshold**: Otsu by default, adjustable with a 0–255 slider; `invert` option (default: dark =
  stroke). The threshold preview updates live.
- **Crop** to the box of the ink pixels; long side at most `IMAGE_MAX_PX` (4096):
  beyond that it is reduced before the threshold, with a warning.
- **Bitmap in the order**: binary, at native resolution after the crop, encoded by
  `bitmapCodec.ts` in RLE: rows from the top, alternating runs starting from 0, lengths as
  LEB128 varints, all in base64.
- **Resolution**: `pxPerMm` = height in px / `heightMm`. Under 8 px/mm (known limit of [B])
  a "low-resolution image for this height" warning, with the maximum height at 8 px/mm.
  Changing `heightMm` does not require reading the image again. The 5 empty px of [A] are added.

### `trace`: centreline or outline

Applies to SVG areas and to bitmaps.

- `"centerline"` (default): [B] → [C] like Sacramento. Suited to signatures and uniform-stroke drawings.
  If the stroke thickness (distance transform on the skeleton pixels) has a coefficient of
  variation > 0.35, an "uneven stroke: try Outline" warning.
- `"outline"`: the **border** of every region (and of every hole ≥ 0.05 mm²) is a closed strip
  path, like the walls of `stripMode` `"walls"`. Contours extracted with marching squares on the
  bitmap, simplified with Douglas-Peucker at 0.75 px. Suited to solid logos. Regions narrower
  than `CHANNEL_W + 2·WALL + MIN_GAP` give the usual merge warning with the height that separates them.

### Coverage and warnings

Instead of letters, the reference for coverage (§5) is the **connected components** of the
drawing, numbered from left to right ("region 1", "region 2"…). Everything else (curves, cusps,
dots, `I_DOT_MODE`, holes, BOM) is unchanged.

## 5. Pipeline

Seen from the front, the solid is only `offset(smoothed centreline [E], CHANNEL_W/2 + WALL)`, with rounded joins and ends. Nothing sticks out of this outline: slots, pockets, holes, wire ducts and standoffs sit inside the outline or on the back. The outer profile has constant width. The chain [F] does not draw the profile: it validates the bends and computes the sagitta, which is taken from the inner wall without bringing it under `WALL_MIN`.

```
text + font + height, or an image (§4bis)
 → with "paths" in the order (editor, §5bis): the curves enter [E] directly, without [A]–[D]
 → stroke SVG: the paths, in mm, enter [C] directly; SVG areas and bitmaps: [A] with trace (§4bis)
 → with kind "stroke": the glyph paths, in mm, enter [C] directly (no [A] or [B])
 → [A] rasterization, kind "outline" only (own rasterizer, not canvas: opentype.js contours → binary bitmap)
 → [B] skeleton (Zhang-Suen thinning; fallback: medial axis via d3-delaunay)
 → [C] graph (nodes = endpoints/junctions, edges = polylines in mm), pruning of spurious branches < stroke width,
        merging of Y pairs into degree-4 crossings.
        With stripMode "walls" every wall already is an edge and goes on to [D] like a monoline.
 → [D] segmentation:
        - degree-4 nodes = CROSSINGS: branches are paired by tangent continuity; one pair continues,
          the other is interrupted by CROSSING_GAP per side
        - disconnected components (dots, accents) = separate segments; a closed loop smaller than the
          minimum radius (e.g. the dot of the i) follows `I_DOT_MODE`: `"dot"` (default) is a segment
          with two holes, `"dash"` a dash, `"omit"` excludes it, `"unlit"` is a raised shape with no strip
        - degree-3 nodes: the straightest continuation is chosen, the remaining branch becomes a segment
 → [E] smoothing (Chaikin or spline) + resampling
 → [F] chain simulation: resampling into chords of HINGE_PITCH, check angle ≤ HINGE_MAX_DEG,
        local sagitta s = HINGE_PITCH² / (8R) → widens the channel locally
 → [G] validation: every bend beyond the maximum is a curve (the radius grows with scale) or a
        cusp (angle in at most 2 hinges, radius that does not grow). The minimum height is the highest
        among curves, short segments and non-adjacent strokes that would merge.
        Cusps are listed separately. `CUSP_MODE` `"split"` cuts the segment at the cusp
 → [H] 2D (manifold-3d CrossSection): offset of the smoothed line [E] → channel (CHANNEL_W/2) and
        outer profile (CHANNEL_W/2 + WALL), rounded joins and ends, constant outer width;
        the chain sagitta widens only the inner side, without going under WALL_MIN:
        along the smoothed line the widening equals the sagitta within half a HINGE_PITCH of every
        hinge and drops to zero over one HINGE_PITCH of ramp (`innerWidening`), without steps;
        morphological closing and opening of the channel with radius WALL_MIN (`closeChannel`, three offsets:
        +r, −2r, +r): holes and notches narrower than 2·WALL_MIN are filled and outward corners
        are rounded (lenses between a sagitta band and the channel, wedges of
        wall at crossings and junctions); they would be unprintable pillars or wall tips
        and dark slits in the diffuser. The channel stays inside the outer profile;
        at the CROSSING_GAPs the channel stays continuous, only the strip is interrupted;
        the slot is the last WIRE_SLOT_L of the segment, flush with the rounded end;
        with a backdrop (§13): outline of the plate and its holes, from the same outline
 → [I] 3D (manifold-3d): extrusion of the outer profile (with the EDGE_PROFILE chamfer on top) − channel
        − holes (anchor, cable) − wire slots and corner pockets, with the SLOT_LIP_CHAMFER chamfer (+ bosses);
        with a backdrop: extrusion of the plate by PLATE_T, holes included
 → [J] export: binary STL, DXF/SVG, BOM JSON, plate.svg/plate.dxf
```

Everything from [A] to [J] runs in a **Web Worker** (Comlink). The interface never blocks.

`generate(order)` runs [A]–[I] in the worker and returns
`{ housingMesh, diffuserMesh, plateMesh, holes, slots, pockets, outline, plateOutline, plateHoles, centerlines, lightPoints, ledGapMm, bom, warnings }`.
The meshes are the triangles in mm, in the same frame as the STL. `holes` are the anchors (blind)
and the cable; `slots` and `pockets` the real outlines of slots and pockets; `outline` the outer profile;
`centerlines` the centrelines of the segments. `plateMesh`, `plateOutline` and `plateHoles` are
`null` without a backdrop (§13). `lightPoints` are the LEDs on the lit part of
every centreline (`pos`, `dir` from DIN to DOUT, `segment`, `index`): today at `LED_PER_M` (160 per metre
of COB strip); a free-pitch pixel will use the same list. `ledGapMm` is
`CHANNEL_DEPTH − STRIP_T`, the distance between the face of the LED and the diffuser.
The debug page shows the solid in grey, without
effects, and downloads `housing.stl` and `diffuser.stl`. "Ciao Torino" with both fonts stays under 3 seconds.
The interface does not wait for the solid: the 3D generation starts after the 2D drawing.

### Preview (`src/viewer/scene.ts`)

The three.js scene does not know whether the source is a COB strip or a pixel: it reads `lightPoints`.

- **Housing**: matt black, barely satin. The **diffuser** is a separate mesh. Normals are
  creased (`toCreasedNormals`, 35°): soft curved walls, flat faces flat, no fans.
- **Backdrop** (§13): a separate mesh behind the housing, with the chosen material, the thickness and the real
  holes; on the transparent one, holes and wires show behind the plate.
- **Off**: opaque white diffuser, daytime ambient light, no bloom.
- **On**: on the diffuser the brightness is the sum of gaussians centred on the `lightPoints`.
  Sigma is `ledGapMm`, so if the pitch is large compared with the depth the points stay
  visible, and if it is dense they blend. The bloom (`UnrealBloomPass`) has a high threshold, low intensity and
  radius: the core keeps the LED colour and does not wash out. On the wall the same
  gaussian draws the halo, which fades within about 2–3 times the stroke width.
  Tone mapping is ACES; exposure is adjustable.
- **Without diffuser**: the cover mesh is hidden and the LEDs are small emitters in the channel.
- **Effect**: `"colore fisso"` (solid colour, default) gives every LED exactly the chosen colour;
  `"arcobaleno"` (rainbow) makes it run along the segment, from DIN to DOUT. With `prefers-reduced-motion`
  the motion stops.
- In admin two sliders, intensity (exposure, default 0.85) and halo (gaussian on the wall
  and bloom radius, default 0.16), for tuning. The customer does not see them and uses those defaults.
- Wall background. `OrbitControls` stay on the front view, ±40° in azimuth and elevation.
- On a laptop the target is 60 fps (pixel ratio at most 1.5, brightness map up to 512 px).
  On mobile the pixel ratio is 1, the map goes up to 256 px and the bloom is computed at half resolution.
- **Customer STL** (`index.html`), if `CUSTOMER_STL_DOWNLOAD` in `src/config.ts` is true: a
  "Download STL" button next to sending, visible without scrolling. It downloads `housing.stl` and, if the diffuser
  is on in the preview, `diffuser.stl` too, from the meshes already computed for the scene (no
  second generation). It is disabled, with the label "Generating…", until `generate()` has
  returned `housingMesh`; text, font, height or diffuser disable it again and an earlier mesh is never
  downloaded. BOM, DXF, SVG and backdrop files stay in admin only.

### [A] Rasterization (`src/geometry/rasterize.ts`)

A pure module, **without DOM and without canvas**: the same code gives the same bytes in the worker, in the main
thread and in Node. Canvas and OffscreenCanvas are excluded because they apply antialiasing and the result
depends on browser and GPU, which would break determinism (§6).

- **Input**: text on one line (line breaks become spaces, with a warning), `fontId`, `heightMm` (= top
  of the "H", `capHeightMeasured`, §4), resolution `pxPerMm` (default 10).
- **Contours**: `font.forEachGlyph` with kerning on and `letterSpacing` 0 (`defaultTracking` does not
  apply here); the font's standard ligatures stay on. Quadratic and cubic Bézier curves
  are flattened into polygons with tolerance **0.02 mm** (number of segments from the estimate of the maximum
  curvature). Coordinates in mm, origin on the baseline at the start of the text, Y pointing up.
- **Fill**: hand-written scanline, **nonzero** rule, one sample at the centre of every pixel, no
  antialiasing. A pixel is 1 if its centre is inside the contour.
- **Output**: binary `Uint8Array` (0/1, row by row from the top), `width`, `height`, with **5 empty px** on
  every side. The px→mm transform is `x = originX + px · mmPerPx`, `y = originY − py · mmPerPx` (pixel
  edges on integer coordinates, centres at +0.5). The grid is aligned to the text origin, so
  the baseline falls on a pixel edge.
- **Exposed measurements (mm)**: height (top of the "H"), x-height (top of the "x"), **real total
  footprint** (bbox of the contours: width × height, descenders and flourishes included) and that of every glyph,
  total advance, font body (em); for `hollowTubes` fonts also line thickness and tube gap
  at the scale of the text. With `stripMode` `"walls"` they are not needed for pairing: the walls are the strips.
- **Hollow-tube fonts**: the bitmap is faithful to the font, with two lines per tube; the gap is not filled
  (§4). The debug page reports it with a warning.
- **Cap of 40 million pixels**: beyond it, the resolution is reduced in proportion, with a warning.
- **Warnings**: one warning for every character without a glyph in the font (with the U+XXXX code); the character is
  skipped, without the `.notdef` box.
- **Tests** (`test/rasterize.test.ts`, `test/distance.test.ts`): registry measurements equal to the TTF; tops
  of "H" and "x" at the expected heights and capitals within ±1 px; byte-for-byte determinism; area of synthetic
  rectangle and ring within 1%; topology (regions and holes ≥ 0.05 mm²) of every letter identical at 10 and at
  30 px/mm; missing character → warning; distance transform equal to brute force; `measureTubes` on
  synthetic tubes and consistent with the registry.

### [B] Skeleton (`src/geometry/skeleton.ts`) and [C] graph (`src/geometry/graph.ts`)

Pure, deterministic modules like [A]. They apply to monoline fonts and, with `stripMode` `"walls"`, to
every wall of a hollow tube: the edges of the graph already are the strip paths.

- **Pinholes**: before thinning, holes with area < (stroke/6)² (`HOLE_FILL_MAX_W`) are filled; they come
  from overlapping font contours (in Sacramento < 0.1 mm² at 100 mm). Real holes (the dot
  of the *i*, counters, from ~2 mm²) stay.
- **[B]**: **Zhang-Suen** thinning (front pixels only, same result as the classic method),
  then cleanup of simple pixels with at least 2 neighbours (steps, corners): an 8-connected skeleton 1 px wide,
  with the same topology as the bitmap.
- **Stroke width**: median of 2·d − 1 px over the skeleton pixels, with d from the exact Euclidean
  distance transform (`distance.ts`). It is the yardstick for all the graph thresholds.
- **[C] nodes**: pixels with a number of neighbours ≠ 2 or crossing number ≠ 2; adjacent node pixels form
  **a single node** (centroid). A loop without nodes (the dot of the *i*) gets a degree-2 node.
  **Edges**: polylines in mm from node to node, simplified with Douglas-Peucker at 0.75 px (the stepped
  pixel chain would lengthen the edges by 5–8%).
- **Simplification**, repeated while the graph changes:
  1. **spurious branches**: endpoint–junction edge shorter than the stroke width → pruned;
  2. small loops (< π · stroke) on a junction → pruned; **bubbles** (two edges between the same nodes,
     sum < π · stroke) → the shorter one stays;
  3. **crossings**: thinning returns a crossing as two Ys joined by a short edge. It is contracted into
     a degree-4 node (at the middle of the edge) if the edge is shorter than the stroke; or, between two
     degree-3 junctions, if it is within 2 strokes and the four branches form two through paths with deviation ≤ 60°;
     or if it is within 5 strokes and the outer branches turn back by at least 120° from the edge and
     continue in a straight line (± 35°) on the other side (narrow X, down to ~20°). Two Ts 3 strokes apart
     (as in an "H") stay distinct;
  4. degree-2 nodes between two different edges → edges joined.
- **Isolated letters**: in Sacramento "l", "e", "b" alone have no lead-in stroke. The stroke starts
  inside the loop and ends head-on against the stem, so the node has degree 3. In a word the stroke
  comes from the previous letter and the loop becomes a degree-4 crossing.
- **Known limit**: under 8 px/mm a gap of ~0.2 mm between two strokes (the counter of Sacramento's
  "d") closes in the bitmap and changes the topology; at 10 px/mm (default) it is correct.
- **Debug**: skeleton over the lightened bitmap, edges as polylines, nodes coloured by degree
  (1 green, 2 grey, 3 orange, 4 red, ≥ 5 purple), counts of nodes by degree and of edges, stroke
  width, pruned branches, merged junctions, filled pinholes, time in the worker.
- **Tests** (`test/graph.test.ts`): line, ring (length 2π·r ± 3%), "X" at 20°/30°/40°/60°/90° →
  one degree-4 node, "T" → degree 3, narrow "H" → two distinct Ts, filled pinhole, determinism;
  Sacramento: in "alebe" the loops of l, e, b are degree-4 nodes and the endpoints are only the 4 real ones,
  same topology at 8, 10 and 15 px/mm; l/e/b isolated without crossings or spurious branches; alphabet without branches
  shorter than the stroke, the same at 8, 10 and 12 px/mm; the dots of the *i*s in "Ciao Torino" stay loops.

### Hollow-tube fonts (`stripMode` `"walls"`)

Neonderthaw has `stripMode` `"walls"`. The tube gap is not filled on the bitmap (§4), the skeleton
stays two lines, and **every wall is a strip path**: [B] → [C] → [D] as for Sacramento.

`src/geometry/tubePairing.ts` used to pair the two walls along the mutual normal and replace them with
the median line. **It is not in the pipeline.** Small counters do not pair
reliably: they are concentric arcs of very different length. On the *g* of "Ciao" at 200 mm the mutual
stretch was 26.5 mm, under the 30.4 mm required (twice the nominal distance), and the wall was left
without a partner. Widening the thresholds would have paired different tubes. The module stays in the code, with
its tests, but `generate` and the worker do not call it.

The two walls of the same tube are two non-adjacent strokes. Distance validation applies
between them too: the minimum height keeps the two channels side by side, with at least `MIN_GAP` between the outlines
(`CHANNEL_W + 2·WALL + MIN_GAP` between the centrelines).

### Curves, cusps and dots

A hinge beyond `HINGE_MAX_DEG` is classified by comparing the chain with the same geometry at ×2 scale:

- **curve**: the local radius grows (at least ×1.5). It is solved by making the text bigger. The recommended
  minimum height is the smallest that brings every curve to at least R_MIN, that is height × R_MIN / radius,
  and that keeps the non-adjacent strokes of the centreline at least `CHANNEL_W + 2·WALL + MIN_GAP` apart.
  With `stripMode` `"walls"` the two walls of the same tube are two non-adjacent strokes: the minimum
  height guarantees two channels side by side with `MIN_GAP` between the outlines.
  If two non-adjacent strokes are closer, the outlines merge: a warning with the position and
  the height that separates them (distances scale with height). That value enters the
  "minimum height" summary. T junctions (degree-3 node: the remaining branch ends on the stroke that
  continues) are not merges: there the outlines touch by design, as at a crossing, and the distance
  stays 0 at every scale. They are recognized on the lines before smoothing (an open end within 0.5 mm
  of another stroke, `touchPoints` in `validate.ts`) and are excluded like crossings, within
  `CHANNEL_W + 2·WALL + MIN_GAP` of the contact. Beyond that radius two close branches still count. If there are no curves or merges, the height can go down to the cut pitch.
  Cusps do not enter the count.
- **cusp**: the angle is concentrated in at most 2 hinges and the radius does not grow (a cusp of the font or
  of the skeleton). It is not solved by scale. It is reported separately, with count and position.
  With `CUSP_MODE` `"split"` (default) the segment is cut at the cusp into two segments, but only if
  both keep at least `CUT_PITCH` of lit length after the slots. Otherwise the cusp stays an error
  and the strip is not interrupted. A segment under that lit length is joined to the neighbouring end, if the two
  endpoints touch; it is not dropped silently. Each segment has
  its own direction (DIN = end with the smaller x, then the smaller y). If the exit slot of one and the
  entry slot of the other overlap, or the lips are less than `CORNER_MERGE_DIST` apart, they become
  a single `CORNER_POCKET` (union of the two slots, at full channel width, with
  `SLOT_LIP_CHAMFER` on both entry sides) and the wire between the two segments is 0 mm.
  With `"warn"` the cusp stays an error and the segment is not cut.

`I_DOT_MODE` applies to every closed loop with equivalent radius under R_MIN:

- `"omit"`: the loop does not enter the strip and produces a warning.
- `"dot"` (default): a straight segment `CUT_PITCH` long, centred on the dot and oriented like
  the nearest stem. The channel is a pill (the line plus the round ends). Instead of slots
  there are two through holes `DOT_WIRE_HOLE_D` under the pads, one per end. The `WIRE_SLOT_L`s
  are not subtracted: the lit length is the whole segment. The dot carries **a single LED**, in the centre
  (`DOT_LED_COUNT` in `lights.ts`), in the preview and in the BOM.
  In the BOM it is a segment of its own and does not count among the slots. The footprint of the dot is the outline
  of the ink (the skeleton widened by half a stroke width), not the skeleton line.
  **The dot is always an LED.** If the rectangle `CUT_PITCH` long and `CHANNEL_W + 2·WALL` wide
  sticks out more than `DOT_OVERHANG_MM` from that footprint (single-stroke fonts, small sizes), the
  pill stays lit and larger than the drawing, with a warning for the admin only ("Dot smaller
  than the LED pill: it sticks out X mm"). If the pill touches the stem, the merge ([G])
  blocks sending and gives the height that separates them.
- **Isolated marks** (the accent of "ì", "è", …), with `"dot"`: an open stroke that does not pass within
  `max(CORNER_MERGE_DIST, 2·CROSSING_GAP + 1.5)` of any other and is shorter than
  `CUT_PITCH + 2·WIRE_SLOT_L` (too short for two slots and the minimum lit length) behaves like the
  dot: a segment of its own without slots, holes under the pads, **one LED**. Under `CUT_PITCH` it
  is lengthened to `CUT_PITCH`, centred and oriented like the stroke (`markPieces` in `strip.ts`).
- `"dash"`: as above, but with normal slots. The dash, wall included, must fit in the dot
  widened by at most `WALL`. If it does not fit, `"unlit"` with the position.
- `"unlit"`: a solid raised shape, without channel and without strip, hence without LEDs.

### Coverage

No stroke of the letter stays unlit or disappears without a reason. The reference length,
per letter, is the edges of the graph. With `stripMode` `"walls"` every wall of the tube enters the
reference, so the strip is about twice the median line.

The lit part is the lit length of the segment after the slots, rounded to the cut pitch. The rest
is unlit and has a reason: slot, corner pocket, crossing gap, cut leftover, segment too
short. The dot of the *i* follows `I_DOT_MODE` and does not enter this
count as an unlit stretch. Lit plus unlit rebuilds the
reference. Under `COVERAGE_MIN` (0.85) the letter warns, with the height that brings it above the
threshold when the gap is made of fixed slots, gaps and leftovers.

In the debug page the unlit stretches are dashed in grey with the label of the reason, and a
table lists reference, lit millimetres and percentage per letter. Warnings are
grouped by segment, in a collapsible list, with on top
the summary (curves, cusps, crossings, minimum height) and the coverage table per letter.
A validation error does not turn the strip off: the stretch stays lit and marked. On the drawing every bend has a
numbered marker: a circle for a curve, a triangle for a cusp. A click on the warning zooms
the view to that point.

### Holes

- **Anchor**: on the centreline, under the strip, blind from the back. Distributed every `ANCHOR_SPACING`, at least `ANCHOR_MIN_PER_SEGMENT` per segment, away from the slot, the corner pocket, the crossings and the other holes (≥ 10 mm). If a station intersects one of these obstacles, the hole moves along the centreline to the nearest valid point: it is not removed. If fewer than the minimum are left in the segment, there is a warning with the position.
- **Wires, as it is today (18 November 2026)**: a **round through hole** of diameter `WIRE_HOLE_D` at the start and end of every segment, centred halfway along the last `WIRE_SLOT_L` (the stretch without strip, between the lip and the end). It is the disc cut out of the channel, never wider than the channel: the floor stays all around and under the walls, so the part comes out **in one piece**. A corner joint has a single hole, at the vertex. If the first segment starts with a hole at least as large as `CABLE_HOLE_D`, the cable goes through it and has no hole of its own. **Along the whole path** there are then small holes (`PATH_HOLE_D`, about every `PATH_HOLE_PITCH`, at equal distances): where the strip is cut on a curve, the wires go through the nearest one. They come last and give way to the others: one that would sit less than 1.5 mm of floor from a large hole, an anchor, the cable, a crossing or another small hole is not made. Dots have their two holes and nothing else. Wires go through the hole, not the strip: there is no longer a chamfer on the lip. `test/onePiece.test.ts` checks that the solids of the housing are as many as the intended parts of the sign (the dot of the *i* is a part of its own). The slot described next stays available with `WIRE_HOLE_D` 0: as wide as the channel, where channels merge it removed the floor under a piece of wall and left it detached from everything.
- **Wires, the slot (`WIRE_HOLE_D` 0)**: a through slot in the floor, at the start and end of every segment. It takes the last `WIRE_SLOT_L` of the segment itself, flush with the rounded end: as wide as the channel (`WIRE_SLOT_W` = `CHANNEL_W` by default) and with the same shape as the floor. There is no extension beyond the outline. The lit part ends where the slot starts (the lip) and there the strip goes down towards the back. On the inner edge of the lip, segment side, there is a `SLOT_LIP_CHAMFER` chamfer at 45°.
- **Corner pocket**: when two slots, the exit of one segment and the entry of the next, overlap or are less than `CORNER_MERGE_DIST` apart, there is a single through pocket in their place, intersected with the channel (never beyond), with the lip chamfer on both sides from which the strip enters.
- **Cable**: at the start of the first segment.

The matching holes in the backdrop are described in §13.

### Direction of the segments

The strip is addressable (WS2812B): the signal enters at **DIN** and leaves at **DOUT**.
Every segment therefore has a direction: the start of the path is the DIN, the end is the DOUT, and the
strip must be mounted in that direction (arrow printed on the strip). The start slot carries the
input wires, the end slot the output wires. The BOM gives the direction of every segment.

### DXF

Seen **from the back**, that is mirrored in X, in the same reference frame as the STL.
Layers: `ANCHOR_HOLES` (CIRCLE), `WIRE_SLOTS` (closed LWPOLYLINE of the real outline of the slot), `CORNER_POCKETS` (closed LWPOLYLINE of the corner pocket), `CABLE_HOLE` (CIRCLE), `OUTLINE` (LWPOLYLINE).

### BOM

```json
{ "segments": [{ "id": 1, "lengthMm": 0, "ledCount": 0, "cutLengthMm": 0,
                 "din": [0,0], "dout": [0,0], "dinDir": [1,0], "doutDir": [1,0] }],
  "totalLeds": 0, "anchorHoles": 0, "wireSlots": 0,
  "wireSlotW": 5.4, "wireSlotL": 6,
  "corners": [{ "x": 0, "y": 0, "segments": [1, 2], "wireMm": 0 }],
  "assembly": { "segments": 0, "solderJoints": 0, "wires": 0, "corners": 0,
                "wireM": 0, "totalLeds": 0, "voltageV": 5, "maxCurrentA": 0, "supplyA": 0,
                "controllerWarnings": [] },
  "plate": null,
  "warnings": [] }
```

`lengthMm` is the length of the centreline. LEDs and `cutLengthMm` use the lit part:
the segment minus `WIRE_SLOT_L` at every free end (a closed loop and a `"dot"` dot have no
slots: the lit length is the whole length). `cutLengthMm` is
that length rounded down to multiples of `CUT_PITCH`.
`din` / `dout` = position (mm, front view) of the lip, where the lit part ends;
`dinDir` / `doutDir` = unit tangent of the path at those points, in the DIN → DOUT direction.
`wireSlotW` / `wireSlotL` = size of the slot. `wireSlots` = slots left single: two per segment,
minus the two absorbed by every pocket. A split cusp (`CUSP_MODE` `"split"`), a dash
(`"dash"`) or a dot (`"dot"`) adds a segment. The `"dot"` dot has no slots: it has two
`DOT_WIRE_HOLE_D` holes and `ledCount` 1. An `"unlit"` dot does not enter the BOM.
`corners` = corner joints: position of the shared lip, connected segments, wire 0 mm.
`plate` = summary of the backdrop (§13), `null` without a backdrop.

`assembly` is the assembly summary, on top of the BOM table in the debug page:

- `segments`: segments
- `solderJoints`: DIN/DOUT connections to solder (corner joints do not count); every connection carries 3 wires (`wires`)
- `corners`: corner joints
- `wireM`: estimated metres of wire, sum as the crow flies between every free DOUT and the nearest free DIN, plus 0.2 m for every unpaired end (power). Corner joints count 0
- `totalLeds`
- `voltageV`: voltage of the strip and of the power supply (`STRIP_V`)
- `maxCurrentA`: `totalLeds · LED_MAX_MA / 1000 · 5 / STRIP_V`, full white
- `supplyA`: recommended power supply, the smallest whole number of amperes that covers the maximum current with a 25% margin
- `supply`: model recommended from the catalogue, `{ model, family, watts, amps }` (nominal `amps` of the
  model), or `null` if none holds `supplyA`. The catalogue (`src/parts/supplies.ts`) has ten Mean Well
  families, 100–240 V input, each at 5, 12 and 24 V where it exists: the GST60A plug-in adapter,
  the panel-mount LRS-35/50/75/100/150/200/350 and the sealed IP67 LPV-60/100, with currents, measurements (mm),
  average price (€ per piece, excluding VAT, November 2026) and datasheet. `pickSupply(V, A)` picks the
  GST60A if it is enough, otherwise the smallest LRS that holds the current at the strip voltage; the
  LPVs (outdoor) are never picked
- `box`: box `{ id, model, brand, innerMm, fits, auto, contents }` or `null` (no LEDs, `none`,
  or none is enough); `boxWarnings`; `boxesThatFit`: ids of the boxes that are enough, smallest first
- `controller`: id of the chosen controller (`CONTROLLER_ID`, default `gl-c-309wl`)
- `controllerWarnings`: warnings if `supplyA` exceeds the controller's 10 A (power injection or a
  second controller is needed) or if the LEDs exceed its 800 ICs. They do not block sending; they enter the
  generator's warnings. In the customer page the power supply pill ("12 V · 4 A") turns red and
  Request shows controller, power supply and warnings.

## 5bis. Path editor (`src/editor/`, customer side)

The customer can retouch the lines of the strip after generation, from text as well as from an image.
The editor is in the customer page (`index.html`) and also in `admin.html`. It uses **Paper.js**, loaded
with a dynamic `import()` only when the editor is opened: the initial page does not download it.

### Freezing

- "Edit paths" takes the segments after [D] (before smoothing) and converts them into
  cubic Bézier curves with Paper.js `Path.simplify` (tolerance `EDIT_FIT_TOL`, 0.3 mm).
  From that moment the order contains `paths` (§6) and the pipeline **restarts from [E]**: [A]–[D] are not
  run again.
- With `paths`, [E] **does not smooth** (no Chaikin): it flattens the Béziers into polylines (tolerance
  0.02 mm) and resamples. The curve drawn by the customer is the one produced.
- Changing `heightMm` scales all the curves uniformly about the origin (factor new /
  old height). Changing text, font or image **discards** the edits, after a confirmation.
- "Restore original" removes `paths` and goes back to automatic generation.

### Curve format

Every segment is a `path` with a stable `id` (`p1`, `p2`…, assigned from left to right at
freezing; new ones take the first free number). Nodes in the format of Paper.js segments:
point and relative handles, in mm, rounded to 0.001 mm.

```json
{ "id": "p1", "closed": false,
  "nodes": [{ "p": [0, 0], "in": [0, 0], "out": [4.2, 1.1] }] }
```

Dots (`I_DOT_MODE`): `{ "id": "d1", "type": "dot", "center": [x, y], "angle": 0 }`. They are moved and
rotated, not edited like curves; they can be deleted.

### Operations

- Select a node, drag it; handles appear only on the selected node.
- Add a node (double click / double tap on the curve), delete it (Delete key or button).
- Cusp ↔ curve on a node (handles zeroed or aligned).
- Cut a segment at a point (it becomes two segments); join two endpoints ≤ 1 mm apart.
- Delete a segment; draw a new segment (pen tool).
- Move the whole drawing or a single segment.
- **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z and buttons), at least 50 steps.
- Zoom and pan (wheel, pinch); node targets ≥ 44 px on touch.
- Two consecutive nodes are never closer than `EDIT_MIN_NODE_DIST` (0.5 mm): dragging
  stops before that.

### Crossings

Without a graph, a **crossing** is an intersection between two segments (or of a segment with itself).
One of the two passes under and its strip is interrupted by `CROSSING_GAP` per side (§5 [D]).
Default: the segment with the smaller `id` passes over. A click on the crossing swaps them. The choices are
saved in `crossings` (§6) with the position; at regeneration each one is matched to the nearest
crossing within 2 mm. A choice without a matching crossing is discarded with a warning; a crossing
without a choice uses the default.

### Live validation

- While dragging, in the main thread and only on the touched segments: chain [F] (hinges
  beyond `HINGE_MAX_DEG`) and distance from the other segments (`CHANNEL_W + 2·WALL + MIN_GAP`, with the
  `WALL` chosen by the customer and a spatial grid). The curve, cusp and merge markers (§5) update on every frame.
- On release, after a 300 ms wait, the worker regenerates everything ([E]–[J]) and updates the 3D preview,
  coverage and BOM.
- **Sending is blocked** while there are errors: curves under R_MIN, merges, segments under `CUT_PITCH`
  of lit length. Warnings do not block. Cusps follow `CUSP_MODE` as always.

### Direction

The DIN → DOUT direction follows the rule of §5 ("Direction of the segments"). The editor shows it with an
arrow on every segment.

## 6. Order (customer → admin contract)

```json
{ "schemaVersion": 2, "generatorVersion": "0.2.0",
  "source": { "kind": "text", "text": "Ciao", "fontId": "sacramento" },
  "heightMm": 120, "color": "#ff2fd6", "params": {},
  "paths": null, "crossings": [] }
```

`source` for an image (§4bis):

```json
{ "kind": "image", "format": "svg", "name": "firma.svg", "trace": "centerline",
  "svg": { "elements": [{ "d": "M0 0 C10 5 20 5 30 0", "kind": "stroke" },
                        { "d": "M40 0 L60 0 L60 20 Z", "kind": "fill", "fillRule": "nonzero" }] } }

{ "kind": "image", "format": "raster", "name": "logo.png", "trace": "outline",
  "threshold": 128, "invert": false,
  "bitmap": { "width": 1200, "height": 400, "rle": "<base64>" } }
```

- `paths`: `null` until the customer opens the editor; then the list of §5bis. With `paths`
  generation ignores `source` (which stays as a reference) and starts from [E].
- `crossings`: `[{ "at": [x, y], "under": "p2" }]` (§5bis).
- A `schemaVersion: 1` order is read as v2: `text` and `fontId` go into `source`
  (`kind: "text"`), `paths: null`, `crossings: []`. Same files as before.

### Customer fields (`schemaVersion` 3)

```json
{ "schemaVersion": 3, "generatorVersion": "0.2.0", "pricingVersion": "2026-11",
  "source": { "kind": "text", "text": "Ciao", "fontId": "sacramento" },
  "heightMm": 120, "sizePreset": "M", "color": "#ff2fd6", "params": {},
  "paths": null, "crossings": [],
  "customer": { "effect": "colore fisso", "diffuser": true, "mount": "wall",
                "plug": "EU", "proof": true } }
```

- `customer` collects the customer's choices that **do not change the geometry**: `effect`
  (`LIGHT_EFFECTS`: `"colore fisso"` | `"arcobaleno"` | `"respiro"` | `"scia"` | `"scintille"`, shown as Solid, Rainbow, Breathe, Chase, Twinkle: WLED effects, animated in the preview only; the snapshot for the shop is always the still frame), `diffuser`, `mount` (`"wall"`), `plug` (`"EU"` | `"UK"` | `"CH"` | `"US"`, default `"EU"`; unknown → EU with a warning), `proof`
  (approval draft). The diffuser only changes whether `diffuser.stl` is exported; the edge profile
  and the frame thickness stay in `params` (`EDGE_PROFILE`, `WALL`), as today.
- `sizePreset` is informative: `heightMm` is what counts. `pricingVersion` pins the price table (§12.5).
- Migration in `src/order/schema.ts`: v1 → v2 as today, then v2 → v3 with `customer` at the defaults
  above, `sizePreset` and `pricingVersion` `null`. A migrated v1 or v2 order produces **the same STLs
  and the same BOM** (tests such as `orderSchema.test.ts`).
- The order **contains no personal data**: contact details travel only in the request (§12.7).

### Backdrop (`schemaVersion` 4)

```json
{ "schemaVersion": 4, "...": "as v3",
  "plate": { "shape": "rect", "material": "clear", "marginMm": 20, "cornerRMm": 8 } }
```

- `plate` is `null` without a backdrop. The backdrop generates a production file (`plate.svg`), so
  it does not live in `customer`.
- `shape`: `"rect"` | `"pill"` | `"contour"`; `material`: `"clear"` | `"black"` | `"wood"` (§13).
  Thickness and kerf are not in the order: they depend on the material and live in `src/config.ts`.
- Migration v3 → v4: `plate: null`. A migrated v1, v2 or v3 order produces the same STLs and the
  previous BOM plus `"plate": null`.

The same JSON and the same `generatorVersion` produce the same files (determinism, no randomness).

> **18 November 2026.** The debug page (`debug.html`, `src/ui/debug.ts`) has been removed, after the
> admin page: where this document still says "in the debug page", it describes what that page showed.
> The checks it carried live in the `vitest` tests and in the customer page.

## 7. Stack

- Vite + TypeScript (strict), no heavy UI framework (vanilla TS or Preact)
- `opentype.js`, `manifold-3d` (WASM), `three` (+ `UnrealBloomPass`), `comlink`, `d3-delaunay` (fallback)
- `paper` (Paper.js, `paper-core` build, without PaperScript) for the editor (§5bis), loaded with a dynamic `import()`
- Offsets and unions of the backdrop (§13) with `manifold-3d` `CrossSection`, like [H]: no extra library
- Hand-written DXF export (LWPOLYLINE, AC1015, like the layers in §5) or `dxf-writer`
- Tests: `vitest` on the pure geometry modules
- End-of-phase check: `npm run check`. In sequence it runs `tsc --noEmit`, `vitest run`,
  `vite build`, then starts `vite preview` and the Playwright tests in `tests/smoke/` (Chromium only,
  headless). It covers `index.html`, `bend-test.html` and `spec.html`
  (console error or failed network request, the `.wasm` included), the "Test manifold" button
  (`vertici: 8, triangoli: 12`), the rasterization of "Ciao Torino" with both fonts (skeleton
  and graph visible) and the STLs of parts A and B, which must not be empty. It must be run at the end
  of every phase, and errors fixed until it passes, before the work is considered done.
  Once, after installing the dependencies: `npx playwright install chromium`.
- Deploy:
  - **The public build contains only `index.html` and `parts.html`** (customer page and Parts page): `npm run build:public`
    (`vite build --mode public`).
  - The public site is https://vongomben.github.io/sign-configurator/ . It is the build of
    `npm run build:public` (customer page and Parts). The `base` in `vite.config.ts` stays
    `/sign-configurator/`.
  - `.github/workflows/deploy.yml`, on every push to `main`, runs that build and publishes it with
    `actions/upload-pages-artifact` and `actions/deploy-pages`. For it to start, in Settings → Pages the
    source must be **GitHub Actions**. As long as the source is the `main` branch, that branch
    directly hosts the content of `dist` (the already compiled page) and `index.dev.html` keeps
    the source of the page.
  - `bend-test.html` and `spec.html` are used **only locally** with
    `npm run dev`; `npm run build` compiles them all, as a check.

## 8. Folder structure

```
src/
  config.ts
  fonts/registry.ts, loadFont.ts
  geometry/rasterize.ts, distance.ts, tubes.ts, skeleton.ts, graph.ts, tubePairing.ts, segment.ts, smooth.ts,
           chain.ts, validate.ts, strip.ts, holes.ts, housing.ts, diffuser.ts, edgeProfile.ts, lights.ts,
           plate.ts                (§13: outline, holes, mesh of the backdrop)
  export/stl.ts, dxf.ts, svg.ts, bom.ts, plate.ts (§13: plate.svg, plate.dxf)
  worker/generator.worker.ts, api.ts
  viewer/scene.ts, neonMaterial.ts, plateMaterials.ts (§13)
  sources/svgImport.ts (main thread), svgPaths.ts, rasterImport.ts (main thread), bitmapCodec.ts, contours.ts
  editor/editor.ts (Paper.js, UI), paths.ts (format, scale, flattening: pure), crossings.ts, liveCheck.ts
  order/schema.ts (v4 types, migration v1 → v2 → v3 → v4)
  pricing.ts                      (§12.5, pure)
  order/share.ts                  (§12.6)
  ui/copy.it.ts, sizes.ts
  ui/customer.ts, customer.css
  tools/bendTest.ts (page), bendTestGeometry.ts (test parts A arcs / B corners, testable in Node)
index.html   (customer, §12)
admin.html   (admin: paste or upload JSON, download ZIP)
bend-test.html
tests/smoke/          Playwright (headless Chromium), launched by `npm run check`
playwright.config.ts
```

## 9. Out of scope for v1

Splitting for the print bed, payments, user accounts.
The customer page sends a request, not a paid order (§12.7).

## 10. Open questions

Real thickness of the strip, whether notches and cut pads coincide, 5 or 24 V, what goes into the Ø3 holes (pins, M3 screws, heat-set inserts). They do not block development: the defaults
of `config.ts` stay, to be updated after the measurements on the printed sample.

Images uploaded by the customer: is a statement that they hold the rights needed (a checkbox before sending)?

Backdrop (§13): the wire passages use `PLATE_WIRE_HOLES` (default `true`): through holes under the
slots and at the cable, visible on the transparent one. `false` leaves the plate closed at those points (wires
in the gap between housing and plate). Still to be confirmed on the sample. Fixing housing →
plate: M3 screws from the back into the blind holes, heat-set inserts or standoffs? Real thicknesses of the purchased
materials and kerf measured on the laser for each.

For the customer page (§12), to be decided before publication: price constants
(`src/pricing.ts`, including those of the backdrop), production and delivery times, warranty, shipping costs and
zones, who issues the invoice, email address for requests, text of the privacy
notice. For sending without a mail client the direction is the WooCommerce integration (§11). The customer
page is `index.html`: it is tried locally and published with `npm run deploy` only after
Davide's approval.

## 11. Post-v1 roadmap

- **Per-letter transforms** in the editor (§5bis): move, rotate, scale, spacing, with the
  letter as a group of segments.
- **WordPress / WooCommerce integration** (replaces the `mailto:` of §12.7):
  - [ ] Custom REST endpoint (WP mini-plugin) `neon/v1/richiesta`: creates a WooCommerce order
        "Pending payment" with the configuration as line metadata + `#o=` link (§12.6)
  - [ ] No WooCommerce API key in the configurator code (public repo)
  - [ ] CORS limited to the configurator's domain (or the configurator embedded in the site via shortcode)
  - [ ] Anti-spam with Cloudflare Turnstile: widget in the configurator, token verified on the PHP side
        with the secret key in `wp-config.php`; `turnstile.reset()` after every submission
  - [ ] Honeypot + per-IP rate limit as additional defences
  - [ ] Checkbox / link to the privacy policy (collection of name/email, Turnstile as a third-party service)

## 12. Customer page: value proposition, flow, price

Market reference: the neon flex LED sign configurators already on sale (e.g. customneon.com).
**The structure** is taken from them (the sign visible at once, tools in a dock and one sheet at a time,
§12.2, immediate price, trust bar, custom quote always reachable, shareable
design). Their texts, images, font names, trademarks or slogans are **not** reused.

The customer page is `index.html`. It is tried locally with `npm run dev` and published with
`npm run deploy` only after Davide's approval.

### 12.1 Value proposition

1. **What you see is what we print.** The preview is the geometry of the STL (§5) with the light
   computed on the real LEDs (`lightPoints`); the physical constraints are visible before ordering. This also holds
   for the backdrop: material, thickness and holes in the preview are the ones that get cut (§13).
2. **Your drawing, not just a font.** Text, signature or logo (§4bis), retouchable in the editor (§5bis).
3. **Made here, repairable.** Printed and assembled in Italy; frame, diffuser and strips are
   separable, replaceable parts.
4. **Every LED is addressable.** Effects are standard, not a surcharge (§2).

Working title: *"Write or draw. See your sign as it will really be printed."*
**Language**: the customer page does not depend on Italian. First icons, numbers and units (mm, cm, V, A,
LED/m); the text that remains is short English, all in `src/ui/strings.ts` (`S`), with `lang="en"`.
Generator warnings are in English too, but technical, for admin and debug: `customerMessage` reduces them to
a few sentences for the customer (tight curves, short strokes, close outlines, low-definition image,
uneven stroke, dot, controller limits) and discards all the others; a generation
error becomes "Could not build this sign." (the detail goes to the console). The labels of admin, debug and bend
test stay in Italian. `copy.it.ts` stays as an archive of the texts of future
pages (§12.7–§12.9). **Trust bar**: 3 entries from `copy.it.ts`; an entry with a
`null` value (not yet decided, §10) is not shown.

### 12.2 Mobile first: the sign, then the tools

No step-by-step procedure. The first thing seen is the "Ciao" sign lit, full screen.
A single screen (`100dvh`): the page never scrolls. The styles live in `src/ui/customer.css`
(imported by `customer.ts`), with the system font and no inline styles. `#stage` and its canvas
are 100 % high with `!important`: `scene.ts` leaves the inline `70vh` because admin uses it too.
The background of the customer preview is mid grey (`#5c5c62`, `--stage` in `customer.css` and
`STAGE_BACKGROUND` in `customer.ts`): on black the frame and backdrops disappeared, the neon stays lit
all the same. Admin stays on the light wall of §5.

Under 900 px the sheet is a row of the grid, to the left of the bar, and the preview shrinks above it: it does not
cover it. On opening no sheet is open.

```
┌───────────────────────────┬──────┐
│ On|Off            Request │ Text │
│ With|Without diffuser     │ Font │
│ Frame mm                  │ Size │
│        "Ciao" lit         │Colour│
│                           │  …   │
│ 114 LED         5 V · 9 A │      │
├───────────────────────────┤      │
│ sheet, max 48dvh     Done │      │  ← closed at start
└───────────────────────────┴──────┘
```

- **Preview** (`#stage`) full screen. Overlaid on top: on the left the On/Off pill
  (`radio name="mode"`). Right below, the With diffuser / Without diffuser pill (`radio
  name="diffuser"`): if it is off the scene goes to "senza diffusore" (no diffuser), otherwise it stays on or off.
  Between that block and "Request" (`#open-request`, in the chosen colour, with a slight halo) there is
  `input name="wallMm"` (`WALL`, 1.6–5 mm). Under 900 px, with the preview narrowed by the bar,
  the frame goes down to a third row under the diffuser, on the left. Bottom left, a dark pill, `#preview-status` (`data-generation` stays). Bottom
  right, side by side (`.stage-power`): the **plug** and the power supply. The plug is a dark pill
  (`label.plug-pill`) with the drawing of the face of the plug, the word "Plug" and a menu
  (`select name="plug"`): EU (Europe, type C/F), UK (United Kingdom and Ireland, type G), CH (Switzerland,
  type J), US (United States and Canada, type A/B), in `src/ui/plugs.ts`. The drawing and the title follow the
  choice; it goes into `customer.plug` and into the Request summary ("Plug: … · power supply 100–240 V").
  The power supplies are universal, 100–240 V input: only the shape of the plug changes, not the
  mains voltage. Next to it, if the bill of materials knows the power supply, a dark pill `a#preview-supply`
  with the recommended model, its voltage and its nominal current (`LRS-50-5 · 5 V · 10 A`; without a
  model only `5 V · 8 A`), red beyond the controller limits: it balances the LED count. It is a
  link to the **Parts** page (`parts.html#<family>`, new tab); the title says how many amperes are needed.
  Request shows "LRS-50-5 · 5 V 10 A (needs 8 A)". Without LEDs it stays hidden.
- **Parts page** (`parts.html`, `src/ui/parts.ts`), public and in English: the tables of the power supply
  catalogue split by type (Plug-in adapter, Enclosed, Waterproof), with current and order code at
  5/12/24 V, measurements and price; then the controllers (`CONTROLLERS`) and the strip profiles. The first column is an SVG
  drawing of the model (`src/parts/supplyArt.ts`), oblique and at the same scale for all (0.6 px/mm,
  from the catalogue measurements): box with vents and terminal block (LRS), black brick with C14 socket and
  cable (GST60A), sealed body with two cables (LPV). Drawings, not photos: Mean Well publishes photos only per
  series and those of the resellers are not ours. The controllers have their drawing too
  (`src/parts/controllerArt.ts`, 1.2 px/mm, same scale among them): bare board with green terminal blocks
  (Dig-Uno, Seeed XIAO) or board in a case (the white GLEDOPTOs). Without the maker's
  measurements the outline is dashed, of indicative size (60 × 35 × 20 mm), with "size not published".
  The Boxes section lists the boxes with a scale drawing (`src/parts/boxArt.ts`, 0.4 px/mm), inner
  and outer measurements and price. Every section (power supplies, controllers, boxes, strips) has a **+ Add one** button that opens the GitHub
  issue form `.github/ISSUE_TEMPLATE/new-part.yml` ("New part", labels `new-part` and `needs-review`), with
  the title "[Part] <category>: ". Proposals enter the catalogue only after review by the
  maintainer, by hand in `src/parts/supplies.ts` or `CONTROLLERS`. The row of the anchor is highlighted.
  On a phone every row becomes a card.
- **Dock** (`nav.dock`), always visible: a vertical bar on the right edge, as tall as the
  screen (64 px; 76 px on desktop), with seven large tools (≥ 48 px, icon + label) one
  below the other, centred. Each with `data-tool`: `text` "Text", `font` "Font", `size` "Size", `color` "Color", `image`
  "Image", `plate` "Backdrop", `tech` "Tech", `more` "More".
- **Pointing at a parameter.** In the Tech tool, the mouse over a parameter, or the focus in its field
  (on a phone: a tap), highlights in the preview exactly what the parameter refers to, and nothing more
  (`TECH_FOCUS` in `src/ui/techParams.ts`, `scene.setFocus`, faces chosen by `src/viewer/housingParts.ts`):
  the channel width draws a double arrow across the channel, from wall to wall at the highest LED, over the
  view as it is; the channel depth tints only the inner walls of the channel; the floor thickness tints the
  floor of the channel and the walls of the holes through it; frame, edges and layer height tint the housing;
  the wire parameters ring the end holes or the path holes; the plate size tints the print-bed cuts. For walls,
  floor and holes the sign shows switched off and without the diffuser. The "LED strip" group (strip, density,
  voltage, controller, box) highlights nothing. The highlight is temporary: it goes away with the pointer or
  the focus, it never enters the order or the photo for the shop.
- **Wire fields.** `WIRE_SLOT_L` is labelled "End clearance": the stretch without strip at each end, with the
  hole halfway. `WIRE_SLOT_W` and `SLOT_LIP_CHAMFER` only shape the old slot: the Tech tool hides them while
  `WIRE_HOLE_D` is above 0 (`SLOT_ONLY_FIELDS`). Hidden, they keep their value and still enter the order.
- **Everything in the open.** The tools do not alternate: they all sit in the same "Configure" sheet
  (`data-sheet="config"`), one below the other, each in a collapsible section
  (`details.section[data-section=…]`, open at start, header with an arrow). The bar is
  the index: touching a tool opens the sheet, opens its section and brings it to the top;
  while scrolling, the bar highlights the section on top. On mobile the sheet rises from the bottom (`.sheet`,
  max 48dvh, rounded corners, "Done" `#sheet-close`) and scrolls inside itself; touching the highlighted
  tool again, or "Done", closes it. Request is a separate sheet (`data-sheet="request"`)
  that hides the sections. Esc closes the sheet, except while retouching and except when the focus
  is on a field.
- The `#path-editor` canvas sits over the preview (`position: absolute`, 100 % with `!important`) and is
  visible only with the Configure sheet open and the More section open. Closing the section does not
  call `editor.close()`.

**Desktop** (≥ 900 px): preview on the left, then the sheet, a fixed 400 px column, then the dock
on the right edge. The Configure sheet is always open, with all the sections; "Done" is not shown there.
Esc, on desktop, only leaves the Request sheet and goes back to the last section.

Every section contains a `.pane[data-pane=…]`; Request is the `.pane[data-pane="request"]`:

- **text.** `input name="text"`, initial value "Ciao", large. Focusing the field brings the source back to
  text.
- **font.** Compact cards in a two-column grid, all in view without horizontal scrolling: each shows the customer's text in the
  font. The TTFs are loaded with `FontFace` from `import.meta.env.BASE_URL` + `font.file`. `select
  name="fontId"` stays hidden and is the source of truth. With an image as the source the tool is
  dimmed. **v1.1**: 2D thumbnails for the single-stroke fonts.
- **size.** S/M/L/XL chips from `src/ui/sizes.ts` (`.size-chip[data-size=mm]`, `S 80`, `M 120`, `L 180`,
  `XL 250`) plus `input name="heightMm"` with − and + in 10 mm steps (limits 40–800). The height is the top
  of the "H" for text and the height of the box for an image (§4bis). Changing the size scales the
  paths already retouched (§5bis). **v1.1**: price on every size; sizes disabled under the minimum.
- **color.** Nine swatches, `input type="color" name="color"` and `radio name="effect"` solid/rainbow.
  The chosen colour updates `--neon` and `--on-neon` (light or dark depending on luminance), used by
  "Request", by the active tool and by the primary buttons. **v1.1**: one colour per segment.
- **plate** ("Backdrop", §13). Material: None / Clear acrylic / Black transparent acrylic /
  Wood, with the thickness (`radio name="plateMaterial"`: `none`, `clear`, `black`, `wood`). With a
  material: shape Rectangular / Pill / Contoured around the LEDs (`radio name="plateShape"`:
  `rect`, `pill`, `contour`), margin around the sign 10–60 mm (`input name="plateMarginMm"`) and,
  for the rectangle, corner radius 0–50 mm (`input name="plateCornerRMm"`). With "None" the
  other fields are dimmed and disabled. After generation `#plate-size` shows the measurements of the
  plate and the number of holes. The backdrop appears in the Request summary and in the order (`plate`,
  §6). It has its own entry in the toolbar, like the others: with the vertical bar there is room.
- **image.** A large "Upload an image" area with `input name="image"`. The file makes the image the
  source (hidden `radio`s `name="sourceKind"`). Then trace, threshold, invert and "Back to
  text" (`#back-to-text`) appear, as in §4bis.
- **tech** ("Technical parameters"). The same parameters as the bend test, grouped as there, with
  a label and the name of the parameter: strip (`STRIP_W`, `STRIP_T`, `HINGE_PITCH`,
  `HINGE_MAX_DEG`), channel (`CHANNEL_W`, `CHANNEL_DEPTH`, `FLOOR`), wires (`WIRE_SLOT_W`,
  `WIRE_SLOT_L`, `SLOT_LIP_CHAMFER`), edges (`EDGE_PROFILE`, `CHAMFER_SIZE`, `CHAMFER_ANGLE`,
  `LAYER_STEP`).
  The strip group also has the **voltage** (`select name="tech-STRIP_V"`: 5, 12, 24 V, default
  5; in the order only if different) and the **LED density** (`select name="tech-LED_PER_M"`): only 30, 60,
  74, 96 and 144 LED/m (`LED_DENSITIES` in `techParams.ts`), default 144 (`DEFAULT_LED_DENSITY`).
  The strip profile in `config.ts` (160, the COB) is not on the scale and applies only to admin and
  debug: the customer page always writes `LED_PER_M` into the order. It changes the number and pitch of the
  LEDs in the preview, in the BOM and in the power supply; it does not change `CUT_PITCH`. The dot and the
  isolated marks stay at one LED. Fields `input name="tech-<PARAMETER>"`, table and limits in `src/ui/techParams.ts`.
  `WALL` stays on the preview bar; `BANK_TRANSITION_L` is not needed for generation and is absent.
  Only values different from the default go into the order; an empty, non-numeric or out-of-range field
  stays at the default and is marked `aria-invalid`. `WIRE_SLOT_W` follows `CHANNEL_W` until it is
  changed by hand. "Default values" (`#tech-reset`) restores everything. Changed values appear
  in the Request summary and are passed to the path editor.
- **more.** `#edit-paths`, `#restore-paths` and `#path-toolbar`. "Edit paths" opens the editor of
  §5bis over the preview. Changing text, font or image discards the edits after confirmation. Diffuser
  and frame are on the preview bar, not in this sheet.
- **request** (from "Request"). Summary `<dl id="summary">`: the customer's text is text, not HTML;
  it includes the backdrop (none, or material, shape and margin).
  `#blocked-reason` is visible when sending is blocked. `#submit-order` "Send request",
  `#download-stl`. **v1.1**: price, power supply, mounting, approval draft and form (12.7).

Every change updates the 3D when it is ready (§5). Choices persist when changing tool. **v1.1**, besides
what is marked above: indicative price, backgrounds and dimensions of the preview (12.3), square/chamfered edge,
quote (12.8) and the "Info" panel (12.9). The other parameters of §3 (besides those of the
Tech tool) and of §13 stay in admin only.

### 12.3 Preview in a setting

- Selectable backgrounds (light wall, dark wall, bricks, wood, the neutral one of §5): our own textures in
  `public/backgrounds/`, ≤ 300 kB, with a mobile version. Generated patterns are fine in the
  test page.
- Dimensions in cm that can be switched on, which with a backdrop include the plate; optional scale
  reference (neutral outline of a socket or of a door).
- On/off switch (§5).

### 12.4 Understandable constraints

The warnings of §5, §4bis and §5bis are for the admin. The customer sees only these, with the texts of
`copy.it.ts`:

| Warning | What the customer sees | Blocks the request |
|---|---|---|
| minimum height (curves, merges) | "At this size the curves are too tight: from X cm up" + "set to X cm" | yes |
| editor errors (§5bis: curves under R_MIN, merges, short segments) | marker on the path + "fix or undo" | yes |
| backdrop beyond the laser bed (§13) | "The backdrop is larger than the maximum we cut: reduce size or margin" | yes |
| character without a glyph | "This font does not have the character "ñ"" | no |
| low-resolution image | "Image not sharp enough for this size: up to X cm, or upload a larger one" | no |
| uneven stroke | "Try the Outline mode" + button | no |
| coverage under `COVERAGE_MIN` | "Some strokes stay poorly lit at this size" + recommended height | no |
| dot without strip | "The dot does not light under X cm" | no |
| cusps (`CUSP_MODE` `"split"`) | nothing | no |

A blocking constraint disables "Send request" and shows the reason in `#blocked-reason`; it does not hide the button.

### 12.5 Price

**As it is today (17 November 2026).** The Order panel shows the price **line by line**, under the
summary, when the shop is configured (§15). `src/order/quote.ts` (`quoteSign`) takes the measurements
from the bill of materials and the prices from the catalogues, then calls `priceOrder` of `src/pricing.ts`:

| Line | Where it comes from |
|---|---|
| Controller | `priceEur` of the chosen controller (§2) |
| LED strip · n m | sum of the `cutLengthMm` plus 20 % waste, times the `eurPerM` of the strip |
| 3D printing | €7 up to 70 cm of width, €14 beyond |
| Assembly · n min | €1 per minute: the minutes of cuts and jumpers in the summary |
| Power supply, Box | average of the price range of the chosen model, from the parts page |
| Backdrop | laser €15 plus the material; absent without a backdrop |
| Margin 15 % | on the total of the lines above |
| Rounding, Minimum order | rounding up to €5, minimum €25 |

Lines at zero do not appear. The list closes with the total excluding VAT and, separately, the estimated
shipping (€20). The sum of the lines is the total. The same rows leave with "Send request", with the
prefix "Price · ", and reach the shop together with the summary.

A strip without `eurPerM` (not yet surveyed) has the line "to be quoted" and the total is called
"Total without the strip": a total that looks complete and is not is never shown. The strips with a price
are the 10 mm WS2812B 144 LED/m, the standard one (€20/m), the 10 mm WS2812B 60 LED/m (€5.20/m)
and the 5 mm COB (€5.14/m).

What follows is the original design, partly superseded: the formulas on grams and tiers are not
the ones in use.

It is computed **from the 2D**, without waiting for the solid, in `src/pricing.ts` (pure module, tested). It is
the same with or without `paths`.

```
volumeMm3   = area(outline) · (FLOOR + CHANNEL_DEPTH) − area(channel) · CHANNEL_DEPTH
grams       = volumeMm3 / 1000 · PLA_DENSITY · INFILL_FACTOR      (+ diffuser if chosen)
strip       = Σ cutLengthMm / 1000                                 (m)
backdrop    = area(plateOutline) / 1e6 · EUR_PER_M2[material]
            + perimeter(backdrop cuts) / 1000 · EUR_PER_M_LASER    (0 without a backdrop)
price       = BASE
            + strip · EUR_PER_M_STRIP
            + grams · EUR_PER_G_PRINT
            + assembly.segments     · EUR_PER_SEGMENT
            + assembly.solderJoints · EUR_PER_JOINT
            + powerSupply(supplyA)                                  (tiered table)
            + backdrop
            + options
customerPrice = max(PRICE_MIN, round_up(price · MARGIN, €5))
```

**Assembly time (18 November 2026).** Labour is €1 per minute. The minutes come from `assemblyMinutes`
(`src/config.ts`), on the cuts on bends plus the jumpers: the first `ASSEMBLY_FULL_CUTS` (5) count
`ASSEMBLY_MIN_PER_CUT` (10 min) each, the following ones `ASSEMBLY_MIN_PER_EXTRA_CUT` (4 min) each.
41 cuts are 5 · 10 + 36 · 4 = 194 minutes, not 410. `PRICING_VERSION` is `2026-11-18`.

`priceOrder` receives the diffuser choice and the 2D measurements (areas, sum of the `cutLengthMm`,
`assembly`, `supplyA`, thicknesses, area and perimeter of the backdrop cuts): it does not wait for the meshes. The
volume of the diffuser, if `customer.diffuser` is true, is `area(outline) · DIFFUSER_T` (solid part,
without `INFILL_FACTOR`). `supplyA` 0 does not add the power supply; otherwise the first tier
with `maxA` ≥ `supplyA` applies. Effect and draft stay at 0: effects are standard (§12.1).
`round_up` is the next multiple of €5. A negative volume is treated as 0.

- Constants with `PRICING_VERSION` (e.g. `"2026-11"`), **placeholder** values until fixed (§10).
- **Indicative** price, VAT included, shipping separate, confirmed with the draft.
- Every size of the Size tool will show its own price (v1.1): the worker computes the 2D of the
  other heights in sequence, after the selected one. The customer page does not show the price yet.
- In admin: line-by-line breakdown.
- Same order + same `PRICING_VERSION` → same price (test).

### 12.6 Sharing

- "Save or share" produces `index.html#o=<base64url(order JSON)>`; when opened, the page
  rebuilds the sign. The hash does not reach the server. With `navigator.share` the native sheet is used.
- An order with an image or `paths` can be large: if the link exceeds **8 kB**, the link is not
  offered, but **"Download the design (.json)"** and "Upload a design" are.
- The link and the file contain only the order (§6), never contact details.
- On opening: migration (§6), unknown fields ignored (contact details too), out-of-range values
  clamped to the limit with a warning, never an exception. Limits: height 40–800 mm, `WALL` 1.6–5 mm (§1),
  bitmap threshold 0–255 (§4bis), colour `#rrggbb` otherwise the default of the example (`#ff2fd6`),
  `plate.marginMm` and `plate.cornerRMm` within the limits of §13. Unknown `effect`, `mount`, `plug`, `trace` or
  `sizePreset` fall back to the default; unknown `plate.shape` or `plate.material` give
  `plate: null`. `generatorVersion` different from the current one → warning, without blocking. The 8 kB are
  the UTF-8 length of `#o=` plus the base64url, without padding.

### 12.7 Request

**As it is today (17 November 2026).** "Send request" sends four things to `POST /api/design`, none
personal: the order, the summary (text rows), the **estimate** and a **photo**. A code is returned, and
the customer moves to the shop cart (§15), where they enter their details.

- **Estimate** (`quote`): the lines of the Order panel (§12.5), each with `id`, label, detail
  (controller model, strip and metres, power supply, box, cuts and minutes) and amount; then
  total excluding VAT, estimated shipping, `pricingVersion` and `complete` (false if a line has no
  price). **It is computed by the customer's browser**: it is an estimate, the shop shows it as such and does not
  use it to charge. Whoever reviews the order reopens the design and the configurator recomputes.
- **Photo** (`image`): `scene.snapshot()`, a 1000 × 750 JPEG in the standard view: from the front, lit,
  with the diffuser, without the cuts for the print bed. It does not depend on how the customer rotated
  or switched off the preview.
- **Server checks** (`src/api/designStore.ts`): the estimate is copied field by field (at most 20
  lines, amounts between €0 and €100,000, short texts); the photo must be a JPEG data URL, valid
  base64, within 400 kB, and start like a JPEG. If either is present but not valid the
  request is rejected (`bad_quote`, `bad_image`) and nothing is left in the KV. Both are
  optional.
- **Where they live**: the estimate inside `design:<code>`, the photo separately in `image:<code>`, with the
  same 180-day expiry.
- **How the shop reads them**: `GET /api/design/<code>` adds `quote` and `imageUrl`;
  `GET /api/design/<code>/image` gives the bytes, always `image/jpeg` with `nosniff`. The WordPress
  plugin keeps a copy in the order, because here the photo expires.

What follows is the original design (form and `mailto:`), superseded by the shop.

No payment (§9): the Request sheet sends a **request**.

- Fields: name, email, phone (optional), postcode and city, date by which it is needed (optional), notes,
  privacy consent (mandatory); with an image, the checkbox on usage rights (§10).
- Sending in v1: `mailto:` with subject "Richiesta insegna — <text or file name>", summary, indicative
  price, `PRICING_VERSION` and the 12.6 link (or the invitation to attach the `.json`).
- Confirmation page with "what happens now"; times from `copy.it.ts`.
- Sending without a mail client moves to the WooCommerce integration (§11).

### 12.8 Custom quote

For what the pipeline does not close (multiple lines, scripts not covered, sizes out of range, images that
stay blocked after the editor): the same form with description, approximate size and budget in
tiers; the file is attached to the mail.

### 12.9 Informative content

It does not sit under the configurator (12.2: one screen): it opens from the "Info" button in an overlaid
panel, closable with Esc or with "Back to the sign", without losing the state. In this order:

1. **How it works**: create, receive the draft, receive the sign.
2. **What is in the box**: exploded view frame / strip / diffuser / backdrop / power supply /
   fixings, generated from the three.js scene.
3. **Before and after**: slider preview / real photo, only with our own photos (`public/gallery/`).
4. **FAQ**: safety (5 V, no glass, no heat), consumption, mounting, cleaning, effects,
   warranty, times and shipping, images and rights, changes after the order.

### 12.9bis Downloading the STL

The customer page (`index.html`) downloads the STLs as in §5 (Preview), with `CUSTOMER_STL_DOWNLOAD`.
With a backdrop (§13) it also downloads `<name>-<height>mm-backdrop.stl` (the plate, in the same
position as the housing) and `<name>-<height>mm-backdrop.svg` (the laser cutting file). BOM, DXF and SVG
of the housing stay in admin.

### 12.10 Tests

- Unit: price deterministic and monotonic in height; order → hash → identical order; v1, v2 and v3
  migrated to v4 with the same STLs and the previous BOM plus `"plate": null`; malformed hash → warning,
  no exception; order over 8 kB → no link, `.json` download.
- Smoke (Playwright): the page opens on "Ciao" at 390×844 and at 1280×800 and does not scroll
  (`scrollWidth` / `scrollHeight` ≤ window) either horizontally or vertically; on desktop all
  the sections are open and visible; every tool of the bar opens its section and brings it into
  view, even after it has been closed; Request shows a single `.pane`; size L sets
  `heightMm` to 180 and the summary shows "18 cm"; on mobile "Done" closes the sheet; with a backdrop
  the download gives four files. **v1.1**: price (of the backdrop too), size under the minimum
  disabled with a reason, link that rebuilds text, font, height and backdrop, "Info" that opens and
  closes with Esc. Paper.js is not downloaded until the editor is opened.

## 13. Backdrop (laser-cut plate)

The backdrop is optional and visible in the preview with real material, thickness and holes.
Preview and export derive from the same polygons (mm), in `src/geometry/plate.ts` (`buildPlate`):
no visual-only geometry. `generate` returns `plate` (outline, holes, measurements, choice) and
`plateMesh`; without a backdrop they are `null`.

### Parameters (`src/config.ts`)

| Parameter | Default | Meaning |
|---|---|---|
| `PLATE_MARGIN` | 20 | margin between the outline of the sign and the edge of the plate (customer: 10–60 mm) |
| `PLATE_CORNER_R` | 8 | corner radius for `rect` (0–50 mm) |
| `PLATE_MAX_W` / `_H` | `null` | usable bed of the laser. `null` does not block; with a number, beyond it is a blocking constraint (§12.4) |
| `PLATE_FIX_HOLE_D` | 3.4 | fixing holes aligned with the anchors (depends on the fixing, §10) |
| `PLATE_MOUNT_HOLE_D` | 5.0 | wall mounting holes |
| `PLATE_MOUNT_INSET` | 10 | distance of the mounting holes from the edge |
| `PLATE_MOUNT_CLEARANCE` | 3 | minimum air between a mounting hole and the outline of the sign |
| `PLATE_WIRE_HOLES` | true | through holes for slots and cable ("Wire passages") |
| `PLATE_WIRE_HOLE_D` | 6 | diameter of the wire passages under slots and corner pockets |
| `PLATE_T` | 3 / 3 / 4 | thickness per material (`clear` / `black` / `wood`) |
| `PLATE_KERF` | `null` | kerf per material; `null` (TO BE CALIBRATED) counts as 0 |

### Shapes (`manifold-3d` CrossSection, rounded joins)

- `rect` "Rectangular": the rectangle that contains the outline of the housing plus the margin, corners
  rounded by `cornerRMm` (from the order; by default `PLATE_CORNER_R`).
- `pill` "Pill": like `rect` with radius = half the short side.
- `contour` "Contoured around the LEDs": offset of the outline by the margin; inner holes (the counter
  of the "o") are filled. If the letters stay in several pieces, a morphological closing (offset
  out and then in, radii 10–160 mm) joins them; if that is not enough, the convex hull is used with a
  warning.

### Materials (chosen by the customer)

| id | Label | `PLATE_T` | Preview |
|---|---|---|---|
| `clear` | Clear acrylic | 3 | light, glossy acrylic, very transparent: holes and wires show behind |
| `black` | Black transparent acrylic | 3 | glossy semi-transparent smoke grey, which reads as black on the grey of the preview |
| `wood` | Wood | 4 | matt brown |

Placeholder thicknesses: they must be replaced with those of the purchased materials (§10). The materials live
in `src/viewer/scene.ts` (`MeshStandardMaterial`). The plate sits between Z = −thickness and Z = 0, that is
right behind the back of the housing: the STL of the plate and that of the housing line up without
shifts. The framing of the preview includes the plate. The plate sits in front of the wall and would
cover the glow of the neon on it: the plate receives it instead, from the same texture as the wall (`emissiveMap`, with the
coordinates of the XY plane), stronger on matt wood and damped on glossy acrylic. With a backdrop the
room light in the lit views is three times that without a backdrop, otherwise the plate
would disappear into black.

### Holes

All through holes:

- fixing under every anchor of the housing, Ø `PLATE_FIX_HOLE_D`;
- main cable, Ø `CABLE_HOLE_D`;
- wire passages (below);
- only for `rect` and `pill`: four wall mounting holes in the corners, Ø `PLATE_MOUNT_HOLE_D`
  at `PLATE_MOUNT_INSET` from the edge. A hole that would end up less than `PLATE_MOUNT_CLEARANCE` from the
  outline of the sign is removed, with a warning that suggests increasing the margin.

`PLATE_KERF` compensation: the outline grows by kerf/2 and the holes shrink by kerf/2, so
the final measurements are the nominal ones.

### Wire passages

The wires that leave the sign go through the backdrop if `PLATE_WIRE_HOLES` is true (default `true`).
**Since 18 November 2026 the backdrop carries the same holes as the housing**, at the same point and with the
same diameter: the large ones at the ends (`WIRE_HOLE_D`), the small ones along the path
(`PATH_HOLE_D`; they switch off on their own with `PLATE_PATH_HOLES` false) and those of the dots
(`DOT_WIRE_HOLE_D`). Where the cable goes through the large hole of the first end the backdrop has a single hole,
as wide as the larger of the two. No hole overlaps another. This holds for every solid
backdrop, that is for all of them today. With the old slots (`WIRE_HOLE_D` 0) there is still
a Ø `PLATE_WIRE_HOLE_D` hole under every slot and corner pocket. `false` leaves the backdrop closed at those points (the cable
hole stays). It changes neither frame nor diffuser. It stays an open question (§10) until it is measured on the
sample.

### Export

`backdrop.svg` (`src/export/plate.ts`), in mm (`width`/`height` in mm, `viewBox` in mm), **seen from the
back like `back.dxf`**, so the two files overlay. Blue (`#0000ff`) = holes, to be cut
first; red (`#ff0000`) = outline, last. Material, thickness and measurements are in `<title>` and
`<desc>`. `backdrop.stl` is the plate in 3D, for assembly. **To do**: `plate.dxf` and the text
"BACK" on an engraving layer (green); the engraving must go where there is always plate.
In the BOM `plate` = `{ shape, material, widthMm, heightMm, areaMm2, cutLengthMm, thicknessMm,
fixHoles, mountHoles, wireHoles }`, `null` without a backdrop.

### Tests

`test/plate.test.ts`: measurements of the rectangle and thickness; a hole in the plate for every hole; pill
with radius equal to half the short side; contoured in a single piece and smaller than the rectangle; mounting
holes removed with a narrow margin; no wire passages with `PLATE_WIRE_HOLES` false; mirrored SVG in
mm; backdrop BOM; the generator produces the backdrop only if the order asks for it; the
backdrop survives the shared link. Smoke: with the backdrop the download gives four files.

## 14. Download and request counter

How many times "Download STL" was pressed and how many times a request was sent. It serves whoever runs the
site and, above a threshold, is shown to customers in the Order panel.

- **Data**: a D1 database bound to Pages with the name `STATS`, table `events(id, type, ts)`
  (`migrations/0001_events.sql`). `type` is `stl` or `request`, `ts` is the ISO time. No IP, no
  cookie, no personal data: the count is anonymous.
- **Optional binding**, like `DESIGNS`: without `STATS` nothing is counted and everything else works.
- **`POST /api/event`**, body `{ "type": "stl" }`: the page sends it on every click on "Download STL"
  (`navigator.sendBeacon`, one event per click even with the multi-part zip). It accepts only `stl` and only
  if the host of `Origin` (or, if missing, of `Referer`) is that of the request: no domain in the code,
  so it works on pages.dev, on previews and in forks. Responses: 204, 403 different origin, 400 invalid
  type.
- **Requests**: `POST /api/design` counts them when the design is saved (201), after the response. An
  error of the counter neither changes nor slows the response to the customer. It counts moves to the cart,
  not completed orders: those are in the shop.
- **`GET /api/stats`**: `{ "downloads": n, "requests": n }`, cached for 5 minutes. Without a database it answers
  200 with both values `null` (not 404, which would leave an error in the browser console).
- **Customer page**: on the first opening of the Order panel it asks for the totals and shows a small line
  under the buttons, for example "123 downloads · 12 requests so far". The labels of the buttons do not
  change. Each total appears only from `STATS_MIN_SHOWN` (`src/config.ts`, 10) up; if none gets
  there, or if the endpoint does not answer, the line does not appear and leaves no empty space.
- **Locally** (`vite`, `vite preview`) the Functions do not run: `vite.config.ts` answers
  `/api/stats` and `/api/event` like a site without a database.
- The calls are relative to the page, never to an absolute address: a fork counts its clicks in
  its own database, not in that of another site.

## 15. Configurable shop

The shop that "Send request" leads to is not written in the code. It comes from two build variables:
`VITE_SHOP_URL` (address of the WooCommerce shop) and `VITE_SHOP_PRODUCT_ID` (generic product to which
the shop attaches the design). `src/config.ts` reads them into `SHOP`; `shopCartUrl(code)` builds
`<shop>/?add-to-cart=<product>&design=<code>`.

- **Where they are set**: on Cloudflare Pages in Settings → Variables and secrets, for Production and
  Preview (they are read at build time: after a change a new deploy is needed); locally in `.env.local`
  (template in `.env.example`).
- **Without the variables**, or with invalid values, `SHOP` is `null`: "Send request" and the note about contact
  details do not appear, "Download STL" stays. A fork does not send its customers to someone
  else's shop.
- **`npm run check`** builds with `--mode check` and reads `.env.check`: a fake shop
  (`shop.example.test`), so the tests do not depend on a real shop.

## 16. Invitation to support the project

Whoever downloads the STL and prints the sign buys nothing: the page suggests offering a coffee.
The address of the donation page (Ko-fi, Buy Me a Coffee or similar) is not written in the code:
it comes from the build variable `VITE_SUPPORT_URL`, read into `SUPPORT_URL` by `src/config.ts`, and is
set like the shop variables (§15).

- **Where it appears**: one line under the name, after the GitHub link ("☕ Offer me a coffee"), and one
  in the Order panel under "Download STL" and the line of totals ("Printing it yourself? Offer me a
  coffee: espresso, doppio or corretto.").
- **Links only**: they open in a new tab. No third-party script or widget in the page,
  so no extra cookie and no visitor data goes through here.
- **The three sizes** (espresso, doppio, corretto) are named in the text and are chosen on the donation
  page: we do not rely on links that preset the amount.
- **Without the variable**, or with a value that is not an http(s) address, `SUPPORT_URL` is `null` and
  the two lines do not appear. A fork does not collect donations for someone else.
- **Repository**: the GitHub Sponsor button is separate, in `.github/FUNDING.yml`.
- **`npm run check`** uses a fake page (`support.example.test`) from `.env.check`.
