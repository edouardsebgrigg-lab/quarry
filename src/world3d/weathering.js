// Weathered paint for the machines. The Blender models keep a clean, readable base colour; here
// their paint turns into what years on a quarry do to it, differently for a Rusty and a Used
// machine:
//  - rust where it really starts: on worn edges and seams, low down, in patches that creep
//    across panels (more on a rusty machine, hardly any on a used one);
//  - paint chipped off corners and edges, showing dark primer;
//  - sun-faded tops (bonnet, roof, arm);
//  - dried mud splashed up from the ground, thickest at the bottom.
// Everything is worked out once when a model loads (its rest-pose shape, "baked" into a vertex
// attribute so the patterns stick to each part as it moves) and in a light shader addition:
// three octaves of value noise and the surface curvature from screen-space derivatives, which
// finds edges and bevels without any extra textures.
import { BufferAttribute } from 'three';

// Which material gets which treatment (Blender material names, before any ".001" suffix).
const ROLES = {
  Paint: 'body', TractorPaint: 'body', PickupPaint: 'body', PickupFaded: 'body', Toolbox: 'body',
  PaintDark: 'dark', Canopy: 'dark', Frame: 'dark', Chassis: 'dark', Castings: 'dark', Rims: 'dark', RimPaint: 'dark',
  Steel: 'metal', Rubber: 'mud', RubberTrack: 'mud',
  // (names used by the refined fleet, after "Review_")
  BarrowPaint: 'body', FramePaint: 'dark', WornSteel: 'metal',
};

// How hard each tier has been used.
const TIERS = {
  rusty: { wear: 1.0, fade: 0.85, mud: 1.0 },
  used: { wear: 0.18, fade: 0.2, mud: 0.5 },
};
// The refined fleet (materials named "Review_…") already has wear painted into its textures, so
// it gets a lighter hand: enough that a Rusty machine reads as rusty and a Used one as cared-for,
// with tyres and tracks kept dark.
const BAKED_TIERS = {
  rusty: { wear: 0.92, fade: 0.55, mud: 0.45 },
  used: { wear: 0.1, fade: 0.12, mud: 0.22 },
};

// Which role a material plays: "Paint.001" -> Paint; "Review_PaintDark_BoomRam.002" -> PaintDark.
export function materialRole(name) {
  const plain = name.replace(/\.\d+/g, '');
  const baked = plain.startsWith('Review_');
  const key = baked ? plain.slice('Review_'.length).split('_')[0] : plain;
  const role = ROLES[key] ?? null;
  return role ? { role, baked } : null;
}

// Where the ground is in each model's own space (the truck's origin is its body centre).
const GROUND = { truck: -1.3 };

const ROLE_SCALE = {
  body: { wear: 1, fade: 1, mud: 1 },
  dark: { wear: 0.6, fade: 0.35, mud: 1 },
  metal: { wear: 0, fade: 0, mud: 0.8 },
  mud: { wear: 0, fade: 0, mud: 1.1 },
};

const NOISE = /* glsl */ `
varying vec3 vRest;
varying vec3 vWN;
uniform vec3 uWeather; // wear, fade, mud
uniform float uGround;
uniform float uRole; // 0 body, 1 dark, 2 metal/rubber
float wHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float wNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1, 0, 0)), f.x), mix(wHash(i + vec3(0, 1, 0)), wHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(wHash(i + vec3(0, 0, 1)), wHash(i + vec3(1, 0, 1)), f.x), mix(wHash(i + vec3(0, 1, 1)), wHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float wFbm(vec3 p) {
  return 0.55 * wNoise(p) + 0.3 * wNoise(p * 2.13 + 3.7) + 0.15 * wNoise(p * 4.37 + 9.1);
}
vec3 wLin(vec3 c) { return pow(c, vec3(2.2)); }
`;

