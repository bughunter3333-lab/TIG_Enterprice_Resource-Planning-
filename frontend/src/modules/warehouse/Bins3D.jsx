/**
 * The boxes, drawn like the bins in the aisle B photo: an open-front kraft
 * carton with a low front lip, the opening above it, and a white location
 * label on the lip. Three instanced meshes — body, opening, label — so 3,600
 * boxes stay three draw calls.
 *
 * The label carries the box's state (palette in binColors.js), which keeps
 * the cartons looking like cartons: white is nothing slotted, blue stock on
 * hand, orange slotted with none on hand, red over capacity. The opening is
 * dark where goods are in it. Location codes are printed on the labels near
 * the camera only — 3,600 lines of text everywhere would cost the frame rate
 * and could not be read from that far anyway.
 */
import { useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import font72Bold from '@sap-theming/theming-base-content/content/Base/baseLib/baseTheme/fonts/72-Bold.woff?url';
import { SIZE } from './layout';
import { BIN_COLORS } from './binColors';

export const BOX = { d: SIZE.depth * 0.9, h: SIZE.level * 0.86, w: SIZE.box * 0.94 };
const OPENING = { h: BOX.h * 0.52, w: BOX.w * 0.84, y: BOX.h * 0.16 };
const LABEL = { h: BOX.h * 0.2, w: BOX.w * 0.6, y: -BOX.h * 0.27 };

const tmp = new THREE.Object3D();
const tint = new THREE.Color();

/** Which way the box's open front faces on x: toward the aisle. */
export const frontSign = (cell) => (cell.side === 'right' ? -1 : 1);
const frontX = (cell) => cell.x + frontSign(cell) * (BOX.d / 2);

// Cardboard is never one flat colour: a small, stable shade per box (from its
// index, so it does not shimmer between renders).
function kraft(i) {
  const n = Math.sin(i * 12.9898) * 43758.5453;
  return tint.set(BIN_COLORS.kraft).multiplyScalar(0.9 + (n - Math.floor(n)) * 0.14);
}

/** The state a box shows, after the current search and highlight filter. */
function shownState(code, entry, hits, filter) {
  if (!entry) return null;
  if (hits && hits.size > 0 && !hits.has(code)) return null;
  if (filter !== 'all' && entry.state !== filter) return null;
  return entry.state;
}

function place(mesh, i, x, y, z, scale = 1) {
  tmp.position.set(x, y, z);
  tmp.scale.set(scale, scale, scale);
  tmp.updateMatrix();
  mesh.setMatrixAt(i, tmp.matrix);
}

export function Bins({ cells, bins, hits, filter, selected, onHover, onSelect }) {
  const bodies = useRef();
  const openings = useRef();
  const labels = useRef();
  const { invalidate } = useThree();

  useLayoutEffect(() => {
    cells.forEach((c, i) => {
      const entry = bins.get(c.code);
      const state = shownState(c.code, entry, hits, filter);
      const isSelected = c.code === selected;
      const fx = frontX(c);
      const s = frontSign(c);

      place(bodies.current, i, c.x, c.y, c.z, isSelected ? 1.06 : 1);
      bodies.current.setColorAt(i, isSelected ? tint.set(BIN_COLORS.selected) : kraft(i));

      place(openings.current, i, fx + s * 0.002, c.y + OPENING.y, c.z);
      const filled = entry && entry.skus.some((k) => (k.qty_on_hand ?? 0) > 0);
      openings.current.setColorAt(i, tint.set(filled ? BIN_COLORS.goods : BIN_COLORS.hollow));

      place(labels.current, i, fx + s * 0.004, c.y + LABEL.y, c.z);
      labels.current.setColorAt(i, tint.set(state ? BIN_COLORS[state] : BIN_COLORS.label));
    });
    for (const m of [bodies, openings, labels]) {
      m.current.instanceMatrix.needsUpdate = true;
      if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true;
    }
    bodies.current.computeBoundingSphere();
    invalidate();
  }, [cells, bins, hits, filter, selected, invalidate]);

  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[null, null, cells.length]}
        onPointerMove={(e) => { e.stopPropagation(); onHover(cells[e.instanceId]); }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); onSelect(cells[e.instanceId].code); }}
      >
        <boxGeometry args={[BOX.d, BOX.h, BOX.w]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={openings} args={[null, null, cells.length]} raycast={() => null}>
        <boxGeometry args={[0.004, OPENING.h, OPENING.w]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      <instancedMesh ref={labels} args={[null, null, cells.length]} raycast={() => null}>
        <boxGeometry args={[0.004, LABEL.h, LABEL.w]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </>
  );
}

/** The location printed on each nearby box's label. */
export function BinCodes({ cells, bins, hits, filter }) {
  return cells.map((c) => {
    const s = frontSign(c);
    const state = shownState(c.code, bins.get(c.code), hits, filter);
    return (
      <Text
        key={c.code}
        font={font72Bold}
        position={[frontX(c) + s * 0.008, c.y + LABEL.y, c.z]}
        rotation={[0, s * (Math.PI / 2), 0]}
        fontSize={LABEL.h * 0.62}
        maxWidth={LABEL.w * 0.96}
        anchorX="center"
        anchorY="middle"
        color={state ? '#ffffff' : BIN_COLORS.labelText}
        raycast={() => null}
      >
        {c.code}
      </Text>
    );
  });
}
