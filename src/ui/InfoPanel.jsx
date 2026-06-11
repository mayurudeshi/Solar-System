import { useStore } from '../state/useStore.js';
import { BODIES } from '../data/bodies.js';

// Slide-in data drawer keyed off useStore.selected. Scaffold renders the
// shell so the design lands; v1 fills the full data + fact body.
export function InfoPanel() {
  const selected = useStore((s) => s.selected);
  const setSelected = useStore((s) => s.setSelected);
  const body = selected ? BODIES[selected] : null;

  return (
    <aside className={`info-panel${body ? ' show' : ''}`}>
      <button className="info-close" onClick={() => setSelected(null)}>✕</button>
      {body && (
        <>
          <h2>
            <span className="info-swatch" style={{ background: body.color }} />
            {selected}
          </h2>
          <p className="info-sub">
            Semi-major axis {body.a} AU ·{' '}
            {body.period < 1
              ? `${(body.period * 365).toFixed(0)}-day year`
              : `${body.period.toFixed(1)}-year orbit`}
          </p>
          <p className="info-fact">{body.fact}</p>
        </>
      )}
    </aside>
  );
}
