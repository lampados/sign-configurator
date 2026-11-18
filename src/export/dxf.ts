// [J] DXF seen from the back, mirrored in X (SPEC §5).
// The layers of §5 are LWPOLYLINE and CIRCLE: the file is AC1015, which contains them.
// WIRE_SLOTS is the real outline of the slot, not an approximated stadium.

export type DxfLayer = 'ANCHOR_HOLES' | 'WIRE_SLOTS' | 'CORNER_POCKETS' | 'CABLE_HOLE' | 'OUTLINE';

export interface DxfPolyline {
  layer: 'WIRE_SLOTS' | 'CORNER_POCKETS' | 'OUTLINE';
  /** Outline in front view, the same as the STL. The DXF negates X. */
  points: readonly (readonly [number, number])[];
}

export interface DxfCircle {
  layer: 'ANCHOR_HOLES' | 'CABLE_HOLE';
  center: readonly [number, number];
  radius: number;
}

const LAYERS: readonly DxfLayer[] = ['ANCHOR_HOLES', 'WIRE_SLOTS', 'CORNER_POCKETS', 'CABLE_HOLE', 'OUTLINE'];

function fmt(n: number): string {
  const rounded = Math.round(n * 1e6) / 1e6;
  if (Object.is(rounded, -0)) return '0';
  return String(rounded);
}

function ring(points: readonly (readonly [number, number])[]): readonly (readonly [number, number])[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && points.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    return points.slice(0, -1);
  }
  return points;
}

/** DXF of the back. The input coordinates are the front ones of the STL. */
export function toDxf(model: { polylines?: readonly DxfPolyline[]; circles?: readonly DxfCircle[] } = {}): string {
  const lines = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1015',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE',
    '2', 'LAYER',
    '70', String(LAYERS.length),
  ];
  for (const name of LAYERS) {
    lines.push('0', 'LAYER', '2', name, '70', '0', '62', '7', '6', 'CONTINUOUS');
  }
  lines.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  for (const circle of model.circles ?? []) {
    lines.push(
      '0', 'CIRCLE',
      '8', circle.layer,
      '10', fmt(-circle.center[0]),
      '20', fmt(circle.center[1]),
      '40', fmt(circle.radius),
    );
  }
  for (const poly of model.polylines ?? []) {
    const points = ring(poly.points);
    if (points.length < 3) continue;
    lines.push('0', 'LWPOLYLINE', '8', poly.layer, '90', String(points.length), '70', '1');
    for (const [x, y] of points) lines.push('10', fmt(-x), '20', fmt(y));
  }
  lines.push('0', 'ENDSEC', '0', 'EOF', '');
  return lines.join('\n');
}
