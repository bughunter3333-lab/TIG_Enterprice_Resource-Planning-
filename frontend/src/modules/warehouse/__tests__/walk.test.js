import {
  DEFAULT_LAYOUT as L, SIZE, aisleX, baysAt, binPlacement, extent, frontView, levelCount, levelY, walkwayX,
} from '../layout';
import {
  enterAisle, faceBox, look, moveTo, rise, rowHeight, slide, standingHeight, step, turn, walkEye, walkLine,
} from '../walk';

const QUARTER = Math.PI / 2;
const B = 3; // aisle B, in E D C B A

describe('the line down an aisle', () => {
  test('runs down the middle of the walkway, from before the racking to past its end', () => {
    const line = walkLine(L, B);
    expect(line.x).toBe(aisleX(L, B));
    expect(line.start).toBeGreaterThan(0);
    expect(line.end).toBeLessThan(-extent(L).length);
  });

  test('stepping on to it stands at the receiving end, looking up the aisle', () => {
    const pose = enterAisle(L, B);
    expect(pose).toEqual({ aisleIndex: B, z: walkLine(L, B).start, height: standingHeight(L), yaw: 0, pitch: 0 });
    expect(walkEye(L, pose)).toEqual([aisleX(L, B), standingHeight(L), walkLine(L, B).start]);
  });

  test('the eye stands level with the row of boxes nearest a person’s eyes, not looking through the gap under a beam', () => {
    // Rows D and E sit either side of 1.55 m; D is the nearer.
    expect(standingHeight(L)).toBe(rowHeight(L, 3));
    expect(standingHeight(L)).toBeGreaterThan(1.3);
    expect(standingHeight(L)).toBeLessThan(1.8);
    // Level with the row: inside the height of its boxes.
    expect(Math.abs(standingHeight(L) - levelY(L, 3))).toBeLessThan(SIZE.level / 2);
  });

  test('racking too low to have a row at eye level is looked over, not crouched to', () => {
    expect(standingHeight({ ...L, beams: [1] })).toBeCloseTo(1.55);
  });

  test('stepping on at the far end looks back down the aisle, where there is something to see', () => {
    expect(enterAisle(L, B, -extent(L).length + 1).yaw).toBe(Math.PI);
    expect(enterAisle(L, B, -2).yaw).toBe(0);
  });

  test('a spot beyond either end of the line is brought back on to it', () => {
    const line = walkLine(L, B);
    expect(enterAisle(L, B, 40).z).toBe(line.start);
    expect(enterAisle(L, B, -400).z).toBe(line.end);
    expect(moveTo(L, enterAisle(L, B), -400).z).toBe(line.end);
  });
});

describe('where the eye is', () => {
  test('whatever the turn, the height and the spot on the line, it is on the walkway — never in racking', () => {
    const line = walkLine(L, B);
    const [min, max] = [rowHeight(L, 0), rowHeight(L, levelCount(L) - 1)];
    for (let aisle = 0; aisle < L.aisles.length; aisle += 1) {
      for (let yaw = -7; yaw <= 7; yaw += 0.13) {
        for (const z of [line.start, 0, -0.01, -4.4, -extent(L).length, line.end]) {
          for (const height of [min, standingHeight(L), max]) {
            const [x, y, zz] = walkEye(L, { aisleIndex: aisle, z, height, yaw, pitch: 0 });
            expect(walkwayX(L, x, y, zz)).toBe(x);
          }
        }
      }
    }
  });

  test('facing a rack it stands back against the one behind; looking along the aisle it is on the line', () => {
    const pose = enterAisle(L, B, -4);
    expect(walkEye(L, pose)[0]).toBe(aisleX(L, B));
    expect(walkEye(L, turn(pose, 1))[0]).toBeGreaterThan(aisleX(L, B));  // facing left, backed to the right
    expect(walkEye(L, turn(pose, -1))[0]).toBeLessThan(aisleX(L, B));
  });
});

describe('walking', () => {
  const start = enterAisle(L, B, -4);

  test('forward is the way the eye is looking', () => {
    expect(step(L, start, 1).z).toBeCloseTo(-4 - 3 * SIZE.box);
    expect(step(L, start, -1).z).toBeCloseTo(-4 + 3 * SIZE.box);
    const turnedRound = turn(turn(start, 1), 1);
    expect(step(L, turnedRound, 1).z).toBeCloseTo(-4 + 3 * SIZE.box);
  });

  test('side-on to a rack, forward means up the aisle', () => {
    expect(step(L, turn(start, 1), 1).z).toBeLessThan(start.z);
    expect(step(L, turn(start, -1), 1).z).toBeLessThan(start.z);
  });

  test('the walk stops at the ends of the line', () => {
    const line = walkLine(L, B);
    expect(slide(L, start, 500).z).toBe(line.end);
    expect(slide(L, start, -500).z).toBe(line.start);
  });

  test('a step keeps the turn and the height', () => {
    const up = rise(L, look(start, 0.4, 0.2), 1);
    expect(step(L, up, 1)).toEqual({ ...up, z: step(L, up, 1).z });
  });
});

