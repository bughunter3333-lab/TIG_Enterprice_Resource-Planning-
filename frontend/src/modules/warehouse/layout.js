/**
 * The warehouse racking, as data — where every bin code sits in space.
 *
 * A bin code is aisle · bay · level · position (lib/binLocation.js): `A.1.C.4`
 * is aisle A, bay 1, level C counted up from A at the floor, box 4 across the
 * level. The defaults are the HQ racking as the owner drew it (2026-10-10):
 *
 *   aisles E D C B A, left to right standing at receiving
 *   bays 1–10 per aisle — odd bays on the right walking up the aisle, even
 *   bays facing them on the left, bays 1 and 2 at the receiving end
 *   levels A to L on four orange beams of three rows: A–C, D–F, G–I, J–L,
 *   closed by an orange beam on top with an open shelf above for excess boxes
 *   six boxes across every level
 *
 * The layout is stored (admin setting `warehouse_layout:<branch>`) so a
 * miscount is a setting to change, not code. Units are metres-ish: the scene
 * only needs proportions that read like the real racking.
 *
 * Space: x runs left to right across the aisles, y up, and z from receiving
 * (z = 0, nearest the viewer) into the building (negative z).
 */
import { parseBin } from '../../lib/binLocation';

export const LEVEL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const DEFAULT_LAYOUT = {
  version: 1,
  aisles: ['E', 'D', 'C', 'B', 'A'],
  baysPerAisle: 10,
  beams: [3, 3, 3, 3],  // rows of boxes on each beam, bottom to top
  excessShelf: true,    // closing beam on top, with an open shelf for excess boxes
  positions: 6,
  oddSide: 'right',
};

/** How many levels the racking has: every row on every beam. */
export const levelCount = (layout) => layout.beams.reduce((n, rows) => n + rows, 0);

/** The beam a level sits on (0 = the floor beam). */
function beamOf(layout, levelIndex) {
  let top = 0;
  for (let b = 0; b < layout.beams.length; b += 1) {
    top += layout.beams[b];
    if (levelIndex < top) return b;
  }
  return layout.beams.length - 1;
}

export const SIZE = {
  box: 0.42,      // one box, along the aisle
  level: 0.36,    // one level, floor to floor
  depth: 0.5,     // rack depth, across
  aisle: 1.8,     // walkway between two rack faces
  beamGap: 0.14,  // an orange beam and its clearance, between rows on different beams
  bayGap: 0.18,   // between neighbouring bays
};

const bayLength = (layout) => layout.positions * SIZE.box + SIZE.bayGap;
const aislePitch = () => SIZE.aisle + 2 * SIZE.depth;

/** Total footprint, for framing the camera and laying the floor. */
export function extent(layout) {
  const width = layout.aisles.length * aislePitch();
  const length = Math.ceil(layout.baysPerAisle / 2) * bayLength(layout);
  const top = levelY(layout, levelCount(layout) - 1) + SIZE.level / 2 + SIZE.beamGap;
  const height = top + (layout.excessShelf ? SIZE.level : 0);
  return { width, length, height, left: -width / 2, right: width / 2 };
}

/** Centre of aisle `index` (0 = leftmost) on x. */
export function aisleX(layout, index) {
  return (index - (layout.aisles.length - 1) / 2) * aislePitch();
}

/** Height of the centre of level `index` (0 = A, the floor). */
export function levelY(layout, index) {
  return index * SIZE.level + beamOf(layout, index) * SIZE.beamGap + SIZE.level / 2;
}

/** Height of the top of each beam — where its first row of boxes sits. */
export function beamHeights(layout) {
  const heights = [];
  let first = 0;
  for (const rows of layout.beams) {
    heights.push(levelY(layout, first) - SIZE.level / 2);
    first += rows;
  }
  return heights;
}

/** The closing beam above the top row, which carries the excess shelf. */
export function closingBeamHeight(layout) {
  return levelY(layout, levelCount(layout) - 1) + SIZE.level / 2 + SIZE.beamGap;
}

/** Which side of the aisle a bay is on, walking up from receiving. */
export function bayside(layout, bay) {
  const odd = bay % 2 === 1;
  const other = layout.oddSide === 'right' ? 'left' : 'right';
  return odd ? layout.oddSide : other;
}

/** Rack-face centre on x for one side of an aisle. */
export function faceX(layout, aisleIndex, side) {
  const offset = SIZE.aisle / 2 + SIZE.depth / 2;
  return aisleX(layout, aisleIndex) + (side === 'right' ? offset : -offset);
}

