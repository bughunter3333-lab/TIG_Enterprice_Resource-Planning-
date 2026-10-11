/**
 * The racking in 3D. Loaded on demand (WarehouseModule lazy-imports it), so
 * three.js costs nothing until someone opens the warehouse.
 *
 * Boxes (Bins3D) and racking (Racking3D) are instanced, so the whole
 * building is a handful of draw calls.
 * The canvas renders on demand: nothing redraws while the view is still.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, invalidate as redraw, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SIZE, aisleView, aisleX, allCells, clearPath, extent, walkwayX } from './layout';
import { BIN_COLORS } from './binColors';
import { BOX, BinCodes, Bins } from './Bins3D';
import Racking from './Racking3D';
import { T } from '../../ui/tokens';

/** A crisp outline round the selected box, so it reads at any distance. */
function SelectedOutline({ cell }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX.d * 1.12, BOX.h * 1.12, BOX.w * 1.12)), []);
  if (!cell) return null;
  return (
    <lineSegments geometry={edges} position={[cell.x, cell.y, cell.z]} raycast={() => null}>
      <lineBasicMaterial color={BIN_COLORS.outline} />
    </lineSegments>
  );
}

// Codes are printed on the labels of the aisle the camera is standing in —
// the only faces it can read — nearest first, once it is close enough.
const CODE_REACH = { z: 4.5, maxDistance: 9, max: 320 };

// Moving is the main gesture, as on a map: drag moves, right-drag (or Ctrl-
// or Shift-drag) turns, scroll zooms toward the cursor. With turning on the
// drag, the view only swung round one point — and, in an aisle, through the
// rack behind it.
const MOUSE_BUTTONS = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
const TOUCHES = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
// Looking across at a rack, a drag slides over its face (up the levels, along
// the bays); looking down on the floor, it slides over the floor instead.
const FACING_RACK_FROM = Math.PI / 3;
const MIN_CAMERA_HEIGHT = 0.15;
const MIN_DISTANCE = 1.2;
// A frame drawn after the canvas has sat idle reports the whole idle time as
// its step; taken at face value the easing arrives in that one frame.
const MAX_EASE_STEP = 1 / 30;
const ORIGIN = new THREE.Vector3();

/**
 * A camera move. It is eased only where a person could travel it: in a
 * straight line that stays out of the racking, without having to turn right
 * round on the way (eye and target ease separately, so a reversal passes the
 * eye through the target). Anything else is a cut — eased, it flew through
 * cartons and over the top of the rack.
 */
function planMove(layout, camera, controls, eye, target) {
  const position = new THREE.Vector3(...eye);
  const lookAt = new THREE.Vector3(...target);
  const c = controls.current;
  if (!c) return { position, target: lookAt, cut: true };
  const turn = new THREE.Line3(c.target.clone().sub(camera.position), lookAt.clone().sub(position));
  const tightest = turn.closestPointToPoint(ORIGIN, true, new THREE.Vector3()).length();
  const cut = tightest < MIN_DISTANCE || !clearPath(layout, camera.position.toArray(), eye);
  return { position, target: lookAt, cut };
}

function nearbyCells(cells, view, layout) {
  if (!view || view.distance > CODE_REACH.maxDistance) return [];
  let aisle = 0;
  let best = Infinity;
  layout.aisles.forEach((_, i) => {
    const d = Math.abs(aisleX(layout, i) - view.cameraX);
    if (d < best) { best = d; aisle = i; }
  });
  const far = (c) => (c.x - view.x) ** 2 + (c.y - view.y) ** 2 + (c.z - view.z) ** 2;
  return cells
    .filter((c) => c.aisleIndex === aisle && Math.abs(c.z - view.z) < CODE_REACH.z)
    .sort((a, b) => far(a) - far(b))
    .slice(0, CODE_REACH.max);
}

function Label({ position, children, strong }) {
  return (
    // A fixed on-screen size: scaled with distance, a floor label grew to fill
    // the view whenever the camera stood near it.
    <Html position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{
        fontFamily: T.font, fontSize: strong ? 13 : 12, fontWeight: 700, whiteSpace: 'nowrap',
        color: T.text, background: T.panel, border: `1px solid ${T.hairline}`,
        borderRadius: 6, padding: strong ? '2px 9px' : '1px 7px', boxShadow: T.shadowSm,
      }}>
        {children}
      </div>
    </Html>
  );
}

