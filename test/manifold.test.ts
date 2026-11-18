import { describe, expect, it } from 'vitest';
import { cubeCounts, cubeVertexCount } from '../src/geometry/manifold';

describe('manifold-3d', () => {
  it('a cube has 8 vertices', async () => {
    expect(await cubeVertexCount()).toBe(8);
    expect(await cubeCounts()).toEqual({ vertices: 8, triangles: 12 });
  });
});
