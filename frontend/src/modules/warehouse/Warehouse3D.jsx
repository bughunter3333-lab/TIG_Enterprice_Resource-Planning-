/**
 * The racking in 3D. Loaded on demand (WarehouseModule lazy-imports it), so
 * three.js costs nothing until someone opens the warehouse.
 *
 * Boxes (Bins3D) and racking (Racking3D) are instanced, so the whole
 * building is a handful of draw calls.
 * The canvas renders on demand: nothing redraws while the view is still.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SIZE, aisleX, allCells, extent } from './layout';
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

/** Eases the camera to a bin, standing in its aisle at the bin's height. */
function CameraRig({ focus, controls, home, onSettle }) {
  const { camera, invalidate } = useThree();
  const goal = useRef(null);

  useEffect(() => {
    if (focus) {
      const target = new THREE.Vector3(focus.x, focus.y, focus.z);
      // Stand back down the aisle, across from the face, a little above the box:
      // close enough to read the box, far enough to see its neighbours.
      // Stand across the aisle from the face, on the side of the box away from
      // its nearest bay-end upright, so the upright never sits in front of it.
      const across = focus.side === 'right' ? -0.6 : 0.6;
      const along = focus.position <= focus.layout.positions / 2 ? -4.6 : 4.6;
      const stand = new THREE.Vector3(aisleX(focus.layout, focus.aisleIndex) + across, focus.y + 1.4, focus.z + along);
      goal.current = { target, position: stand };
    } else if (home) {
      goal.current = { target: home.target.clone(), position: home.position.clone() };
    }
    invalidate();
  }, [focus, home, invalidate]);

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controls.current;
    if (!g || !c) return;
    const k = 1 - Math.exp(-dt * 5);
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
        minDistance={1.2}
        maxDistance={80}
        maxPolarAngle={Math.PI / 2.05}
        onEnd={readView}
      />
      <CameraRig focus={focus} controls={controls} home={home} onSettle={readView} />
    </Canvas>
  );
}