/** Floor, receiving, and the packing / despatch bench, from the owner's plan. */
function Floor({ layout }) {
  const ext = extent(layout);
  const depth = ext.length + 9;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -ext.length / 2 + 3]} receiveShadow raycast={() => null}>
        <planeGeometry args={[ext.width + 6, depth]} />
        <meshStandardMaterial color={BIN_COLORS.floor} roughness={1} />
      </mesh>
      {/* Packing / despatch bench, between the racks and receiving */}
      <mesh position={[0, 0.45, 2.2]} raycast={() => null}>
        <boxGeometry args={[ext.width * 0.62, 0.9, 0.8]} />
        <meshStandardMaterial color={BIN_COLORS.bench} roughness={0.6} />
      </mesh>
      <Label position={[0, 1.25, 2.2]}>Packing / despatch bench</Label>
      {/* Receiving */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 5.3]} raycast={() => null}>
        <planeGeometry args={[ext.width + 4, 2.6]} />
        <meshStandardMaterial color={BIN_COLORS.receiving} roughness={1} />
      </mesh>
      <Label position={[0, 0.3, 5.3]}>Receiving</Label>
      {layout.aisles.map((a, i) => (
        <Label key={a} strong position={[aisleX(layout, i), 0.25, 0.7]}>Aisle {a}</Label>
      ))}
    </>
  );
}

/** Takes the camera to a box, an aisle or the overview — until the person takes over. */
function CameraRig({ focus, controls, home, layout, goal, onSettle }) {
  const { camera, invalidate } = useThree();

  // The overview: on opening, on "Reset view" and for a new layout. Not when
  // a box is deselected — closing its panel leaves the view where it is.
  useEffect(() => {
    goal.current = planMove(layout, camera, controls, home.position.toArray(), home.target.toArray());
    invalidate();
  }, [home, layout, camera, controls, goal, invalidate]);

  useEffect(() => {
    if (!focus) return;
    goal.current = planMove(layout, camera, controls, focus.eye, focus.target);
    invalidate();
  }, [focus, layout, camera, controls, goal, invalidate]);

  // A drag or a scroll ends the move at once: the view is theirs, and an
  // easing that kept running would pull against the mouse.
  useEffect(() => {
    const c = controls.current;
    if (!c) return undefined;
    const release = () => { goal.current = null; };
    c.addEventListener('start', release);
    return () => c.removeEventListener('start', release);
  }, [controls, goal]);

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controls.current;
    if (!g || !c) return;
    const k = g.cut ? 1 : 1 - Math.exp(-Math.min(dt, MAX_EASE_STEP) * 5);
    camera.position.lerp(g.position, k);
    c.target.lerp(g.target, k);
    c.update();
    if (camera.position.distanceTo(g.position) < 0.01 && c.target.distanceTo(g.target) < 0.01) {
      goal.current = null;
      onSettle();
    } else {
      invalidate();
    }
  });
  return null;
}

