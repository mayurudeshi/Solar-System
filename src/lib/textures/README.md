# Texture management module

Manifest-driven, progressive-resolution texture loading with a swappable
asset resolver and explicit VRAM-conscious disposal. Plain JS + JSDoc, no
new deps (just `three`).

## Why

Three.js does **not** garbage-collect GPU textures. Dropping the last JS
reference to a `THREE.Texture` leaves its WebGL object resident on the GPU
forever. This module centralizes the discipline of disposing every texture
the moment it's superseded or unmounted, and loads low-res first so bodies
appear instantly and sharpen up.

## Architecture

```
AssetResolver.js   where bytes live (web now → local-disk/native later)
manifest.js        load + parse textures.manifest.json; schema + helpers
TextureManager.js  the core: progressive load, dispose, VRAM budget, races
useBodyTexture.js  R3F hook → current best texture as React state
```

Everything downstream depends only on the **resolver interface**
(`resolve(relPath)`, `manifestUrl()`) — no path is ever hardcoded at a call
site. The manifest is the single source of truth for which maps exist, their
resolutions, colorspace, and sampling.

### Public API

```js
// AssetResolver.js
WebResolver(base = '/textures')        // → { resolve, manifestUrl }
LocalResolver(base)                    // → { resolve, manifestUrl }
getDefaultResolver()                   // LocalResolver if window.__TAURI__, else WebResolver

// manifest.js
await loadManifest(resolver, signal?)  // → Manifest | null  (null if missing/bad)
getMap(manifest, body, map)            // → MapEntry | null
pickLevels(mapEntry)                   // → TextureLevel[]   (ascending, local-file only)

// TextureManager.js
new TextureManager(renderer, resolver)
mgr.setLoaders({ imageLoader?, ktx2Loader? })   // → this
await mgr.init(signal?)                          // loads manifest; safe if missing
await mgr.loadMap(body, map, { targetRes?, onLevel?, focused? })  // → THREE.Texture | null
mgr.residentBytes()                              // → number (decoded est.)
mgr.budgetBytes                                  // soft cap, default ~512MB
mgr.dispose(body, map)
mgr.disposeAll()

// useBodyTexture.js
useBodyTexture(manager, body, map, { targetRes?, focused? })  // → THREE.Texture | null
```

## Manifest schema

`/textures/textures.manifest.json`:

```json
{
  "version": 1,
  "assetRoot": "",
  "bodies": {
    "Earth": {
      "maps": {
        "albedo": {
          "type": "srgb",
          "wrap": "repeat",
          "levels": [
            { "res": 1024, "file": "earth/albedo_1k.jpg", "bytes": 463087 },
            { "res": 2048, "file": "earth/albedo_2k.jpg", "bytes": 1500000 },
            { "res": 8192, "acquire": "https://.../8k.jpg" }
          ]
        }
      }
    }
  }
}
```

- `type`: `srgb` for color maps, `linear` for data maps (normal/specular/
  roughness/alpha). Drives colorspace.
- `alpha` / `normalMap` / `wrap` (`repeat` | `clamp`): optional flags.
- `levels[]`: each has `res` + either a local `file` (loadable now) or just
  `acquire` (a placeholder URL for bytes not on disk yet — **ignored** by the
  loader until a `file` is added). Sorted ascending internally.
- The module **no-ops gracefully if the manifest is missing** — `loadMap`
  returns `null` and callers keep their existing fallback.

## Swapping to KTX2 / Basis (compressed GPU textures)

1. Add `.ktx2` levels to the manifest (alongside or instead of jpg/png).
2. Configure a loader and inject it — no core changes:

```js
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const ktx2 = new KTX2Loader()
  .setTranscoderPath('/basis/')      // ship basis_transcoder.{js,wasm}
  .detectSupport(renderer);          // REQUIRED before loading

mgr.setLoaders({ ktx2Loader: ktx2 });
```

`TextureManager.loaderFor()` routes `.ktx2`/`.basis` files to this loader by
extension. Compressed textures are stored bottom-up, so `_configure()` sets
`flipY = false` for them automatically (image textures stay `flipY = true`).
If no `ktx2Loader` is injected, `.ktx2` levels are skipped and the loader
falls back to whatever jpg/png levels exist.

## Swapping to local disk / native (Tauri)

`getDefaultResolver()` already returns a `LocalResolver` when
`window.__TAURI__` is present. To finish the native path, feed `LocalResolver`
a real base — e.g. a `convertFileSrc()`'d directory or a localhost asset-server
origin:

```js
import { convertFileSrc } from '@tauri-apps/api/tauri';
import { LocalResolver } from './AssetResolver.js';

const base = convertFileSrc('/abs/path/to/textures');
const resolver = LocalResolver(base);
```

Because every consumer talks only to the resolver interface, nothing else
changes.

## Pitfalls this module handles for you

- **Disposal**: GPU textures are not auto-GC'd. Superseded levels are disposed
  the instant a higher one installs; `dispose(body, map)` / `disposeAll()`
  release the rest. The hook disposes on unmount/param-change.
- **Colorspace**: color maps → `SRGBColorSpace`; data maps (normals/alpha/
  specular) → `NoColorSpace`. (sRGB on an alpha map crushes soft edges; sRGB
  on a normal map bends lighting — both are classic bugs in this codebase.)
- **Anisotropy**: capped to `renderer.capabilities.getMaxAnisotropy()`.
- **Races**: a per-key generation token means re-requesting or disposing a
  map mid-load never leaks — the stale load disposes its decoded texture and
  bails instead of installing it.
- **VRAM budget**: `residentBytes()` tracks decoded bytes (`res*res*4`); when a
  load for a **non-focused** body (`focused: false`) would exceed
  `budgetBytes`, the top level is skipped. Simple, present, and tunable.
