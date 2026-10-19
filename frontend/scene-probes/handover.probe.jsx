/* Hand-overs between the map (OrbitControls + CameraRig) and a walk (WalkRig). */
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('@react-three/fiber', async (importOriginal) => {
  const { fiberMock } = await import('./mocks.jsx');
  return fiberMock(await importOriginal());
});
vi.mock('@react-three/drei', async () => {
  const { dreiMock } = await import('./mocks.jsx');
  const { OrbitControls } = await import('@react-three/drei/core/OrbitControls.js');
  return dreiMock(OrbitControls, await import('@react-three/fiber'));
});

import Warehouse3D from '@src/modules/warehouse/Warehouse3D';
import { standingHeight, walkLine } from '@src/modules/warehouse/walk';
import {
  mount, wait, rest, ev, wheel, cam, ctl, frames, where, codes, clear, focusOf, since, aisleAt, aisleX, layout, probe, W, H,
} from './h.jsx';

const A = 4; // aisle A, x = +5.6
const C = 2; // aisle C, x = 0
const E = 0; // aisle E, x = -5.6
const r2 = (n) => Math.round(n * 100) / 100;
const short = (f) => `#${f.n} (${r2(f.x)}, ${r2(f.y)}, ${r2(f.z)}) fov${f.fov} ctl${f.enabled ? 'ON' : 'off'}${clear(f) ? '' : ' IN-RACK'}`;
let m;
afterEach(() => { m?.unmount(); m = null; });

test('T0 smoke: overview, then a walk stands the eye on the line', async () => {
  m = await mount(Warehouse3D);
  expect(cam().fov).toBe(42);
  expect(ctl().enabled).toBe(true);
  const before = frames();
  m.set({ walk: { aisleIndex: A, z: -6 } });
  expect(await rest()).toBe(true);
  const p = where();
  console.log('T0 walk eye', p, 'frames', frames() - before, 'codes', codes().length);
  expect(p.fov).toBe(60);
  expect(ctl().enabled).toBe(false);
  expect(p.x).toBeCloseTo(aisleX(layout, A), 3);
  expect(p.y).toBeCloseTo(standingHeight(layout), 3);
  expect(p.z).toBeCloseTo(-6, 2);
});

async function resetOutOfWalk({ frontViewFirst, walkAisle, z }) {
  m = await mount(Warehouse3D);
  if (frontViewFirst) {
    m.set({ selected: frontViewFirst, focus: focusOf(frontViewFirst) });
    await rest();
    console.log('  map camera before the walk', where());
  }
  m.set({ walk: { aisleIndex: walkAisle, z } });
  await rest();
  const eye = where();
  const mark = frames();
  // What the Reset view button does in one go: setSelected(null); leaveWalk(); setResetKey(k + 1).
  m.set({ walk: null, selected: null, focus: null, resetKey: 1 });
  const rested = await rest(250, 8000);
  const flown = since(mark);
  return { eye, flown, rested, end: where() };
}

test('T1 Reset view out of a walk, when the map was last in ANOTHER aisle: no frame in racking, no sideways jump', async () => {
  const r = await resetOutOfWalk({ frontViewFirst: 'C.5.E.3', walkAisle: A, z: -6 });
  console.log('T1 walk eye', r.eye, '\n  first frames after Reset:', r.flown.slice(0, 5).map(short).join(' | '), '\n  end', r.end, 'rested', r.rested, 'frames', r.flown.length);
  expect(r.rested).toBe(true);
  expect(r.end.fov).toBe(42);
  // The first frame of an eased flight is a short step from where the eye stood.
  expect(Math.abs(r.flown[0].x - r.eye.x)).toBeLessThan(1);
  expect(r.flown.filter((f) => !clear(f)).map(short)).toEqual([]);
});

