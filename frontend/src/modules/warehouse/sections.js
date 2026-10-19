/**
 * Sections of racking marked for a company — "bays 3, 5 and 7 of aisle B are
 * Zone Bowling's" — as GET /rack-sections returns them. (Not zones.js: that is
 * an older static table the dashboard reads.)
 *
 * A section is a rectangle on one rack face: from one box along to another,
 * and from one level up to another. Along a face the boxes run bay by bay —
 * bay 1 boxes 1..N, then bay 3, then bay 5 — so "along" is the pair
 * (bay, box) compared in that order, and only bays on the same side (odd with
 * odd, even with even) are on one face. The server keeps the same rule
 * (backend/app/routers/rack_sections.py).
 */
import { LEVEL_LETTERS, SIZE, aisleX, bayside, binPlacement, levelCount } from './layout';
import { SECTION_COLORS } from './binColors';

// One number for a spot along a face. A level holds at most 20 boxes, and the
// server takes at most 99.
const along = (bay, position) => bay * 100 + position;
// How high a level is. One letter in any racking the map can draw — but the
// server stores up to two (A–Z, then AA), ordered shorter first, and a section
// marked that way has to compare here as it does there.
const levelAt = (letters) => [...letters].reduce((rank, letter) => rank * 27 + LEVEL_LETTERS.indexOf(letter) + 1, 0) - 1;

const withCodes = (s) => ({
  ...s,
  from_bin: `${s.aisle}.${s.bay_from}.${s.level_from}.${s.position_from}`,
  to_bin: `${s.aisle}.${s.bay_to}.${s.level_to}.${s.position_to}`,
});

/**
 * The section whose opposite corners are the boxes `a` and `b` (codes, in
 * either order), or why there is none: `{ ok: false, reason, corner }`, where
 * the reason is one of binPlacement's for the `corner` ('from' or 'to') that
 * is not a box in this racking, `aisles` (the two are in different aisles) or
 * `sides` (on opposite sides of one). `wholeBays` takes in every box of the
 * bays touched; `allLevels` every level.
 */
export function sectionBetween(layout, a, b, { wholeBays = false, allLevels = false } = {}) {
  const pa = binPlacement(layout, a);
  if (!pa.ok) return { ok: false, corner: 'from', reason: pa.reason };
  const pb = binPlacement(layout, b);
  if (!pb.ok) return { ok: false, corner: 'to', reason: pb.reason };
  if (pa.aisle !== pb.aisle) return { ok: false, reason: 'aisles' };
  if (pa.side !== pb.side) return { ok: false, reason: 'sides' };
  const [near, far] = along(pa.bay, pa.position) <= along(pb.bay, pb.position) ? [pa, pb] : [pb, pa];
  const low = allLevels ? 0 : Math.min(pa.levelIndex, pb.levelIndex);
  const high = allLevels ? levelCount(layout) - 1 : Math.max(pa.levelIndex, pb.levelIndex);
  return {
    ok: true,
    ...withCodes({
      aisle: pa.aisle,
      bay_from: near.bay,
      position_from: wholeBays ? 1 : near.position,
      bay_to: far.bay,
      position_to: wholeBays ? layout.positions : far.position,
      level_from: LEVEL_LETTERS[low],
      level_to: LEVEL_LETTERS[high],
    }),
  };
}

/** Whether the box at `p` (a binPlacement or a cell) is inside `section`. */
export function holds(section, p) {
  const at = along(p.bay, p.position);
  return section.aisle === p.aisle
    && (section.bay_from - p.bay) % 2 === 0
    && along(section.bay_from, section.position_from) <= at && at <= along(section.bay_to, section.position_to)
    && levelAt(section.level_from) <= levelAt(p.level) && levelAt(p.level) <= levelAt(section.level_to);
}

/** The section the box at `p` is in, if any. */
export const sectionFor = (sections, p) => (sections ?? []).find((s) => holds(s, p)) ?? null;

