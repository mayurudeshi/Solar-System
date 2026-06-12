import { useState } from 'react';
import { useStore } from '../../state/useStore.js';
import { BODIES } from '../../data/bodies.js';
import { DEG } from '../../lib/orbital.js';
import { ProceduralPhotosphere } from './ProceduralPhotosphere.jsx';
import { ParticleCMEs } from './ParticleCMEs.jsx';

// v1.5 Sun composition. Mirrors the v1.4 Sun's external surface (selection
// click, hover, lighting modes) so Scene.jsx can swap implementations via
// a flag without rewiring anything else.

const ARTIFICIAL_INTENSITY = 2.8;
const NATURAL_INTENSITY = 2000;

export function SunV15() {
  const setSelected = useStore((s) => s.setSelected);
  const naturalLight = useStore((s) => s.naturalLight);
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
      <group rotation={[0, 0, BODIES.Sun.axial * DEG]}>
        <ProceduralPhotosphere
          hovered={hovered}
          eventHandlers={{ onClick, onPointerOver, onPointerOut }}
        />
      </group>
      <ParticleCMEs />
      <pointLight
        position={[0, 0, 0]}
        intensity={naturalLight ? NATURAL_INTENSITY : ARTIFICIAL_INTENSITY}
        decay={naturalLight ? 2 : 0}
      />
    </group>
  );
}
