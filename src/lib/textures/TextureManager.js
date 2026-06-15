// TextureManager — manifest-driven, progressive-resolution texture loading
// with explicit VRAM-conscious disposal.
//
// Three.js does NOT garbage-collect GPU textures. Dropping the last JS
// reference to a THREE.Texture leaves its WebGL texture object resident on
// the GPU forever. Every texture we stop using MUST get an explicit
// `.dispose()`. This class centralizes that discipline:
//   - progressive load (show low-res instantly, sharpen up to a target)
//   - dispose the superseded level the moment a higher one is ready
//   - dispose everything for a body/map on demand, and on teardown
//   - a soft VRAM budget that can skip the top level for non-focused bodies
//
// It is framework-agnostic (no React). The R3F hook in useBodyTexture.js
// wraps it for components.

import * as THREE from 'three';
import { loadManifest, getMap, pickLevels } from './manifest.js';

const DEFAULT_BUDGET_BYTES = 512 * 1024 * 1024; // ~512 MB soft cap
const DEFAULT_ANISOTROPY = 8;

/**
 * @typedef {Object} Loaders
 * @property {{ load: Function }} imageLoader  loader for jpg/png (THREE.TextureLoader-shaped)
 * @property {{ load: Function }|null} ktx2Loader  loader for .ktx2/.basis (injected later)
 */

/**
 * @typedef {Object} LoadMapOptions
 * @property {number} [targetRes]   highest resolution to climb to (default: max available)
 * @property {(texture: THREE.Texture, res: number) => void} [onLevel]
 *                                  called with each level as it becomes ready, low→high
 * @property {boolean} [focused]    if false, the budget may skip the top level (default true)
 */

