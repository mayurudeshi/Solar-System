import { useMemo } from 'react';
import * as THREE from 'three';

// Static background starfield. 2600 points on a thick spherical shell,
// matching the POC's feel. Render order is non-interactive — no raycast.
export function Starfield({ count = 2600 }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 900 + Math.random() * 900;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#cdd6e8" size={1.1} sizeAttenuation={false} />
    </points>
  );
}