const FRAGMENT = /* glsl */ `
#include <color_fragment>
{
  vec3 P = vRest;
  float wear = uWeather.x;
  float big = wFbm(P * 0.85);
  float mid = wFbm(P * 3.1 + 5.0);
  float fine = wNoise(P * 19.0);
  // Curvature (1/m) from how fast the normal turns across the pixel: high on bevels and edges.
  float curv = length(fwidth(vWN)) / max(length(fwidth(P)), 1e-4);
  float edge = clamp((curv - 3.0) / 22.0, 0.0, 1.0);
  float low = 1.0 - smoothstep(uGround + 0.2, uGround + 1.15, P.y);
  float up = smoothstep(0.45, 0.95, vWN.y);
  vec3 c = diffuseColor.rgb;
  float rough = 0.0;
  if (uRole < 1.5) {
    // Sun fade on upward faces: duller and a little chalky, but not pale (pale reads as new).
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    vec3 faded = mix(c, vec3(lum) * 1.08 + 0.01, 0.5);
    c = mix(c, faded, uWeather.y * up * (0.55 + 0.45 * mid));
    // Chips on edges and corners, down to dark primer.
    float chip = smoothstep(0.7, 0.74, fine * 0.55 + mid * 0.2 + edge * (0.35 + 0.45 * wear) + big * 0.1 * wear);
    c = mix(c, wLin(vec3(0.2, 0.19, 0.18)), chip * step(0.01, wear));
    // Rust: starts on edges and low down, spreads in patches; flaky orange-brown.
    // (a heavily worn machine gets broad patches you can see from across the field)
    float rustAmt = big * 0.55 + mid * 0.35 + edge * 0.35 + low * 0.22 + fine * 0.08 - (1.0 - wear) * 0.55 + wear * 0.1;
    float rust = smoothstep(0.8, 0.86, rustAmt) * step(0.01, wear);
    vec3 rustC = mix(wLin(vec3(0.24, 0.1, 0.05)), wLin(vec3(0.56, 0.26, 0.1)), smoothstep(0.2, 0.8, fine * 0.6 + mid * 0.4));
    c = mix(c, rustC, rust);
    // Rust bleeding down from the patches.
    float streak = smoothstep(0.72, 0.8, rustAmt + (1.0 - wNoise(vec3(P.x * 14.0, P.y * 1.2, P.z * 14.0))) * 0.12) * (1.0 - rust) * 0.35 * wear;
    c = mix(c, rustC * 0.8, streak);
    rough = max(rust, chip * 0.5);
  }
  // Dried mud splashed up from the ground: solid at the bottom, flecks higher up.
  float mudAmt = low * (0.55 + 0.65 * mid) + fine * 0.12 * low;
  float mud = smoothstep(0.5, 0.72, mudAmt) * uWeather.z;
  float fleck = smoothstep(0.86, 0.9, fine * 0.7 + mid * 0.3) * (1.0 - smoothstep(uGround + 0.6, uGround + 1.8, P.y)) * uWeather.z;
  vec3 mudC = mix(wLin(vec3(0.33, 0.27, 0.2)), wLin(vec3(0.52, 0.45, 0.35)), fine);
  c = mix(c, mudC, max(mud * 0.9, fleck * 0.8));
  diffuseColor.rgb = c;
  wRough = max(rough, max(mud, fleck));
}
`;

// Replace a model's materials with weathered copies (once per loaded model; clones share them).
// `name` is the model file name, e.g. "excavator_rusty".
export function weatherModel(scene, name) {
  const [type, tier] = name.split('_');
  const tierName = TIERS[tier] ? tier : type === 'vehicle' ? 'rusty' : null;
  if (!tierName) return;
  const ground = GROUND[type] ?? 0;
  scene.updateMatrixWorld(true);
  const made = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    let any = false;
    const next = mats.map((m) => {
      const r = materialRole(m.name);
      if (!r) return m;
      any = true;
      if (!made.has(m)) made.set(m, weathered(m, r.role, (r.baked ? BAKED_TIERS : TIERS)[tierName], ground));
      return made.get(m);
    });
    if (!any) return;
    o.material = Array.isArray(o.material) ? next : next[0];
    bakeRest(o);
  });
}

// Each vertex's position in the model's rest pose, so patterns run continuously across parts.
function bakeRest(mesh) {
  const g = mesh.geometry;
  if (g.attributes.aRest) mesh.geometry = g.clone(); // (shared geometry: each mesh bakes its own)
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const e = mesh.matrixWorld.elements;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    out[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  geo.setAttribute('aRest', new BufferAttribute(out, 3));
}

function weathered(src, role, tier, ground) {
  const m = src.clone();
  const k = ROLE_SCALE[role];
  const u = {
    uWeather: { value: [tier.wear * k.wear, tier.fade * k.fade, tier.mud * k.mud] },
    uGround: { value: ground },
    uRole: { value: role === 'body' ? 0 : role === 'dark' ? 1 : 2 },
  };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWeather = { value: u.uWeather.value };
    shader.uniforms.uGround = u.uGround;
    shader.uniforms.uRole = u.uRole;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRest;\nvarying vec3 vRest;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('void main() {', 'void main() {\n  float wRough = 0.0;')
      .replace('#include <color_fragment>', FRAGMENT)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, wRough);');
  };
  m.customProgramCacheKey = () => 'weathered';
  m.userData.weather = u;
  return m;
}
