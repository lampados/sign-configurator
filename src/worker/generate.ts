// [A]–[I] in the worker: from the order to the meshes, the holes and the bill of materials (SPEC §5, §6).
import { buildPlate, plateBom, type PlateBom, type PlateModel } from '../geometry/plate';
import type { Manifold, Mesh } from 'manifold-3d';
import { assemblyMinutes, resolveParams, stripFitWarnings, stripProfileOf } from '../config';
import type { Bom } from '../export/bom';
import type { FontBytesReader } from '../fonts/loadFont';
import { buildGraph, type SkeletonGraph } from '../geometry/graph';
import { buildHousing, type HousingHole, type HousingPocket, type HousingSlot } from '../geometry/housing';
import { getManifold } from '../geometry/manifold';
import { planSplit, SPLIT_CLEARANCE, type SplitPiece } from '../geometry/split';
import { rasterize, type GlyphInfo, type RasterizeInput, type TextRaster } from '../geometry/rasterize';
import { layoutStroke } from '../geometry/strokeLayout';
import { ledToDiffuserMm, lightPointsFromChains, type LightPoint } from '../geometry/lights';
import { getFont, NO_LETTERS } from '../fonts/registry';
import { applyCoverage, coverSign } from '../geometry/coverage';
import { buildStrip, buildStripFromPieces, type StripModel } from '../geometry/strip';
import { dotSegment, flattenPaths, type EditSegment } from '../editor/paths';
import { cutCrossingGaps, intersectPaths, resolveCrossings } from '../editor/crossings';
import { migrateOrder, type AnyOrder, type OrderV1, type SignOrder, type SignOrderV4 } from '../order/schema';
import { layoutRaster } from '../sources/bitmapCodec';
import { layoutSvg } from '../sources/svgPaths';

export type { OrderV1, SignOrder };

export interface MeshData {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  mergeFromVert: Uint32Array;
  mergeToVert: Uint32Array;
}

export interface Centerline {
  id: number;
  points: [number, number][];
}

export interface GenerateResult {
  housingMesh: MeshData;
  diffuserMesh: MeshData;
  holes: { anchors: HousingHole[]; cable: HousingHole | null };
  slots: HousingSlot[];
  pockets: HousingPocket[];
  /** Small holes along the path, in the channel floor. */
  pathHoles: { segmentId: number; x: number; y: number; d: number }[];
  outline: [number, number][][];
  centerlines: Centerline[];
  /** LEDs along the centreline, DIN → DOUT. The pitch is LED_PER_M. */
  lightPoints: LightPoint[];
  /** LED face–diffuser distance, mm. It is the sigma of the gaussian in the preview. */
  ledGapMm: number;
  /** Geometry BOM plus `plate`, the summary of the backdrop (SPEC §13). Without a backdrop it is null. */
  bom: Bom & { plate: PlateBom | null };
  warnings: string[];
  /** Segments after [D], before Chaikin. "Edit paths" starts from here. */
  segments: EditSegment[];
  /** Backdrop (SPEC §13), behind the housing between Z = −thickness and 0. null without a backdrop. */
  plateMesh: MeshData | null;
  plate: PlateSummary | null;
  /** Pieces for the print bed (SPEC §14). null: housing and diffuser fit the bed whole. */
  split: SplitResult | null;
}

export interface SplitResult {
  /** Abscissas of the vertical cuts, increasing, mm. */
  cutsX: number[];
  /** Joints that cross a lit channel: there the strip must be interrupted and resoldered. */
  onChannel: number;
  minY: number;
  maxY: number;
  /** One piece per element, from left to right. */
  housing: MeshData[];
  diffuser: MeshData[];
}

/** The backdrop without the mesh: what the cutting SVG, the summary and the preview need. */
export type PlateSummary = Omit<PlateModel, 'solid'>;

function editSegments(strip: StripModel): EditSegment[] {
  const count = Math.max(strip.paths.length, strip.chains.length);
  const segments: EditSegment[] = [];
  for (let i = 0; i < count; i++) {
    const path = strip.paths[i];
    const chain = strip.chains[i];
    const points = path?.points ?? chain?.points;
    if (!points || points.length < 2) continue;
    segments.push({
      points: points.map((point) => [point[0], point[1]]),
      closed: path?.closed ?? chain?.closed ?? false,
      dot: chain?.dot === true,
    });
  }
  return segments;
}

function copyMesh(mesh: Mesh): MeshData {
  return {
    numProp: mesh.numProp,
    vertProperties: new Float32Array(mesh.vertProperties),
    triVerts: new Uint32Array(mesh.triVerts),
    mergeFromVert: new Uint32Array(mesh.mergeFromVert ?? []),
    mergeToVert: new Uint32Array(mesh.mergeToVert ?? []),
  };
}

