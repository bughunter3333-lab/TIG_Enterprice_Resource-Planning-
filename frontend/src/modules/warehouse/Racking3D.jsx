/**
 * The racking, as in the aisle B photo: blue uprights at each bay end, an
 * orange beam front and back under every group of three rows, and an orange
 * beam closing off the top row. Above that closing beam is an open shelf for
 * excess boxes — drawn empty, because what is up there is not recorded.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SIZE, bayZ, bayside, beamHeights, closingBeamHeight, extent, faceX } from './layout';
import { BIN_COLORS } from './binColors';

const tmp = new THREE.Object3D();

function useInstances(ref, list, toMatrix) {
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    list.forEach((item, i) => {
      toMatrix(item);
      tmp.updateMatrix();
      ref.current.setMatrixAt(i, tmp.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [ref, list, toMatrix, invalidate]);
}

const atScaled = (sx, sy, sz) => (p) => { tmp.position.set(p.x, p.y, p.z); tmp.scale.set(sx(p), sy(p), sz(p)); };
const one = () => 1;
const uprightMatrix = atScaled(one, (p) => p.h, one);
const runMatrix = atScaled(one, one, (p) => p.len);

export default function Racking({ layout }) {
  const uprights = useRef();
  const beams = useRef();
  const decks = useRef();

  const { uprightList, beamList, deckList } = useMemo(() => {
    const bayLen = layout.positions * SIZE.box;
    const height = extent(layout).height + 0.05;
    const closing = closingBeamHeight(layout);
    const beamTops = [...beamHeights(layout), closing];
    const u = [];
    const b = [];
    const d = [];
    layout.aisles.forEach((_, ai) => {
      for (let bay = 1; bay <= layout.baysPerAisle; bay += 1) {
        const x = faceX(layout, ai, bayside(layout, bay));
        const z0 = bayZ(layout, bay);
        const zc = z0 - bayLen / 2;
        for (const z of [z0, z0 - bayLen]) {
          for (const dx of [-SIZE.depth / 2, SIZE.depth / 2]) u.push({ x: x + dx, y: height / 2, z, h: height });
        }
        beamTops.forEach((top, n) => {
          const isClosing = n === beamTops.length - 1;
          for (const dx of [-SIZE.depth / 2, SIZE.depth / 2]) b.push({ x: x + dx, y: top - 0.05, z: zc, len: bayLen });
          // A deck on every working beam; on the closing beam only when it
          // carries the excess shelf.
          if (!isClosing || layout.excessShelf) d.push({ x, y: top - 0.012, z: zc, len: bayLen });
        });
      }
    });
    return { uprightList: u, beamList: b, deckList: d };
  }, [layout]);

  useInstances(uprights, uprightList, uprightMatrix);
  useInstances(beams, beamList, runMatrix);
  useInstances(decks, deckList, runMatrix);

  return (
    <>
      <instancedMesh ref={uprights} args={[null, null, uprightList.length]} raycast={() => null}>
        <boxGeometry args={[0.05, 1, 0.05]} />
        <meshStandardMaterial color={BIN_COLORS.upright} roughness={0.45} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={beams} args={[null, null, beamList.length]} raycast={() => null}>
        <boxGeometry args={[0.05, 0.1, 1]} />
        <meshStandardMaterial color={BIN_COLORS.beam} roughness={0.45} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={decks} args={[null, null, deckList.length]} raycast={() => null}>
        <boxGeometry args={[SIZE.depth, 0.02, 1]} />
        <meshStandardMaterial color={BIN_COLORS.deck} roughness={0.8} />
      </instancedMesh>
    </>
  );
}
