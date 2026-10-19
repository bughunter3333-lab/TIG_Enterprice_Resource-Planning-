/* The map camera's own rules (spec, "Moving around"): racking is solid to the eye, whatever the gesture. */
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
import { closingBeamHeight, extent, walkwayX } from '@src/modules/warehouse/layout';
import { mount, wait, rest, ev, wheel, cam, ctl, frames, focusOf, since, layout, W, H } from './h.jsx';

const TOP = closingBeamHeight(layout);
const ext = extent(layout);
const HOME = [ext.width * 0.28, ext.height * 2.4 + 4, 9 + ext.length * 0.15];
const r2 = (n) => Math.round(n * 100) / 100;
const far = (a, b) => Math.hypot(a.x - b[0], a.y - b[1], a.z - b[2]);
// Two millimetres of slack: the controls do not report a move under a
// millimetre, so the eye can rest a hair past where it was put.
const inRacking = (f) => Math.abs(walkwayX(layout, f.x, f.y, f.z) - f.x) > 0.002 || f.y < 0.15 - 1e-6;
const bad = (mark) => since(mark).filter(inRacking).map((f) => `#${f.n} (${r2(f.x)}, ${r2(f.y)}, ${r2(f.z)})`);

let m;
afterEach(() => { m?.unmount(); m = null; });

async function face(code) {
  m.set({ selected: code, focus: focusOf(code) });
  await rest();
}
/** A drag from `from` by `by` pixels, a frame between each step. Button 0 moves the view, 2 turns it. */
async function drag(from, by, { button = 0, px = 25 } = {}) {
  const steps = Math.max(1, Math.round(Math.hypot(by[0], by[1]) / px));
  const buttons = button === 2 ? 2 : 1;
  ev('pointerdown', { x: from[0], y: from[1], button, buttons });
  for (let i = 1; i <= steps; i += 1) {
    ev('pointermove', { x: from[0] + (by[0] * i) / steps, y: from[1] + (by[1] * i) / steps, button, buttons });
    await wait(16);
  }
  ev('pointerup', { x: from[0] + by[0], y: from[1] + by[1], button, buttons: 0 });
}
async function scroll(notches, deltaY, at = [W / 2, H / 2]) {
  for (let i = 0; i < notches; i += 1) { wheel(deltaY, { x: at[0], y: at[1] }); await wait(30); }
}
const reach = () => cam().position.distanceTo(ctl().target);

test('the overview opens whole and at rest', async () => {
  m = await mount(Warehouse3D);
  expect(cam().near).toBeCloseTo(0.1, 6); // nothing is cut away
  expect(far(cam().position, HOME)).toBeLessThan(0.02);
  expect(ctl().target.z).toBeCloseTo(-ext.length / 2, 3);
  const mark = frames();
  await wait(1200);
  expect(frames()).toBe(mark);
});

test('turns and drags from a front view, slow and fast, never put the eye in racking, and the view rests where it was put', async () => {
  const gestures = [
    [[300, 0], 2, 40], [[-300, 0], 2, 40], [[220, 0], 2, 8],     // turns: fast, the other way, slow
    [[420, 0], 0, 30], [[-420, 0], 0, 30], [[0, 240], 0, 30], [[0, -300], 0, 30], // drags along and up the face
  ];
  for (const code of ['B.5.E.3', 'E.10.A.6', 'A.1.L.1']) {
    for (const [by, button, px] of gestures) {
      m = await mount(Warehouse3D);
      await face(code);
      const mark = frames();
      await drag([W / 2, H / 2], by, { button, px });
      expect(await rest()).toBe(true);
      expect(bad(mark), `${code} ${button === 2 ? 'turn' : 'drag'} ${by}`).toEqual([]);
      m.unmount(); m = null;
    }
  }
});

