/**
 * helios-plasma.js
 * ----------------------------------------------------------------------------
 * A BOLT-ON solar atmosphere layer for an existing three.js Sun.
 *
 * It adds, as a separate layer parented under its own Group:
 *   - a fresnel corona shell (additive)
 *   - magnetically-bound coronal loops (plasma advects along field lines)
 *   - open-field plumes / solar wind
 *   - flux-rope CMEs (a loop destabilizes and ejects, collimated along its axis)
 *   - coronal rain (gravity drains plasma down the loop legs)
 *
 * It DOES NOT create or modify any photosphere/surface mesh. Your surface stays
 * yours. This is pure atmosphere + motion that lives *around* your Sun.
 *
 * --- Integration contract -------------------------------------------------
 *   import * as THREE from 'three';
 *   import { createSolarPlasma } from './helios-plasma.js';
 *
 *   const plasma = createSolarPlasma(THREE, scene, {
 *     center:    sunMesh.position,   // THREE.Vector3 (default 0,0,0)
 *     sunRadius: SUN_RADIUS,         // your Sun's radius in scene units (default 1)
 *     particleBudget: 8000,          // hard cap; 8k holds 60fps comfortably
 *   });
 *
 *   // in your render loop:
 *   plasma.update(dt);              // dt in seconds
 *
 *   // LOD: fade it in only when the Sun is the focused vantage & zoomed in.
 *   // intensity 0 => emission paused + invisible (near-zero cost).
 *   const k = THREE.MathUtils.clamp((zoomInThreshold - distToSun) / range, 0, 1);
 *   plasma.setIntensity(k);
 *
 *   // optional:
 *   plasma.triggerCME(camera);      // erupt the region facing the camera
 *   plasma.triggerCME();            // erupt a random region
 *   plasma.setActivity({ loops: 0.6, wind: 0.3, eruptionFrequency: 0.4 });
 *   plasma.setDetail(0.7);          // scale particle budget for weaker GPUs
 *   plasma.dispose();
 *
 * Everything runs in unit space (Sun radius = 1) and is scaled to sunRadius via
 * the parent Group, so the original tuning holds at any scale. Materials are
 * toneMapped:false so additive glow survives ACES/sRGB pipelines.
 * Works on three r128 through current.
 * ----------------------------------------------------------------------------
 */

