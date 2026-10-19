/**
 * Walking an aisle, as on Street View — the maths only; Walk3D.jsx moves the
 * camera with it.
 *
 * A line runs down the middle of every walkway and the eye rides it: it can
 * turn all the way round, step along, and go up and down the rows. Where it
 * stands is a pose, `{ aisleIndex, z, height, yaw, pitch }`. Yaw 0 looks up
 * the aisle, away from receiving; a quarter turn left faces the left-hand
 * rack. Every function here returns a new pose.
 *
 * The eye cannot be in racking, by construction rather than by correction:
 * the line is the centre of the walkway, and the furthest the eye leans off it
 * (`walkEye`) is less than the walkway's free half-width.
 */
import { FRONT_VIEW, SIZE, aisleX, extent, frontView, levelCount, levelY } from './layout';

// About where a person's eyes are. The eye rides level with a row of boxes,
// not at this height exactly: between two rows it looks straight through the
// gap under a beam, at nothing.
const EYE_LEVEL = 1.55;
// A wider lens than the map's 42°: an aisle is 1.8 m across, and at 42° a rack
// face that close shows barely three levels.
export const WALK_FOV = 60;

const QUARTER = Math.PI / 2;
const FULL = Math.PI * 2;
const STEP = 3 * SIZE.box;  // one step along the line: three boxes
const ROWS_PER_MOVE = 3;    // one move up or down: a beam's worth of rows
const PITCH_LIMIT = 1.25;   // short of straight up, where left and right swap over
// The line starts before the racking, clear of the bench, and runs a little past the last bay.
const LINE = { before: 1.2, beyond: 0.6 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Where an aisle's line runs on the floor: `x`, and from `start` (receiving end) to `end`. */
export function walkLine(layout, aisleIndex) {
  return { x: aisleX(layout, aisleIndex), start: LINE.before, end: -extent(layout).length - LINE.beyond };
}

const onLine = (layout, z) => clamp(z, -extent(layout).length - LINE.beyond, LINE.before);

/** Where the eye rides to look along row `row` (0 = the floor): where the front view of its boxes stands. */
export const rowHeight = (layout, row) => levelY(layout, row) + FRONT_VIEW.rise;

function rowNearest(layout, height) {
  let best = 0;
  for (let row = 1; row < levelCount(layout); row += 1) {
    if (Math.abs(rowHeight(layout, row) - height) < Math.abs(rowHeight(layout, best) - height)) best = row;
  }
  return best;
}

/**
 * How high the eye is on stepping on to a line: level with the row nearest a
 * person's eyes. Racking too low to have such a row is looked over instead.
 */
export function standingHeight(layout) {
  const height = rowHeight(layout, rowNearest(layout, EYE_LEVEL));
  return Math.abs(height - EYE_LEVEL) <= SIZE.level ? height : EYE_LEVEL;
}

/**
 * Where the eye is for a pose. Facing a rack it stands back against the one
 * behind, as a person does to read a label — on the centre line a face is
 * 0.9 m off, too close to see more than a couple of levels of it. The lean
 * follows the turn smoothly, so looking along the aisle it is on the line.
 */
export function walkEye(layout, pose) {
  return [aisleX(layout, pose.aisleIndex) + FRONT_VIEW.across * Math.sin(pose.yaw), pose.height, pose.z];
}

/**
 * Stepping on to an aisle's line at `z` (its receiving end when not given),
 * standing, looking along whichever way has more aisle ahead.
 */
export function enterAisle(layout, aisleIndex, z) {
  const at = onLine(layout, z ?? LINE.before);
  const facingBack = at < -extent(layout).length / 2;
  return { aisleIndex, z: at, height: standingHeight(layout), yaw: facingBack ? Math.PI : 0, pitch: 0 };
}

/** Along the same line to `z` (its receiving end when not given), looking the same way. */
export const moveTo = (layout, pose, z) => ({ ...pose, z: onLine(layout, z ?? LINE.before) });

// Forward is the way the eye is looking. Side-on to a rack there is no
// forward along the line, so it means up the aisle, as the bay numbers run.
const ahead = (pose) => (Math.cos(pose.yaw) < -0.5 ? 1 : -1);

/** `metres` along the line: forward when positive, backward when negative. */
export const slide = (layout, pose, metres) => ({ ...pose, z: onLine(layout, pose.z + ahead(pose) * metres) });

/** `steps` steps along the line, forward or (negative) back. */
export const step = (layout, pose, steps) => slide(layout, pose, steps * STEP);

/**
 * A quarter turn: `quarters` +1 to the left, -1 to the right. It lands square
 * — along the aisle or flat on to a rack — and level, whatever the view had
 * been dragged round to.
 */
export function turn(pose, quarters) {
  const at = pose.yaw / QUARTER;
  const next = quarters > 0 ? Math.floor(at + 1e-6) + 1 : Math.ceil(at - 1e-6) - 1;
  return { ...pose, yaw: next * QUARTER, pitch: 0 };
}

/** Looking round by hand: `left` and `up` in radians. */
export const look = (pose, left, up) => ({ ...pose, yaw: pose.yaw + left, pitch: clamp(pose.pitch + up, -PITCH_LIMIT, PITCH_LIMIT) });

/** Up (`moves` positive) or down the rows, a beam's worth at a time, between the bottom row and the top one. */
export function rise(layout, pose, moves) {
  const row = clamp(rowNearest(layout, pose.height) + moves * ROWS_PER_MOVE, 0, levelCount(layout) - 1);
  return { ...pose, height: rowHeight(layout, row) };
}

/** Turned square to the rack on `side` ('left' or 'right'), the short way round, and level. */
export function faceSide(pose, side) {
  const square = side === 'right' ? -QUARTER : QUARTER;
  return { ...pose, yaw: square + FULL * Math.round((pose.yaw - square) / FULL), pitch: 0 };
}

/**
 * In front of a box, square to it and level with it — the same spot as the
 * map's front view (`frontView`). `from` is the pose being left: the turn goes
 * the short way round from it. `p` is a binPlacement or a cell.
 */
export function faceBox(layout, p, from) {
  const { eye, target } = frontView(layout, p);
  return {
    ...faceSide({ yaw: from ? from.yaw : 0 }, p.side),
    aisleIndex: p.aisleIndex,
    z: eye[2],
    height: eye[1],
    pitch: Math.atan2(target[1] - eye[1], Math.abs(target[0] - eye[0])),
  };
}