test('T1b control: the same Reset, with the map last at the overview', async () => {
  const r = await resetOutOfWalk({ frontViewFirst: null, walkAisle: A, z: -6 });
  console.log('T1b walk eye', r.eye, '\n  first frames after Reset:', r.flown.slice(0, 5).map(short).join(' | '), '\n  end', r.end, 'frames', r.flown.length);
  expect(Math.abs(r.flown[0].x - r.eye.x)).toBeLessThan(1);
  expect(r.flown.filter((f) => !clear(f)).map(short)).toEqual([]);
});

test('T2 plain Leave after a front view elsewhere: one cut, straight up out of the walked aisle', async () => {
  m = await mount(Warehouse3D);
  m.set({ selected: 'C.5.E.3', focus: focusOf('C.5.E.3') });
  await rest();
  m.set({ walk: { aisleIndex: A, z: -6 } });
  await rest();
  const eye = where();
  const mark = frames();
  m.set({ walk: null });
  expect(await rest()).toBe(true);
  const flown = since(mark);
  console.log('T2 eye', eye, 'frames after leave:', flown.map(short).join(' | '), 'target', ctl().target.toArray().map(r2));
  expect(flown.filter((f) => !clear(f)).map(short)).toEqual([]);
  expect(flown[0].x).toBeCloseTo(eye.x, 3);
  expect(where().fov).toBe(42);
  expect(ctl().enabled).toBe(true);
  expect(flown.length).toBeLessThan(6);
});

test('T3 a walk started during an eased fly-to: the walk owns the camera from its first frame', async () => {
  m = await mount(Warehouse3D);
  m.set({ selected: 'C.5.E.3', focus: focusOf('C.5.E.3') });
  await rest();
  m.set({ selected: 'C.9.E.3', focus: focusOf('C.9.E.3') }); // same aisle, same side: eased
  await wait(60);
  const mid = where();
  const mark = frames();
  m.set({ walk: { aisleIndex: E, z: -2 } });
  expect(await rest()).toBe(true);
  const flown = since(mark);
  const walkFrames = flown.filter((f) => f.enabled === false);
  console.log('T3 mid-flight', mid, 'frames', flown.map(short).join(' | '));
  // Every frame drawn with the controls off is on aisle E's line.
  for (const f of walkFrames) {
    expect(aisleAt(f.x)).toBe(E);
    expect(clear(f)).toBe(true);
  }
  expect(where().x).toBeCloseTo(aisleX(layout, E), 3);
  expect(where().z).toBeCloseTo(-2, 2);
  expect(where().fov).toBe(60);
});

test('T4 a pointer that went down on the map before the walk, released during it: the walk keeps its box codes', async () => {
  m = await mount(Warehouse3D);
  ev('pointerdown', { x: 400, y: 300, pointerType: 'touch', pointerId: 7 }); // a finger panning the map
  await wait(30);
  m.set({ walk: { aisleIndex: C, z: -6 } }); // the Aisle C button, with the other hand
  await rest();
  const before = codes();
  const eye = where();
  ev('pointermove', { x: 420, y: 310, pointerType: 'touch', pointerId: 7 });
  ev('pointerup', { x: 420, y: 310, pointerType: 'touch', pointerId: 7 });
  await rest();
  const after = codes();
  console.log('T4 codes before release', before.length, 'after', after.length, 'eye moved?', eye, where(), 'sample', after.slice(0, 3));
  expect(where()).toEqual(eye);
  expect(before.length).toBeGreaterThan(0);
  expect(after.length).toBe(before.length);
});

test('T4b pointercancel during a walk (no map gesture at all): the walk keeps its box codes', async () => {
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: C, z: -6 } });
  await rest();
  const before = codes();
  ev('pointerdown', { x: 400, y: 300, pointerType: 'touch', pointerId: 3 });
  ev('pointermove', { x: 430, y: 300, pointerType: 'touch', pointerId: 3 });
  await rest();
  const during = codes();
  ev('pointercancel', { x: 430, y: 300, pointerType: 'touch', pointerId: 3 });
  await rest();
  const after = codes();
  console.log('T4b codes before', before.length, 'after look', during.length, 'after cancel', after.length);
  expect(after.length).toBe(before.length);
});