export function createSolarPlasma(THREE, scene, options = {}) {
  const opt = Object.assign({
    center: new THREE.Vector3(0, 0, 0),
    sunRadius: 1,
    particleBudget: 8000,
    regions: 3,
    palette: [ // temperature ramp over a particle's life: [t, r,g,b]
      [0.00, 1.00, 1.00, 0.93],
      [0.12, 1.00, 0.82, 0.38],
      [0.35, 1.00, 0.45, 0.10],
      [0.65, 0.82, 0.16, 0.04],
      [1.00, 0.25, 0.03, 0.02],
    ],
    coronaTint: [1.0, 0.55, 0.2],
    autoErupt: true,
    renderOrder: 10,
  }, options);

  const N = opt.particleBudget | 0;
  const CDEPTH = 0.86;

  // master group: unit-space sim, scaled & placed to match the real Sun
  const group = new THREE.Group();
  group.position.copy(opt.center);
  group.scale.setScalar(opt.sunRadius);
  group.renderOrder = opt.renderOrder;
  scene.add(group);

  // ---- corona shell (fresnel, additive) --------------------------------
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTint: { value: new THREE.Vector3(...opt.coronaTint) },
      uOpacity: { value: 0.0 },
    },
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.FrontSide,
    vertexShader: `varying vec3 vN; varying vec3 vView;
      void main(){ vN=normalize(normalMatrix*normal);
        vec4 mv=modelViewMatrix*vec4(position,1.0); vView=normalize(-mv.xyz);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uTint; uniform float uOpacity;
      varying vec3 vN; varying vec3 vView;
      void main(){ float f=pow(1.0-max(dot(vN,vView),0.0),3.4);
        gl_FragColor=vec4(uTint, f*0.5*uOpacity); }`,
  });
  coronaMat.toneMapped = false;
  const corona = new THREE.Mesh(new THREE.SphereGeometry(1.3, 48, 48), coronaMat);  // hug the limb closer (was 1.4) → no detached-ring gap
  group.add(corona);

  // ---- particle buffers -------------------------------------------------
  const posArr = new Float32Array(N * 3);
  const colArr = new Float32Array(N * 3);
  const alphaArr = new Float32Array(N);
  const sizeArr = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  const age = new Float32Array(N);
  const life = new Float32Array(N);
  const pmode = new Uint8Array(N);    // 0 loop-bound, 1 open/plume, 2 erupting
  const regionOf = new Int8Array(N);
  const activeF = new Uint8Array(N);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(posArr, 3);
  const aCol = new THREE.BufferAttribute(colArr, 3);
  const aAlp = new THREE.BufferAttribute(alphaArr, 1);
  const aSz = new THREE.BufferAttribute(sizeArr, 1);
  if (THREE.DynamicDrawUsage) [aPos, aCol, aAlp, aSz].forEach(a => a.setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('position', aPos);
  geo.setAttribute('aColor', aCol);
  geo.setAttribute('aAlpha', aAlp);
  geo.setAttribute('aSize', aSz);

  const pixRatio = (scene.userData && scene.userData.pixelRatio) ||
    (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uPix: { value: pixRatio }, uScale: { value: 0.9 }, uMaxSize: { value: 9.0 } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    vertexShader: `
      attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
      uniform float uPix; uniform float uScale; uniform float uMaxSize;
      varying vec3 vC; varying float vA;
      void main(){
        vC=aColor; vA=aAlpha;
        vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mv;
        float s=aSize*uScale*uPix*(140.0/max(-mv.z,0.1));
        gl_PointSize=min(s, uMaxSize*uPix);
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vA;
      void main(){
        vec2 c=gl_PointCoord-0.5; float d=length(c);
        float soft=smoothstep(0.5,0.0,d);
        float core=pow(soft,2.8);
        float a=vA*(soft*0.38+core*0.72);
        if(a<0.01) discard;
        gl_FragColor=vec4(vC*(0.7+core*0.7), a);
      }`,
  });
  pMat.toneMapped = false;
  const points = new THREE.Points(geo, pMat);
  points.frustumCulled = false;
  group.add(points);

  // ---- magnetic field (buried charge-pair bipoles + weak global dipole) -
  const charges = [];
  const regions = [];
  const _ax = new THREE.Vector3();
  const _v = new THREE.Vector3();

  function randUnit(out) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    out.set(s * Math.cos(a), u, s * Math.sin(a)); return out;
  }
  const _b1 = new THREE.Vector3(), _b2 = new THREE.Vector3();
  function coneDir(dir, spread, out) {
    if (Math.abs(dir.y) < 0.95) _b1.set(0, 1, 0); else _b1.set(1, 0, 0);
    _b1.crossVectors(dir, _b1).normalize();
    _b2.crossVectors(dir, _b1).normalize();
    const ct = Math.cos(spread), z = ct + (1 - ct) * Math.random();
    const r = Math.sqrt(Math.max(0, 1 - z * z)), ph = Math.random() * Math.PI * 2;
    out.copy(dir).multiplyScalar(z)
      .addScaledVector(_b1, r * Math.cos(ph))
      .addScaledVector(_b2, r * Math.sin(ph)).normalize();
    return out;
  }
  function makeRegion(centerDir) {
    const c = centerDir ? centerDir.clone().normalize() : randUnit(new THREE.Vector3());
    if (Math.abs(c.y) > 0.9) _ax.set(1, 0, 0); else _ax.set(0, 1, 0);
    _ax.crossVectors(c, _ax).normalize();
    const sep = 0.34 + Math.random() * 0.26;
    const pPos = c.clone().applyAxisAngle(_ax, sep * 0.5).normalize();
    const nPos = c.clone().applyAxisAngle(_ax, -sep * 0.5).normalize();
    return { c, pPos, nPos, q: 0.9 + Math.random() * 0.5, erupt: 0, acc: 0 };
  }
  function rebuildCharges() {
    charges.length = 0;
    for (const r of regions) {
      charges.push({ x: r.pPos.x * CDEPTH, y: r.pPos.y * CDEPTH, z: r.pPos.z * CDEPTH, q: r.q });
      charges.push({ x: r.nPos.x * CDEPTH, y: r.nPos.y * CDEPTH, z: r.nPos.z * CDEPTH, q: -r.q });
    }
    charges.push({ x: 0, y: CDEPTH, z: 0, q: 0.35 });
    charges.push({ x: 0, y: -CDEPTH, z: 0, q: -0.35 });
  }
  for (let i = 0; i < opt.regions; i++) regions.push(makeRegion());
  rebuildCharges();

  const _bf = [0, 0, 0];
  function field(px, py, pz) {
    let bx = 0, by = 0, bz = 0;
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      const dx = px - c.x, dy = py - c.y, dz = pz - c.z;
      let r2 = dx * dx + dy * dy + dz * dz; if (r2 < 0.0025) r2 = 0.0025;
      const inv = c.q / (r2 * Math.sqrt(r2));
      bx += dx * inv; by += dy * inv; bz += dz * inv;
    }
    _bf[0] = bx; _bf[1] = by; _bf[2] = bz; return _bf;
  }

  // ---- palette ramp -----------------------------------------------------
  const P = opt.palette;
  function ramp(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (t <= b[0]) {
        const f = (t - a[0]) / Math.max(b[0] - a[0], 1e-5);
        return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
      }
    }
    const L = P[P.length - 1]; return [L[1], L[2], L[3]];
  }

  // ---- emission & eruption ---------------------------------------------
  const _d = new THREE.Vector3(), _dir = new THREE.Vector3(), _vdir = new THREE.Vector3();
  function emit(px, py, pz, v0, v1, v2, lifespan, m, baseSize, reg) {
    const i = cursor; cursor = (cursor + 1) % N;
    const i3 = i * 3;
    posArr[i3] = px; posArr[i3 + 1] = py; posArr[i3 + 2] = pz;
    vel[i3] = v0; vel[i3 + 1] = v1; vel[i3 + 2] = v2;
    age[i] = 0; life[i] = lifespan; pmode[i] = m; sizeArr[i] = baseSize;
    regionOf[i] = (reg === undefined ? -1 : reg); activeF[i] = 1;
  }
  function eruptRegion(idx) {
    const r = regions[idx]; if (!r) return;
    r.erupt = 0.9 + Math.random() * 0.4;
    for (let i = 0; i < N; i++) {
      if (!activeF[i] || regionOf[i] !== idx || pmode[i] !== 0) continue;
      const i3 = i * 3;
      const sp = 1.15 + Math.random() * 0.3;        // slower → shorter reach
      // velocity diverges in a cone around the eruption axis: a narrow neck that
      // balloons outward. Gravity (toward Sun center) then arcs the off-axis
      // edges back, rounding the front into a lightbulb rather than a straight cone.
      coneDir(r.c, 0.15, _dir);
      vel[i3] = _dir.x * sp;
      vel[i3 + 1] = _dir.y * sp;
      vel[i3 + 2] = _dir.z * sp;
      pmode[i] = 2; age[i] = 0; life[i] = 2.2 + Math.random() * 1.0;  // fade sooner
    }
  }

  // ---- runtime config / LOD --------------------------------------------
  const BLOOM = 0.55;   // CME canopy widening rate (tangential push, grows with height)
  const cfg = { loops: 0.6, wind: 0.3, eruptionFreq: 0.4, grav: 1.2, detail: 1, intensity: 0, auto: opt.autoErupt };
  let autoTimer = 2.0;

  function step(dt) {
    if (dt > 0.05) dt = 0.05;
    const gate = cfg.intensity * cfg.detail;

    if (cfg.auto && cfg.intensity > 0.01) {
      autoTimer -= dt;
      const interval = 9.0 - cfg.eruptionFreq * 7.6;
      if (cfg.eruptionFreq > 0.01 && autoTimer <= 0 && regions.length) {
        eruptRegion(Math.floor(Math.random() * regions.length));
        autoTimer = interval * (0.6 + Math.random() * 0.8);
      }
    }

    // 1) loop-bound plasma from each region's + footpoint
    const loopRate = 430 * cfg.loops * gate;
    for (let ri = 0; ri < regions.length; ri++) {
      const r = regions[ri];
      r.erupt = Math.max(0, r.erupt - dt);
      if (r.erupt > 0) {
        r.acc += 2200 * dt * cfg.detail;             // denser → coherent leading front, not scattered embers
        let en = Math.floor(r.acc); r.acc -= en;
        for (let k = 0; k < en; k++) {
          coneDir(r.c, 0.06, _dir);                  // tight neck at the surface (the bulb's stem)
          const px = _dir.x, py = _dir.y, pz = _dir.z;
          coneDir(r.c, 0.15, _vdir);                 // velocity fans modestly → necks then balloons into the bulb as it climbs
          const sp = 1.15 + Math.random() * 0.3;     // slower → shorter reach
          emit(px * 1.01, py * 1.01, pz * 1.01,
            _vdir.x * sp, _vdir.y * sp, _vdir.z * sp,
            2.0 + Math.random() * 1.0, 2, 0.62 + Math.random() * 0.5, ri);          // fade sooner
        }
        continue;
      }
      r.acc += loopRate * dt;
      let en = Math.floor(r.acc); r.acc -= en;
      for (let k = 0; k < en; k++) {
        coneDir(r.pPos, 0.05, _dir);
        const spd = 0.5 + Math.random() * 0.3;
        emit(_dir.x * 1.01, _dir.y * 1.01, _dir.z * 1.01, spd, 0, 0,
          7.0 + Math.random() * 2.5, 0, 0.42 + Math.random() * 0.3, ri);
      }
    }

    // 2) open-field plumes / solar wind
    const windCount = Math.floor(22 * cfg.wind * gate);
    for (let k = 0; k < windCount; k++) {
      randUnit(_d);
      const spd = 0.45 + Math.random() * 0.3;
      emit(_d.x * 1.01, _d.y * 1.01, _d.z * 1.01, spd, 0, 0,
        6.0 + Math.random() * 2.5, 1, 0.36 + Math.random() * 0.26, -1);
    }

    // 3) integrate
    const G = cfg.grav;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (!activeF[i]) continue;
      const i3 = i * 3;
      let x = posArr[i3], y = posArr[i3 + 1], z = posArr[i3 + 2];
      const m = pmode[i];
      if (m === 2) {
        const r2 = x * x + y * y + z * z, r = Math.sqrt(r2);
        const af = -G / (r2 * r + 1e-4);
        vel[i3] += af * x * dt; vel[i3 + 1] += af * y * dt; vel[i3 + 2] += af * z * dt;
        // BLOOM: push outward (tangential to the radial line) growing with height,
        // so the ejecta necks at the anchored base then balloons into a rounded
        // canopy wider than the neck = the lightbulb head. Pure width: radial
        // speed is untouched, so reach stays capped (Mercury safe).
        const inv = 1 / (r || 1);
        const rx = x * inv, ry = y * inv, rz = z * inv;
        const vr = vel[i3] * rx + vel[i3 + 1] * ry + vel[i3 + 2] * rz;
        const tx = vel[i3] - vr * rx, ty = vel[i3 + 1] - vr * ry, tz = vel[i3 + 2] - vr * rz;
        const tlen = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (tlen > 1e-4) {
          const push = BLOOM * r * dt / tlen;   // grows with height → dome, not straight cone
          vel[i3] += tx * push; vel[i3 + 1] += ty * push; vel[i3 + 2] += tz * push;
        }
        x += vel[i3] * dt; y += vel[i3 + 1] * dt; z += vel[i3 + 2] * dt;
      } else {
        const b = field(x, y, z);
        const bl = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]) + 1e-6;
        const bx = b[0] / bl, by = b[1] / bl, bz = b[2] / bl;
        const nr0 = Math.sqrt(x * x + y * y + z * z) || 1;
        const align = (bx * x + by * y + bz * z) / nr0;
        const s = vel[i3] * (1 + 1.3 * Math.max(0, -align) * G);
        x += bx * s * dt; y += by * s * dt; z += bz * s * dt;
      }
      posArr[i3] = x; posArr[i3 + 1] = y; posArr[i3 + 2] = z;

      age[i] += dt;
      const t = age[i] / life[i];
      const nr = Math.sqrt(x * x + y * y + z * z);
      const drained = (m !== 2) && nr < 1.01 && age[i] > 0.25;
      // CMEs (mode 2) are capped tight so they don't reach Mercury's orbit
      // (~16.9 scene units = ~4.97 sun-radii at sunRadius 3.4). 4.5 keeps them
      // comfortably inside. Loops/wind keep their original 9-radii reach.
      // CMEs capped at 4.3 sun-radii (~14.6 units) — Mercury is at ~4.98 radii
      // (16.9 units), so this keeps a margin. Loops/wind keep their 9-radii reach.
      const maxR = (m === 2) ? 4.3 : 9;
      if (t >= 1 || drained || nr > maxR) { activeF[i] = 0; alphaArr[i] = 0; continue; }

      const c = ramp(t);
      colArr[i3] = c[0]; colArr[i3 + 1] = c[1]; colArr[i3 + 2] = c[2];
      const fin = t < 0.05 ? t / 0.05 : 1.0;
      const fout = t > 0.6 ? 1.0 - (t - 0.6) / 0.4 : 1.0;
      // CME: hold the bulb body solid, fade only the leading edge so it dies into
      // nothing right at the cap (no scattered embers). Loops/wind unchanged.
      const distFade = (m === 2)
        ? (nr < 2.2 ? 1.0 : Math.max(0, 1 - (nr - 2.2) / 2.1))
        : (nr < 2.4 ? 1.0 : Math.max(0, 1 - (nr - 2.4) / 4.2));
      const baseA = m === 0 ? 0.55 : (m === 2 ? 0.78 : 0.36);  // brighter CME → coherent front (was 0.6)
      alphaArr[i] = baseA * fin * fout * distFade * cfg.intensity;
      count++;
    }
    aPos.needsUpdate = true; aCol.needsUpdate = true; aAlp.needsUpdate = true; aSz.needsUpdate = true;
    coronaMat.uniforms.uOpacity.value = cfg.intensity;
    return count;
  }

  // ---- public API -------------------------------------------------------
  return {
    group,
    update(dt) { if (cfg.intensity <= 0.001 && !anyActive()) { coronaMat.uniforms.uOpacity.value = 0; return 0; } return step(dt); },
    /** Erupt a region. Pass your camera (or a THREE.Vector3 world point) to erupt
     *  the region facing it; pass nothing for a random region. */
    triggerCME(target) {
      if (!regions.length) return;
      if (target) {
        const p = target.isCamera ? target.position : (target.isVector3 ? target : null);
        if (p) {
          _v.copy(p).sub(opt.center).normalize();
          let best = 0, bv = -2;
          for (let i = 0; i < regions.length; i++) { const d = regions[i].c.dot(_v); if (d > bv) { bv = d; best = i; } }
          return eruptRegion(best);
        }
      }
      eruptRegion(Math.floor(Math.random() * regions.length));
    },
    /** Master LOD fade 0..1. At 0 the layer pauses emission and goes invisible. */
    setIntensity(v) { cfg.intensity = Math.max(0, Math.min(1, v)); },
    /** Per-channel activity, each 0..1. */
    setActivity(a = {}) {
      if (a.loops != null) cfg.loops = a.loops;
      if (a.wind != null) cfg.wind = a.wind;
      if (a.eruptionFrequency != null) cfg.eruptionFreq = a.eruptionFrequency;
      if (a.gravity != null) cfg.grav = a.gravity;
    },
    /** Scale particle budget for weaker GPUs (0..1). */
    setDetail(v) { cfg.detail = Math.max(0.05, Math.min(1, v)); },
    setAutoErupt(b) { cfg.auto = !!b; },
    /** Apparent sprite size knobs, if you want to match your art direction. */
    setSpriteScale(scale, maxPx) {
      if (scale != null) pMat.uniforms.uScale.value = scale;
      if (maxPx != null) pMat.uniforms.uMaxSize.value = maxPx;
    },
    setPixelRatio(r) { pMat.uniforms.uPix.value = r; },
    regionCount: () => regions.length,
    dispose() {
      scene.remove(group);
      geo.dispose(); pMat.dispose(); coronaMat.dispose(); corona.geometry.dispose();
    },
  };

  function anyActive() { for (let i = 0; i < N; i++) if (activeF[i]) return true; return false; }
}

export default createSolarPlasma;
