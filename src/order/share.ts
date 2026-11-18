// Link e file dell'ordine (SPEC §12.6). Mai un'eccezione: un hash rotto diventa un avviso.

import { BOX_AUTO, BOX_NONE, BOXES } from '../parts/boxes';
import {
  GENERATOR_VERSION,
  STRIP_PROFILES,
  STRIP_VOLTAGES,
  CONTROLLERS,
  PLATE_CORNER_R,
  PLATE_CORNER_R_MAX,
  PLATE_CORNER_R_MIN,
  PLATE_MARGIN,
  PLATE_MARGIN_MAX,
  PLATE_MARGIN_MIN,
  type CuspMode,
  type EdgeProfile,
  type IDotMode,
  type Params,
} from '../config';
import {
  DEFAULT_CUSTOMER,
  migrateOrder,
  type CurveNode,
  type CustomerChoices,
  type LightEffect,
  type OrderCrossing,
  type OrderPath,
  type OrderSource,
  type OrderV1,
  type PlateChoice,
  type PlugType,
  type PlateMaterial,
  type PlateShape,
  type SignOrder,
  type SignOrderV3,
  type SignOrderV4,
  type SizePreset,
  type SvgFillElement,
  type SvgStrokeElement,
  type TraceMode,
} from './schema';

/** Lunghezza massima del frammento `#o=…`, in byte UTF-8. */
export const SHARE_LINK_MAX_BYTES = 8192;
export const SHARE_HEIGHT_MIN_MM = 40;
export const SHARE_HEIGHT_MAX_MM = 800;
export const SHARE_WALL_MIN_MM = 1.6;
export const SHARE_WALL_MAX_MM = 5;
const DEFAULT_COLOR = '#ff2fd6';

export interface ShareLink {
  /** `#o=…`, oppure null se il frammento supera 8 kB. */
  hash: string | null;
  bytes: number;
  /** JSON dell'ordine normalizzato, anche quando il link non c'è. */
  json: string;
}

export interface ShareRead {
  order: SignOrderV4 | null;
  warnings: string[];
}

const NUMERIC_PARAMS = [
  'STRIP_W',
  'STRIP_T',
  'BANK_TRANSITION_L',
  'HINGE_PITCH',
  'HINGE_MAX_DEG',
  'CUT_PITCH',
  'LED_PER_M',
  'LED_MAX_MA',
  'STRIP_V',
  'CHANNEL_W',
  'CHANNEL_DEPTH',
  'WALL',
  'WALL_MIN',
  'MIN_GAP',
  'FLOOR',
  'ANCHOR_HOLE_D',
  'ANCHOR_HOLE_DEPTH',
  'ANCHOR_SPACING',
  'ANCHOR_MIN_PER_SEGMENT',
  'ANCHOR_BOSS_D',
  'ANCHOR_BOSS_H',
  'WIRE_SLOT_W',
  'WIRE_SLOT_L',
  'SLOT_LIP_CHAMFER',
  'WIRE_HOLE_D',
  'PATH_HOLE_D',
  'PATH_HOLE_PITCH',
  'CABLE_HOLE_D',
  'CROSSING_GAP',
  'DIFFUSER_T',
  'DIFFUSER_CLEARANCE',
  'CHAMFER_SIZE',
  'CHAMFER_ANGLE',
  'LAYER_STEP',
  'CORNER_MERGE_DIST',
  'DOT_WIRE_HOLE_D',
  'DOT_OVERHANG_MM',
  'COVERAGE_MIN',
  'BED_W',
  'BED_H',
] as const satisfies readonly (keyof Params)[];

