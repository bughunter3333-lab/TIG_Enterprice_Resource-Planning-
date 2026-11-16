/* Leaving a walk: the order of the scene commit, its effects and the next frame. */
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
import { mount, wait, rest, ev, wheel, cam, ctl, frames, where, codes, clear, focusOf, since, aisleAt, cells, layout } from './h.jsx';

const A = 4; const C = 2;
const r2 = (n) => Math.round(n * 100) / 100;
const short = (f) => `#${f.n} (${r2(f.x)}, ${r2(f.y)}, ${r2(f.z)}) fov${f.fov} ctl${f.enabled ? 'ON' : 'off'}${clear(f) ? '' : ' IN-RACK'}`;
let m;
afterEach(() => { m?.unmount(); m = null; });

// A click handler: the scene renders its updates synchronously, effects included.
async function asClick(fn) {
  const desc = Object.getOwnPropertyDescriptor(window, 'event');
  Object.defineProperty(window, 'event', { configurable: true, get: () => ({ type: 'click' }) });
  try { fn(); await wait(0); await wait(0); } finally {
    if (desc) Object.defineProperty(window, 'event', desc); else delete window.event;
  }
}
// One frame drawn between the scene commit (controls back on) and its passive
// effects (the hand-over in CameraRig, the lens put back by WalkRig): the first
// frame asked for once the controls are on and the lens is still the walking one.
function frameBeforeEffects() {
  const real = window.requestAnimationFrame;
  let hurried = false;
  window.requestAnimationFrame = (cb) => {
    if (hurried || !(ctl().enabled && cam().fov === 60)) return real(cb);
    hurried = true;
    window.requestAnimationFrame = real;
    queueMicrotask(() => cb(performance.now()));
    return -1;
  };
  return () => { window.requestAnimationFrame = real; return hurried; };
}
async function intoWalk({ frontView, aisle, z }) {
  m = await mount(Warehouse3D);
  if (frontView) { m.set({ selected: frontView, focus: focusOf(frontView) }); await rest(); }
  const map = where();
  m.set({ walk: { aisleIndex: aisle, z } });
  await rest();
  return { map, eye: where() };
}

test('L1 Leave (not a click: Esc), a frame drawn before the effects, map last in ANOTHER aisle', async () => {
  const { map, eye } = await intoWalk({ frontView: 'C.5.E.3', aisle: A, z: -6 });
  const mark = frames();
  const disarm = frameBeforeEffects();
  m.set({ walk: null });
  await rest();
  const hurried = disarm();
  const flown = since(mark);
  console.log('L1 hurried', hurried, '| map eye before the walk', JSON.stringify(map), '| walk eye', JSON.stringify(eye),
    '\n  frames after Leave:', flown.map(short).join(' | '), '\n  ends above aisle', layout.aisles[aisleAt(where().x)], JSON.stringify(where()), 'looking at', ctl().target.toArray().map(r2));
  expect(flown.filter((f) => f.enabled && f.fov !== 42).map(short)).toEqual([]);
  expect(layout.aisles[aisleAt(where().x)]).toBe('A');
});

test('L1b control: the same, map last at the overview', async () => {
  const { eye } = await intoWalk({ frontView: null, aisle: A, z: -6 });
  const mark = frames();
  const disarm = frameBeforeEffects();
  m.set({ walk: null });
  await rest();
  const hurried = disarm();
  const flown = since(mark);
  console.log('L1b hurried', hurried, '| walk eye', JSON.stringify(eye), '\n  frames after Leave:', flown.map(short).join(' | '), '\n  ends', JSON.stringify(where()), 'looking at', ctl().target.toArray().map(r2));
  expect(layout.aisles[aisleAt(where().x)]).toBe('A');
  expect(flown.filter((f) => f.enabled && f.fov !== 42).map(short)).toEqual([]);
});

