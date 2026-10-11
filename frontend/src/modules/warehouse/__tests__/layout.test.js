/**
 * The racking, as the owner drew it (2026-10-10):
 *   aisles E D C B A left to right, standing at receiving
 *   bays 1–10 per aisle; odd bays on the right walking up the aisle,
 *   even bays facing them on the left, bays 1 and 2 at the receiving end
 *   levels A (floor) up to L, on orange beams carrying A–C, D–F, G–I, J–L,
 *   closed by an orange beam on top, with an open shelf above it for excess boxes
 *   six boxes across each level
 */
import {
  DEFAULT_LAYOUT, SIZE, aisleX, allCells, binPlacement, clearPath, closingBeamHeight, extent,
  frontView, heldToWalkway, sightStart, validateLayout, walkwayX,
} from '../layout';

const L = DEFAULT_LAYOUT;

describe('binPlacement', () => {
  test('reads aisle, bay, level and position from the code', () => {
    const p = binPlacement(L, 'A.1.C.4');
    expect(p).toMatchObject({ ok: true, aisle: 'A', bay: 1, level: 'C', levelIndex: 2, position: 4 });
  });

  test('odd bays are on the right of the aisle, even bays face them on the left', () => {
    const odd = binPlacement(L, 'B.3.A.1');
    const even = binPlacement(L, 'B.4.A.1');
    expect(odd.side).toBe('right');
    expect(even.side).toBe('left');
    expect(odd.x).toBeGreaterThan(even.x);
    // Bays 3 and 4 face each other across the aisle: same distance from receiving.
    expect(odd.z).toBeCloseTo(even.z);
  });

  test('bays run away from receiving: bay 9 is further in than bay 1', () => {
    expect(binPlacement(L, 'A.9.A.1').z).toBeLessThan(binPlacement(L, 'A.1.A.1').z);
  });

  test('aisles run E to A left to right', () => {
    const xs = ['E', 'D', 'C', 'B', 'A'].map((a) => binPlacement(L, `${a}.1.A.1`).x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  test('levels go up from A at the floor; a new beam is a bigger step than a row on the same beam', () => {
    const y = (lvl) => binPlacement(L, `A.1.${lvl}.1`).y;
    const row = y('B') - y('A');
    expect(y('C')).toBeGreaterThan(y('A'));
    // C→D, F→G and I→J each cross onto the next beam.
    for (const [lo, hi] of [['C', 'D'], ['F', 'G'], ['I', 'J']]) expect(y(hi) - y(lo)).toBeGreaterThan(row + 0.01);
    // J, K and L share the top beam: no beam between them.
    expect(y('L') - y('K')).toBeCloseTo(row);
  });

  test('anything outside the layout says why', () => {
    expect(binPlacement(L, 'A-01-04')).toEqual({ ok: false, reason: 'format' });
    expect(binPlacement(L, 'F.1.A.1')).toEqual({ ok: false, reason: 'aisle' });
    expect(binPlacement(L, 'A.11.A.1')).toEqual({ ok: false, reason: 'bay' });
    expect(binPlacement(L, 'A.1.M.1')).toEqual({ ok: false, reason: 'level' });
    expect(binPlacement(L, 'A.1.A.7')).toEqual({ ok: false, reason: 'position' });
  });
});

describe('frontView', () => {
  test("stands in the box's own aisle, square to its face and level with it", () => {
    const box = binPlacement(L, 'B.3.H.1');
    const { eye, target } = frontView(L, box);
    expect(target).toEqual([box.x, box.y, box.z]);
    // Square on: no distance along the aisle between the viewer and the box.
    expect(eye[2]).toBe(box.z);
    // Level with the box, near enough that the face is not seen from above.
    expect(eye[1] - box.y).toBeGreaterThan(0);
    expect(eye[1] - box.y).toBeLessThan(SIZE.level / 2);
    // On the walkway, not inside either rack.
    expect(Math.abs(eye[0] - aisleX(L, box.aisleIndex))).toBeLessThan(SIZE.aisle / 2);
  });

  test('faces a right-hand box from the left of the aisle, and a left-hand box from the right', () => {
    const right = binPlacement(L, 'B.3.H.1');
    const left = binPlacement(L, 'B.4.H.1');
    const centre = aisleX(L, right.aisleIndex);
    expect(frontView(L, right).eye[0]).toBeLessThan(centre);
    expect(frontView(L, left).eye[0]).toBeGreaterThan(centre);
  });
});

describe('walkwayX', () => {
  const B = aisleX(L, 3); // aisle B
  const low = 1.5;        // among the racking
  const inside = -4;      // well inside the building

  test('a point on a walkway stays where it is', () => {
    expect(walkwayX(L, B, low, inside)).toBe(B);
    expect(walkwayX(L, B + 0.5, low, inside)).toBe(B + 0.5);
    // The front view stands on the walkway, so it is never moved.
    const view = frontView(L, binPlacement(L, 'B.3.H.1'));
    expect(walkwayX(L, ...view.eye)).toBe(view.eye[0]);
  });

  test('a point inside a rack is put back on the nearest walkway, short of the rack face', () => {
    const inRack = B + SIZE.aisle / 2 + 0.2;
    const kept = walkwayX(L, inRack, low, inside);
    expect(kept).toBeLessThan(B + SIZE.aisle / 2);
    expect(kept).toBeGreaterThan(B);
    // Between two aisles, the nearer one wins.
    const A = aisleX(L, 4);
    expect(walkwayX(L, A - SIZE.aisle / 2 - 0.1, low, inside)).toBeGreaterThan(B + SIZE.aisle);
  });

  test('above the racking and outside the building, anywhere is free', () => {
    const inRack = B + SIZE.aisle / 2 + 0.2;
    expect(walkwayX(L, inRack, closingBeamHeight(L) + 1, inside)).toBe(inRack);
    expect(walkwayX(L, inRack, low, 3)).toBe(inRack);                      // out past receiving
    expect(walkwayX(L, inRack, low, -extent(L).length - 2)).toBe(inRack);  // out the back
    expect(walkwayX(L, extent(L).right + 2, low, inside)).toBe(extent(L).right + 2);
  });
});

describe('clearPath', () => {
  const eyeOf = (code) => frontView(L, binPlacement(L, code)).eye;

  test('sliding along a rack, or across its walkway, passes through nothing', () => {
    expect(clearPath(L, eyeOf('B.3.H.1'), eyeOf('B.9.A.6'))).toBe(true);
    expect(clearPath(L, eyeOf('B.3.H.1'), eyeOf('B.4.H.1'))).toBe(true);
  });

  test('a straight line to another aisle goes through the racking between them', () => {
    expect(clearPath(L, eyeOf('B.3.H.1'), eyeOf('D.3.H.1'))).toBe(false);
  });

  test('coming down from above the racking into an aisle is clear when it drops into the walkway', () => {
    const [x, y, z] = eyeOf('B.3.H.1');
    expect(clearPath(L, [x, closingBeamHeight(L) + 6, z + 2], [x, y, z])).toBe(true);
  });
});

describe('heldToWalkway', () => {
  const B = aisleX(L, 3);
  const edge = B + SIZE.aisle / 2; // the face of the rack on B's right
  const onWalkway = [B + 0.5, 1.5, -4];

  test('a sideways move from a walkway stops short of the rack', () => {
    const x = heldToWalkway(L, onWalkway, [edge + 0.2, 1.5, -4]);
    expect(x).toBeLessThan(edge);
    expect(x).toBeGreaterThan(B);
  });

  test('a quick move is held on the walkway it started on, not carried to the next aisle', () => {
    // One fast step lands past the middle of the double rack, nearer aisle A.
    const A = aisleX(L, 4);
    const x = heldToWalkway(L, onWalkway, [A - SIZE.aisle / 2 - 0.1, 1.5, -4]);
    expect(x).toBeLessThan(edge);
    expect(x).toBeGreaterThan(B);
    // ... and right across the next aisle too.
    expect(heldToWalkway(L, onWalkway, [A + 0.3, 1.5, -4])).toBeLessThan(edge);
  });

  test('a move that starts or ends in the open is not held', () => {
    const inRack = edge + 0.2;
    const above = closingBeamHeight(L) + 1;
    expect(heldToWalkway(L, [B, above, -4], [inRack, 1.5, -4])).toBe(inRack);   // came down from above
    expect(heldToWalkway(L, [B, 1.5, 3], [inRack, 1.5, -4])).toBe(inRack);     // came in from receiving
    expect(heldToWalkway(L, onWalkway, [inRack, above, -4])).toBe(inRack);     // rose above the racks
    expect(heldToWalkway(L, onWalkway, [inRack, 1.5, 3])).toBe(inRack);        // left by the end of the aisle
  });

  test('an eye already among the racks is not dragged back to a walkway', () => {
    const inRack = [edge + 0.3, 1.5, -4];
    expect(heldToWalkway(L, inRack, [edge + 0.6, 1.5, -4])).toBe(edge + 0.6);
  });
});

describe('sightStart', () => {
  const box = binPlacement(L, 'B.3.H.3');       // right-hand rack of aisle B
  const { eye, target } = frontView(L, box);
  const backBy = (d) => [eye[0] - d, eye[1], eye[2]]; // straight back from the rack face
  const at = (from, to, d) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    return [0, 1, 2].map((k) => from[k] + ((to[k] - from[k]) * d) / len);
  };
  const clear = (p) => walkwayX(L, ...p) === p[0];

  test('standing in the aisle in front of the box, nothing is cut away', () => {
    expect(sightStart(L, eye, target)).toBe(0);
  });

  test('backed into the rack behind, the picture starts where that rack ends', () => {
    const behind = backBy(0.6);
    const start = sightStart(L, behind, target);
    expect(start).toBeGreaterThan(0);
    expect(clear(behind)).toBe(false);
    // From there on, the line of sight is on the box's own walkway.
    expect(clear(at(behind, target, start + 0.05))).toBe(true);
    expect(clear(at(behind, target, start - 0.1))).toBe(false);
  });

  test('from two aisles back, everything up to the box’s own walkway is cut away', () => {
    const far = backBy(2 * (SIZE.aisle + 2 * SIZE.depth) + 0.4);
    const start = sightStart(L, far, target);
    const landing = at(far, target, start + 0.05);
    expect(clear(landing)).toBe(true);
    expect(Math.abs(landing[0] - aisleX(L, 3))).toBeLessThan(SIZE.aisle / 2); // aisle B, not the one between
  });

  test('from above the racks, or from the aisle behind the box, nothing is cut away', () => {
    expect(sightStart(L, [eye[0], closingBeamHeight(L) + 3, eye[2] + 2], target)).toBe(0);
    const aisleA = [aisleX(L, 4), eye[1], eye[2]];
    expect(sightStart(L, aisleA, target)).toBe(0);
  });
});

describe('allCells', () => {
  test('one cell per box in the racking, each with its own code', () => {
    const cells = allCells(L);
    expect(cells).toHaveLength(5 * 10 * 12 * 6); // 12 levels = four beams of three
    expect(new Set(cells.map((c) => c.code)).size).toBe(cells.length);
    expect(cells.find((c) => c.code === 'E.10.L.6')).toBeTruthy();
  });
});

describe('validateLayout', () => {
  test('a stored layout round-trips', () => {
    expect(validateLayout(JSON.stringify(L))).toEqual({ layout: L, errors: [] });
  });

  test('rows per beam must add up to at most 26 levels (A–Z)', () => {
    expect(validateLayout({ ...L, beams: [10, 10, 10] }).errors.length).toBeGreaterThan(0);
  });

  test('a broken one falls back to the default and says what was wrong', () => {
    const { layout, errors } = validateLayout('{"aisles": [], "beams": [99]}');
    expect(layout).toEqual(L);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('the open excess shelf on top is part of the layout', () => {
    expect(L.excessShelf).toBe(true);
    expect(validateLayout({ ...L, excessShelf: 'yes' }).errors.length).toBeGreaterThan(0);
  });

  test('nothing stored is not an error', () => {
    expect(validateLayout(null)).toEqual({ layout: L, errors: [] });
  });
});
