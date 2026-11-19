// Technical parameters of the customer page (SPEC §12.2, "Tech" tool): the same as the bend test,
// without BANK_TRANSITION_L (not used by [H]/[I]) and without WALL, which is on the preview bar.
// Pure module: no DOM.

import { BOX_AUTO, BOX_NONE, BOXES } from '../parts/boxes';
import { STRIP_PROFILES } from '../config';
import type { SignFocus } from '../viewer/scene';
import { CONTROLLERS, DEFAULT_PARAMS, STRIP_VOLTAGES, type EdgeProfile, type Params } from '../config';

export type TechNumericKey =
  | 'STRIP_W'
  | 'STRIP_T'
  | 'HINGE_PITCH'
  | 'HINGE_MAX_DEG'
  | 'CHANNEL_W'
  | 'CHANNEL_DEPTH'
  | 'FLOOR'
  | 'DIFFUSER_LEDGE'
  | 'WIRE_SLOT_W'
  | 'WIRE_SLOT_L'
  | 'SLOT_LIP_CHAMFER'
  | 'WIRE_HOLE_D'
  | 'PATH_HOLE_D'
  | 'PATH_HOLE_PITCH'
  | 'CHAMFER_SIZE'
  | 'CHAMFER_ANGLE'
  | 'LAYER_STEP'
  | 'BED_W'
  | 'BED_H';

export interface TechField {
  key: TechNumericKey;
  label: string;
  unit: 'mm' | '°';
  min: number;
  max: number;
  step: number;
}

export interface TechGroup {
  id: 'strip' | 'channel' | 'wires' | 'edges' | 'bed';
  title: string;
  fields: readonly TechField[];
}

export const TECH_GROUPS: readonly TechGroup[] = [
  {
    id: 'strip',
    title: 'LED strip',
    fields: [
      { key: 'STRIP_W', label: 'Strip width', unit: 'mm', min: 1, max: 20, step: 0.1 },
      { key: 'STRIP_T', label: 'Strip thickness', unit: 'mm', min: 0.2, max: 6, step: 0.1 },
      { key: 'HINGE_PITCH', label: 'Hinge pitch', unit: 'mm', min: 1, max: 50, step: 0.1 },
      { key: 'HINGE_MAX_DEG', label: 'Max bend per hinge', unit: '°', min: 1, max: 90, step: 1 },
    ],
  },
  {
    id: 'channel',
    title: 'Channel',
    fields: [
      { key: 'CHANNEL_W', label: 'Channel width', unit: 'mm', min: 1, max: 25, step: 0.1 },
      { key: 'CHANNEL_DEPTH', label: 'Channel depth', unit: 'mm', min: 1, max: 40, step: 0.1 },
      { key: 'FLOOR', label: 'Floor thickness', unit: 'mm', min: 1, max: 20, step: 0.1 },
      { key: 'DIFFUSER_LEDGE', label: 'Diffuser ledge', unit: 'mm', min: 0, max: 2, step: 0.1 },
    ],
  },
  {
    id: 'wires',
    title: 'Wires',
    fields: [
      { key: 'WIRE_HOLE_D', label: 'End hole', unit: 'mm', min: 0, max: 25, step: 0.1 },
      { key: 'PATH_HOLE_D', label: 'Path hole', unit: 'mm', min: 0, max: 25, step: 0.1 },
      { key: 'PATH_HOLE_PITCH', label: 'Path hole spacing', unit: 'mm', min: 3, max: 200, step: 0.5 },
      { key: 'WIRE_SLOT_W', label: 'Slot width', unit: 'mm', min: 0.5, max: 25, step: 0.1 },
      { key: 'WIRE_SLOT_L', label: 'End clearance', unit: 'mm', min: 0.5, max: 30, step: 0.1 },
      { key: 'SLOT_LIP_CHAMFER', label: 'Lip chamfer', unit: 'mm', min: 0, max: 10, step: 0.1 },
    ],
  },
  {
    id: 'edges',
    title: 'Edges',
    fields: [
      { key: 'CHAMFER_SIZE', label: 'Chamfer height', unit: 'mm', min: 0, max: 40, step: 0.1 },
      { key: 'CHAMFER_ANGLE', label: 'Chamfer angle', unit: '°', min: 1, max: 89, step: 1 },
      { key: 'LAYER_STEP', label: 'Layer height', unit: 'mm', min: 0.04, max: 1, step: 0.02 },
    ],
  },
  {
    id: 'bed',
    title: 'Printing plate',
    fields: [
      { key: 'BED_W', label: 'Plate width', unit: 'mm', min: 100, max: 1000, step: 1 },
      { key: 'BED_H', label: 'Plate height', unit: 'mm', min: 100, max: 1000, step: 1 },
    ],
  },
];

