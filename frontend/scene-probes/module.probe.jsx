/* The REAL WarehouseModule around the REAL scene: words, keyboard, focus, marking. */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('@react-three/fiber', async (importOriginal) => {
  const { fiberMock } = await import('./mocks.jsx');
  return fiberMock(await importOriginal());
});
vi.mock('@react-three/drei', async () => {
  const { dreiMock } = await import('./mocks.jsx');
  const { OrbitControls } = await import('@react-three/drei/core/OrbitControls.js');
  return dreiMock(OrbitControls, await import('@react-three/fiber'));
});
vi.mock('@src/api', () => ({
  adminSettings: { get: vi.fn(), set: vi.fn() },
  stock: { binMap: vi.fn(), putAway: vi.fn(), locationSummary: vi.fn() },
  rackSections: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, within, fireEvent, waitFor } from '@testing-library/dom';
import { adminSettings, rackSections, stock } from '@src/api';
import WarehouseModule from '@src/modules/warehouse/WarehouseModule';
import { wait, rest, click, cam, where, screenOf, cells, layout, reset, SIZE, aisleAt } from './h.jsx';

const BOX = { d: SIZE.depth * 0.9, h: SIZE.level * 0.86 };
const ZB = {
  id: 1, branch: 'HQ', customer_id: 'ZB', customer_name: 'Zone Bowling', aisle: 'B',
  bay_from: 5, bay_to: 5, level_from: 'A', level_to: 'L', position_from: 1, position_to: 6, from_bin: 'B.5.A.1', to_bin: 'B.5.L.6',
};
const CUSTOMERS = [{ id: 'ACME', name: 'Acme Signs' }, { id: 'ZB', name: 'Zone Bowling' }];
const r2 = (n) => Math.round(n * 100) / 100;
const quat = () => cam().quaternion.toArray().map(r2);
const words = () => document.querySelector('p[aria-live="polite"]')?.textContent ?? null;
const aisleBtn = (letter) => within(screen.getByRole('group', { name: 'Walk an aisle' })).getByRole('button', { name: `Aisle ${letter}` });
const main = () => document.querySelector('main');
const binPanel = () => document.querySelector('aside[aria-label^="Bin "]')?.getAttribute('aria-label') ?? null;
const frontOf = (c) => [c.x + (c.side === 'right' ? -1 : 1) * (BOX.d / 2), c.y, c.z];
const topOf = (c) => [c.x, c.y + BOX.h / 2, c.z];
const cell = (code) => cells.find((c) => c.code === code);
/** The box on `side` of aisle `i` nearest the eye. */
const facing = (i, side) => {
  const e = where();
  return cells.filter((c) => c.aisleIndex === i && c.side === side)
    .sort((a, b) => ((a.z - e.z) ** 2 + (a.y - e.y) ** 2) - ((b.z - e.z) ** 2 + (b.y - e.y) ** 2))[0];
};
const clickAt = async (point) => { const s = screenOf(point); click(s.x, s.y); await wait(60); await rest(); return s; };

let root; let host;
beforeEach(() => {
  vi.clearAllMocks();
  adminSettings.get.mockResolvedValue({ key: 'warehouse_layout:HQ', value: null });
  stock.binMap.mockResolvedValue({ branch: 'HQ', bins: [{ bin: 'D.5.E.3', sku: 'WID-1', name: 'Widget', qty_on_hand: 4 }] });
  rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [ZB] });
  window.WebGLRenderingContext = function WebGLRenderingContext() {};
  window.HTMLCanvasElement.prototype.getContext = () => ({});
});
afterEach(() => { root?.unmount(); host?.remove(); root = null; });

async function open(role = 'admin') {
  reset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  root.render(
    <QueryClientProvider client={client}>
      <WarehouseModule currentUser={{ role }} onOpenSku={() => {}} inventory={[]} customers={CUSTOMERS} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(document.querySelector('[data-surface]')).not.toBeNull(), { timeout: 30000 });
  await screen.findByText('Zone Bowling');
  await wait(200);
  await rest();
}

