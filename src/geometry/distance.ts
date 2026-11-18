// Exact Euclidean distance transform on a grid (Felzenszwalb & Huttenlocher, 2012), separable:
// first the columns, then the rows. Pure, deterministic module.

const INF = 1e20;

/** Lower envelope of parabolas: d[q] = min_p (q − p)² + f[p]. */
function dt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let first = 0;
  while (first < n && f[first]! >= INF) first++;
  if (first === n) {
    d.fill(INF, 0, n);
    return;
  }
  let k = 0;
  v[0] = first;
  z[0] = -INF;
  z[1] = INF;
  for (let q = first + 1; q < n; q++) {
    if (f[q]! >= INF) continue;
    let s: number;
    for (;;) {
      const p = v[k]!;
      s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * (q - p));
      if (s > z[k]!) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const p = v[k]!;
    d[q] = (q - p) * (q - p) + f[p]!;
  }
}

/**
 * Squared distance (in pixels²) from every pixel to the nearest "site" pixel (`mask[i] === site`).
 * Without sites all the values are 1e20. Float32 to fit in memory with 40 Mpx: the values are
 * integers, exact up to 2²⁴ px² (over 4000 px of distance, well above every threshold used).
 */
export function squaredDistanceTo(mask: Uint8Array, width: number, height: number, site: 0 | 1): Float32Array {
  const out = new Float32Array(width * height);
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = mask[y * width + x] === site ? 0 : INF;
    dt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) out[y * width + x] = d[y]!;
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = out[row + x]!;
    dt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) out[row + x] = d[x]!;
  }
  return out;
}