/** What a field points at in the 3D preview. */
export type TechFocus = SignFocus;

/**
 * The element of the preview each parameter refers to (SPEC §12.2, "Pointing at a parameter").
 * The frame thickness and the edge profile are here too. The "LED strip" group points at nothing.
 */
export const TECH_FOCUS: Readonly<Partial<Record<TechNumericKey | 'WALL' | 'EDGE_PROFILE', TechFocus>>> = {
  CHANNEL_W: 'channelWidth',
  CHANNEL_DEPTH: 'channelDepth',
  FLOOR: 'floor',
  WALL: 'housing',
  WIRE_HOLE_D: 'endHoles',
  WIRE_SLOT_W: 'endHoles',
  WIRE_SLOT_L: 'endHoles',
  SLOT_LIP_CHAMFER: 'endHoles',
  PATH_HOLE_D: 'pathHoles',
  PATH_HOLE_PITCH: 'pathHoles',
  EDGE_PROFILE: 'housing',
  CHAMFER_SIZE: 'housing',
  CHAMFER_ANGLE: 'housing',
  LAYER_STEP: 'housing',
  BED_W: 'cuts',
  BED_H: 'cuts',
};

/**
 * Fields that only shape the old wire slot: with a round end hole (`WIRE_HOLE_D` > 0) they change
 * nothing the customer can see, and the Tech tool hides them (SPEC §12.2).
 */
export const SLOT_ONLY_FIELDS: readonly TechNumericKey[] = ['WIRE_SLOT_W', 'SLOT_LIP_CHAMFER'];

/** The slot fields show only when the end hole is off (0, or not a valid number above 0). */
export function slotFieldsShown(endHole: string): boolean {
  return !(Number(endHole) > 0);
}

export const TECH_FIELDS: readonly TechField[] = TECH_GROUPS.flatMap((group) => group.fields);

export const EDGE_PROFILES: readonly { value: EdgeProfile; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'outer', label: 'Outer chamfer' },
  { value: 'inner', label: 'Inner chamfer' },
  { value: 'both', label: 'Both chamfers' },
];

/**
 * LED densities per metre the customer can choose. The default is 144: the strip profile
 * in `config.ts` (the 160 COB) is not on the scale, so the
 * customer page always writes the density into the order. It changes only the number and pitch of the LEDs
 * (preview, BOM, power supply), not the cut pitch.
 */
export const LED_DENSITIES: readonly number[] = [30, 60, 74, 96, 144];
export const DEFAULT_LED_DENSITY = DEFAULT_PARAMS.LED_PER_M;

export function ledDensityOptions(): { value: number; label: string; isDefault: boolean }[] {
  return LED_DENSITIES.map((value) => ({ value, label: `${value} LED/m`, isDefault: value === DEFAULT_LED_DENSITY }));
}

/** Strip voltages in the menu; default that of the profile (5 V). */
export function voltageOptions(): { value: number; label: string; isDefault: boolean }[] {
  return STRIP_VOLTAGES.map((value) => ({ value, label: `${value} V`, isDefault: value === DEFAULT_PARAMS.STRIP_V }));
}

