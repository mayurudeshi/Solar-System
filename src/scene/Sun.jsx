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
  // SINGLE smooth-ramp sprite — replaces the previous two-layer stack
  // that created visible "Saturn-ring" bands and a dark gap in between.
  // No alpha jumps; every adjacent gradient stop is within ~0.1 alpha of
  // its neighbor. Sprite is sized so the sphere edge (radius 3.4) sits
  // at fraction ~0.227 of the sprite half-width (scale 30 → 15 unit
  // radius), and the bright ramp peaks just outside that.
  // H-alpha palette — red-orange dominated to match the chromosphere look
  // (656 nm hydrogen emission). Peak alpha just past the sphere limb, smooth
  // taper to zero.
  const glowTex = useMemo(
    () =>
      makeGlowTexture([
        [0.00, 'rgba(255, 200, 150, 0.00)'],
        [0.15, 'rgba(255, 180, 120, 0.03)'],
        [0.20, 'rgba(255, 130,  70, 0.12)'],
        [0.25, 'rgba(255,  90,  40, 0.32)'], // peak red-orange just past limb
        [0.32, 'rgba(255,  70,  30, 0.22)'],
        [0.45, 'rgba(220,  50,  20, 0.10)'],
        [0.65, 'rgba(180,  40,  15, 0.04)'],
        [1.00, 'rgba(150,  30,  10, 0.00)'],
      ]),
    []
  );

  return (
    <sprite scale={[30, 30, 1]}>
      <spriteMaterial
        map={glowTex}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
}

// Light tuning for the two modes:
//   artificial (decay=0): intensity is a uniform multiplier — every body
//     receives the same illumination. Easy on the eyes; outer planets visible.
//   natural (decay=2): physical inverse-square falloff. We boost intensity
//     to compensate so Earth at ~26 scene-units looks comparable to before.
//     Result: Mercury overlit, Jupiter dim, Pluto a faint twilight — same
//     qualitative pattern as the real solar system (compressed by our log
//     AU scale, not literally 1/r² of true AU).
const ARTIFICIAL_INTENSITY = 2.8;
const NATURAL_INTENSITY = 2000; // ≈ ARTIFICIAL × Earth_r² (26²) so Earth matches

export function Sun() {
  const setSelected = useStore((s) => s.setSelected);
  const naturalLight = useStore((s) => s.naturalLight);
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
        {/* The 2k_sun.jpg from Solar System Scope is ALREADY an H-alpha /
            chromosphere-style equirectangular projection (deep red-orange
            with granulation + prominence patterns). Render it as-is.

            `key={texture ? 'loaded' : 'loading'}` forces React to remount
            the material when the texture finishes loading — otherwise the
            shader was compiled without map support (texture was null at
            first render) and never re-compiles when map is set. That's
            why the sphere was rendering as a flat white dot. */}
        <meshBasicMaterial
          key={texture ? 'loaded' : 'loading'}
          map={texture}
          color={hovered ? '#fff0e0' : '#ffffff'}
        />
      </mesh>
      <SunCorona />
      <pointLight
        position={[0, 0, 0]}
        intensity={naturalLight ? NATURAL_INTENSITY : ARTIFICIAL_INTENSITY}
        decay={naturalLight ? 2 : 0}
      />
    </group>
  );
}