test('M1 a box picked in ANOTHER aisle during a walk: the words, the pressed aisle and the company follow the eye', async () => {
  await open();
  fireEvent.click(screen.getByTitle('Walk to this section'));
  await wait(60); await rest();
  const inB = { eye: where(), words: words() };
  // A box inside Zone Bowling's wash is still a box: the section takes no click.
  const target = facing(3, 'right');
  await clickAt(frontOf(target));
  const afterBoxClick = { panel: binPanel(), expected: target.code, eye: where() };
  // Now a search result in aisle D, picked while the walk is on.
  fireEvent.change(screen.getByPlaceholderText(/AS-5001/), { target: { value: 'Widget' } });
  await wait(50);
  fireEvent.click(within(screen.getByRole('complementary', { name: 'Find a bin' })).getByRole('button', { name: /D\.5\.E\.3/ }));
  await wait(60); await rest();
  const inD = {
    eye: where(), aisleOfEye: layout.aisles[aisleAt(where().x)], words: words(),
    pressed: layout.aisles.filter((a) => aisleBtn(a).getAttribute('aria-pressed') === 'true'), panel: binPanel(),
  };
  console.log('M1 in B', JSON.stringify(inB), '\n  box click', JSON.stringify(afterBoxClick), '\n  after picking D.5.E.3', JSON.stringify(inD));
  expect(inB.words).toMatch(/Aisle B · bay 5 on the right \(Zone Bowling\)/);
  expect(afterBoxClick.panel).toBe(`Bin ${target.code}`);
  expect(inD.aisleOfEye).toBe('D');
  expect(inD.words).toMatch(/^Aisle D/);
  expect(inD.words).not.toMatch(/Zone Bowling/);
  expect(inD.pressed).toEqual(['D']);
});

test('M2 marking: a box clicked is a corner — no bin panel, no camera move — on the map and in a walk', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: /Mark a section/ }));
  await wait(50);
  const before = { ...where(), q: quat() };
  await clickAt(topOf(cell('C.5.L.3')));
  const map = { from: screen.getByLabelText('First box').value, to: screen.getByLabelText('Second box').value, panel: binPanel(), eye: { ...where(), q: quat() } };
  fireEvent.click(aisleBtn('C'));
  await wait(60); await rest();
  for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
  fireEvent.click(screen.getByRole('button', { name: 'Turn left' }));
  await wait(60); await rest();
  const stood = { ...where(), q: quat() };
  const target = facing(2, 'left');
  await clickAt(frontOf(target));
  const walk = { clicked: target.code, from: screen.getByLabelText('First box').value, to: screen.getByLabelText('Second box').value, panel: binPanel(), eye: { ...where(), q: quat() } };
  console.log('M2 map', JSON.stringify(map), 'before', JSON.stringify(before), '\n  walk stood', JSON.stringify(stood), JSON.stringify(walk));
  expect(map.from).toBe('C.5.L.3');
  expect(map.panel).toBeNull();
  expect(map.eye).toEqual(before);
  expect(walk.to).toBe(target.code);
  expect(walk.panel).toBeNull();
  expect(walk.eye).toEqual(stood);
});

