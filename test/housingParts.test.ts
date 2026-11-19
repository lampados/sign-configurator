import { describe, expect, it } from 'vitest';
import { PART_FLOOR, PART_OTHER, PART_WALL, classifyHousing, widthArrow, type ChannelInfo } from '../src/viewer/housingParts';

// A straight channel along X: centreline on y = 0, 10 wide, walls 2, floor 3, top 11.
const channel: ChannelInfo = { centerlines: [[[0, 0], [100, 0]]], floor: 3, width: 10, wall: 2, top: 11 };

function mesh(triangles: number[][]): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } {
  return {
    numProp: 3,
    vertProperties: new Float32Array(triangles.flat()),
    triVerts: new Uint32Array(triangles.flatMap((_, i) => [i * 3, i * 3 + 1, i * 3 + 2])),
  };
}

describe('faces of the housing a Tech parameter points at', () => {
  it('tells inner walls, floor and hole walls from the rest', () => {
    const parts = classifyHousing(
      mesh([
        // Inner wall at y = 5, facing −y (towards the centreline), above the floor.
        [10, 5, 3, 20, 5, 3, 20, 5, 11],
        // Outer wall at y = 7, facing +y (away).
        [20, 7, 0, 10, 7, 0, 20, 7, 11],
        // Floor of the channel, facing up at z = 3.
        [10, -4, 3, 20, -4, 3, 20, 4, 3],
        // Top edge of the wall, facing up at z = 11.
        [10, 5, 11, 20, 5, 11, 20, 7, 11],
        // Wall of a hole through the floor, near the centreline.
        [50, 1, 0, 51, 1, 0, 51, 1, 3],
        // Outer wall below the floor.
        [20, 7, 0.5, 10, 7, 0.5, 20, 7, 2.5],
        // Far from every channel.
        [10, 300, 3, 20, 300, 3, 20, 300, 11],
      ]),
      channel,
    );
    expect([...parts]).toEqual([PART_WALL, PART_OTHER, PART_FLOOR, PART_OTHER, PART_FLOOR, PART_OTHER, PART_OTHER]);
  });

  it('without centrelines nothing is highlighted', () => {
    const parts = classifyHousing(mesh([[10, 5, 3, 20, 5, 3, 20, 5, 11]]), { ...channel, centerlines: [] });
    expect([...parts]).toEqual([PART_OTHER]);
  });

  it('the width arrow crosses the channel at the highest LED', () => {
    const arrow = widthArrow(
      [
        { pos: [0, 0, 5], dir: [1, 0, 0] },
        { pos: [10, 40, 5], dir: [1, 0, 0] },
        { pos: [20, 20, 5], dir: [0, 1, 0] },
      ],
      10,
    );
    expect(arrow).toEqual({ a: [10, 35], b: [10, 45] });
    expect(widthArrow([], 10)).toBeNull();
  });
});
