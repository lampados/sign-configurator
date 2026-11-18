// [B] Skeleton (SPEC §5): Zhang-Suen thinning on the bitmap of [A], then cleanup of redundant
// pixels (steps, 2×2 blocks) to get an 8-connected skeleton one pixel wide.
// Pure, deterministic module. The bitmap must have at least 1 empty px on the border (the margin of [A]).

/** Offsets of the 8 neighbours clockwise starting from north: P2..P9 of the Zhang-Suen notation. */
function ringOffsets(width: number): number[] {
  return [-width, -width + 1, 1, width + 1, width, width - 1, -1, -width - 1];
}

/** Neighbours (0/1) of `i` in the order N, NE, E, SE, S, SW, W, NW. */
function ring(data: Uint8Array, i: number, off: readonly number[], out: Uint8Array): void {
  for (let k = 0; k < 8; k++) out[k] = data[i + off[k]!] ? 1 : 0;
}

/** Number of 0→1 transitions going around the ring of the 8 neighbours (crossing number). */
export function crossings(n: Uint8Array): number {
  let a = 0;
  for (let k = 0; k < 8; k++) if (!n[k] && n[(k + 1) % 8]) a++;
  return a;
}

const count = (n: Uint8Array): number => n[0]! + n[1]! + n[2]! + n[3]! + n[4]! + n[5]! + n[6]! + n[7]!;

/** Zhang & Suen (1984), on filled cells only: returns a new bitmap. */
export function zhangSuen(data: Uint8Array, width: number, height: number): Uint8Array {
  const img = data.slice();
  const off = ringOffsets(width);
  const n = new Uint8Array(8);
  // Only front pixels (with at least one empty neighbour) can be removed: only those are
  // examined, and the front advances with the neighbours of the removed pixels. The result is that of the classic method.
  const inFront = new Uint8Array(img.length);
  let front: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (img[i] && off.some((o) => !img[i + o])) {
        inFront[i] = 1;
        front.push(i);
      }
    }
  }
  const remove: number[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const step of [0, 1]) {
      remove.length = 0;
      for (const i of front) {
        ring(img, i, off, n);
        const b = count(n);
        if (b < 2 || b > 6 || crossings(n) !== 1) continue;
        // N=0 E=2 S=4 W=6
        if (step === 0 ? n[0]! * n[2]! * n[4]! || n[2]! * n[4]! * n[6]! : n[0]! * n[2]! * n[6]! || n[0]! * n[4]! * n[6]!) {
          continue;
        }
        remove.push(i);
      }
      if (remove.length) {
        changed = true;
        for (const i of remove) img[i] = 0;
        const next = front.filter((i) => img[i]);
        for (const i of remove) {
          inFront[i] = 0;
          for (const o of off) {
            const j = i + o;
            if (img[j] && !inFront[j]) {
              inFront[j] = 1;
              next.push(j);
            }
          }
        }
        front = next;
      }
    }
  }
  return img;
}

/**
 * Simple point for the 8-connectivity of the filled set: the filled neighbours form a single component
 * (8-adjacency in the ring) and the empty neighbours 4-adjacent to p a single component (4-adjacency).
 */
function isSimple(n: Uint8Array): boolean {
  // Components of the filled ones in the ring: in the ordered ring, filled ones on the sides (even k) are adjacent
  // to the two neighbouring corners; two consecutive sides (N and E) are adjacent to each other even if the corner is empty.
  const seen = new Uint8Array(8);
  let fgComponents = 0;
  for (let s = 0; s < 8; s++) {
    if (!n[s] || seen[s]) continue;
    fgComponents++;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const nb = k % 2 === 0 ? [(k + 1) % 8, (k + 7) % 8, (k + 2) % 8, (k + 6) % 8] : [(k + 1) % 8, (k + 7) % 8];
      for (const j of nb) {
        if (n[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  if (fgComponents !== 1) return false;
  // Components of the empty ones (4-adjacency in the ring: only k±1) that contain an empty side.
  const seenBg = new Uint8Array(8);
  let bgComponents = 0;
  for (const s of [0, 2, 4, 6]) {
    if (n[s] || seenBg[s]) continue;
    bgComponents++;
    const stack = [s];
    seenBg[s] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      for (const j of [(k + 1) % 8, (k + 7) % 8]) {
        if (!n[j] && !seenBg[j]) {
          seenBg[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  return bgComponents === 1;
}

/**
 * Removes simple pixels with at least 2 neighbours (steps and 2×2 blocks left by Zhang-Suen):
 * the ends stay, and so does connectivity.
 */
export function cleanSkeleton(skel: Uint8Array, width: number, height: number): Uint8Array {
  const img = skel.slice();
  const off = ringOffsets(width);
  const n = new Uint8Array(8);
  // In raster order, like a full scan of the image.
  let alive: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) if (img[y * width + x]) alive.push(y * width + x);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const i of alive) {
      ring(img, i, off, n);
      if (count(n) >= 2 && isSimple(n)) {
        img[i] = 0;
        changed = true;
      }
    }
    if (changed) alive = alive.filter((i) => img[i]);
  }
  return img;
}

/** [B]: bitmap of [A] → skeleton one pixel wide. */
export function skeletonize(data: Uint8Array, width: number, height: number): Uint8Array {
  return cleanSkeleton(zhangSuen(data, width, height), width, height);
}

export { ringOffsets, ring, count as ringCount };
