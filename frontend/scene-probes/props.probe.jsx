/* Props changing under a walk, and two requests landing in one commit of the scene. */
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
import { mount, wait, rest, cam, ctl, frames, where, clear, focusOf, since, aisleAt, layout } from './h.jsx';

const A = 4; const C = 2; const E = 0;
const r2 = (n) => Math.round(n * 100) / 100;
const short = (f) => `#${f.n} (${r2(f.x)}, ${r2(f.y)}, ${r2(f.z)}) fov${f.fov} ctl${f.enabled ? 'ON' : 'off'}${clear(f) ? '' : ' IN-RACK'}`;
const quat = () => cam().quaternion.toArray().map(r2);
const ZB = { id: 1, customer_id: 'ZB', customer_name: 'Zone Bowling', aisle: 'C', bay_from: 5, bay_to: 5, level_from: 'A', level_to: 'L', position_from: 1, position_to: 6, from_bin: 'C.5.A.1', to_bin: 'C.5.L.6' };
let m;
afterEach(() => { m?.unmount(); m = null; });

test('P1 resetKey changed DURING a walk (the walk kept), then the walk goes deep and is left', async () => {
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: E } }); // the line start, in front of the racking
  await rest();
  m.set({ resetKey: 1 });
  await rest();
  const held = where();
  m.set({ walk: { aisleIndex: E, z: -12 } });
  await rest();
  const eye = where();
  const mark = frames();
  m.set({ walk: null });
  const rested = await rest(250, 8000);
  const flown = since(mark);
  console.log('P1 during the walk the reset moved nothing:', JSON.stringify(held), '| eye when left', JSON.stringify(eye),
    '\n  frames after Leave:', flown.slice(0, 5).map(short).join(' | '), '| frames', flown.length, 'in racking', flown.filter((f) => !clear(f)).length, 'end', JSON.stringify(where()), rested);
  expect(aisleAt(held.x)).toBe(E);
});

test('P2 an equal layout as a NEW object during a walk (the walk kept)', async () => {
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: C, z: -3 } });
  await rest();
  m.set(m.pressing('forward'));
  await rest();
  m.set(m.pressing('left'));
  await rest();
  const before = { ...where(), q: quat() };
  const mark = frames();
  m.set({ layout: { ...layout } });
  const rested = await rest(250, 8000);
  const flown = since(mark);
  console.log('P2 before', JSON.stringify(before), 'after', JSON.stringify({ ...where(), q: quat() }), 'frames', flown.length, 'in racking', flown.filter((f) => !clear(f)).length, 'fov', where().fov, 'ctl', ctl().enabled, rested);
  expect(flown.filter((f) => !clear(f)).map(short)).toEqual([]);
  expect(flown.every((f) => aisleAt(f.x) === C)).toBe(true);
});

test('P3 sections and the draft changing during a walk: the camera does not move, the canvas rests', async () => {
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: C, z: -6 } });
  await rest();
  const before = { ...where(), q: quat() };
  m.set({ sections: [ZB], sectionColors: new Map([['ZB', '#0070f2']]) });
  expect(await rest()).toBe(true);
  m.set({ draft: { ...ZB, id: undefined, bay_from: 7, bay_to: 7, from_bin: 'C.7.A.1', to_bin: 'C.7.L.6' } });
  expect(await rest()).toBe(true);
  m.set({ sections: [], draft: null });
  expect(await rest()).toBe(true);
  expect({ ...where(), q: quat() }).toEqual(before);
});

test('P4 a box picked and a walk started in ONE commit; a control pressed in the commit that starts the walk', async () => {
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: C }, selected: 'C.5.E.3', focus: focusOf('C.5.E.3'), ...m.pressing('forward') });
  await rest();
  const got = where();
  const front = focusOf('C.5.E.3').eye;
  console.log('P4 eye', JSON.stringify(got), '| the front view of the picked box is', front.map(r2), '| line start is z 1.2, one step on is z -0.06');
  expect(aisleAt(got.x)).toBe(C);
  expect(clear(got)).toBe(true);
});

test('P5 a box picked and the walk left in ONE commit', async () => {
  m = await mount(Warehouse3D);
  m.set({ walk: { aisleIndex: A, z: -6 } });
  await rest();
  const mark = frames();
  m.set({ walk: null, selected: 'C.5.E.3', focus: focusOf('C.5.E.3') });
  const rested = await rest(250, 8000);
  const flown = since(mark);
  console.log('P5 frames', flown.slice(0, 4).map(short).join(' | '), 'total', flown.length, 'in racking', flown.filter((f) => !clear(f)).length, 'end', JSON.stringify(where()), 'front view', focusOf('C.5.E.3').eye.map(r2), rested);
  expect(flown.filter((f) => !clear(f)).map(short)).toEqual([]);
  expect(where().fov).toBe(42);
});

test('P6 the same box picked again during a walk, then one in another aisle: faced, by a cut, never through racking', async () => {
  m = await mount(Warehouse3D, { selected: 'C.5.E.3', focus: focusOf('C.5.E.3') });
  await rest();
  m.set({ walk: { aisleIndex: C } });
  await rest();
  const start = where();
  const mark = frames();
  m.set({ focus: focusOf('C.5.E.3') }); // picked again: a new focus object
  await rest();
  const faced = where();
  m.set({ selected: 'A.4.B.2', focus: focusOf('A.4.B.2') });
  await rest();
  const other = where();
  const flown = since(mark);
  console.log('P6 start', JSON.stringify(start), 'faced', JSON.stringify(faced), 'want', focusOf('C.5.E.3').eye.map(r2), '| other aisle', JSON.stringify(other), 'want', focusOf('A.4.B.2').eye.map(r2), 'in racking', flown.filter((f) => !clear(f)).length);
  expect(start.z).toBeCloseTo(1.2, 2);
  focusOf('C.5.E.3').eye.forEach((v, i) => expect([faced.x, faced.y, faced.z][i]).toBeCloseTo(v, 2));
  focusOf('A.4.B.2').eye.forEach((v, i) => expect([other.x, other.y, other.z][i]).toBeCloseTo(v, 2));
  expect(flown.filter((f) => !clear(f)).map(short)).toEqual([]);
  expect(flown.every((f) => f.enabled === false && f.fov === 60)).toBe(true);
});
