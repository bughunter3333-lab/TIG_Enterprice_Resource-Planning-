/**
 * Walking an aisle. A line runs down the middle of every walkway; clicking it
 * stands the camera on the line, and from there it is Street View: drag to
 * look round, scroll or click further along to walk (walk.js has the maths).
 *
 * While WalkRig drives the camera the map's orbit controls are switched off
 * (Warehouse3D) — two things steering one camera is what went wrong with it
 * three times (spec, "Moving around"). Nothing here needs holding out of the
 * racking afterwards: a pose can only be on a walkway.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SIZE, baysAt } from './layout';
import { WALK_FOV, enterAisle, faceBox, faceSide, look, moveTo, rise, slide, step, turn, walkEye, walkLine } from './walk';
import { BIN_COLORS } from './binColors';
import { CLICK_SLOP_PX } from './Bins3D';

const LINE_WIDTH = 0.1;
// Most of the walkway, not just the paint: from the overview the line is a
// few pixels across, and a click on an aisle's floor can mean nothing else.
const HIT_WIDTH = 1.4;
const FLAT = [-Math.PI / 2, 0, 0];

/** The lines on the floor. `walking` is the index of the aisle being walked, if any. */
export function WalkLines({ layout, walking, onWalk, onOver }) {
  const [over, setOver] = useState(null);
  const point = (i) => { setOver(i); onOver(i != null); };
  return layout.aisles.map((aisle, i) => {
    const line = walkLine(layout, i);
    const length = line.start - line.end;
    const middle = (line.start + line.end) / 2;
    const lit = over === i || walking === i;
    return (
      <group key={aisle}>
        <mesh rotation={FLAT} position={[line.x, 0.012, middle]} scale={[lit ? 1.7 : 1, 1, 1]} raycast={() => null}>
          <planeGeometry args={[LINE_WIDTH, length]} />
          <meshBasicMaterial color={BIN_COLORS.walk} transparent opacity={lit ? 1 : 0.7} />
        </mesh>
        {/* Where the line starts: the obvious place to click from the overview. */}
        <mesh rotation={FLAT} position={[line.x, 0.014, line.start]} scale={lit ? 1.2 : 1} raycast={() => null}>
          <circleGeometry args={[0.26, 32]} />
          <meshBasicMaterial color={BIN_COLORS.walk} />
        </mesh>
        <mesh
          rotation={FLAT}
          position={[line.x, 0.02, middle]}
          onPointerOver={(e) => { e.stopPropagation(); point(i); }}
          onPointerOut={() => { if (over === i) point(null); }}
          // A drag that ends over the line is the end of a move, not a click on it.
          onClick={(e) => { e.stopPropagation(); if (e.delta <= CLICK_SLOP_PX) onWalk(i, e.point.z); }}
        >
          <planeGeometry args={[HIT_WIDTH, length + 0.6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    );
  });
}

const PARTS = ['z', 'height', 'yaw', 'pitch'];
// Near enough to count as there: a couple of millimetres, a twentieth of a degree.
const THERE = { z: 0.002, height: 0.002, yaw: 0.001, pitch: 0.001 };
const EASE = 6;
// A frame drawn after the canvas has sat idle reports the whole idle time as its step.
const MAX_EASE_STEP = 1 / 30;
const WHEEL_STEP = 2 * SIZE.box; // one notch of the wheel: two boxes along

const MOVES = {
  forward: (layout, pose) => step(layout, pose, 1),
  back: (layout, pose) => step(layout, pose, -1),
  left: (_, pose) => turn(pose, 1),
  right: (_, pose) => turn(pose, -1),
  up: (layout, pose) => rise(layout, pose, 1),
  down: (layout, pose) => rise(layout, pose, -1),
};

const turned = new THREE.Euler();

/**
 * The camera, while an aisle is being walked. Mounted only then.
 *
 * `walk` is where the walk was last sent (`{ aisleIndex, z, side }` — a new
 * object is a new request), `nudges` the controls pressed (`{ kind, id }`,
 * oldest first — a list, because two presses can arrive in one render),
 * `focus` and `cell` the box last picked. `lastEye` is the map's own note of
 * where the eye is, kept true here so the map's rules start from the right
 * place when the walk ends. `onMove` is told whenever the eye moves along or
 * up, `onView` where it is once it has gone far enough for different codes to
 * be in reach, `onAt` the aisle it is in and the bays it has come level with.
 */
export function WalkRig({ layout, walk, nudges, focus, cell, lastEye, onMove, onView, onAt }) {
  const { camera, gl, invalidate } = useThree();
  // Where the scene's own pointer events and the map controls listen, so a
  // click is the same click to all three.
  const surface = useThree((state) => state.events.connected) ?? gl.domElement;
  const pose = useRef(null); // where the eye is
  const goal = useRef(null); // where it is going
  const held = useRef(null); // the pointer that is turning the view
  // What has already been acted on. A control pressed or a box picked before
  // this walk began is not a request to this one.
  const done = useRef({ nudge: nudges.length ? nudges[nudges.length - 1].id : 0, focus });
  const told = useRef({ view: null, at: null });
  // The latest callbacks, without re-attaching the listeners (and dropping a
  // drag half-way) each time the scene around this re-renders.
  const on = useRef(null);
  on.current = { onMove, onView, onAt };

  // The walking lens, for as long as the walk lasts. Layout effects, this and
  // the next: the lens and the eye change in the same commit that switches
  // the map's controls off and on, never a frame later.
  useLayoutEffect(() => {
    const mapFov = camera.fov;
    camera.fov = WALK_FOV;
    camera.updateProjectionMatrix();
    return () => {
      camera.fov = mapFov;
      camera.updateProjectionMatrix();
    };
  }, [camera]);

  // Sent somewhere: along this line, or on to another one — and, when the
  // request says so, to face the rack on one side there.
  useLayoutEffect(() => {
    const from = goal.current;
    const glide = from && from.aisleIndex === walk.aisleIndex;
    const there = glide ? moveTo(layout, from, walk.z) : enterAisle(layout, walk.aisleIndex, walk.z);
    goal.current = walk.side ? faceSide(there, walk.side) : there;
    // From the overview or another aisle the straight way is through
    // racking, so it is a cut, not a glide.
    if (!glide) {
      pose.current = goal.current;
      lastEye.current = walkEye(layout, pose.current);
    }
    invalidate();
  }, [walk, layout, lastEye, invalidate]);

  // Every control pressed since the last one acted on, in order.
  useEffect(() => {
    const fresh = nudges.filter((pressed) => pressed.id > done.current.nudge);
    if (!fresh.length) return;
    done.current.nudge = fresh[fresh.length - 1].id;
    if (!goal.current) return;
    for (const { kind } of fresh) goal.current = MOVES[kind](layout, goal.current);
    invalidate();
  }, [nudges, layout, invalidate]);

  // A box picked on the way: go and stand in front of it.
  useEffect(() => {
    if (focus === done.current.focus) return;
    done.current.focus = focus;
    if (!focus || !cell || !goal.current) return;
    const facing = faceBox(layout, cell, goal.current);
    if (facing.aisleIndex !== goal.current.aisleIndex) {
      pose.current = facing;
      lastEye.current = walkEye(layout, facing);
    }
    goal.current = facing;
    invalidate();
  }, [focus, cell, layout, lastEye, invalidate]);

  useEffect(() => {
    const el = surface;
    const down = (e) => {
      // Either mouse button: on the map the right one turns the view, and the
      // hand that learnt that should not get a browser menu here instead.
      if (held.current || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2)) return;
      held.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      const h = held.current;
      if (!h || e.pointerId !== h.id || !pose.current) return;
      // The scene follows the pointer, as if the hand were on it. Not eased:
      // a view that lags the hand feels like dragging it through treacle.
      const perPixel = THREE.MathUtils.degToRad(camera.fov) / el.clientHeight;
      const left = (e.clientX - h.x) * perPixel;
      const up = (e.clientY - h.y) * perPixel;
      held.current = { id: h.id, x: e.clientX, y: e.clientY };
      pose.current = look(pose.current, left, up);
      goal.current = look(goal.current, left, up);
      on.current.onMove();
      invalidate();
    };
    const release = (e) => {
      if (!held.current || e.pointerId !== held.current.id) return;
      held.current = null;
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const wheel = (e) => {
      // The page must not scroll under a walk.
      e.preventDefault();
      if (!goal.current) return;
      goal.current = slide(layout, goal.current, (-e.deltaY / 100) * WHEEL_STEP);
      invalidate();
    };
    const noMenu = (e) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('contextmenu', noMenu);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('contextmenu', noMenu);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      el.removeEventListener('wheel', wheel);
    };
  }, [surface, camera, layout, invalidate]);

  useFrame((_, dt) => {
    const from = pose.current;
    const to = goal.current;
    if (!from || !to) return;
    const k = 1 - Math.exp(-Math.min(dt, MAX_EASE_STEP) * EASE);
    const now = { ...to };
    let arrived = true;
    for (const part of PARTS) {
      const left = to[part] - from[part];
      if (Math.abs(left) > THERE[part]) {
        now[part] = from[part] + left * k;
        arrived = false;
      }
    }
    const travelled = from.aisleIndex !== now.aisleIndex || PARTS.some((part) => from[part] !== now[part]);
    pose.current = now;
    const eye = walkEye(layout, now);
    camera.position.set(...eye);
    camera.quaternion.setFromEuler(turned.set(now.pitch, now.yaw, 0, 'YXZ'));
    // The map's rules judge a move by where the eye was. Left as it was
    // before the walk, the first map gesture afterwards was judged from an
    // aisle the eye had long left, and carried it there through the racks.
    lastEye.current = eye;

    if (travelled) on.current.onMove();
    // Codes are printed for what is in reach of the eye: said again once it
    // has gone a box along or a level up, and when it stops.
    const seen = told.current.view;
    const far = !seen || seen.aisleIndex !== now.aisleIndex
      || Math.abs(seen.z - now.z) >= SIZE.box || Math.abs(seen.height - now.height) >= SIZE.level;
    if (far || (arrived && (seen.z !== now.z || seen.height !== now.height))) {
      told.current.view = now;
      on.current.onView(eye);
    }
    // The aisle too, not only the bays: a box picked in another aisle takes
    // the walk there, and what the screen says has to go with it.
    const bays = baysAt(layout, now.z);
    const at = `${now.aisleIndex}:${bays?.odd ?? ''}`;
    if (at !== told.current.at) {
      told.current.at = at;
      on.current.onAt({ aisleIndex: now.aisleIndex, bays });
    }
    if (!arrived) invalidate();
  });
  return null;
}