/** Cuts the solid at the x = constant planes of the pieces, with SPLIT_CLEARANCE of air per face. */
function cutSolid(solid: Manifold, pieces: readonly SplitPiece[]): MeshData[] {
  const meshes: MeshData[] = [];
  pieces.forEach((piece, i) => {
    const made: Manifold[] = [];
    let part = solid;
    try {
      if (i > 0) {
        part = part.trimByPlane([1, 0, 0], piece.x0 + SPLIT_CLEARANCE);
        made.push(part);
      }
      if (i < pieces.length - 1) {
        part = part.trimByPlane([-1, 0, 0], -(piece.x1 - SPLIT_CLEARANCE));
        made.push(part);
      }
      meshes.push(copyMesh(part.getMesh()));
    } finally {
      for (const m of made) m.delete();
    }
  });
  return meshes;
}

function xRange(points: readonly (readonly [number, number])[]): { x0: number; x1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const [x] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  return { x0, x1 };
}

/** With `paths` the geometry is already in mm: no [A]–[D] and no Chaikin. */
function stripFromPaths(order: SignOrderV4, params: ReturnType<typeof resolveParams>, warnings: string[]): StripModel {
  const flat = flattenPaths(order.paths ?? []);
  const hits = intersectPaths(flat.curves);
  const resolved = resolveCrossings(hits, order.crossings);
  warnings.push(...resolved.warnings);
  const cut = cutCrossingGaps(flat.curves, resolved.applied, params.CROSSING_GAP);
  const pieces = [
    ...cut.pieces.map((piece) => ({ points: piece.points, closed: piece.closed, dot: false })),
    ...flat.dots.map((dot) => ({
      points: dotSegment(dot.center, dot.angle, params.CUT_PITCH),
      closed: false,
      dot: true,
    })),
  ];
  return buildStripFromPieces(pieces, params, order.heightMm, {
    notices: resolved.applied.map((crossing) => ({
      kind: 'crossing' as const,
      x: crossing.at[0],
      y: crossing.at[1],
      radiusMm: null,
      degree: 4,
      points: [],
    })),
    gaps: cut.gaps,
  });
}