/** Strips in the menu: the model sets measurements, hinges, cut pitch and density. */
export function stripOptions(): { value: string; label: string; isDefault: boolean }[] {
  return STRIP_PROFILES.map((strip) => ({
    value: strip.id,
    label: `${strip.name} · ${strip.STRIP_W} × ${strip.STRIP_T} mm${strip.sideBend ? '' : ` · cut over ${strip.cutBendDeg}°`}`,
    isDefault: strip.id === DEFAULT_PARAMS.STRIP_ID,
  }));
}

/** Controllers in the menu; default the standard one. */
export function controllerOptions(): { value: string; label: string; isDefault: boolean }[] {
  return CONTROLLERS.map((c) => ({
    value: c.id,
    label: `${c.name} · ${c.maxA} A`,
    isDefault: c.id === DEFAULT_PARAMS.CONTROLLER_ID,
  }));
}

/** Boxes in the menu: automatic, none, then the catalogue. */
export function boxOptions(): { value: string; label: string; isDefault: boolean }[] {
  return [
    { value: BOX_AUTO, label: 'Auto: smallest that fits', isDefault: true },
    { value: BOX_NONE, label: 'No box', isDefault: false },
    ...BOXES.map((b) => ({
      value: b.id,
      label: `${b.brand} ${b.model} · ${b.innerMm.join(' × ')} mm`,
      isDefault: false,
    })),
  ];
}

export interface TechInput {
  numbers: Partial<Record<TechNumericKey, string>>;
  edgeProfile: string;
  /** Value of the density menu. Absent: no density in the order. Unknown: 144. */
  ledPerM?: string;
  /** Value of the voltage menu. Absent or unknown: that of the profile. */
  stripV?: string;
  /** Id of the controller. Absent or unknown: the standard one. */
  controller?: string;
  /** Box: BOX_AUTO, BOX_NONE or an id from BOXES. Absent or unknown: automatic. */
  box?: string;
  /** Id from STRIP_PROFILES. Absent or unknown: the default one. */
  strip?: string;
}

/**
 * Form values → overrides for the order. An empty, non-numeric or out-of-range field
 * stays at the default; only values different from the default are written.
 */
export function techParams(input: TechInput): Partial<Params> {
  const out: Partial<Params> = {};
  for (const field of TECH_FIELDS) {
    const raw = input.numbers[field.key];
    if (raw === undefined || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < field.min || value > field.max) continue;
    if (Math.abs(value - DEFAULT_PARAMS[field.key]) < 1e-9) continue;
    out[field.key] = value;
  }
  const profile = EDGE_PROFILES.find((entry) => entry.value === input.edgeProfile)?.value;
  if (profile && profile !== DEFAULT_PARAMS.EDGE_PROFILE) out.EDGE_PROFILE = profile;
  const volts = Number(input.stripV);
  if (STRIP_VOLTAGES.includes(volts) && volts !== DEFAULT_PARAMS.STRIP_V) out.STRIP_V = volts;
  const strip = STRIP_PROFILES.find((s) => s.id === input.strip);
  if (strip && strip.id !== DEFAULT_PARAMS.STRIP_ID) out.STRIP_ID = strip.id;
  const controller = CONTROLLERS.find((c) => c.id === input.controller);
  if (controller && controller.id !== DEFAULT_PARAMS.CONTROLLER_ID) out.CONTROLLER_ID = controller.id;
  const box = input.box;
  if (box !== undefined && (box === BOX_NONE || BOXES.some((b) => b.id === box))) out.BOX_ID = box;
  if (input.ledPerM !== undefined) {
    const asked = Number(input.ledPerM);
    const density = LED_DENSITIES.includes(asked) ? asked : DEFAULT_LED_DENSITY;
    if (density !== DEFAULT_PARAMS.LED_PER_M) out.LED_PER_M = density;
  }
  return out;
}

/** The field is readable but out of range, or it is not a number. */
export function techFieldInvalid(field: TechField, raw: string): boolean {
  if (raw.trim() === '') return false;
  const value = Number(raw);
  return !Number.isFinite(value) || value < field.min || value > field.max;
}