test('L2 Reset during a glide (click order and async order), map last at the overview: clear all the way home', async () => {
  for (const order of ['click', 'async']) {
    await intoWalk({ frontView: null, aisle: A, z: -2 });
    wheel(-900); // gliding up the aisle
    await wait(90);
    const mid = where();
    const mark = frames();
    const patch = { walk: null, selected: null, focus: null, resetKey: 1 };
    if (order === 'click') await asClick(() => m.set(patch)); else m.set(patch);
    const rested = await rest(250, 8000);
    const flown = since(mark);
    console.log(`L2 ${order}: mid-glide`, JSON.stringify(mid), 'first frames', flown.slice(0, 3).map(short).join(' | '), 'frames', flown.length, 'in racking', flown.filter((f) => !clear(f)).length, 'end', JSON.stringify(where()), 'rested', rested);
    expect(rested).toBe(true);
    expect(flown.filter((f) => !clear(f)).map(short)).toEqual([]);
    expect(where().fov).toBe(42);
    expect(where().y).toBeGreaterThan(16);
    m.unmount(); m = null;
  }
});

test('L3 the map takes over after a plain Leave: scroll in, turn, drag — the eye stays out of racking', async () => {
  await intoWalk({ frontView: null, aisle: C, z: -6 });
  m.set({ walk: null });
  await rest();
  const mark = frames();
  for (let i = 0; i < 14; i += 1) { wheel(-300, { x: 400, y: 330 }); await wait(20); }
  await rest();
  const zoomed = where();
  ev('pointerdown', { x: 400, y: 300, button: 2, buttons: 2 });
  ev('pointermove', { x: 520, y: 300, buttons: 2 });
  ev('pointermove', { x: 640, y: 320, buttons: 2 });
  ev('pointerup', { x: 640, y: 320, button: 2, buttons: 0 });
  await rest();
  ev('pointerdown', { x: 400, y: 300 });
  ev('pointermove', { x: 700, y: 300 });
  ev('pointermove', { x: 100, y: 300 });
  ev('pointerup', { x: 100, y: 300, buttons: 0 });
  await rest();
  const flown = since(mark);
  console.log('L3 after scrolling in', JSON.stringify(zoomed), 'end', JSON.stringify(where()), 'frames', flown.length, 'in racking', flown.filter((f) => !clear(f)).map(short).slice(0, 5));
  expect(flown.filter((f) => !clear(f)).map(short)).toEqual([]);
  expect(flown.every((f) => f.fov === 42 && f.enabled)).toBe(true);
});

test('L4 a map pointer released (or a pointer cancelled) during a walk at the far end: codes stay round the eye', async () => {
  const zOf = new Map(cells.map((c) => [c.code, c.z]));
  const roundEye = () => { const e = where(); return codes().filter((code) => Math.abs(zOf.get(code) - e.z) < 2).length; };
  m = await mount(Warehouse3D);
  ev('pointerdown', { x: 400, y: 300, pointerType: 'touch', pointerId: 7 }); // a finger resting on the map
  await wait(30);
  m.set({ walk: { aisleIndex: A, z: -13 } });
  await rest();
  const before = { all: codes().length, roundEye: roundEye(), eye: where() };
  ev('pointerup', { x: 400, y: 300, pointerType: 'touch', pointerId: 7 });
  await rest();
  const afterUp = { all: codes().length, roundEye: roundEye() };
  wheel(-100); await rest(); // two boxes along: the walk prints its own again
  const afterStep = { all: codes().length, roundEye: roundEye() };
  ev('pointercancel', { x: 400, y: 300, pointerType: 'touch', pointerId: 9 });
  await rest();
  const afterCancel = { all: codes().length, roundEye: roundEye() };
  console.log('L4 codes', JSON.stringify({ before, afterUp, afterStep, afterCancel }));
  expect(afterUp.roundEye).toBe(before.roundEye);
  expect(afterCancel.roundEye).toBe(afterStep.roundEye);
});