/** Near edge of a bay on z; bays 1 and 2 are at the receiving end. */
export function bayZ(layout, bay) {
  return -Math.floor((bay - 1) / 2) * bayLength(layout);
}

function place(layout, aisleIndex, bay, levelIndex, position) {
  const side = bayside(layout, bay);
  return {
    side,
    x: faceX(layout, aisleIndex, side),
    y: levelY(layout, levelIndex),
    z: bayZ(layout, bay) - (position - 0.5) * SIZE.box,
  };
}

/**
 * Where a bin code sits, or why it cannot be placed: `format` (not an
 * aisle.bay.level.position code, e.g. a legacy `A-01-04`), or the part that
 * falls outside this layout — `aisle`, `bay`, `level`, `position`.
 */
export function binPlacement(layout, code) {
  const parsed = parseBin(code);
  if (!parsed) return { ok: false, reason: 'format' };
  const aisleIndex = layout.aisles.indexOf(parsed.aisle);
  if (aisleIndex < 0) return { ok: false, reason: 'aisle' };
  if (parsed.bay < 1 || parsed.bay > layout.baysPerAisle) return { ok: false, reason: 'bay' };
  const levelIndex = LEVEL_LETTERS.indexOf(parsed.level);
  if (parsed.level.length !== 1 || levelIndex < 0 || levelIndex >= levelCount(layout)) return { ok: false, reason: 'level' };
  if (parsed.position < 1 || parsed.position > layout.positions) return { ok: false, reason: 'position' };
  return {
    ok: true,
    code: `${parsed.aisle}.${parsed.bay}.${parsed.level}.${parsed.position}`,
    aisle: parsed.aisle,
    aisleIndex,
    bay: parsed.bay,
    level: parsed.level,
    levelIndex,
    position: parsed.position,
    ...place(layout, aisleIndex, parsed.bay, levelIndex, parsed.position),
  };
}

/** Every box in the racking, in a stable order — one instance each in the scene. */
export function allCells(layout) {
  const cells = [];
  layout.aisles.forEach((aisle, aisleIndex) => {
    for (let bay = 1; bay <= layout.baysPerAisle; bay += 1) {
      for (let levelIndex = 0; levelIndex < levelCount(layout); levelIndex += 1) {
        for (let position = 1; position <= layout.positions; position += 1) {
          const level = LEVEL_LETTERS[levelIndex];
          cells.push({
            code: `${aisle}.${bay}.${level}.${position}`,
            aisle, aisleIndex, bay, level, position,
            ...place(layout, aisleIndex, bay, levelIndex, position),
          });
        }
      }
    }
  });
  return cells;
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/**
 * A stored layout, checked. Returns the default (and what was wrong) rather
 * than drawing nonsense; nothing stored is simply the default.
 */
export function validateLayout(raw) {
  if (raw == null || raw === '') return { layout: DEFAULT_LAYOUT, errors: [] };
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return { layout: DEFAULT_LAYOUT, errors: ['Not valid JSON'] }; }
  }
  const errors = [];
  const aisles = Array.isArray(value.aisles) ? value.aisles.map((a) => String(a).trim().toUpperCase()) : [];
  if (aisles.length < 1 || aisles.length > 26 || aisles.some((a) => !/^[A-Z]+$/.test(a)) || new Set(aisles).size !== aisles.length) {
    errors.push('Aisles must be 1–26 distinct letters');
  }
  if (!isInt(value.baysPerAisle, 1, 60)) errors.push('Bays per aisle must be 1–60');
  const beams = Array.isArray(value.beams) ? value.beams : [];
  if (beams.length < 1 || beams.some((r) => !isInt(r, 1, 26)) || beams.reduce((n, r) => n + r, 0) > 26) {
    errors.push('Rows per beam must be whole numbers adding up to at most 26 levels (A–Z)');
  }
  if (!isInt(value.positions, 1, 20)) errors.push('Positions per level must be 1–20');
  if (typeof value.excessShelf !== 'boolean') errors.push('Say whether there is an open excess shelf on top');
  if (value.oddSide !== 'left' && value.oddSide !== 'right') errors.push('Odd bays must be on the left or the right');
  if (errors.length) return { layout: DEFAULT_LAYOUT, errors };
  return {
    layout: {
      version: 1,
      aisles,
      baysPerAisle: value.baysPerAisle,
      beams: [...beams],
      positions: value.positions,
      excessShelf: value.excessShelf,
      oddSide: value.oddSide,
    },
    errors: [],
  };
}
