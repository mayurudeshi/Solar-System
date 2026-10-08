import * as THREE from 'three';
import { BODIES } from '../data/bodies.js';
import { DEG, auToSceneUnits } from '../lib/orbital.js';

// Shared geometry + clock for everything that lives on or leaves the Sun.
//
// "Body frame" = the Sun's own rotating, untilted frame. It is the same frame
// the photosphere shader samples its texture in, so a point given in body
// coordinates sits on the same spot of the visible surface. To place it in the
// scene: world = tilt * rotY(spin) * body.
//
// Body-frame convention matches three's SphereGeometry UVs:
//   n(lat, lon) = (-cos(lon) cos(lat), sin(lat), sin(lon) cos(lat)),  lon = 2*pi*u
// Increasing lon is the direction of rotation (solar west).

export const SUN_R = 3.4;                 // photosphere radius, scene units
export const ROT_PERIOD_DAYS = 25.38;     // Carrington sidereal mean (solid body)
export const R_SUN_KM = 695700;
export const AU_KM = 149597870.7;
export const R_SUN_AU = R_SUN_KM / AU_KM;

// One reference instant shared by the photosphere and everything anchored to
// it, so spots, loops and CME launch sites agree on where the surface is.
export const SUN_REF_MS = Date.now();

// Spin angle (radians, wrapped) of the body frame at the current store state.
// Mirrors the photosphere's texture scroll exactly.
export function sunSpinRotations(state) {
  const { spinEpochMs, showRotation, slowRotation } = state;
  let deltaMs = showRotation ? spinEpochMs - SUN_REF_MS : 0;
  if (slowRotation) deltaMs *= 0.1;
  return deltaMs / 86400000 / ROT_PERIOD_DAYS;
}

const _tilt = new THREE.Matrix4().makeRotationFromEuler(
  new THREE.Euler(0, 0, BODIES.Sun.axial * DEG)
);
const _spin = new THREE.Matrix4();

// Body -> world rotation matrix (no scale).
export function sunBodyMatrix(out, state) {
  const rot = sunSpinRotations(state);
  const angle = 2 * Math.PI * (rot - Math.floor(rot));
  _spin.makeRotationY(angle);
  return out.multiplyMatrices(_tilt, _spin);
}

// World-space solar north pole (tilt only; spin doesn't move the pole).
export const SUN_POLE_WORLD = new THREE.Vector3(0, 1, 0).applyMatrix4(_tilt).normalize();

export function latLonToBody(latRad, lonRad) {
  const cl = Math.cos(latRad);
  return [-Math.cos(lonRad) * cl, Math.sin(latRad), Math.sin(lonRad) * cl];
}

// Physical heliocentric distance (in solar radii) -> scene radius.
// The scene compresses AU logarithmically (orbital.js) and draws the Sun ~8x
// oversized, so a raw AU mapping would put the solar surface at 0.46 units
// instead of 3.4. This adds a correction that is exactly the surface offset at
// 1 R_sun and decays within ~0.1 AU, so at every planet the mapping equals the
// planets' own mapping (a CME reaches Earth's drawn orbit when it reaches 1 AU).
// Monotonic everywhere. Mirrored in GLSL (SCENE_OF_R_GLSL) below.
const SURF_RAW = auToSceneUnits(R_SUN_AU);
const CORR_DECAY_AU = 0.1;
export function sceneRadiusOfR(rSun) {
  const rAU = Math.max(rSun, 1) * R_SUN_AU;
  return auToSceneUnits(rAU) + (SUN_R - SURF_RAW) * Math.exp(-(rAU - R_SUN_AU) / CORR_DECAY_AU);
}

// Pure additive light that leaves the canvas alpha untouched. The canvas is
// transparent and part of the starry background is page CSS behind it; plain
// AdditiveBlending also adds to destination ALPHA, which made every glow layer
// punch an opaque black box over that background. Shaders using this should
// write premultiplied light in rgb.
export function makeLightAdditive(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}

export const SCENE_OF_R_GLSL = /* glsl */ `
  float sceneOfR(float rSun) {
    float rAU = max(rSun, 1.0) * ${R_SUN_AU.toFixed(9)};
    float raw = log(rAU * 9.0 + 1.0) * ${(26 / Math.LN10).toFixed(9)};
    return raw + ${(SUN_R - SURF_RAW).toFixed(9)} * exp(-(rAU - ${R_SUN_AU.toFixed(9)}) / ${CORR_DECAY_AU.toFixed(3)});
  }
`;