test('M3 keys and focus', async () => {
  await open();
  const out = {};
  // Outside a walk nothing is swallowed.
  out.outside = ['ArrowDown', 'ArrowLeft', 'PageDown', 'Escape', ' '].map((key) => fireEvent.keyDown(main(), { key }));
  fireEvent.click(screen.getByRole('button', { name: /Mark a section/ }));
  await wait(50);
  fireEvent.click(aisleBtn('C'));
  await wait(60); await rest();
  const q0 = quat(); const z0 = where().z;
  const from = screen.getByLabelText('First box');
  out.inForm = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Escape'].map((key) => fireEvent.keyDown(from, { key }));
  await wait(60); await rest();
  out.formKeysMovedTheWalk = JSON.stringify(quat()) !== JSON.stringify(q0) || where().z !== z0;
  out.stillWalkingAfterEscInForm = !!screen.queryByRole('button', { name: /Leave aisle/ });
  out.formStillOpenAfterEsc = !!screen.queryByLabelText('First box');
  out.inSearch = ['ArrowLeft', 'Escape'].map((key) => fireEvent.keyDown(screen.getByPlaceholderText(/AS-5001/), { key }));
  out.onMain = fireEvent.keyDown(main(), { key: 'ArrowLeft' });
  await wait(60); await rest();
  out.mainKeyTurned = JSON.stringify(quat()) !== JSON.stringify(q0);
  out.enterOnPad = fireEvent.keyDown(screen.getByRole('button', { name: 'Forward' }), { key: 'Enter' });
  out.modified = [fireEvent.keyDown(main(), { key: 'ArrowLeft', ctrlKey: true }), fireEvent.keyDown(main(), { key: 'ArrowLeft', altKey: true })];
  // Leave goes away under the keyboard.
  const leave = screen.getByRole('button', { name: /Leave aisle/ });
  leave.focus();
  fireEvent.click(leave);
  await wait(80);
  out.afterLeave = document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName;
  // Esc with the keyboard in the view.
  fireEvent.click(aisleBtn('B'));
  await wait(60);
  main().focus();
  fireEvent.keyDown(main(), { key: 'Escape' });
  await wait(80);
  out.afterEscInView = document.activeElement?.tagName;
  // The marking form goes away under the keyboard.
  const cancel = within(screen.getByRole('complementary', { name: 'Mark a section' })).getByRole('button', { name: 'Cancel' });
  cancel.focus();
  fireEvent.click(cancel);
  await wait(80);
  out.afterCancelMark = document.activeElement?.textContent ?? document.activeElement?.tagName;
  // The remove confirmation.
  const trash = screen.getByRole('button', { name: /Remove Zone Bowling's section/ });
  trash.focus();
  fireEvent.click(trash);
  await wait(80);
  out.afterAsk = document.activeElement?.textContent;
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
  await wait(80);
  out.afterKeep = document.activeElement?.getAttribute('aria-label');
  console.log('M3', JSON.stringify(out, null, 1));
  expect(out.outside).toEqual([true, true, true, true, true]);
  expect(out.inForm).toEqual([true, true, true, true]);
  expect(out.formKeysMovedTheWalk).toBe(false);
  expect(out.stillWalkingAfterEscInForm).toBe(true);
  expect(out.inSearch).toEqual([true, true]);
  expect(out.onMain).toBe(false);
  expect(out.mainKeyTurned).toBe(true);
  expect(out.enterOnPad).toBe(true);
  expect(out.modified).toEqual([true, true]);
  expect(out.afterLeave).toBe('Aisle C');
  expect(out.afterEscInView).toBe('MAIN');
  expect(out.afterCancelMark).toMatch(/Mark a section/);
  expect(out.afterAsk).toBe('Keep');
  expect(out.afterKeep).toMatch(/^Remove Zone Bowling/);
});

test('M4 a refusal about the last corners, after a new corner is clicked in the view', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: /Mark a section/ }));
  await wait(50);
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } });
  await wait(30);
  fireEvent.click(screen.getByRole('button', { name: /Acme Signs/ }));
  await wait(30);
  fireEvent.change(screen.getByLabelText('First box'), { target: { value: 'C.5.A.1' } });
  rackSections.create.mockRejectedValue(Object.assign(new Error('Those boxes are already marked for Zone Bowling'), { status: 409 }));
  await wait(30);
  fireEvent.click(screen.getByRole('button', { name: /Mark for Acme Signs/ }));
  await screen.findByText(/Couldn't mark the section/);
  await wait(100); await rest();
  await clickAt(topOf(cell('C.7.L.3')));
  const afterClick = { to: screen.getByLabelText('Second box').value, refusalStillShown: !!screen.queryByText(/Couldn't mark the section/) };
  fireEvent.change(screen.getByLabelText('Second box'), { target: { value: 'C.9.L.3' } });
  await wait(50);
  const afterTyping = { refusalStillShown: !!screen.queryByText(/Couldn't mark the section/) };
  console.log('M4 after a corner clicked in the view', JSON.stringify(afterClick), 'after typing one', JSON.stringify(afterTyping));
  expect(afterClick.to).toBe('C.7.L.3');
  expect(afterTyping.refusalStillShown).toBe(false);
  expect(afterClick.refusalStillShown).toBe(false);
});

test('M5 two walk keys in one tick, and two a frame apart', async () => {
  await open('staff');
  fireEvent.click(aisleBtn('C'));
  await wait(60); await rest();
  const z0 = where().z;
  fireEvent.keyDown(main(), { key: 'ArrowUp' });
  fireEvent.keyDown(main(), { key: 'ArrowUp' });
  await wait(60); await rest();
  const z1 = where().z;
  fireEvent.keyDown(main(), { key: 'ArrowUp' });
  await wait(17);
  fireEvent.keyDown(main(), { key: 'ArrowUp' });
  await wait(60); await rest();
  const z2 = where().z;
  console.log('M5 one step is', 3 * SIZE.box, '| two keys in one tick moved', r2(z0 - z1), '| two keys 17 ms apart moved', r2(z1 - z2));
});
