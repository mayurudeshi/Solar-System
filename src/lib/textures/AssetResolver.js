// AssetResolver — the single seam between "where do texture bytes live" and
// everything else in this module. Nothing downstream (manifest loader,
// TextureManager, the hook) ever builds a path by hand: they ask a resolver.
//
// Today every asset is a plain file served over HTTP from Vite's /public
// (so /textures/foo.jpg). Later we may run inside Tauri (native shell) where
// assets live on local disk and must be reached via convertFileSrc() or a
// localhost asset server. Swapping that future in is a one-line factory
// change here — no call site moves.
//
// The "interface" is structural (duck-typed), not a class hierarchy:
//   resolve(relPath) -> string   absolute/loadable URL for a relative asset
//   manifestUrl()    -> string   loadable URL for textures.manifest.json
//
// @typedef {Object} AssetResolver
// @property {(relPath: string) => string} resolve
// @property {() => string} manifestUrl

/**
 * Join a base and a relative path with exactly one slash, tolerating a
 * trailing slash on base and/or a leading slash on rel.
 * @param {string} base
 * @param {string} rel
 * @returns {string}
 */
function joinPath(base, rel) {
  const b = String(base).replace(/\/+$/, '');
  const r = String(rel).replace(/^\/+/, '');
  return `${b}/${r}`;
}

/**
 * Web resolver — assets served over HTTP from a public base path.
 * This is the default for the running app today.
 * @param {string} [base='/textures']
 * @returns {AssetResolver}
 */
export function WebResolver(base = '/textures') {
  return {
    /** @param {string} relPath */
    resolve(relPath) {
      return joinPath(base, relPath);
    },
    manifestUrl() {
      return joinPath(base, 'textures.manifest.json');
    },
  };
}

/**
 * Local resolver — assets on local disk in a native shell (e.g. Tauri).
 * `base` is whatever the host needs as a root: a convertFileSrc() result,
 * a tauri://localhost asset path, or a localhost asset-server origin.
 *
 * The shape is intentionally identical to WebResolver so it drops in
 * without touching any consumer. If a host needs a transform (e.g. Tauri's
 * convertFileSrc), pass an already-converted `base` or wrap this resolver.
 * @param {string} base
 * @returns {AssetResolver}
 */
export function LocalResolver(base) {
  if (!base) {
    // Don't silently produce "/undefined/..." — fail loud at construction.
    throw new Error('LocalResolver requires a base path.');
  }
  return {
    /** @param {string} relPath */
    resolve(relPath) {
      return joinPath(base, relPath);
    },
    manifestUrl() {
      return joinPath(base, 'textures.manifest.json');
    },
  };
}

/**
 * Pick the right resolver for the current runtime. Tauri injects
 * `window.__TAURI__`; everything else gets the web resolver. The native
 * base here is a placeholder — when we actually ship Tauri we'll feed it a
 * real convertFileSrc()'d directory.
 * @returns {AssetResolver}
 */
export function getDefaultResolver() {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    // Placeholder native base; swap for the real local asset root when
    // the Tauri target lands. Kept here so the branch is wired, not invented
    // at call sites.
    return LocalResolver('asset://localhost/textures');
  }
  return WebResolver('/textures');
}