const KNOWN_ROOT = new Set([
  'schemaVersion',
  'generatorVersion',
  'pricingVersion',
  'source',
  'heightMm',
  'sizePreset',
  'color',
  'params',
  'paths',
  'crossings',
  'customer',
  'plate',
  'text',
  'fontId',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function pointOf(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = finite(value[0]);
  const y = finite(value[1]);
  if (x === null || y === null) return null;
  return [x, y];
}

function nodeOf(value: unknown): CurveNode | null {
  if (!isRecord(value)) return null;
  const p = pointOf(value.p);
  const inn = pointOf(value.in);
  const out = pointOf(value.out);
  if (!p || !inn || !out) return null;
  return { p, in: inn, out };
}

function pathOf(value: unknown, warnings: string[]): OrderPath | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
    warnings.push('Segment ignored: the id is missing.');
    return null;
  }
  if (value.type === 'dot') {
    const center = pointOf(value.center);
    const angle = finite(value.angle);
    if (!center || angle === null) {
      warnings.push(`Dot ${value.id} ignored.`);
      return null;
    }
    return { id: value.id, type: 'dot', center, angle };
  }
  if (!Array.isArray(value.nodes)) {
    warnings.push(`Segment ${value.id} ignored.`);
    return null;
  }
  const nodes: CurveNode[] = [];
  for (const node of value.nodes) {
    const read = nodeOf(node);
    if (read) nodes.push(read);
  }
  if (nodes.length < 2) {
    warnings.push(`Segment ${value.id} ignored.`);
    return null;
  }
  return { id: value.id, closed: value.closed === true, nodes };
}

function pathsOf(value: unknown, warnings: string[]): OrderPath[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) {
    warnings.push('Paths ignored.');
    return null;
  }
  const paths: OrderPath[] = [];
  for (const item of value) {
    const path = pathOf(item, warnings);
    if (path) paths.push(path);
  }
  return paths;
}

function crossingsOf(value: unknown, warnings: string[]): OrderCrossing[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    warnings.push('Crossings ignored.');
    return [];
  }
  const crossings: OrderCrossing[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.under !== 'string') continue;
    const at = pointOf(item.at);
    if (!at) continue;
    crossings.push({ at, under: item.under });
  }
  return crossings;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function sourceOf(value: unknown, warnings: string[]): OrderSource | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'text') {
    const text = typeof value.text === 'string' ? value.text : '';
    let fontId = typeof value.fontId === 'string' ? value.fontId : '';
    if (!fontId) {
      fontId = 'sacramento';
      warnings.push('Font missing: Sacramento used.');
    }
    return { kind: 'text', text, fontId };
  }
  if (value.kind !== 'image') return null;
  const name = typeof value.name === 'string' && value.name ? value.name : 'image';
  let trace = oneOf(value.trace, ['centerline', 'outline'] as const satisfies readonly TraceMode[]);
  if (!trace) {
    trace = 'centerline';
    warnings.push('Unknown trace: centreline used.');
  }
  if (value.format === 'svg' && isRecord(value.svg) && Array.isArray(value.svg.elements)) {
    const elements: (SvgStrokeElement | SvgFillElement)[] = [];
    for (const element of value.svg.elements) {
      if (!isRecord(element) || typeof element.d !== 'string') continue;
      if (element.kind === 'stroke') elements.push({ d: element.d, kind: 'stroke' });
      else if (element.kind === 'fill') {
        const fillRule = element.fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
        elements.push({ d: element.d, kind: 'fill', fillRule });
      }
    }
    return { kind: 'image', format: 'svg', name, trace, svg: { elements } };
  }
  if (value.format === 'raster' && isRecord(value.bitmap)) {
    const width = finite(value.bitmap.width);
    const height = finite(value.bitmap.height);
    const rle = typeof value.bitmap.rle === 'string' ? value.bitmap.rle : null;
    if (width === null || height === null || width <= 0 || height <= 0 || rle === null) return null;
    let threshold = finite(value.threshold);
    if (threshold === null) threshold = 128;
    else if (threshold < 0 || threshold > 255) {
      const next = Math.min(255, Math.max(0, threshold));
      warnings.push(`Threshold ${threshold} out of range: clamped to ${next}.`);
      threshold = next;
    }
    return {
      kind: 'image',
      format: 'raster',
      name,
      trace,
      threshold,
      invert: value.invert === true,
      bitmap: { width, height, rle },
    };
  }
  return null;
}

