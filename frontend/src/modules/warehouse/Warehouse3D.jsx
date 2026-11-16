/**
 * The racking in 3D. Loaded on demand (WarehouseModule lazy-imports it), so
 * three.js costs nothing until someone opens the warehouse.
 *
 * Boxes (Bins3D) and racking (Racking3D) are instanced, so the whole
 * building is a handful of draw calls.
 * The canvas renders on demand: nothing redraws while the view is still.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, invalidate as redraw, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SIZE, aisleX, allCells, clearPath, extent, heldToWalkway, liftOut } from './layout';
import { BIN_COLORS } from './binColors';
import { BOX, BinCodes, Bins } from './Bins3D';
import Racking from './Racking3D';
import { WalkLines, WalkRig } from './Walk3D';
import Sections from './Sections3D';
import { sectionFor } from './sections';
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
const NO_SECTIONS = [];
const NO_NUDGES = [];
const NO_COLORS = new Map();

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

/** Takes the camera to a box, out of an aisle or to the overview — until the person takes over. */
function CameraRig({ focus, controls, home, layout, goal, byRig, walking, onSettle }) {
  const { camera, invalidate } = useThree();
  const opened = useRef(false);
  const wasWalking = useRef(false);
  const overviewAsked = useRef(false);

  // Walking an aisle is WalkRig's work (Walk3D.jsx), with the controls off.
  // Going in, whatever this was doing is dropped. Coming out, the camera
  // rises out of the aisle to look back down at where it stood — a cut, as
  // stepping in was.
  //
  // A layout effect, not a passive one: the commit that ends a walk switches
  // the controls back on, and a frame drawn before this had run let them act
  // on the walk's camera with their aim from before the walk — it could come
  // out above the wrong aisle. This runs in that same commit. "Reset view"
  // ends a walk and asks for the overview in one go; the overview's effect
  // runs after this and wins.
  useLayoutEffect(() => {
    const c = controls.current;
    if (walking) {
      goal.current = null;
    } else if (wasWalking.current && c) {
      const eye = camera.position;
      // The controls were off and are still aimed where the walk began. Aim
      // them where the eye was looking (never upward: they cannot look up,
      // and would move the eye to make it so).
      const ahead = camera.getWorldDirection(new THREE.Vector3());
      ahead.y = Math.min(ahead.y, -0.08);
      c.target.copy(eye).addScaledVector(ahead.normalize(), MIN_DISTANCE * 2);
      if (overviewAsked.current) {
        // Asked for during the walk: planned now, from where the eye is now.
        goal.current = planMove(layout, camera, controls, home.position.toArray(), home.target.toArray());
      } else {
        const up = liftOut(layout, eye.toArray(), [eye.x, Math.min(eye.y, 1), eye.z]);
        goal.current = { position: new THREE.Vector3(...up.eye), target: new THREE.Vector3(...up.target), cut: true };
      }
      invalidate();
    }
    overviewAsked.current = false;
    wasWalking.current = walking;
    // `home` is read only when a walk ends; a new overview by itself is the next effect's business.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, layout, camera, controls, goal, invalidate]);

  // The overview: on opening, on "Reset view" and for a new layout. Not when
  // a box is deselected — closing its panel leaves the view where it is.
  useEffect(() => {
    const c = controls.current;
    if (c && !opened.current) {
      // The first aim is set here, not as a prop on the controls: a prop is
      // put back on every "Reset view", which snapped the aim round before
      // the eye had moved.
      opened.current = true;
      c.target.copy(home.target);
      c.update();
      onSettle();
      return;
    }
    // During a walk the eye will be somewhere else by the time it ends, so
    // only the asking is remembered; the move is planned then.
    if (c && !c.enabled) {
      overviewAsked.current = true;
      return;
    }
    goal.current = planMove(layout, camera, controls, home.position.toArray(), home.target.toArray());
    invalidate();
    // onSettle only reads the controls; leaving it out keeps this to real changes of the overview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, layout, camera, controls, goal, invalidate]);

  useEffect(() => {
    // During a walk the controls are off, and WalkRig faces the box itself.
    if (!focus || controls.current?.enabled === false) return;
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
    // Nothing of this rig's moves the camera during a walk.
    if (!g || !c || !c.enabled) return;
    const k = g.cut ? 1 : 1 - Math.exp(-Math.min(dt, MAX_EASE_STEP) * 5);
    camera.position.lerp(g.position, k);
    c.target.lerp(g.target, k);
    // Marked as the rig's own: its moves are planned clear of the racking,
    // and holding it to a walkway mid-flight would strand it short.
    byRig.current = true;
    c.update();
    byRig.current = false;
    if (camera.position.distanceTo(g.position) < 0.01 && c.target.distanceTo(g.target) < 0.01) {
      goal.current = null;
      onSettle();
    } else {
      invalidate();
    }
  });
  return null;
}

/**
 * `walk` is set while an aisle is being walked (`{ aisleIndex, z, side }`, a
 * new object for each place it is sent); `nudges` are the walk controls
 * pressed, oldest first, each `{ kind, id }`; `onWalk(aisleIndex, z)` is a
 * click on an aisle's line, and `onWalkAt({ aisleIndex, bays })` says where
 * the walk has got to — `walkAisle` is that aisle, for lighting its line.
 * `sections` is the racking marked for companies, `sectionColors` each
 * company's colour, and `draft` a section being marked.
 */
export default function Warehouse3D({
  layout, bins, hits, filter, selected, focus, resetKey, onSelect, walk, walkAisle = null, nudges = NO_NUDGES, onWalk, onWalkAt,
  sections = NO_SECTIONS, sectionColors = NO_COLORS, draft = null,
}) {
  const controls = useRef();
  const [hover, setHover] = useState(null);
  const [overLine, setOverLine] = useState(false);
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
  const hoverSection = hover ? sectionFor(sections, hover) : null;
  // The view has moved, so the box the pointer was over is no longer under
  // it; the label comes back with the next move of the pointer.
  const dropHover = () => setHover((h) => (h ? null : h));
  // Walking, codes are printed for what is in reach of the eye itself.
  const showFrom = ([x, y, z]) => setView({ x, y, z, cameraX: x, distance: 0 });

  // What the camera is being taken to, if anything (CameraRig moves it).
  const goal = useRef(null);
  // True while CameraRig is moving the camera itself.
  const byRig = useRef(false);
  // Where the last change left the eye.
  const lastEye = useRef(null);
  // A scroll-out being handled right now (set and cleared around the wheel
  // event itself), and whether the racking stopped it.
  const scrollingOut = useRef(false);
  const stoppedByRack = useRef(false);

  // The controls still hear a pointer released or cancelled while they are
  // switched off for a walk, and report it as a gesture ending. During a walk
  // their gestures are nobody's: acting on one reprinted the box codes round
  // where the map had last been aimed.
  const aimDrag = () => {
    const c = controls.current;
    if (c?.enabled) c.screenSpacePanning = c.getPolarAngle() > FACING_RACK_FROM;
  };
  const keepInFreeSpace = () => {
    const c = controls.current;
    if (!c) return;
    dropHover();
    const eye = c.object.position;
    // Sliding down a rack face stops at the floor, not beneath it.
    const lift = MIN_CAMERA_HEIGHT - eye.y;
    if (lift > 0) {
      eye.y += lift;
      c.target.y += lift;
    }
    if (!byRig.current) {
      // Racking is solid, whatever the gesture: the eye stays out of it (the
      // eye only — moving the pivot with it would push the pivot deeper into
      // the rack each time).
      const kept = heldToWalkway(layout, lastEye.current, eye.toArray());
      if (kept !== eye.x) {
        eye.x = kept;
        if (scrollingOut.current) stoppedByRack.current = true;
        // Held this close, the pivot is moved on instead: left nearer than
        // the controls allow, their next update pushes the eye back out and
        // the two never stop correcting each other.
        if (eye.distanceTo(c.target) < MIN_DISTANCE) c.target.sub(eye).setLength(MIN_DISTANCE).add(eye);
      }
    }
    lastEye.current = eye.toArray();
  };
  const endGesture = () => {
    const c = controls.current;
    if (!c?.enabled) {
      stoppedByRack.current = false;
      return;
    }
    // An aisle is too narrow to back away from a rack. Scrolling out against
    // the rack behind rises out of the aisle instead, still looking at the
    // same spot; from up there the view is free.
    if (stoppedByRack.current) {
      const up = liftOut(layout, c.object.position.toArray(), c.target.toArray());
      goal.current = planMove(layout, c.object, controls, up.eye, up.target);
      redraw();
    }
    stoppedByRack.current = false;
    readView();
  };

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 250, position: home.position.toArray() }}
      style={{ background: BIN_COLORS.sky, cursor: hover || overLine ? 'pointer' : 'grab' }}
      // Known for certain to be a scroll-out, rather than guessed from how
      // the camera moved: set on the way down to the controls, cleared on
      // the way back up.
      onWheelCapture={(e) => { scrollingOut.current = e.deltaY > 0; }}
      onWheel={() => { scrollingOut.current = false; }}
      aria-label="3D view of the warehouse racking"
      role="img"
    >
      <hemisphereLight args={['#ffffff', '#c9d1d9', 0.75]} />
      <directionalLight position={[8, 14, 10]} intensity={1.15} />
      <directionalLight position={[-10, 6, -6]} intensity={0.35} />
      <Floor layout={layout} />
      <WalkLines layout={layout} walking={walk ? walkAisle ?? walk.aisleIndex : null} onWalk={onWalk} onOver={setOverLine} />
      <Racking layout={layout} />
      <Bins cells={cells} bins={bins} hits={hits} filter={filter} selected={selected} onHover={setHover} onSelect={onSelect} />
      {/* Its own boundary: the label font loads on first use, and the racking
          must not vanish while it does. */}
      <Suspense fallback={null}>
        <BinCodes cells={near} bins={bins} hits={hits} filter={filter} />
      </Suspense>
      {/* Its own boundary too: the company signs use the same font. */}
      <Suspense fallback={null}>
        <Sections layout={layout} sections={sections} colors={sectionColors} draft={draft} labelled={!walk} />
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
              {hoverSection && ` · ${hoverSection.customer_name}`}
            </span>
          </div>
        </Html>
      )}
      <OrbitControls
        ref={controls}
        makeDefault
        enabled={!walk}
        enableDamping={false}
        minDistance={MIN_DISTANCE}
        maxDistance={80}
        maxPolarAngle={Math.PI / 2.05}
        mouseButtons={MOUSE_BUTTONS}
        touches={TOUCHES}
        zoomToCursor
        onStart={aimDrag}
        onChange={keepInFreeSpace}
        onEnd={endGesture}
      />
      <CameraRig focus={focus} controls={controls} home={home} layout={layout} goal={goal} byRig={byRig} walking={!!walk} onSettle={readView} />
      {walk && (
        <WalkRig layout={layout} walk={walk} nudges={nudges} focus={focus} cell={selectedCell} lastEye={lastEye}
          onMove={dropHover} onView={showFrom} onAt={onWalkAt} />
      )}
    </Canvas>
  );
}