test('T5 a walk ended during a look-drag with the button still down: nothing leaks into the map or the next walk', async () => {
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: C, z: -6 } });
  await rest();
  ev('pointerdown', { x: 400, y: 300, button: 0 });
  ev('pointermove', { x: 500, y: 300 });
  await rest();
  const q1 = cam().quaternion.toArray().map(r2);
  m.set({ walk: null }); // Esc, button still down
  await rest();
  const lifted = { ...where(), target: ctl().target.toArray().map(r2), q: cam().quaternion.toArray().map(r2) };
  const mark = frames();
  ev('pointermove', { x: 650, y: 380 });
  ev('pointermove', { x: 700, y: 420 });
  ev('pointerup', { x: 700, y: 420, buttons: 0 });
  await rest();
  const afterDrag = { ...where(), target: ctl().target.toArray().map(r2), q: cam().quaternion.toArray().map(r2) };
  console.log('T5 look q', q1, 'lifted', lifted, 'after the rest of the drag', afterDrag, 'frames', frames() - mark, 'capture still held', probe.surface.hasPointerCapture(1));
  expect(afterDrag).toEqual(lifted);
  // The next walk: a move with no button pressed does not look round.
  m.set({ walk: { aisleIndex: C, z: -3 } });
  await rest();
  const q2 = cam().quaternion.toArray();
  ev('pointermove', { x: 300, y: 200, buttons: 0 });
  await rest();
  expect(cam().quaternion.toArray()).toEqual(q2);
  // And the map's own first gesture afterwards still works: leave, then a drag pans.
  m.set({ walk: null });
  await rest();
  const p0 = where();
  ev('pointerdown', { x: 400, y: 300 });
  ev('pointermove', { x: 440, y: 300 });
  ev('pointerup', { x: 440, y: 300, buttons: 0 });
  await rest();
  console.log('T5 map pan after leaving', p0, '->', where());
  expect(where().x).not.toBeCloseTo(p0.x, 3);
  expect(clear(where())).toBe(true);
});

test('T6 the lens: 42 outside a walk, 60 inside, whatever the order', async () => {
  m = await mount(Warehouse3D, { walk: { aisleIndex: C, z: -6 } }); // walking from the first render
  const seen = [where().fov];
  m.set({ walk: null }); await rest(); seen.push(where().fov);
  m.set({ walk: { aisleIndex: A } }); m.set({ walk: null }); await rest(); seen.push(where().fov); // in and out before a frame
  m.set({ walk: { aisleIndex: A } }); await wait(5); m.set({ walk: null }); await rest(); seen.push(where().fov);
  m.set({ walk: { aisleIndex: A } }); await rest(); seen.push(where().fov);
  m.set({ walk: { aisleIndex: E, z: -3 } }); await rest(); seen.push(where().fov); // another aisle
  m.set({ walk: null, resetKey: 5 }); await rest(); seen.push(where().fov);
  console.log('T6 fov sequence', seen, 'log fovs outside walk with controls on:', [...new Set(probe.log.filter((f) => f.enabled).map((f) => f.fov))], 'with controls off:', [...new Set(probe.log.filter((f) => f.enabled === false).map((f) => f.fov))]);
  expect(seen).toEqual([60, 42, 42, 42, 60, 60, 42]);
  expect(probe.log.filter((f) => f.enabled && f.fov !== 42)).toEqual([]);
  expect(probe.log.filter((f) => f.enabled === false && f.fov !== 60)).toEqual([]);
});

test('T7 a walk left before it ever drew a frame', async () => {
  m = await mount(Warehouse3D);
  const home = where();
  m.set({ walk: { aisleIndex: A } });
  await wait(5); // the scene has committed the walk; no frame yet (16 ms)
  const drew = frames();
  m.set({ walk: null });
  await rest();
  console.log('T7 home', home, 'after', where(), 'target', ctl().target.toArray().map(r2), 'frames drawn in between', frames() - drew);
});