test('a turn held at the edge, a scroll in the middle of it, and the turn carried on', async () => {
  for (const notch of [-100, 100]) {
    m = await mount(Warehouse3D);
    await face('B.5.E.3');
    const mark = frames();
    ev('pointerdown', { x: 200, y: 300, button: 2, buttons: 2 });
    for (let i = 1; i <= 25; i += 1) { ev('pointermove', { x: 200 + i * 10, y: 300, button: 2, buttons: 2 }); await wait(16); }
    wheel(notch, { x: 450, y: 300 });
    await wait(16);
    for (let i = 26; i <= 55; i += 1) { ev('pointermove', { x: 200 + i * 10, y: 300, button: 2, buttons: 2 }); await wait(16); }
    ev('pointerup', { x: 750, y: 300, button: 2, buttons: 0 });
    await rest(250, 8000);
    expect(bad(mark), `notch ${notch}`).toEqual([]);
    m.unmount(); m = null;
  }
});

test('scrolling in from the overview on to a rack lands the eye on a walkway, and it can be moved about from there', async () => {
  for (const at of [[300, 250], [450, 220], [560, 290]]) {
    m = await mount(Warehouse3D);
    const mark = frames();
    await scroll(70, -100, at);
    expect(await rest(250, 8000)).toBe(true);
    await drag([W / 2, H / 2], [240, 0], { px: 30 });
    await drag([W / 2, H / 2], [-240, 0], { px: 30 });
    await drag([W / 2, H / 2], [160, 0], { button: 2, px: 20 });
    expect(await rest(250, 8000)).toBe(true);
    expect(bad(mark), `scrolled in at ${at}`).toEqual([]);
    m.unmount(); m = null;
  }
});

test('scrolling out against the rack behind lifts the eye out of the aisle once, still on the box, then zooms freely', async () => {
  for (const code of ['B.9.C.3', 'E.10.A.6', 'A.1.L.1']) {
    m = await mount(Warehouse3D);
    await face(code);
    const front = focusOf(code);
    const before = reach();
    const mark = frames();
    await scroll(1, 100);
    expect(await rest(250, 8000)).toBe(true);
    expect(cam().position.y, code).toBeGreaterThan(TOP + 2);
    expect(reach()).toBeGreaterThan(before);
    expect(far(ctl().target, front.target)).toBeLessThan(0.05);
    const reaches = [reach()];
    for (let i = 0; i < 12; i += 1) { await scroll(1, 100); reaches.push(reach()); }
    expect(reaches.every((r, i) => i === 0 || r > reaches[i - 1])).toBe(true);
    expect(await rest(250, 8000)).toBe(true);
    expect(bad(mark), code).toEqual([]);
    m.unmount(); m = null;
  }
});

test('only a scroll-out lifts: a blocked turn, a drag into the rack and a scroll-in leave the eye in the aisle', async () => {
  m = await mount(Warehouse3D);
  await face('B.5.E.3');
  const mark = frames();
  await drag([W / 2, H / 2], [300, 0], { button: 2, px: 30 });
  await drag([W / 2, H / 2], [350, 0], { px: 35 });
  await scroll(3, -100);
  // A wheel during a drag is ignored by the controls; it must not arm a lift either.
  ev('pointerdown', { x: 400, y: 300, button: 0, buttons: 1 });
  wheel(100, { x: 400, y: 300 });
  for (let i = 1; i <= 15; i += 1) { ev('pointermove', { x: 400 + i * 20, y: 300, button: 0, buttons: 1 }); await wait(16); }
  ev('pointerup', { x: 700, y: 300, button: 0, buttons: 0 });
  expect(await rest(250, 8000)).toBe(true);
  expect(cam().position.y).toBeLessThan(TOP);
  expect(bad(mark)).toEqual([]);
});

test('Reset view goes home without snapping the aim round first, and rests', async () => {
  m = await mount(Warehouse3D);
  await drag([W / 2, H / 2], [160, 50], { px: 20 });
  await drag([W / 2, H / 2], [100, 0], { button: 2, px: 20 });
  await rest();
  const aim = ctl().target.clone();
  m.set({ resetKey: 1 });
  await wait(0);
  expect(ctl().target.distanceTo(aim)).toBeLessThan(0.5); // before any frame has eased it
  expect(await rest(250, 8000)).toBe(true);
  expect(far(cam().position, HOME)).toBeLessThan(0.02);
});
