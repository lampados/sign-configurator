import Module, { type ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';

let instance: Promise<ManifoldToplevel> | undefined;

const isNode =
  typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node ===
  'string';

/**
 * Shared instance of manifold-3d, usable in the main thread, in the worker and in vitest.
 * In the browser the URL of the .wasm comes from Vite (`?url`), so it works both in dev and in the build;
 * in Node the module reads the file from node_modules by itself.
 */
export function getManifold(): Promise<ManifoldToplevel> {
  instance ??= (async () => {
    const wasm = await Module(isNode ? undefined : { locateFile: () => wasmUrl });
    wasm.setup();
    return wasm;
  })();
  return instance;
}

/** Vertices and triangles of a cube. A manifold cube has 8 and 12. */
export async function cubeCounts(size = 10): Promise<{ vertices: number; triangles: number }> {
  const { Manifold } = await getManifold();
  const cube = Manifold.cube([size, size, size], true);
  try {
    return { vertices: cube.numVert(), triangles: cube.numTri() };
  } finally {
    cube.delete();
  }
}

/** Smoke test: vertices of a cube (8 expected). */
export async function cubeVertexCount(size = 10): Promise<number> {
  return (await cubeCounts(size)).vertices;
}
