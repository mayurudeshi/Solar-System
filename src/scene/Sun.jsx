import { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useStore } from '../state/useStore.js';

// Sun: textured sphere + corona glow + point light. The Sun is its own
// light source (planets get lit by the point light), so we use
// meshBasicMaterial — unlit — for the sphere itself.

function useSunTexture() {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load('/textures/2k_sun.jpg', (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = 4;
      setTex(loaded);
    });
  }, []);
  return tex;
}

// Radial-gradient canvas used as a sprite texture. Bright at the center,
// fades to transparent at the edge. Additive blending paints light onto
// the dark scene background — gives the Sun a proper corona instead of
// the previous "pale yellow dot" effect.
function makeGlowTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  stops.forEach(([offset, color]) => g.addColorStop(offset, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function SunCorona() {
  // Two-layer ANNULAR sprite stack — the center of each sprite is
  // transparent so the textured sphere shows through, and the bright
  // band sits OUTSIDE the sphere radius. Additive blending paints light
  // around the photosphere instead of nuking it.
  //
  // Sphere radius is 3.4 scene units. The inner sprite is scale 16
  // (8-unit radius), so sphere edge sits at fraction 0.425. The inner
  // gradient stays transparent up to that boundary, peaks just outside,
  // then fades. Outer corona is scale 40, sphere edge at 0.17 — its
  // glow band starts there and fades to the far edge.
  const innerTex = useMemo(
    () =>
      makeGlowTexture([
        [0.0,  'rgba(255, 240, 200, 0)'],
        [0.40, 'rgba(255, 240, 200, 0)'],
        [0.50, 'rgba(255, 220, 130, 0.50)'],
        [0.65, 'rgba(255, 200,  80, 0.20)'],
        [1.0,  'rgba(255, 180,  80, 0)'],
      ]),
    []
  );
  const outerTex = useMemo(
    () =>
      makeGlowTexture([
        [0.0,  'rgba(255, 215, 120, 0)'],
        [0.17, 'rgba(255, 215, 120, 0)'],
        [0.30, 'rgba(255, 180,  80, 0.18)'],
        [0.60, 'rgba(255, 150,  60, 0.06)'],
        [1.0,  'rgba(255, 140,  60, 0)'],
      ]),
    []
  );

  return (
    <>
      <sprite scale={[16, 16, 1]}>
        <spriteMaterial
          map={innerTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite scale={[40, 40, 1]}>
        <spriteMaterial
          map={outerTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </>
  );
}

export function Sun() {
  const setSelected = useStore((s) => s.setSelected);
  const [hovered, setHovered] = useState(false);
  const texture = useSunTexture();

  const onClick = (e) => {
    e.stopPropagation();
    setSelected('Sun');
  };
  const onPointerOver = (e) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };
  const onPointerOut = () => {
    setHovered(false);
    document.body.style.cursor = '';
  };

  return (
    <group>
      <mesh
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        <sphereGeometry args={[3.4, 64, 64]} />
        <meshBasicMaterial
          map={texture}
          color={hovered ? '#fff4d6' : '#ffffff'}
        />
      </mesh>
      <SunCorona />
      <pointLight position={[0, 0, 0]} intensity={2.8} decay={0} />
    </group>
  );
}
