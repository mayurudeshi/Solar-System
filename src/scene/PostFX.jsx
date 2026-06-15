// v1.8 post-processing. A light-touch bloom pass so the Sun and the
// brightest limbs/emissive highlights actually glow, instead of being
// clamped flat at white. Threshold is set HIGH so only genuinely bright
// pixels (the Sun, specular sun-glint, atmospheric rim) bloom — the lit
// planet surfaces and the Milky Way band stay crisp and un-hazed.
//
// God-rays (volumetric sun shafts) are a separate pass that needs the Sun
// mesh as an occlusion source — added once the Sun exposes a mesh ref.
//
// mipmapBlur gives a soft, wide, cheap glow that reads as light rather than
// a hard halo. Kept conservative on purpose — v1.7's pristine look is the
// baseline we protect; bloom should enhance, never wash out.
import { EffectComposer, Bloom } from '@react-three/postprocessing';

// MOBILE REGRESSION GUARD (v1.8.0a): on phones the EffectComposer's
// high-DPR multisampled framebuffer overran the GPU — the render loop died
// every frame and the canvas went black, flickering alive only on touch
// (each pointer event forced a one-off frame). Skip post-processing on
// coarse-pointer / mobile devices: they fall back to the v1.7 render path
// (no bloom, but fully working). Desktop keeps bloom. Mobile-safe bloom
// (capped dpr + no multisampling) is a v1.8.1 task.
const IS_MOBILE =
  typeof navigator !== 'undefined' &&
  (/Android|webOS|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent || '') ||
    (typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches));

export function PostFX() {
  if (IS_MOBILE) return null;
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={0.85}
        luminanceThreshold={0.62}
        luminanceSmoothing={0.22}
        mipmapBlur
        radius={0.72}
      />
    </EffectComposer>
  );
}
