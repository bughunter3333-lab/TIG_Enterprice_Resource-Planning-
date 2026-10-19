/**
 * Probe harness: mounts the REAL Warehouse3D.jsx (or WarehouseModule) in
 * jsdom, with only the GL renderer faked (mocks.jsx), and sends real DOM
 * pointer / wheel / click / key events. Waits are real time.
 *
 * Why these exist, and are kept in the repo: the 3D camera failed review four
 * times, each time on a sequence of events nobody had tried, and none of it
 * shows in a unit test — the faults were in what the real controls, the real
 * reconciler and the frame loop do together. These measure that: where the
 * eye is after every frame, and whether the canvas comes to rest.
 *
 * Run:  npm run test:scene   (a few minutes; not part of `npm test`).
 */
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { probe, W, H } from './mocks.jsx';
import { DEFAULT_LAYOUT, allCells, aisleX, binPlacement, frontView, walkwayX, SIZE } from '@src/modules/warehouse/layout';

// Production scheduling: no act().
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

// jsdom has no pointer capture, and before 27 had no PointerEvent either (from
// 27 its own is used and this fallback is skipped).
if (!window.PointerEvent) {
  class PointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  window.PointerEvent = PointerEvent;
  globalThis.PointerEvent = PointerEvent;
}
const captured = new WeakMap();
const cap = (el) => { if (!captured.has(el)) captured.set(el, new Set()); return captured.get(el); };
window.Element.prototype.setPointerCapture = function set(id) { cap(this).add(id); };
window.Element.prototype.releasePointerCapture = function rel(id) { cap(this).delete(id); };
window.Element.prototype.hasPointerCapture = function has(id) { return cap(this).has(id); };

export const layout = DEFAULT_LAYOUT;
export const cells = allCells(layout);
export { probe, W, H, aisleX, SIZE, THREE };

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const state = () => probe.fiber._roots.get(probe.canvas)?.store.getState();
export const cam = () => state().camera;
export const ctl = () => state().controls;
export const frames = () => probe.frames;
export const where = () => { const c = cam(); return { x: c.position.x, y: c.position.y, z: c.position.z, fov: c.fov }; };
export const codes = () => [...probe.codes.keys()].filter((k) => /^[A-Z]\.\d+\.[A-Z]\.\d+$/.test(k));
export const clear = (p) => Math.abs(walkwayX(layout, p.x, p.y, p.z) - p.x) < 1e-9;
export const focusOf = (code) => frontView(layout, binPlacement(layout, code));
/** Frames drawn since `mark` (a value of frames()). */
export const since = (mark) => probe.log.filter((f) => f.n > mark);
/** Which aisle an x is in (index), or null when in racking. */
export const aisleAt = (x) => {
  const i = layout.aisles.findIndex((_, k) => Math.abs(aisleX(layout, k) - x) <= SIZE.aisle / 2 - 0.15 + 1e-6);
  return i < 0 ? null : i;
};

/** Wait until no frame has been drawn for `quiet` ms (or `max` passes). Returns whether it came to rest. */
export async function rest(quiet = 250, max = 6000) {
  const start = performance.now();
  let last = probe.frames;
  let since0 = performance.now();
  while (performance.now() - start < max) {
    await wait(40);
    if (probe.frames !== last) { last = probe.frames; since0 = performance.now(); }
    else if (performance.now() - since0 >= quiet) return true;
  }
  return false;
}

/** A pointer / mouse event on the canvas surface, at canvas pixel (x, y). */
export function ev(type, { x = W / 2, y = H / 2, button = 0, buttons, pointerId = 1, pointerType = 'mouse', target, ...more } = {}) {
  const init = {
    bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button,
    buttons: buttons ?? (type === 'pointerdown' || type === 'pointermove' ? 1 : 0), pointerId, pointerType, ...more,
  };
  const e = type.startsWith('pointer') ? new window.PointerEvent(type, init) : new window.MouseEvent(type, init);
  Object.defineProperty(e, 'offsetX', { value: x });
  Object.defineProperty(e, 'offsetY', { value: y });
  (target ?? probe.surface).dispatchEvent(e);
  return e;
}
export function wheel(deltaY, { x = W / 2, y = H / 2, ...more } = {}) {
  const e = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, clientX: x, clientY: y, ...more });
  Object.defineProperty(e, 'offsetX', { value: x });
  Object.defineProperty(e, 'offsetY', { value: y });
  probe.surface.dispatchEvent(e);
  return e;
}
/** Press, release and click at one spot. */
export function click(x, y, more = {}) {
  ev('pointerdown', { x, y, ...more });
  ev('pointerup', { x, y, ...more });
  return ev('click', { x, y, ...more });
}
/** Where a world point is on the canvas, in pixels. */
export function screenOf([x, y, z]) {
  const c = cam();
  c.updateMatrixWorld();
  const v = new THREE.Vector3(x, y, z).project(c);
  return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, behind: v.z > 1 };
}

export function reset() {
  probe.frames = 0; probe.log.length = 0; probe.codes.clear(); probe.errors.length = 0;
}

/** Mount Warehouse3D with props; `m.set(patch)` re-renders with the patch merged in. */
export async function mount(Warehouse3D, initial = {}) {
  reset();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let props = {
    layout, bins: new Map(), hits: new Set(), filter: 'all', selected: null, focus: null, resetKey: 0,
    onSelect: () => {}, walk: null, nudges: [], onWalk: () => {}, onWalkAt: () => {}, ...initial,
  };
  let pressed = 0;
  const render = () => root.render(<Warehouse3D {...props} />);
  render();
  await wait(150);
  await rest();
  return {
    host,
    props: () => props,
    set(patch) { props = { ...props, ...patch }; render(); },
    /** The props for one more walk control pressed (`kind`), to pass to `set` — alone or with others. */
    pressing(kind) { return { nudges: [...props.nudges, { kind, id: (pressed += 1) }] }; },
    unmount() { root.unmount(); host.remove(); },
  };
}
