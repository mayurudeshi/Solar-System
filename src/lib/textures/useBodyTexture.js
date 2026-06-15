// useBodyTexture — R3F hook wrapping TextureManager for a single body+map.
//
// Returns the current best texture as React state. It wires the manager's
// progressive `onLevel` callback to setState so the component re-renders
// with the low-res level immediately, then again as higher levels arrive.
// On unmount or when (manager/body/map/targetRes) changes, it disposes the
// resident texture for that map and cancels the in-flight load.
//
// Mirrors the cancel-safe pattern of the legacy useAsyncTexture(url) hook in
// Planet.jsx (a `cancelled` flag guards every async callback), but delegates
// the actual GPU lifecycle to the manager so disposal stays centralized.
//
// Returns null when there's no manager yet or the manifest has nothing for
// this map — the caller should keep its existing fallback (e.g. procedural
// texture) for that case, exactly like the legacy hook returning null.

import { useState, useEffect } from 'react';

/**
 * @param {import('./TextureManager.js').TextureManager|null} manager
 * @param {string} body
 * @param {string} map
 * @param {{ targetRes?: number, focused?: boolean }} [opts]
 * @returns {import('three').Texture|null}
 */
export function useBodyTexture(manager, body, map, opts = {}) {
  const { targetRes, focused } = opts;
  // Store the texture alongside the params it belongs to. On a param change
  // the stored key won't match this render's key, so we return null (the
  // fallback) WITHOUT a synchronous setState in the effect — the new effect
  // then fills it in. This avoids the cascading-render setState-in-effect.
  const reqKey = manager && body && map ? `${body}/${map}` : null;
  const [state, setState] = useState({ key: null, texture: null });

  useEffect(() => {
    if (!manager || !body || !map) return undefined;

    let cancelled = false;

    manager
      .loadMap(body, map, {
        targetRes,
        focused,
        onLevel: (tex) => {
          if (cancelled) return; // disposal handled centrally by the manager
          setState({ key: `${body}/${map}`, texture: tex });
        },
      })
      .catch(() => {
        // Manager already swallows per-level errors; this guards anything
        // unexpected so a missing asset never throws into render.
      });

    return () => {
      cancelled = true;
      // Releases the GPU texture for this map and invalidates the in-flight
      // generation so any late onLevel is ignored.
      manager.dispose(body, map);
    };
  }, [manager, body, map, targetRes, focused]);

  // Only surface the texture if it matches the currently-requested params;
  // otherwise return the fallback (null) until the new load reports a level.
  return state.key === reqKey ? state.texture : null;
}
