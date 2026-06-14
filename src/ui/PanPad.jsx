import { useRef } from 'react';

// On-screen pan controls (v1.6.1). Conflict-free way to "scroll around" a
// zoomed-in view — Vivaldi's right-drag mouse gesture hijacks OrbitControls
// right-drag pan (back-navigates to about:blank), so this gives a reliable
// alternative that also works one-handed on the S24. Press-and-hold to pan
// continuously; the center button re-centers the followed body.
//
// Calls the camera hooks exposed by VantageCamera on window.
export function PanPad() {
  const timer = useRef(null);

  const pan = (dx, dy) => { if (window.__panView) window.__panView(dx, dy); };
  const recenter = () => { if (window.__recenter) window.__recenter(); };

  const startHold = (dx, dy) => (e) => {
    e.preventDefault();
    pan(dx, dy);
    clearInterval(timer.current);
    timer.current = setInterval(() => pan(dx, dy), 40);
  };
  const stopHold = () => clearInterval(timer.current);

  const holdProps = (dx, dy) => ({
    onPointerDown: startHold(dx, dy),
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  });

  return (
    <div className="panpad" aria-label="Pan view">
      <button className="panpad-btn panpad-up"    {...holdProps(0, 1)}  aria-label="Pan up">▲</button>
      <button className="panpad-btn panpad-left"  {...holdProps(-1, 0)} aria-label="Pan left">◀</button>
      <button className="panpad-btn panpad-center" onClick={recenter} aria-label="Re-center">◎</button>
      <button className="panpad-btn panpad-right" {...holdProps(1, 0)}  aria-label="Pan right">▶</button>
      <button className="panpad-btn panpad-down"  {...holdProps(0, -1)} aria-label="Pan down">▼</button>
    </div>
  );
}
