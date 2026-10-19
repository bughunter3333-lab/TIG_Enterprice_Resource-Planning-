/**
 * The two mocks the probes use. No static import of @react-three/* here: the
 * factories are handed the real modules.
 *
 * fiberMock: the real @react-three/fiber with only <Canvas> replaced — same
 * DOM shape as the real one (outer div = event surface, inner div, canvas),
 * same createRoot/configure/render, but the renderer is a counter instead of
 * WebGL, and the size is fixed at 800x600.
 */
import * as React from 'react';
import * as THREE from 'three';

export const W = 800;
export const H = 600;

export const probe = (globalThis.__probe ??= {
  frames: 0, log: [], canvas: null, surface: null, fiber: null, codes: new Map(), errors: [],
});

export function fiberMock(actual) {
  probe.fiber = actual;
  function Canvas({ children, style, camera, frameloop, dpr, ...props }) {
    React.useMemo(() => actual.extend(THREE), []);
    const canvasRef = React.useRef(null);
    const divRef = React.useRef(null);
    const root = React.useRef(null);
    const surface = React.useCallback((el) => {
      divRef.current = el;
      if (!el) return;
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: W });
      Object.defineProperty(el, 'clientHeight', { configurable: true, value: H });
      el.getBoundingClientRect = () => ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 });
      probe.surface = el;
    }, []);
    React.useLayoutEffect(() => {
      const canvas = canvasRef.current;
      probe.canvas = canvas;
      if (!root.current) root.current = actual.createRoot(canvas);
      root.current.configure({
        gl: {
          domElement: canvas,
          setPixelRatio() {},
          setSize() {},
          render(scene, cam) {
            // What a real renderer does before drawing.
            if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
            if (cam.parent === null && cam.matrixWorldAutoUpdate) cam.updateMatrixWorld();
            probe.frames += 1;
            const st = actual._roots.get(canvas)?.store.getState();
            probe.log.push({
              n: probe.frames, x: cam.position.x, y: cam.position.y, z: cam.position.z, fov: cam.fov,
              enabled: st?.controls?.enabled, t: performance.now(),
            });
          },
        },
        events: actual.events,
        frameloop,
        dpr,
        camera,
        size: { width: W, height: H, top: 0, left: 0 },
        onCreated: (state) => { state.events.connect?.(divRef.current); },
      });
      root.current.render(<React.Suspense fallback={null}>{children ?? null}</React.Suspense>);
    });
    React.useEffect(() => {
      const canvas = canvasRef.current;
      return () => actual.unmountComponentAtNode(canvas);
    }, []);
    return (
      <div ref={surface} data-surface style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }} {...props}>
        <div style={{ width: '100%', height: '100%' }}>
          <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
      </div>
    );
  }
  return { ...actual, Canvas };
}

/**
 * drei: the REAL OrbitControls (deep import, so the rest of drei is not
 * loaded); Html draws nothing; Text draws nothing but, like troika's, asks for
 * a frame after every render (its sync callback) and is counted by its text.
 */
export function dreiMock(OrbitControls, fiber) {
  function Text({ children }) {
    const invalidate = fiber.useThree((s) => s.invalidate);
    React.useLayoutEffect(() => {
      const t = setTimeout(() => invalidate(), 0);
      return () => clearTimeout(t);
    });
    React.useEffect(() => {
      const key = String(children);
      probe.codes.set(key, (probe.codes.get(key) ?? 0) + 1);
      return () => {
        const n = (probe.codes.get(key) ?? 1) - 1;
        if (n <= 0) probe.codes.delete(key); else probe.codes.set(key, n);
      };
    }, [children]);
    return null;
  }
  const Html = () => null;
  return { OrbitControls, Html, Text };
}
