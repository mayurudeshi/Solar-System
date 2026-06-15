// Manifest loading + parsing for the texture system.
//
// The manifest is the single source of truth for "what maps exist, at what
// resolutions, in what colorspace, and how should they be sampled." It is
// fetched through the AssetResolver so its location follows the same
// web/local swap as the assets themselves.
//
// ── Schema ──────────────────────────────────────────────────────────────
// textures.manifest.json:
// {
//   "version": 1,
//   "assetRoot": "",                 // optional path prefix prepended to
//                                    // each level.file before resolving
//                                    // (e.g. "v2/" if assets are versioned)
//   "bodies": {
//     "Earth": {
//       "maps": {
//         "albedo": {
//           "type": "srgb",          // 'srgb' for color maps, 'linear' for
//                                    // normal/specular/roughness/alpha data
//           "alpha": false,          // optional: this map drives alpha
//           "normalMap": false,      // optional: this is a tangent-space normal
//           "wrap": "repeat",        // optional: 'repeat' | 'clamp' (default repeat)
//           "levels": [              // ascending or unsorted; we sort by res
//             { "res": 1024, "file": "earth/albedo_1k.jpg", "bytes": 463087 },
//             { "res": 2048, "file": "earth/albedo_2k.jpg", "bytes": 1500000 },
//             { "res": 8192, "acquire": "https://example/8k.jpg" }
//             //  ^ acquire-only: no local `file` yet, ignored by the loader
//             //    until the bytes are fetched and a `file` is added.
//           ]
//         }
//       }
//     }
//   }
// }
//
// @typedef {Object} TextureLevel
// @property {number} res         square resolution (px) of this level
// @property {string} [file]      relative asset path (passed to resolver). If
//                                absent, this is an "acquire-only" placeholder.
// @property {number} [bytes]     encoded size hint (informational only)
// @property {string} [acquire]   where the bytes can be obtained later
//
// @typedef {Object} MapEntry
// @property {'srgb'|'linear'} type
// @property {boolean} [alpha]
// @property {boolean} [normalMap]
// @property {'repeat'|'clamp'} [wrap]
// @property {TextureLevel[]} levels
//
// @typedef {Object} BodyEntry
// @property {Object<string, MapEntry>} maps
//
// @typedef {Object} Manifest
// @property {number} version
// @property {string} [assetRoot]
// @property {Object<string, BodyEntry>} bodies

/**
 * Fetch + parse the manifest via the resolver. Returns null (never throws)
 * if the manifest is missing or malformed, so the app keeps running with
 * its procedural/legacy fallbacks before any assets land.
 * @param {import('./AssetResolver.js').AssetResolver} resolver
 * @param {AbortSignal} [signal]
 * @returns {Promise<Manifest|null>}
 */
export async function loadManifest(resolver, signal) {
  const url = resolver.manifestUrl();
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== 'object' || !json.bodies) return null;
    return /** @type {Manifest} */ (json);
  } catch {
    // Network error, abort, or bad JSON — treat as "no manifest yet".
    return null;
  }
}

/**
 * Look up one map entry. Returns null if the manifest, body, or map is
 * absent so callers can degrade gracefully.
 * @param {Manifest|null} manifest
 * @param {string} body
 * @param {string} map
 * @returns {MapEntry|null}
 */
export function getMap(manifest, body, map) {
  if (!manifest || !manifest.bodies) return null;
  const b = manifest.bodies[body];
  if (!b || !b.maps) return null;
  return b.maps[map] || null;
}

/**
 * Return the ascending ladder of levels that have a local `file`. Levels
 * that are `acquire`-only (no `file`) are skipped — those bytes don't exist
 * on disk/web yet. Sorted by resolution ascending so progressive loading
 * walks low → high.
 * @param {MapEntry|null} mapEntry
 * @returns {TextureLevel[]}
 */
export function pickLevels(mapEntry) {
  if (!mapEntry || !Array.isArray(mapEntry.levels)) return [];
  return mapEntry.levels
    .filter((lvl) => lvl && typeof lvl.file === 'string' && lvl.file.length > 0)
    .slice()
    .sort((a, b) => a.res - b.res);
}