export class TextureManager {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('./AssetResolver.js').AssetResolver} resolver
   */
  constructor(renderer, resolver) {
    /** @type {THREE.WebGLRenderer} */
    this.renderer = renderer;
    /** @type {import('./AssetResolver.js').AssetResolver} */
    this.resolver = resolver;
    /** @type {import('./manifest.js').Manifest|null} */
    this.manifest = null;

    /** @type {Loaders} */
    this.loaders = {
      imageLoader: new THREE.TextureLoader(),
      ktx2Loader: null,
    };

    // Resident textures keyed by `${body}/${map}` → the currently-kept
    // THREE.Texture plus its decoded-byte estimate. One entry per map; the
    // progressive loader replaces (and disposes) within the same key.
    /** @type {Map<string, { texture: THREE.Texture, bytes: number }>} */
    this.resident = new Map();

    // Per-key generation counter for race-safety. Each loadMap() bumps the
    // generation; any async continuation whose generation is stale aborts
    // and disposes whatever it produced instead of installing it.
    /** @type {Map<string, number>} */
    this.generation = new Map();

    this.budgetBytes = DEFAULT_BUDGET_BYTES;

    // anisotropy capped to hardware. Guard for headless/test renderers.
    const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
    this.anisotropy = Math.min(DEFAULT_ANISOTROPY, maxAniso || 1);
  }

  /**
   * Inject loaders. The KTX2 path is a future drop-in: configure a
   * KTX2Loader (transcoder path + .detectSupport(renderer)) elsewhere and
   * pass it here. Partial updates are merged.
   * @param {Partial<Loaders>} loaders
   * @returns {this}
   */
  setLoaders(loaders) {
    this.loaders = { ...this.loaders, ...loaders };
    return this;
  }

  /**
   * Load the manifest. No-op-safe: if the manifest is missing the manager
   * stays usable and every loadMap() simply resolves to null, so callers
   * keep their existing fallbacks.
   * @param {AbortSignal} [signal]
   * @returns {Promise<import('./manifest.js').Manifest|null>}
   */
  async init(signal) {
    this.manifest = await loadManifest(this.resolver, signal);
    return this.manifest;
  }

  /** @param {string} body @param {string} map @returns {string} */
  static key(body, map) {
    return `${body}/${map}`;
  }

  /**
   * Estimated decoded (in-VRAM) bytes for an RGBA texture at `res`x`res`.
   * Ignores mip overhead (~+33%) and compression — a deliberately simple,
   * conservative-ish accounting hook.
   * @param {number} res
   * @returns {number}
   */
  static decodedBytes(res) {
    return res * res * 4;
  }

  /** Sum of decoded bytes across all resident textures. @returns {number} */
  residentBytes() {
    let total = 0;
    for (const entry of this.resident.values()) total += entry.bytes;
    return total;
  }

  /**
   * Choose which loader handles a file based on extension. KTX2/Basis route
   * to the injected ktx2Loader (if present); everything else to imageLoader.
   * @param {string} file
   * @returns {{ load: Function }|null}
   */
  loaderFor(file) {
    const ext = (file.split('.').pop() || '').toLowerCase();
    if (ext === 'ktx2' || ext === 'basis') {
      return this.loaders.ktx2Loader || null; // null → caller skips this level
    }
    return this.loaders.imageLoader;
  }

  /**
   * Load a single level into a configured THREE.Texture. Promise-wrapped so
   * progressive loading can await each rung. Rejects on load error.
   * @param {import('./manifest.js').TextureLevel} level
   * @param {import('./manifest.js').MapEntry} mapEntry
   * @returns {Promise<THREE.Texture>}
   */
  loadLevel(level, mapEntry) {
    const file = this._withAssetRoot(level.file);
    const loader = this.loaderFor(file);
    if (!loader) {
      return Promise.reject(new Error(`No loader for ${file}`));
    }
    const url = this.resolver.resolve(file);

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (texture) => {
          this._configure(texture, mapEntry);
          resolve(texture);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  /** @param {string} file @returns {string} */
  _withAssetRoot(file) {
    const root = this.manifest?.assetRoot;
    if (!root) return file;
    const r = String(root).replace(/\/+$/, '');
    const f = String(file).replace(/^\/+/, '');
    return `${r}/${f}`;
  }

  /**
   * Apply colorspace, wrapping, anisotropy, flipY per the map entry.
   * @param {THREE.Texture} texture
   * @param {import('./manifest.js').MapEntry} mapEntry
   */
  _configure(texture, mapEntry) {
    // Colorspace: sRGB for color maps; linear (NoColorSpace) for data maps
    // (normals/specular/roughness/alpha). Getting this wrong on a normal map
    // bends lighting; getting it wrong on an alpha map crushes soft edges.
    if (mapEntry.type === 'srgb') {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else {
      texture.colorSpace = THREE.NoColorSpace;
    }

    const wrap = mapEntry.wrap === 'clamp'
      ? THREE.ClampToEdgeWrapping
      : THREE.RepeatWrapping;
    texture.wrapS = wrap;
    texture.wrapT = wrap;

    texture.anisotropy = this.anisotropy;

    // flipY: default true matches how TextureLoader (image) + standard UVs
    // behave for equirectangular sphere maps. Compressed (KTX2) textures are
    // stored bottom-up and must NOT be flipped — the KTX2Loader path sets
    // flipY=false itself, so only force-true for the image path.
    if (this.loaders.ktx2Loader && texture.isCompressedTexture) {
      texture.flipY = false;
    } else {
      texture.flipY = true;
    }

    texture.needsUpdate = true;
  }

  /**
   * Progressive load for a body+map. Shows the lowest available level first
   * (via onLevel), then climbs to targetRes, disposing each superseded
   * level. Race- and dispose-safe via a per-key generation token.
   *
   * Resolves to the highest texture installed, or null when there's nothing
   * to load (no manifest / no map / no local levels) — callers keep their
   * fallback in that case.
   * @param {string} body
   * @param {string} map
   * @param {LoadMapOptions} [opts]
   * @returns {Promise<THREE.Texture|null>}
   */
  async loadMap(body, map, opts = {}) {
    const { targetRes = Infinity, onLevel, focused = true } = opts;
    const key = TextureManager.key(body, map);

    const mapEntry = getMap(this.manifest, body, map);
    let levels = pickLevels(mapEntry);
    if (!mapEntry || levels.length === 0) return null;

    // Clamp ladder to targetRes (always keep at least the lowest level so
    // something shows even if targetRes is below the floor).
    const climb = levels.filter((l) => l.res <= targetRes);
    if (climb.length === 0) climb.push(levels[0]);

    // Budget hook: for non-focused bodies, drop the top rung if installing it
    // would push us over the soft cap. Simple and present; tune as needed.
    if (!focused && climb.length > 1) {
      const top = climb[climb.length - 1];
      const projected = this.residentBytes() + TextureManager.decodedBytes(top.res);
      if (projected > this.budgetBytes) climb.pop();
    }

    // New generation for this key; invalidates any in-flight prior load.
    const gen = (this.generation.get(key) || 0) + 1;
    this.generation.set(key, gen);

    let best = null;

    for (const level of climb) {
      let texture;
      try {
        texture = await this.loadLevel(level, mapEntry);
      } catch {
        // Skip a level that failed to load; keep climbing with what we have.
        continue;
      }

      // Stale? A newer loadMap() or a dispose() superseded us mid-flight.
      // Drop the just-decoded texture and bail without touching resident
      // state — the newer generation owns this key now.
      if (this.generation.get(key) !== gen) {
        texture.dispose();
        return null;
      }

      // Install: replace + dispose the previously-resident level for this key.
      const prior = this.resident.get(key);
      this.resident.set(key, {
        texture,
        bytes: TextureManager.decodedBytes(level.res),
      });
      if (prior && prior.texture !== texture) prior.texture.dispose();

      best = texture;
      if (onLevel) onLevel(texture, level.res);
    }

    return best;
  }

  /**
   * Dispose the resident texture for one body+map and invalidate any
   * in-flight load for it.
   * @param {string} body
   * @param {string} map
   */
  dispose(body, map) {
    const key = TextureManager.key(body, map);
    // Bump generation so an in-flight loadMap() sees itself as stale.
    this.generation.set(key, (this.generation.get(key) || 0) + 1);
    const entry = this.resident.get(key);
    if (entry) {
      entry.texture.dispose();
      this.resident.delete(key);
    }
  }

  /** Dispose every resident texture. Call on scene teardown. */
  disposeAll() {
    for (const [key, entry] of this.resident) {
      entry.texture.dispose();
      this.generation.set(key, (this.generation.get(key) || 0) + 1);
    }
    this.resident.clear();
  }
}