function paramsOf(value: unknown, warnings: string[]): Partial<Params> {
  if (value == null) return {};
  if (!isRecord(value)) {
    warnings.push('Parameters ignored.');
    return {};
  }
  const params: Partial<Params> = {};
  for (const key of NUMERIC_PARAMS) {
    if (!(key in value)) continue;
    const number = finite(value[key]);
    if (number === null) {
      warnings.push(`Parameter ${key} ignored.`);
      continue;
    }
    if (key === 'STRIP_V') {
      if (STRIP_VOLTAGES.includes(number)) params.STRIP_V = number;
      else warnings.push(`Unknown voltage ${number} V: default used.`);
      continue;
    }
    if (key === 'WALL') {
      const next = Math.min(SHARE_WALL_MAX_MM, Math.max(SHARE_WALL_MIN_MM, number));
      if (next !== number) warnings.push(`Frame ${number} mm out of range: clamped to ${next} mm.`);
      params.WALL = next;
      continue;
    }
    params[key] = number;
  }
  if ('ANCHOR_BOSS' in value) {
    if (typeof value.ANCHOR_BOSS === 'boolean') params.ANCHOR_BOSS = value.ANCHOR_BOSS;
    else warnings.push('Parameter ANCHOR_BOSS ignored.');
  }
  if ('MIN_LETTER_H' in value) {
    const letter = value.MIN_LETTER_H === null ? null : finite(value.MIN_LETTER_H);
    if (value.MIN_LETTER_H === null || letter !== null) params.MIN_LETTER_H = letter;
    else warnings.push('Parameter MIN_LETTER_H ignored.');
  }
  if ('BOX_ID' in value) {
    const box = value.BOX_ID;
    if (typeof box === 'string' && (box === BOX_AUTO || box === BOX_NONE || BOXES.some((b) => b.id === box))) params.BOX_ID = box;
    else warnings.push('Unknown box: chosen automatically.');
  }
  if ('STRIP_ID' in value) {
    if (typeof value.STRIP_ID === 'string' && STRIP_PROFILES.some((s) => s.id === value.STRIP_ID)) {
      params.STRIP_ID = value.STRIP_ID;
    } else warnings.push('Unknown strip: default used.');
  }
  if ('CONTROLLER_ID' in value) {
    if (typeof value.CONTROLLER_ID === 'string' && CONTROLLERS.some((c) => c.id === value.CONTROLLER_ID)) {
      params.CONTROLLER_ID = value.CONTROLLER_ID;
    } else warnings.push('Unknown controller: standard one used.');
  }
  if ('EDGE_PROFILE' in value) {
    const profile = oneOf(value.EDGE_PROFILE, ['square', 'outer', 'inner', 'both'] as const satisfies readonly EdgeProfile[]);
    if (profile) params.EDGE_PROFILE = profile;
    else {
      params.EDGE_PROFILE = 'square';
      warnings.push('Unknown edge: square edge used.');
    }
  }
  if ('CUSP_MODE' in value) {
    const mode = oneOf(value.CUSP_MODE, ['warn', 'split'] as const satisfies readonly CuspMode[]);
    if (mode) params.CUSP_MODE = mode;
    else warnings.push('Parameter CUSP_MODE ignored.');
  }
  if ('I_DOT_MODE' in value) {
    const mode = oneOf(value.I_DOT_MODE, ['omit', 'dash', 'dot', 'unlit'] as const satisfies readonly IDotMode[]);
    if (mode) params.I_DOT_MODE = mode;
    else warnings.push('Parameter I_DOT_MODE ignored.');
  }
  return params;
}

function customerOf(value: unknown, warnings: string[]): CustomerChoices {
  const customer: CustomerChoices = { ...DEFAULT_CUSTOMER };
  if (value == null) return customer;
  if (!isRecord(value)) {
    warnings.push('Customer choices ignored.');
    return customer;
  }
  const effect = oneOf(value.effect, ['colore fisso', 'arcobaleno'] as const satisfies readonly LightEffect[]);
  if (value.effect !== undefined) {
    if (effect) customer.effect = effect;
    else warnings.push('Unknown effect: solid colour used.');
  }
  if (value.diffuser !== undefined) {
    if (typeof value.diffuser === 'boolean') customer.diffuser = value.diffuser;
    else warnings.push('Invalid diffuser: left on.');
  }
  if (value.mount !== undefined && value.mount !== 'wall') warnings.push('Unknown mounting: wall used.');
  if (value.plug !== undefined) {
    const plug = oneOf(value.plug, ['EU', 'UK', 'CH', 'US'] as const satisfies readonly PlugType[]);
    if (plug) customer.plug = plug;
    else warnings.push('Unknown plug: EU used.');
  }
  if (value.proof !== undefined) {
    if (typeof value.proof === 'boolean') customer.proof = value.proof;
    else warnings.push('Invalid draft: left on.');
  }
  return customer;
}

