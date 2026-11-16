/**
 * Sections of racking marked for a company, drawn on the rack itself: a wash
 * of the company's colour over its boxes with a frame round them, the name on
 * a sign on each beam that carries them, and a bar along the top of the rack
 * — the part that shows from the overview — with the name above it.
 *
 * Nothing here takes a click or a hover: the boxes behind stay pickable.
 */
import { useMemo } from 'react';
import { Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import font72Bold from '@sap-theming/theming-base-content/content/Base/baseLib/baseTheme/fonts/72-Bold.woff?url';
import { SIZE, bayZ, beamHeights, extent } from './layout';
import { sectionBays, sectionShape } from './sections';
import { BIN_COLORS } from './binColors';
import { frontSign } from './Bins3D';
import { T } from '../../ui/tokens';

// Just proud of the uprights and beams, so the wash lies over the whole face.
const PROUD = SIZE.depth / 2 + 0.035;
const FRAME = 0.03;
const SIGN = { height: 0.08, text: 0.05, pad: 0.05 };
// A beam is 0.1 deep, drawn with its top where its first row of boxes sits.
const BEAM_CENTRE = 0.05;
const ROOF = { thick: 0.07, lift: 0.05 };
const ignore = () => null;

function Bar({ at, size, color }) {
  return (
    <mesh position={at} raycast={ignore}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

/** One section on its rack face. `draft` is the one being marked: no name yet. */
function Section({ layout, shape, bays, color, name, draft, labelled }) {
  const sign = frontSign(shape);
  const x = shape.x + sign * PROUD;
  const [near, far] = shape.z;
  const [bottom, top] = shape.y;
  const length = near - far;
  const height = top - bottom;
  const middle = [(bottom + top) / 2, (near + far) / 2];
  const turn = [0, sign * (Math.PI / 2), 0];
  const roof = extent(layout).height + ROOF.lift;
  const bayLength = layout.positions * SIZE.box;
  const edge = draft ? BIN_COLORS.outline : color;
  // The name goes on the beams that carry the section's rows — on the steel,
  // where it covers no box, and at every height a walk can be at. (Not the
  // floor beam, which is under the floor line.) A section that sits wholly
  // between two beams has none, so its sign hangs inside its top edge.
  const beams = beamHeights(layout).filter((h) => h > 0.1 && h >= bottom - 0.01 && h < top).map((h) => h - BEAM_CENTRE);
  const signs = beams.length ? beams : [top - FRAME - SIGN.height / 2];

  return (
    <group>
      <mesh position={[x, middle[0], middle[1]]} rotation={turn} raycast={ignore}>
        <planeGeometry args={[length, height]} />
        <meshBasicMaterial color={color} transparent opacity={draft ? 0.34 : 0.2} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Bar at={[x, top - FRAME / 2, middle[1]]} size={[0.012, FRAME, length]} color={edge} />
      <Bar at={[x, bottom + FRAME / 2, middle[1]]} size={[0.012, FRAME, length]} color={edge} />
      <Bar at={[x, middle[0], near - FRAME / 2]} size={[0.012, height, FRAME]} color={edge} />
      <Bar at={[x, middle[0], far + FRAME / 2]} size={[0.012, height, FRAME]} color={edge} />
      <Bar at={[shape.x, roof, middle[1]]} size={[SIZE.depth, ROOF.thick, length]} color={edge} />

      {!draft && bays.map((bay) => {
        // The part of this bay the section takes in: all of it, or less at either end.
        const from = Math.min(near, bayZ(layout, bay));
        const to = Math.max(far, bayZ(layout, bay) - bayLength);
        const room = from - to - 2 * FRAME;
        const width = Math.min(room, name.length * SIGN.text * 0.62 + 2 * SIGN.pad);
        return signs.map((y) => (
          <group key={`${bay}:${y}`}>
            <mesh position={[x + sign * 0.006, y, (from + to) / 2]} rotation={turn} raycast={ignore}>
              <planeGeometry args={[width, SIGN.height]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <Text
              font={font72Bold}
              position={[x + sign * 0.01, y, (from + to) / 2]}
              rotation={turn}
              fontSize={SIGN.text}
              anchorX="center"
              anchorY="middle"
              color="#ffffff"
              // A name longer than the part of the bay it has is cut, not spilt on to the neighbours.
              clipRect={[-width / 2, -SIGN.height / 2, width / 2, SIGN.height / 2]}
              raycast={ignore}
            >
              {name}
            </Text>
          </group>
        ));
      })}

      {!draft && labelled && (
        <Html position={[shape.x, roof + 0.45, middle[1]]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{
            fontFamily: T.font, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: '#fff', background: color,
            borderRadius: 4, padding: '1px 6px', boxShadow: T.shadowSm,
          }}>
            {name}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * `sections` are the rows from GET /rack-sections, `colors` each company's
 * colour by customer id, `draft` the section being marked (if any). The names
 * above the racks are for the overview: `labelled` is false during a walk,
 * when they would float over racks they are nowhere near.
 */
export default function Sections({ layout, sections, colors, draft, labelled }) {
  const drawn = useMemo(() => sections
    .map((section) => ({ section, shape: sectionShape(layout, section) }))
    .filter((s) => s.shape), [sections, layout]);
  const draftShape = useMemo(() => (draft ? sectionShape(layout, draft) : null), [draft, layout]);

  return (
    <>
      {drawn.map(({ section, shape }) => (
        <Section
          key={section.id}
          layout={layout}
          shape={shape}
          bays={sectionBays(section)}
          color={colors.get(section.customer_id) ?? T.textMuted}
          name={section.customer_name ?? ''}
          labelled={labelled}
        />
      ))}
      {draftShape && <Section layout={layout} shape={draftShape} bays={[]} color={BIN_COLORS.selected} draft />}
    </>
  );
}
