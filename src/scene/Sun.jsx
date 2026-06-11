import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { useStore } from '../state/useStore.js';

// Sun: textured emissive sphere + point light. The Sun is its own light
// source so we use meshBasicMaterial (unlit) — otherwise the planet
// lighting would also light the Sun's far side.
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
        <sphereGeometry args={[3.4, 48, 48]} />
        <meshBasicMaterial
          map={texture}
          color={texture ? (hovered ? '#fffaf0' : '#ffffff') : (hovered ? '#fff4c8' : '#ffe9a8')}
        />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={2.4} decay={0} />
    </group>
  );
}
