import { useState } from 'react';
import { useStore } from '../state/useStore.js';

// Sun: simple emissive sphere + point light. Click → select; hover → cursor.
export function Sun() {
  const setSelected = useStore((s) => s.setSelected);
  const [hovered, setHovered] = useState(false);

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
        <meshBasicMaterial color={hovered ? '#fff4c8' : '#ffe9a8'} />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={2.4} decay={0} />
    </group>
  );
}