describe('turning', () => {
  const start = enterAisle(L, B, -4);

  test('a quarter turn lands square and level, whatever the view had been dragged to', () => {
    expect(turn(start, 1).yaw).toBe(QUARTER);
    expect(turn(start, -1).yaw).toBe(-QUARTER);
    const dragged = look(start, 0.3, 0.5);
    expect(turn(dragged, 1)).toMatchObject({ yaw: QUARTER, pitch: 0 });
    expect(turn(dragged, -1)).toMatchObject({ yaw: 0, pitch: 0 });
  });

  test('four quarter turns come all the way round', () => {
    let pose = start;
    for (let i = 0; i < 4; i += 1) pose = turn(pose, 1);
    expect(pose.yaw).toBeCloseTo(Math.PI * 2);
    expect(walkEye(L, pose)[0]).toBeCloseTo(aisleX(L, B));
  });

  test('looking up and down stops short of straight up', () => {
    expect(look(start, 0, 9).pitch).toBeLessThan(QUARTER);
    expect(look(start, 0, -9).pitch).toBeGreaterThan(-QUARTER);
  });
});

describe('going up and down the rows', () => {
  const start = enterAisle(L, B, -4);

  test('a move is a beam’s worth of rows, and always ends level with a row', () => {
    expect(rise(L, start, 1).height).toBe(rowHeight(L, 6));   // D to G
    expect(rise(L, start, -1).height).toBe(rowHeight(L, 0));  // D to A
    expect(rise(L, rise(L, start, 1), -1).height).toBe(start.height);
  });

  test('stops level with the top row and with the bottom one', () => {
    let pose = start;
    for (let i = 0; i < 20; i += 1) pose = rise(L, pose, 1);
    expect(pose.height).toBe(rowHeight(L, levelCount(L) - 1));
    for (let i = 0; i < 20; i += 1) pose = rise(L, pose, -1);
    expect(pose.height).toBe(rowHeight(L, 0));
  });

  test('from in front of a box it moves from that box’s row', () => {
    const facing = faceBox(L, binPlacement(L, 'B.5.H.3'));
    expect(facing.height).toBe(rowHeight(L, 7));
    expect(rise(L, facing, 1).height).toBe(rowHeight(L, 10));
  });
});

describe('facing a box', () => {
  test('stands exactly where the map’s front view of it does, looking at it', () => {
    for (const code of ['B.5.E.3', 'B.4.H.2', 'E.10.A.6', 'A.1.L.1']) {
      const p = binPlacement(L, code);
      const pose = faceBox(L, p);
      const front = frontView(L, p);
      walkEye(L, pose).forEach((v, i) => expect(v).toBeCloseTo(front.eye[i]));
      // Square to the face: looking straight across at it, tipped down to its centre.
      expect(Math.abs(Math.cos(pose.yaw))).toBeLessThan(1e-9);
      expect(Math.sign(-Math.sin(pose.yaw))).toBe(Math.sign(p.x - front.eye[0]));
      expect(pose.pitch).toBeLessThan(0);
      expect(pose.pitch).toBeGreaterThan(-0.2);
    }
  });

  test('turns the short way round from where the eye was looking', () => {
    const p = binPlacement(L, 'B.5.E.3'); // odd bay: the right-hand rack
    const spun = { ...enterAisle(L, B, -4), yaw: Math.PI * 4 + 0.2 };
    expect(faceBox(L, p, spun).yaw).toBeCloseTo(Math.PI * 4 - QUARTER);
    expect(faceBox(L, p).yaw).toBe(-QUARTER);
  });
});

describe('baysAt', () => {
  const bayLength = L.positions * SIZE.box + SIZE.bayGap;

  test('names the odd and even bay either side of a spot on the walkway', () => {
    expect(baysAt(L, -0.5)).toEqual({ odd: 1, even: 2 });
    expect(baysAt(L, -bayLength - 0.1)).toEqual({ odd: 3, even: 4 });
    expect(baysAt(L, -extent(L).length + 0.1)).toEqual({ odd: 9, even: 10 });
  });

  test('is null before the racking and past its end', () => {
    expect(baysAt(L, 0.5)).toBeNull();
    expect(baysAt(L, -extent(L).length - 0.1)).toBeNull();
  });

  test('an odd number of bays leaves the last one with nothing facing it', () => {
    expect(baysAt({ ...L, baysPerAisle: 9 }, -4 * bayLength - 0.1)).toEqual({ odd: 9, even: null });
  });
});
