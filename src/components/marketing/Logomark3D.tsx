// 3D woven logomark — flostruction-v5.html:813-834. Three cream bars
// and three green diagonals at the canonical 18 degrees (rotation.z
// = -0.314 rad), gently swaying. three.js is dynamically imported so
// it ships only in the marketing chunk, on the client, after mount.
// Reduced motion: a single static render at the resting pose.
'use client';

import { useEffect, useRef } from 'react';

export function Logomark3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    let disposed = false;
    let raf = 0;
    let cleanup: (() => void) | undefined;

    /* Craft pass: the logomark is decorative — defer the three.js
       chunk to idle time so it never competes with the LCP poster or
       hydration on throttled connections. */
    const start = () => void import('three').then((THREE) => {
      if (disposed || !canvasRef.current) return;
      const s = 52;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
      renderer.setPixelRatio(dpr);
      renderer.setSize(s, s, false);
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      cam.position.set(0, 0, 7.4);
      const g = new THREE.Group();
      g.scale.setScalar(0.92);
      const cream = new THREE.MeshStandardMaterial({ color: 0xf2ecda, metalness: 0.15, roughness: 0.6 });
      const green = new THREE.MeshStandardMaterial({ color: 0x1b7e41, metalness: 0.25, roughness: 0.5, emissive: 0x07351b, emissiveIntensity: 0.2 });
      const geoms: InstanceType<typeof THREE.BoxGeometry>[] = [];
      const box = (w: number, h: number, dep: number, m: InstanceType<typeof THREE.MeshStandardMaterial>) => {
        const geom = new THREE.BoxGeometry(w, h, dep);
        geoms.push(geom);
        return new THREE.Mesh(geom, m);
      };
      [0.82, 0, -0.82].forEach((y) => { const b = box(2.7, 0.42, 0.4, cream); b.position.set(0, y, 0); g.add(b); });
      /* diagonals: rotation.z = -0.314 rad = the canonical 18 degrees */
      [-0.92, 0, 0.92].forEach((x) => { const b = box(0.46, 3.15, 0.52, green); b.position.set(x, 0, 0.34); b.rotation.z = -0.314; g.add(b); });
      scene.add(g);
      scene.add(new THREE.AmbientLight(0xffffff, 0.78));
      const key = new THREE.DirectionalLight(0xfff2e2, 1.15);
      key.position.set(3, 4, 5);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xbcd0e2, 0.4);
      fill.position.set(-4, -2, 3);
      scene.add(fill);
      const rim = new THREE.PointLight(0xe8873a, 0.45);
      rim.position.set(0, 0, -4);
      scene.add(rim);

      cleanup = () => {
        geoms.forEach((geom) => geom.dispose());
        cream.dispose();
        green.dispose();
        renderer.dispose();
      };

      const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (rm) {
        g.rotation.set(0.12, -0.42, 0);
        renderer.render(scene, cam);
        return;
      }
      let r = 0;
      const loop = () => {
        if (disposed) return;
        r += 0.016;
        g.rotation.y = Math.sin(r) * 0.58;
        g.rotation.x = Math.sin(r * 0.7) * 0.16;
        renderer.render(scene, cam);
        raf = requestAnimationFrame(loop);
      };
      loop();
    });

    /* Safari has no requestIdleCallback at runtime even though lib.dom
       declares it — feature-detect with typeof (a truthiness test trips
       TS2774 because the lib type is non-optional). */
    const hasIdle = typeof window.requestIdleCallback === 'function';
    const idleId = hasIdle
      ? window.requestIdleCallback(start, { timeout: 2500 })
      : window.setTimeout(start, 350);

    return () => {
      disposed = true;
      if (hasIdle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      if (raf) cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, []);

  return <canvas ref={canvasRef} className="mark" aria-hidden="true" />;
}