function clampMm(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function plateOf(value: unknown, warnings: string[]): PlateChoice | null {
  if (value == null) return null;
  if (!isRecord(value)) {
    warnings.push('Backdrop ignored.');
    return null;
  }
  const shape = oneOf(value.shape, ['rect', 'pill', 'contour'] as const satisfies readonly PlateShape[]);
  const material = oneOf(value.material, ['clear', 'black', 'wood'] as const satisfies readonly PlateMaterial[]);
  if (!shape || !material) {
    warnings.push('Unknown backdrop: no backdrop.');
    return null;
  }
  let marginMm = finite(value.marginMm);
  if (marginMm === null) {
    marginMm = PLATE_MARGIN;
    warnings.push(`Backdrop margin missing: ${PLATE_MARGIN} mm used.`);
  } else {
    const next = clampMm(marginMm, PLATE_MARGIN_MIN, PLATE_MARGIN_MAX);
    if (next !== marginMm) warnings.push(`Backdrop margin ${marginMm} mm out of range: clamped to ${next} mm.`);
    marginMm = next;
  }
  let cornerRMm = finite(value.cornerRMm);
  if (cornerRMm === null) {
    cornerRMm = PLATE_CORNER_R;
    warnings.push(`Corner radius missing: ${PLATE_CORNER_R} mm used.`);
  } else {
    const next = clampMm(cornerRMm, PLATE_CORNER_R_MIN, PLATE_CORNER_R_MAX);
    if (next !== cornerRMm) warnings.push(`Corner radius ${cornerRMm} mm out of range: clamped to ${next} mm.`);
    cornerRMm = next;
  }
  return { shape, material, marginMm, cornerRMm };
}

function sizeOf(value: unknown, warnings: string[]): SizePreset | null {
  if (value == null) return null;
  const preset = oneOf(value, ['S', 'M', 'L', 'XL'] as const satisfies readonly SizePreset[]);
  if (preset) return preset;
  warnings.push('Unknown size: the height applies.');
  return null;
}

function colorOf(value: unknown, warnings: string[]): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  warnings.push(`Invalid colour: ${DEFAULT_COLOR} used.`);
  return DEFAULT_COLOR;
}

function heightOf(value: unknown, warnings: string[]): number | null {
  const height = finite(value);
  if (height === null) {
    warnings.push('Height missing or invalid.');
    return null;
  }
  if (height < SHARE_HEIGHT_MIN_MM) {
    warnings.push(`Height ${height} mm out of range: clamped to ${SHARE_HEIGHT_MIN_MM} mm.`);
    return SHARE_HEIGHT_MIN_MM;
  }
  if (height > SHARE_HEIGHT_MAX_MM) {
    warnings.push(`Height ${height} mm out of range: clamped to ${SHARE_HEIGHT_MAX_MM} mm.`);
    return SHARE_HEIGHT_MAX_MM;
  }
  return height;
}