/** Whether two sections share any box — the server refuses a new one that does. */
export function overlaps(a, b) {
  return a.aisle === b.aisle
    && (a.bay_from - b.bay_from) % 2 === 0
    && along(a.bay_from, a.position_from) <= along(b.bay_to, b.position_to)
    && along(b.bay_from, b.position_from) <= along(a.bay_to, a.position_to)
    && levelAt(a.level_from) <= levelAt(b.level_to) && levelAt(b.level_from) <= levelAt(a.level_to);
}

/** The bays a section touches, in order: every second one from its first to its last. */
export function sectionBays(section) {
  const bays = [];
  for (let bay = section.bay_from; bay <= section.bay_to; bay += 2) bays.push(bay);
  return bays;
}

/** How many boxes a section takes in. */
export function boxCount(layout, section) {
  const bays = sectionBays(section).length;
  const alongFace = bays * layout.positions - (section.position_from - 1) - (layout.positions - section.position_to);
  return alongFace * (levelAt(section.level_to) - levelAt(section.level_from) + 1);
}

/**
 * Where a section sits in space, for drawing it — or null when it does not
 * fit this racking (a layout edited since it was marked). `x` is the rack
 * face's centre; `z` runs from the near edge to the far one, `y` from the
 * bottom to the top.
 */
export function sectionShape(layout, section) {
  const from = binPlacement(layout, section.from_bin);
  const to = binPlacement(layout, section.to_bin);
  if (!from.ok || !to.ok || from.aisle !== to.aisle || from.side !== to.side) return null;
  return {
    aisleIndex: from.aisleIndex,
    side: from.side,
    x: from.x,
    z: [from.z + SIZE.box / 2, to.z - SIZE.box / 2],
    y: [from.y - SIZE.level / 2, to.y + SIZE.level / 2],
  };
}

/** Where on an aisle's walk line to stand to see a section: level with its middle. */
export function sectionSpot(layout, shape) {
  return { aisleIndex: shape.aisleIndex, x: aisleX(layout, shape.aisleIndex), z: (shape.z[0] + shape.z[1]) / 2, side: shape.side };
}

/** A section in the words on the racking: "Aisle B, right-hand side · bays 3, 5, 7 · all levels". */
export function sectionWords(layout, section) {
  const bays = sectionBays(section);
  const wholeBays = section.position_from === 1 && section.position_to === layout.positions;
  const where = wholeBays
    ? `${bays.length === 1 ? 'bay' : 'bays'} ${bays.length <= 5 ? bays.join(', ') : `${bays[0]} to ${bays[bays.length - 1]} (${bays[0] % 2 ? 'odd' : 'even'})`}`
    : `bay ${section.bay_from} box ${section.position_from} to bay ${section.bay_to} box ${section.position_to}`;
  const allLevels = section.level_from === 'A' && levelAt(section.level_to) === levelCount(layout) - 1;
  const levels = allLevels ? 'all levels'
    : section.level_from === section.level_to ? `level ${section.level_from}` : `levels ${section.level_from}–${section.level_to}`;
  return `Aisle ${section.aisle}, ${bayside(layout, section.bay_from)}-hand side · ${where} · ${levels}`;
}

/**
 * A colour for each company with a section, by customer id. Companies take
 * the colours in the order their first section was marked, so a company keeps
 * its colour as others are added.
 */
export function sectionColors(sections) {
  const colors = new Map();
  for (const s of [...(sections ?? [])].sort((a, b) => a.id - b.id)) {
    if (!colors.has(s.customer_id)) colors.set(s.customer_id, SECTION_COLORS[colors.size % SECTION_COLORS.length]);
  }
  return colors;
}

/** The companies with a section taking in any of bay `bay` of `aisle`, by name. */
export function companiesAtBay(sections, aisle, bay) {
  const names = (sections ?? [])
    .filter((s) => s.aisle === aisle && (s.bay_from - bay) % 2 === 0 && s.bay_from <= bay && bay <= s.bay_to)
    .map((s) => s.customer_name);
  return [...new Set(names)];
}