export default function Warehouse3D({ layout, bins, hits, filter, selected, focus, resetKey, onSelect }) {
  const controls = useRef();
  const [hover, setHover] = useState(null);
  const cells = useMemo(() => allCells(layout), [layout]);
  const selectedCell = useMemo(() => cells.find((c) => c.code === selected) ?? null, [cells, selected]);
  const [view, setView] = useState(null);
  const near = useMemo(() => nearbyCells(cells, view, layout), [cells, view, layout]);
  const readView = () => {
    const c = controls.current;
    if (!c) return;
    setView({
      x: c.target.x, y: c.target.y, z: c.target.z,
      cameraX: c.object.position.x,
      distance: c.object.position.distanceTo(c.target),
    });
  };

  const home = useMemo(() => {
    const ext = extent(layout);
    // resetKey is part of the memo so "Reset view" hands the rig a fresh goal.
    void resetKey;
    return {
      target: new THREE.Vector3(0, ext.height / 4, -ext.length / 2),
      position: new THREE.Vector3(ext.width * 0.28, ext.height * 2.4 + 4, 9 + ext.length * 0.15),
    };
  }, [layout, resetKey]);

  const hoverEntry = hover ? bins.get(hover.code) : null;

  // What the camera is being taken to, if anything (CameraRig eases it).
  const goal = useRef(null);
  // A gesture in progress, and how far the eye was from what it looks at when
  // the gesture began: further than that now means it is zooming out.
  const gesture = useRef(null);
  const beginGesture = () => {
    const c = controls.current;
    if (!c) return;
    c.screenSpacePanning = c.getPolarAngle() > FACING_RACK_FROM;
    gesture.current = { reach: c.object.position.distanceTo(c.target) };
  };
  const endGesture = () => {
    const c = controls.current;
    // Backing away from a rack ends at the rack behind. To see more, step back
    // down the aisle instead, still looking at the same spot — once the hand
    // is off, so the move does not pull against it.
    if (c && gesture.current?.blockedZoomOut) {
      const back = aisleView(layout, c.target.toArray(), c.object.position.x);
      goal.current = planMove(layout, c.object, controls, back.eye, back.target);
      redraw();
    }
    gesture.current = null;
    readView();
  };
  const keepInFreeSpace = () => {
    const c = controls.current;
    if (!c) return;
    // The view has moved, so the box the pointer was over is no longer under
    // it; the label comes back with the next move of the pointer.
    setHover((h) => (h ? null : h));
    const eye = c.object.position;
    // Sliding down a rack face stops at the floor, not beneath it.
    const lift = MIN_CAMERA_HEIGHT - eye.y;
    if (lift > 0) {
      eye.y += lift;
      c.target.y += lift;
    }
    // The rest is for the person's own moves only: the rig plans its moves
    // clear, and holding it back mid-flight would strand it short of its goal.
    if (!gesture.current) return;
    const kept = walkwayX(layout, eye.x, eye.y, eye.z);
    if (kept === eye.x) return;
    if (eye.distanceTo(c.target) > gesture.current.reach + 1e-6) gesture.current.blockedZoomOut = true;
    // Racking is solid: the eye stays on the walkway (the eye only — moving
    // the target with it would push the pivot deeper into the rack each time).
    eye.x = kept;
  };

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 250, position: home.position.toArray() }}
      style={{ background: BIN_COLORS.sky, cursor: hover ? 'pointer' : 'grab' }}
      aria-label="3D view of the warehouse racking"
      role="img"
    >
      <hemisphereLight args={['#ffffff', '#c9d1d9', 0.75]} />
      <directionalLight position={[8, 14, 10]} intensity={1.15} />
      <directionalLight position={[-10, 6, -6]} intensity={0.35} />
      <Floor layout={layout} />
      <Racking layout={layout} />
      <Bins cells={cells} bins={bins} hits={hits} filter={filter} selected={selected} onHover={setHover} onSelect={onSelect} />
      {/* Its own boundary: the label font loads on first use, and the racking
          must not vanish while it does. */}
      <Suspense fallback={null}>
        <BinCodes cells={near} bins={bins} hits={hits} filter={filter} />
      </Suspense>
      <SelectedOutline cell={selectedCell} />
      {hover && (
        <Html position={[hover.x, hover.y + SIZE.level * 0.9, hover.z]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <div style={{
            fontFamily: T.font, fontSize: 12, color: T.text, background: T.panel, whiteSpace: 'nowrap',
            border: `1px solid ${T.hairline}`, borderRadius: 8, padding: '4px 8px', boxShadow: T.shadowMd,
          }}>
            <span style={{ fontFamily: T.fontMono, fontWeight: 700 }}>{hover.code}</span>
            <span style={{ color: T.textMuted }}>
              {' · '}{hoverEntry ? `${hoverEntry.skus.length} SKU${hoverEntry.skus.length === 1 ? '' : 's'}` : 'nothing slotted'}
            </span>
          </div>
        </Html>
      )}
      <OrbitControls
        ref={controls}
        makeDefault
        target={home.target}
        enableDamping={false}
        minDistance={MIN_DISTANCE}
        maxDistance={80}
        maxPolarAngle={Math.PI / 2.05}
        mouseButtons={MOUSE_BUTTONS}
        touches={TOUCHES}
        zoomToCursor
        onStart={beginGesture}
        onChange={keepInFreeSpace}
        onEnd={endGesture}
      />
      <CameraRig focus={focus} controls={controls} home={home} layout={layout} goal={goal} onSettle={readView} />
    </Canvas>
  );
}