function orderFromRecord(record: Record<string, unknown>, warnings: string[]): SignOrderV4 | null {
  const extra = Object.keys(record).filter((key) => !KNOWN_ROOT.has(key));
  if (extra.length > 0) warnings.push(`Fields ignored: ${extra.join(', ')}.`);
  const version = finite(record.schemaVersion);
  const generatorVersion = typeof record.generatorVersion === 'string' ? record.generatorVersion : '';
  const heightMm = heightOf(record.heightMm, warnings);
  if (heightMm === null) return null;
  const color = colorOf(record.color, warnings);
  const params = paramsOf(record.params, warnings);
  if (version === 1) {
    const text = typeof record.text === 'string' ? record.text : '';
    let fontId = typeof record.fontId === 'string' ? record.fontId : '';
    if (!fontId) {
      fontId = 'sacramento';
      warnings.push('Font missing: Sacramento used.');
    }
    const v1: OrderV1 = { schemaVersion: 1, generatorVersion, text, fontId, heightMm, color, params };
    return migrateOrder(v1);
  }
  const source = sourceOf(record.source, warnings);
  if (!source) {
    warnings.push('Source missing or invalid.');
    return null;
  }
  if (version === 2) {
    const v2: SignOrder = {
      schemaVersion: 2,
      generatorVersion,
      source,
      heightMm,
      color,
      params,
      paths: pathsOf(record.paths, warnings),
      crossings: crossingsOf(record.crossings, warnings),
    };
    return migrateOrder(v2);
  }
  const pricingVersion = typeof record.pricingVersion === 'string' ? record.pricingVersion : null;
  const shared = {
    generatorVersion,
    pricingVersion,
    source,
    heightMm,
    sizePreset: sizeOf(record.sizePreset, warnings),
    color,
    params,
    paths: pathsOf(record.paths, warnings),
    crossings: crossingsOf(record.crossings, warnings),
    customer: customerOf(record.customer, warnings),
  };
  if (version === 3) {
    const v3: SignOrderV3 = { schemaVersion: 3, ...shared };
    return migrateOrder(v3);
  }
  if (version === 4) {
    const v4: SignOrderV4 = { schemaVersion: 4, ...shared, plate: plateOf(record.plate, warnings) };
    return migrateOrder(v4);
  }
  warnings.push('Order version not recognized.');
  return null;
}

function noteGenerator(order: SignOrderV4, warnings: string[]): void {
  if (order.generatorVersion !== GENERATOR_VERSION) {
    warnings.push(`Generator version ${order.generatorVersion || 'missing'}: the result may change.`);
  }
}

/** JSON normalizzato e, se ci sta in 8 kB, il frammento `#o=`. */
export function encodeShare(order: SignOrderV4): ShareLink {
  try {
    const json = JSON.stringify(migrateOrder(order));
    const hash = `#o=${toBase64Url(new TextEncoder().encode(json))}`;
    const bytes = new TextEncoder().encode(hash).length;
    return { hash: bytes > SHARE_LINK_MAX_BYTES ? null : hash, bytes, json };
  } catch {
    return { hash: null, bytes: SHARE_LINK_MAX_BYTES + 1, json: '' };
  }
}

function payloadOf(input: string): string | null {
  const hashAt = input.indexOf('#o=');
  if (hashAt >= 0) return input.slice(hashAt + 3);
  if (input.startsWith('o=')) return input.slice(2);
  return null;
}

/** Hash `#o=`, URL con quell'hash, oppure il JSON del file. Non lancia. */
export function decodeShare(input: string): ShareRead {
  const warnings: string[] = [];
  try {
    const trimmed = input.trim();
    if (trimmed.startsWith('{')) {
      const parsed: unknown = JSON.parse(trimmed);
      if (!isRecord(parsed)) {
        warnings.push('Invalid design file.');
        return { order: null, warnings };
      }
      const order = orderFromRecord(parsed, warnings);
      if (order) noteGenerator(order, warnings);
      return { order, warnings };
    }
    const payload = payloadOf(trimmed);
    if (payload === null) {
      warnings.push('Invalid link.');
      return { order: null, warnings };
    }
    let text = payload;
    if (text.includes('%')) {
      try {
        text = decodeURIComponent(text);
      } catch {
        warnings.push('Invalid link.');
        return { order: null, warnings };
      }
    }
    const bytes = fromBase64Url(text);
    if (!bytes) {
      warnings.push('Invalid link.');
      return { order: null, warnings };
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(parsed)) {
      warnings.push('Invalid link.');
      return { order: null, warnings };
    }
    const order = orderFromRecord(parsed, warnings);
    if (order) noteGenerator(order, warnings);
    return { order, warnings };
  } catch {
    warnings.push('Invalid link.');
    return { order: null, warnings };
  }
}