test('T8 wheel: huge, tiny, during a look; second finger; every walk frame on the line', async () => {
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: C, z: -6 } });
  await rest();
  const line = walkLine(layout, C);
  const mark = frames();
  const e1 = wheel(1e12); await rest();
  const zBack = where().z;
  wheel(-1e12); await rest();
  const zFar = where().z;
  wheel(-0.01); await rest();
  const zTiny = where().z;
  ev('pointerdown', { x: 400, y: 300, pointerType: 'touch', pointerId: 5 });
  ev('pointermove', { x: 300, y: 250, pointerType: 'touch', pointerId: 5 });
  wheel(300); // during the look
  await rest();
  ev('pointerdown', { x: 100, y: 100, pointerType: 'touch', pointerId: 6, isPrimary: false });
  const qa = cam().quaternion.toArray();
  ev('pointermove', { x: 700, y: 500, pointerType: 'touch', pointerId: 6 });
  ev('pointerup', { x: 700, y: 500, pointerType: 'touch', pointerId: 6 });
  await rest();
  const qb = cam().quaternion.toArray();
  ev('pointermove', { x: 200, y: 250, pointerType: 'touch', pointerId: 5 });
  ev('pointerup', { x: 200, y: 250, pointerType: 'touch', pointerId: 5 });
  ev('pointermove', { x: 600, y: 250, pointerType: 'touch', pointerId: 6 }); // the finger that was never tracked
  await rest();
  const qc = cam().quaternion.toArray();
  ev('pointermove', { x: 600, y: 250, pointerType: 'touch', pointerId: 5, buttons: 0 }); // the lifted finger
  await rest();
  expect(cam().quaternion.toArray()).toEqual(qc);
  const all = since(mark);
  console.log('T8 wheel prevented', e1.defaultPrevented, 'z after +1e12', zBack, 'after -1e12', zFar, 'after -0.01', zTiny, 'line', line, 'frames', all.length,
    'second finger turned the view?', JSON.stringify(qa.map(r2)) !== JSON.stringify(qb.map(r2)));
  expect(e1.defaultPrevented).toBe(true);
  expect(zBack).toBeCloseTo(line.start, 2);
  expect(zFar).toBeCloseTo(line.end, 2);
  for (const f of all) {
    expect(Number.isFinite(f.x + f.y + f.z)).toBe(true);
    expect(aisleAt(f.x)).toBe(C);
    expect(clear(f)).toBe(true);
    expect(f.z).toBeLessThanOrEqual(line.start + 1e-6);
    expect(f.z).toBeGreaterThanOrEqual(line.end - 1e-6);
    expect(f.enabled).toBe(false);
  }
  expect(qb.map(r2)).toEqual(qa.map(r2));
  expect(await rest()).toBe(true);
});

test('T9 unmount mid-drag, and events that arrive afterwards', async () => {
  const errors = [];
  const onError = (e) => errors.push(String(e.error ?? e.message));
  window.addEventListener('error', onError);
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.map(String).join(' ').slice(0, 200)));
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: C, z: -6 } });
  await rest();
  const surface = probe.surface;
  ev('pointerdown', { x: 400, y: 300 });
  ev('pointermove', { x: 450, y: 300 });
  m.unmount(); m = null;
  ev('pointermove', { x: 500, y: 300, target: surface });
  ev('pointerup', { x: 500, y: 300, target: surface, buttons: 0 });
  ev('pointermove', { x: 500, y: 300, target: document });
  await wait(700); // R3F disposes the root half a second after unmount
  spy.mockRestore();
  window.removeEventListener('error', onError);
  console.log('T9 errors', errors);
  expect(errors).toEqual([]);
});

/* ---- the two orders a leave can take ---- */

