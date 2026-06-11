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
  // Two-layer sprite stack: inner halo (tight, bright) + outer corona
  // (wide, diffuse). Both additive so they paint light, not shadow.
  const innerTex = useMemo(
    () =>
      makeGlowTexture([
        [0.0, 'rgba(255, 240, 200, 0.95)'],
        [0.25, 'rgba(255, 220, 130, 0.55)'],
        [0.5, 'rgba(255, 180, 80, 0.18)'],
        [1.0, 'rgba(255, 180, 80, 0)'],
      ]),
    []
  );
  const outerTex = useMemo(
    () =>
      makeGlowTexture([
        [0.0, 'rgba(255, 215, 120, 0.45)'],
        [0.3, 'rgba(255, 180, 80, 0.18)'],
        [0.7, 'rgba(255, 140, 60, 0.06)'],
        [1.0, 'rgba(255, 140, 60, 0)'],
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
      <sprite scale={[36, 36, 1]}>
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