/** Full pipeline. `read` is for the tests in Node; in the browser the worker uses fetch. */
export async function generateSign(order: AnyOrder, read?: FontBytesReader): Promise<GenerateResult> {
  const current = migrateOrder(order);
  const params = resolveParams(current.params);
  const warnings: string[] = [...stripFitWarnings(params)];

  let glyphs: GlyphInfo[] = [];
  let strip: StripModel;
  if (current.paths != null) {
    strip = stripFromPaths(current, params, warnings);
  } else {
    let raster: TextRaster;
    let graph: SkeletonGraph;
    if (current.source.kind === 'text') {
      const input: RasterizeInput = {
        text: current.source.text,
        fontId: current.source.fontId,
        heightMm: current.heightMm,
      };
      const entry = getFont(current.source.fontId);
      if (!entry) throw new Error(`Unknown font: "${current.source.fontId}"`);
      const laid = entry.kind === 'stroke' ? await layoutStroke(entry, input, read) : null;
      raster = laid ? laid.raster : await rasterize(input, read);
      // No letter of the text is in the font (Cyrillic in Sacramento): an empty graph would make
      // the following steps fail with an error that says nothing. The customer page recognizes it.
      const lost = new Set(raster.missing);
      if (lost.size > 0 && [...input.text].every((ch) => /\s/.test(ch) || lost.has(ch))) throw new Error(NO_LETTERS);
      graph = laid ? laid.graph : buildGraph(raster);
    } else if (current.source.format === 'svg') {
      const laid = layoutSvg(current.source, current.heightMm);
      raster = laid.raster;
      graph = laid.graph;
    } else {
      const laid = layoutRaster(current.source, current.heightMm);
      raster = laid.raster;
      graph = laid.graph;
    }
    warnings.push(...raster.warnings);
    glyphs = raster.glyphs;
    // stripMode "walls" and "centerline" use the edges of the graph: no median.
    strip = buildStrip(
      { nodes: graph.nodes, edges: graph.edges, strokeWidthMm: graph.strokeWidthMm },
      params,
      current.heightMm,
    );
  }
  const coverage = coverSign({
    glyphs,
    paths: strip.paths,
    gaps: strip.gaps,
    excluded: strip.excluded,
    walls: [],
    corners: strip.bom.corners,
    params,
    heightMm: current.heightMm,
  });
  applyCoverage(strip, coverage);
  warnings.push(...strip.issues.map((issue) => issue.message));
  // A strip that does not bend sideways is cut at every curve: every bent hinge is a cut,
  // and every cut is assembly time (SPEC §2). Strips that curve have none.
  const profile = stripProfileOf(params.STRIP_ID);
  if (!profile.sideBend) {
    let cuts = 0;
    for (const chain of strip.chains) {
      if (chain.dot) continue;
      for (const hinge of chain.hinges) if (hinge.angleDeg > profile.cutBendDeg) cuts += 1;
    }
    strip.bom.assembly.bendCuts = cuts;
  }
  // Cuts on bends and jumpers cost the same: cut, arrange, resolder.
  strip.bom.assembly.assemblyMin = assemblyMinutes(strip.bom.assembly.bendCuts + strip.bom.assembly.jumpers);

  const wasm = await getManifold();
  const housing = buildHousing(wasm, {
    paths: strip.chains,
    crossings: strip.notices.filter((notice) => notice.kind === 'crossing').map((notice) => [notice.x, notice.y]),
    unlit: strip.unlit,
    params,
  });
  warnings.push(...housing.warnings);
  warnings.push(...(strip.bom.assembly?.controllerWarnings ?? []));
  try {
    const housingMesh = copyMesh(housing.solid.getMesh());
    const diffuserMesh = copyMesh(housing.diffuser.getMesh());
    let plateMesh: MeshData | null = null;
    let plate: PlateSummary | null = null;
    if (current.plate) {
      const built = buildPlate(wasm, housing, current.plate);
      if (built) {
        try {
          plateMesh = copyMesh(built.solid.getMesh());
          if (built.solid.status() !== 'NoError') warnings.push(`Backdrop not manifold (${built.solid.status()}).`);
        } finally {
          built.solid.delete();
        }
        const { solid: _solid, ...summary } = built;
        plate = summary;
        warnings.push(...built.warnings);
      }
    }
    const plan = planSplit({
      outline: housing.outline,
      centerlines: strip.chains.map((chain) => (chain.smooth.length >= 2 ? chain.smooth : chain.points)),
      keepOut: [
        // Slots and pockets: there the segment already ends, the cut goes through almost without harm.
        ...housing.holes.wireSlots.map((slot) => ({ ...xRange(slot.points), kind: 'slot' as const })),
        ...housing.holes.cornerPockets.map((pocket) => ({ ...xRange(pocket.points), kind: 'slot' as const })),
        // Holes: cutting them in half ruins them, but a few millimetres are enough to avoid them.
        ...[...housing.holes.anchors, ...(housing.holes.cable ? [housing.holes.cable] : []), ...housing.holes.dotWires].map(
          (hole) => ({ x0: hole.x - hole.d / 2, x1: hole.x + hole.d / 2, kind: 'hole' as const }),
        ),
      ],
      bedW: params.BED_W,
      bedH: params.BED_H,
    });
    warnings.push(...plan.warnings);
    let split: SplitResult | null = null;
    if (plan.cutsX.length > 0) {
      split = {
        cutsX: plan.cutsX,
        onChannel: plan.onChannel,
        minY: plan.bounds.minY,
        maxY: plan.bounds.maxY,
        housing: cutSolid(housing.solid, plan.pieces),
        diffuser: cutSolid(housing.diffuser, plan.pieces),
      };
      split.housing.forEach((mesh, i) => {
        if (mesh.triVerts.length === 0) warnings.push(`Print-bed split: piece ${i + 1} is empty.`);
      });
    }
    if (housing.solid.status() !== 'NoError') warnings.push(`Housing not manifold (${housing.solid.status()}).`);
    if (housing.diffuser.status() !== 'NoError') warnings.push(`Diffuser not manifold (${housing.diffuser.status()}).`);
    return {
      housingMesh,
      diffuserMesh,
      holes: { anchors: housing.holes.anchors, cable: housing.holes.cable },
      slots: housing.holes.wireSlots,
      pockets: housing.holes.cornerPockets,
      pathHoles: housing.holes.pathHoles,
      outline: housing.outline,
      centerlines: strip.chains.map((chain) => ({
        id: chain.id,
        points: chain.points.map((point) => [point[0], point[1]] as [number, number]),
      })),
      lightPoints: lightPointsFromChains(
        strip.chains.map((chain) => ({
          id: chain.id,
          points: chain.smooth.length >= 2 ? chain.smooth : chain.points,
          closed: chain.closed,
          dot: chain.dot,
        })),
        params,
      ),
      ledGapMm: ledToDiffuserMm(params),
      bom: { ...strip.bom, plate: plate ? plateBom(plate) : null },
      warnings,
      segments: editSegments(strip),
      plateMesh,
      plate,
      split,
    };
  } finally {
    housing.solid.delete();
    housing.diffuser.delete();
  }
}