// A click handler's updates are rendered by the scene synchronously, effects
// included (R3F reads window.event.type to pick the priority). Emulate that
// for the duration of the scene's commit.
async function asClick(fn) {
  const desc = Object.getOwnPropertyDescriptor(window, 'event');
  Object.defineProperty(window, 'event', { configurable: true, get: () => ({ type: 'click' }) });
  try { fn(); await wait(0); await wait(0); } finally {
    if (desc) Object.defineProperty(window, 'event', desc); else delete window.event;
  }
}
// One frame drawn between the scene's commit and its passive effects — what a
// browser does when a vsync is already due as the commit ends. Only the first
// frame request after arming is hurried; everything else is the real rAF.
function frameBeforeEffects() {
  const real = window.requestAnimationFrame;
  let armed = true;
  window.requestAnimationFrame = (cb) => {
    if (!armed) return real(cb);
    armed = false;
    window.requestAnimationFrame = real;
    queueMicrotask(() => cb(performance.now()));
    return -1;
  };
  return () => { window.requestAnimationFrame = real; return !armed; };
}

async function intoWalkFromFrontView(box, walkAisle, z) {
  m = await mount(Warehouse3D);
  m.set({ selected: box, focus: focusOf(box) });
  await rest();
  const map = where();
  m.set({ walk: { aisleIndex: walkAisle, z } });
  await rest();
  return { map, eye: where() };
}

test('T10 Reset view as a CLICK (effects before any frame), map last in another aisle', async () => {
  const { map, eye } = await intoWalkFromFrontView('C.5.E.3', A, -6);
  const mark = frames();
  await asClick(() => m.set({ walk: null, selected: null, focus: null, resetKey: 1 }));
  const rested = await rest(250, 8000);
  const flown = since(mark);
  console.log('T10 map eye before walk', map, 'walk eye', eye, '\n  frames after Reset:', flown.slice(0, 6).map(short).join(' | '), '\n  total', flown.length, 'rested', rested, 'end', where());
  expect(Math.abs(flown[0].x - eye.x)).toBeLessThan(1);
  expect(flown.filter((f) => !clear(f)).map(short)).toEqual([]);
});

test('T11 plain Leave, ordinary (async) scheduling, 8 times: lifted out above the aisle that was walked', async () => {
  const landed = [];
  for (let i = 0; i < 8; i += 1) {
    const { eye } = await intoWalkFromFrontView('C.5.E.3', A, -6);
    await wait(2 * i);
    const mark = frames();
    m.set({ walk: null });
    await rest();
    const flown = since(mark);
    landed.push({ first: short(flown[0]), end: r2(where().x), target: ctl().target.toArray().map(r2), walked: r2(eye.x) });
    m.unmount(); m = null;
  }
  console.log('T11', JSON.stringify(landed, null, 1));
  expect(landed.filter((l) => Math.abs(l.end - l.walked) > 0.8)).toEqual([]);
});

test('T12 plain Leave with one frame drawn between the commit and its effects (Esc: not a click)', async () => {
  const { map, eye } = await intoWalkFromFrontView('C.5.E.3', A, -6);
  const mark = frames();
  const disarm = frameBeforeEffects();
  m.set({ walk: null });
  await rest();
  const hurried = disarm();
  const flown = since(mark);
  console.log('T12 hurried a frame:', hurried, 'map eye before walk', map, 'walk eye', eye, '\n  frames after Leave:', flown.map(short).join(' | '), '\n  end', where(), 'looking at', ctl().target.toArray().map(r2));
  expect(flown.filter((f) => f.enabled && f.fov !== 42).map(short)).toEqual([]);
  expect(where().x).toBeCloseTo(eye.x, 1);
});

test('T12b the same, with the map last at the overview (control)', async () => {
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: A, z: -6 } });
  await rest();
  const eye = where();
  const mark = frames();
  const disarm = frameBeforeEffects();
  m.set({ walk: null });
  await rest();
  disarm();
  const flown = since(mark);
  console.log('T12b walk eye', eye, 'frames after Leave:', flown.map(short).join(' | '), 'end', where(), 'looking at', ctl().target.toArray().map(r2));
  expect(where().x).toBeCloseTo(eye.x, 1);
});
