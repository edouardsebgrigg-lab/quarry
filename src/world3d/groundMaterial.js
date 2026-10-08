// The terrain material: four real ground surfaces (grass, dirt, gravel, rock) made in Blender
// (blender/ground.py) and blended per vertex by a `splat` attribute.
//  - Flat surfaces are projected from above; rock is projected from the sides onto pit walls.
//  - Surfaces blend by height, so pebbles poke through dirt instead of a soft cross-fade.
//  - A large noise texture varies scale and colour, so the tiling doesn't show.
// Vertex colours tint the result (rock strata, darker depths).
import * as THREE from 'three';

const DIR = 'textures/ground/';
const LAYERS = ['grass', 'dirt', 'gravel', 'rock'];
// Metres covered by one repeat of each texture (matches the tile size in ground.py).
const TILE = { grass: 2, dirt: 3, gravel: 2, rock: 4 };

const textures = {};

// Dry soil, grass and old tarmac barely mirror the sky, even at low angles.
const DAMP_SHEEN = `
  material.specularColor *= 0.5;
  material.specularF90 = 0.25;`;

// How wet the ground is (0 dry .. 1 soaked), shared by every ground material: wet soil is darker
// and shinier. The world eases it up when it rains and down again after.
export const groundWeather = { wet: { value: 0 }, water: { value: 0 } };
// (`water`: metres of rainwater standing in the field's hollows, rising while it rains and
// draining away slowly after; how high it can get in each one comes from src/ground/basins.js)
// (Grass doesn't pool water, so it only gets a little of the sheen: b.x is the grass share.)
const WET = `
  float wetK = uWet * (1.0 - 0.8 * b.x);
  material.roughness = mix(material.roughness, 0.42, wetK);
  material.specularColor *= 1.0 + wetK * 1.4;
  material.specularF90 = mix(material.specularF90, 0.75, wetK);`;

// For other rough outdoor materials (road, driveway): same low sheen as the ground.
export function dampSheen(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>${DAMP_SHEEN}`);
  };
  material.customProgramCacheKey = () => 'damp-sheen';
  return material;
}

// Old country tarmac (the roads; `halfWidth` in metres, the uv across the road runs 0..halfWidth
// and along it in half metres, as countryside.js lays it). One 2 m texture repeated down a lane
// reads as a printed pattern, so on top of it:
//  - the wheel paths, two to a lane, polished darker and smoother by tyres, wandering a little;
//  - grit and dust between them, along the crown and at the edges, where soil creeps on;
//  - square-cut repairs in newer, darker tarmac here and there;
//  - a broad drift in colour so the repeat doesn't show;
//  - in the rain it darkens and shines, and water stands in the wheel paths.
const TARMAC_PARS = /* glsl */ `
uniform float uWet;
uniform float uHalfWidth;
float tHash(vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794) + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * (p.x + p.y));
}
float tNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;
const TARMAC_COLOR = /* glsl */ `
#include <map_fragment>
{
  vec2 m = vMapUv * 2.0; // metres: across from one edge, along the road
  float W = uHalfWidth * 2.0;
  float laneW = W * 0.5;
  // (the wheel paths wander across the lane over tens of metres)
  float u = mod(m.x, laneW) + (tNoise(vec2(m.y * 0.04, floor(m.x / laneW) * 7.0)) - 0.5) * 0.35;
  float d = min(abs(u - (laneW * 0.5 - 0.85)), abs(u - (laneW * 0.5 + 0.85)));
  tPath = 1.0 - smoothstep(0.16, 0.48, d);
  float edge = min(m.x, W - m.x);
  float ragged = tNoise(m * vec2(1.7, 0.9));
  float verge = 1.0 - smoothstep(0.05, 0.35 + 0.55 * ragged, edge);
  float crown = (1.0 - smoothstep(0.1, 0.45, abs(m.x - laneW))) * (1.0 - tPath);
  // Repairs: cut squares a couple of metres long, in a few of the cells along each lane.
  vec2 cell = vec2(floor(m.x / laneW), floor(m.y / 4.5));
  float h = tHash(cell + 11.3);
  vec2 inCell = vec2(mod(m.x, laneW) / laneW, fract(m.y / 4.5));
  vec2 lo = vec2(0.1 + 0.3 * tHash(cell + 3.1), 0.05 + 0.3 * tHash(cell + 5.7));
  vec2 hi = lo + vec2(0.35 + 0.35 * tHash(cell + 8.9), 0.4 + 0.5 * tHash(cell + 1.9));
  float patchArea = step(h, 0.045) * step(lo.x, inCell.x) * step(inCell.x, hi.x) * step(lo.y, inCell.y) * step(inCell.y, hi.y);
  // (a repair's cut edge is sealed with a band of bitumen a few centimetres wide)
  vec2 inside = min(inCell - lo, hi - inCell) * vec2(laneW, 4.5);
  float seam = patchArea * (1.0 - smoothstep(0.02, 0.05, min(inside.x, inside.y)));
  // Less speckle from the texture where it's polished, and a little everywhere.
  vec3 evenTone = diffuse * textureLod(map, vMapUv, 12.0).rgb;
  diffuseColor.rgb = mix(diffuseColor.rgb, evenTone, 0.3 + 0.35 * tPath + 0.1 * patchArea);
  float drift = 0.9 + 0.18 * tNoise(m * 0.035) + 0.06 * tNoise(m * 0.21 + 4.0);
  diffuseColor.rgb *= drift * mix(1.0, 0.8, tPath) * mix(1.0, 1.08, crown) * mix(1.0, 0.9, patchArea) * mix(1.0, 0.75, seam);
  tGrit -= seam; // (the seam is smooth: see the roughness below)
  // Soil and grit at the edges.
  vec3 soil = vec3(0.115, 0.095, 0.07);
  diffuseColor.rgb = mix(diffuseColor.rgb, soil, verge * (0.45 + 0.4 * ragged) * (1.0 - patchArea));
  // Water: everything darker, and standing in the wheel paths when it's really wet.
  tPuddle = uWet * tPath * smoothstep(0.55, 0.8, tNoise(m * vec2(0.9, 0.35) + 2.0) + uWet * 0.2);
  diffuseColor.rgb *= mix(1.0, 0.62, uWet) * mix(1.0, 0.8, tPuddle);
  tGrit += max(crown, verge);
}
`;
const TARMAC_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.74, tPath * 0.7);
roughnessFactor = mix(roughnessFactor, 0.97, clamp(tGrit, 0.0, 1.0) * 0.6);
roughnessFactor = mix(roughnessFactor, 0.78, clamp(-tGrit, 0.0, 1.0)); // (the sealed seam)
roughnessFactor = mix(roughnessFactor, 0.45, uWet * 0.85);
roughnessFactor = mix(roughnessFactor, 0.14, tPuddle);
`;
const TARMAC_SHEEN = /* glsl */ `
#include <lights_physical_fragment>
${DAMP_SHEEN}
material.specularColor *= 1.0 + uWet;
material.specularF90 = mix(material.specularF90, 0.7, max(uWet * 0.7, tPuddle));`;
// The sky reflected in the wet road: the environment map is a clear sky, but it only rains under
// cloud, so as the road gets wet its reflections go grey and dim.
const TARMAC_REFLECT = /* glsl */ `
#include <lights_fragment_maps>
#if defined( RE_IndirectSpecular )
radiance = mix(radiance, vec3(dot(radiance, vec3(0.3, 0.59, 0.11))) * 0.7, uWet);
#endif`;

export function wornTarmac(material, halfWidth) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = groundWeather.wet;
    shader.uniforms.uHalfWidth = { value: halfWidth };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TARMAC_PARS}`)
      .replace('void main() {', 'void main() {\n  float tPath = 0.0, tPuddle = 0.0, tGrit = 0.0;')
      .replace('#include <map_fragment>', TARMAC_COLOR)
      .replace('#include <roughnessmap_fragment>', TARMAC_ROUGH)
      .replace('#include <lights_physical_fragment>', TARMAC_SHEEN)
      .replace('#include <lights_fragment_maps>', TARMAC_REFLECT);
  };
  material.customProgramCacheKey = () => 'worn-tarmac';
  return material;
}

function placeholder(color) {
  const t = new THREE.DataTexture(new Uint8Array(color), 1, 1);
  t.needsUpdate = true;
  return t;
}

export async function preloadGround(renderer) {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = async (file, srgb, fallback) => {
    try {
      const t = await loader.loadAsync(DIR + file);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    } catch {
      return placeholder(fallback);
    }
  };
  const jobs = [];
  for (const name of LAYERS) {
    jobs.push(load(`${name}_albedo.jpg`, true, [140, 128, 110, 255]).then((t) => { textures[`${name}A`] = t; }));
    jobs.push(load(`${name}_normal.jpg`, false, [128, 128, 128, 255]).then((t) => { textures[`${name}N`] = t; }));
  }
  jobs.push(load('macro.jpg', false, [128, 128, 128, 255]).then((t) => { textures.macro = t; }));
  await Promise.all(jobs);
}

// `fields`: farmland beyond the map (the far strips and hills): a patchwork of fields in
// different crops with dark hedge lines between them, the way English hills look from afar.
// `water` (the field: strata on) is { texture, xform }: a texture of each cell's hollow floor and
// spill level (red, green) and where it lies (x0, z0, 1 / width, 1 / depth).
export function createGroundMaterial({ fields = false, strata = false, water = null } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, envMapIntensity: 0.7 });
  if (fields) mat.defines = { ...mat.defines, FIELDS: '' };
  if (strata) mat.defines = { ...mat.defines, STRATA: '' };
  const uniforms = {};
  for (const name of LAYERS) {
    uniforms[`t_${name}A`] = { value: textures[`${name}A`] ?? placeholder([140, 128, 110, 255]) };
    uniforms[`t_${name}N`] = { value: textures[`${name}N`] ?? placeholder([128, 128, 128, 255]) };
  }
  uniforms.t_macro = { value: textures.macro ?? placeholder([128, 128, 128, 255]) };
  if (strata) {
    uniforms.t_water = { value: water?.texture ?? placeholder([0, 0, 0, 255]) };
    uniforms.uWaterXform = { value: water?.xform ?? new THREE.Vector4(0, 0, 1, 1) };
    uniforms.uWaterDepth = groundWeather.water;
  }

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uWet = groundWeather.wet;
    shader.fragmentShader = `uniform float uWet;\n${shader.fragmentShader}`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splat;
        varying vec4 vSplat;
        varying vec3 vWPos;
        varying vec3 vWNormal;`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vSplat = splat;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    if (strata) shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 strataHeights;
        attribute float strataBed;
        attribute float naturalFace;
        varying vec4 vStrataHeights;
        varying float vStrataBed;
        varying float vNaturalFace;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vStrataHeights = strataHeights;
        vStrataBed = strataBed;
        vNaturalFace = naturalFace;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vSplat;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        #ifdef STRATA
        varying vec4 vStrataHeights;
        varying float vStrataBed;
        varying float vNaturalFace;
        #endif
        ${LAYERS.map((n) => `uniform sampler2D t_${n}A; uniform sampler2D t_${n}N;`).join('\n')}
        uniform sampler2D t_macro;
        #ifdef STRATA
        uniform sampler2D t_water;
        uniform vec4 uWaterXform;
        uniform float uWaterDepth;
        #endif

        // Two samples at different scales and angles, mixed by a large noise field,
        // so a repeating texture doesn't show a grid pattern.
        const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
        vec4 tileless(sampler2D t, vec2 uv, float m) {
          vec4 a = texture2D(t, uv);
          vec4 b = texture2D(t, ROT * uv * 0.73 + vec2(0.37, 0.61));
          return mix(a, b, smoothstep(0.38, 0.62, m));
        }
        vec3 decodeN(vec4 s) { return vec3(s.rg * 2.0 - 1.0, s.b); } // xy slope, z = height
      `)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWNormal);
        vec3 mac = texture2D(t_macro, vWPos.xz / 71.0).rgb;
        vec3 mac2 = texture2D(t_macro, vWPos.xz / 13.0 + 0.5).rgb;
        vec2 top = vWPos.xz;

        vec4 gA = vec4(0.0), dA = vec4(0.0), vA = vec4(0.0), rA = vec4(0.0);
        vec3 gN = vec3(0.0, 0.0, 0.5), dN = gN, vN = gN, rN = gN;
        vec4 w = vSplat;
        vec3 faceTint = vec3(1.0);
        float faceAmount = 0.0;
        #ifdef STRATA
        {
          faceAmount = smoothstep(0.14, 0.45, 1.0 - abs(wn.y)) * vNaturalFace;
          vec4 faceW;
          // Original material contacts are interpolated across the triangle; the
          // fragment's world height picks the exposed stratum within the pit face.
          if (vWPos.y < vStrataBed + 0.01) { faceW = vec4(0.0, 0.0, 0.1, 0.9); faceTint = vec3(0.92, 0.9, 0.86); }
          else if (vWPos.y < vStrataHeights.x) { faceW = vec4(0.0, 0.1, 0.9, 0.0); faceTint = vec3(1.0, 0.98, 0.94); }
          else if (vWPos.y < vStrataHeights.y) { faceW = vec4(0.0, 0.92, 0.08, 0.0); faceTint = vec3(1.42, 1.25, 0.92); }
          else if (vWPos.y < vStrataHeights.z) { faceW = vec4(0.0, 1.0, 0.0, 0.0); faceTint = vec3(1.08, 0.8, 0.6); }
          else { faceW = vec4(0.0, 1.0, 0.0, 0.0); faceTint = vec3(0.8, 0.72, 0.62); }
          w = mix(w, faceW, faceAmount);
        }
        #endif
        // Side projection also applies to soil/gravel: steep cuts retain readable
        // texture grain instead of stretching a top-down texture vertically.
        vec2 sideX = vec2(vWPos.z, vWPos.y), sideZ = vec2(vWPos.x, vWPos.y);
        float sideBlend = pow(abs(wn.x), 4.0) / max(pow(abs(wn.x), 4.0) + pow(abs(wn.z), 4.0), 0.0001);
        float wall = smoothstep(0.14, 0.55, 1.0 - abs(wn.y));

        if (w.x > 0.01) {
          gA = tileless(t_grassA, top / ${TILE.grass.toFixed(1)}, mac2.r);
          gA.rgb *= mix(vec3(1.05, 1.0, 0.72), vec3(1.3, 1.12, 0.66), smoothstep(0.3, 0.7, mac.b)); // warmer, drier in patches
          gN = decodeN(tileless(t_grassN, top / ${TILE.grass.toFixed(1)}, mac2.r));
        }
        if (w.y > 0.01) {
          dA = tileless(t_dirtA, top / ${TILE.dirt.toFixed(1)}, mac2.g);
          vec4 dSide = mix(tileless(t_dirtA, sideZ / ${TILE.dirt.toFixed(1)}, mac2.g), tileless(t_dirtA, sideX / ${TILE.dirt.toFixed(1)}, mac2.g), sideBlend);
          dA = mix(dA, dSide, wall);
          dN = decodeN(tileless(t_dirtN, top / ${TILE.dirt.toFixed(1)}, mac2.g));
        }
        if (w.z > 0.01) {
          vA = tileless(t_gravelA, top / ${TILE.gravel.toFixed(1)}, mac2.b);
          vec4 vSide = mix(tileless(t_gravelA, sideZ / ${TILE.gravel.toFixed(1)}, mac2.b), tileless(t_gravelA, sideX / ${TILE.gravel.toFixed(1)}, mac2.b), sideBlend);
          vA = mix(vA, vSide, wall);
          vA.rgb *= vec3(0.84, 0.82, 0.78);
          vN = decodeN(tileless(t_gravelN, top / ${TILE.gravel.toFixed(1)}, mac2.b));
        }
        // Rock: projected from the sides (x and z), blended by which way the wall faces.
        vec3 rockWN = wn;
        if (w.w > 0.01) {
          vec2 bw = pow(abs(wn.xz), vec2(4.0));
          bw = bw.x + bw.y < 1e-4 ? vec2(0.5) : bw / (bw.x + bw.y);
          float rockTop = pow(abs(wn.y), 4.0);
          vec2 uvX = vec2(vWPos.z, vWPos.y) / ${TILE.rock.toFixed(1)};
          vec2 uvZ = vec2(vWPos.x, vWPos.y) / ${TILE.rock.toFixed(1)};
          vec4 aX = texture2D(t_rockA, uvX);
          vec4 aZ = texture2D(t_rockA, uvZ);
          vec3 nX = decodeN(texture2D(t_rockN, uvX));
          vec3 nZ = decodeN(texture2D(t_rockN, uvZ));
          vec3 nTop = decodeN(tileless(t_rockN, top / ${TILE.rock.toFixed(1)}, mac2.r));
          rA = mix(aX * bw.x + aZ * bw.y, tileless(t_rockA, top / ${TILE.rock.toFixed(1)}, mac2.r), rockTop);
          rN = vec3(0.0, 0.0, mix(nX.z * bw.x + nZ.z * bw.y, nTop.z, rockTop));
          vec3 wX = vec3(wn.x, wn.y + nX.y, wn.z + nX.x);
          vec3 wZ = vec3(wn.x + nZ.x, wn.y + nZ.y, wn.z);
          rockWN = normalize(mix(wX * bw.x + wZ * bw.y, vec3(wn.x + nTop.x, wn.y, wn.z + nTop.y), rockTop));
        }

        // Height blend: whichever surface sticks up more wins at the boundary.
        vec4 h = vec4(gN.z, dN.z, vN.z, rN.z) * 0.6 + w;
        float hmax = max(max(h.x, h.y), max(h.z, h.w));
        vec4 b = max(h - (hmax - 0.18), 0.0) * step(0.001, w);
        b /= max(b.x + b.y + b.z + b.w, 1e-4);

        vec4 albedo = gA * b.x + dA * b.y + vA * b.z + rA * b.w;
        #if defined(STRATA) && defined(USE_COLOR)
        albedo.rgb *= mix(vec3(1.0), faceTint / max(vColor.rgb, vec3(0.1)), faceAmount);
        #endif
        // Large-scale colour and brightness variation.
        albedo.rgb *= mix(0.86, 1.1, mac.r) * mix(vec3(1.0), vec3(1.04, 1.0, 0.94), mac.g);
        #ifdef FIELDS
        {
          // Fields about 260 m across with wobbly edges; each one grass, barley, a darker
          // pasture, oilseed or plough; a hedge (about 6 m of dark green) along every edge.
          vec2 fp = vWPos.xz / 260.0 + vec2(sin(vWPos.z / 310.0), cos(vWPos.x / 290.0)) * 0.35;
          vec2 cell = floor(fp);
          vec2 f = fract(fp);
          float fh = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
          vec3 crop = fh < 0.42 ? vec3(1.0) : fh < 0.6 ? vec3(1.14, 1.08, 0.7) : fh < 0.76 ? vec3(0.84, 0.98, 0.78)
            : fh < 0.86 ? vec3(1.28, 1.12, 0.55) : vec3(0.8, 0.66, 0.5);
          albedo.rgb *= crop;
          float edgeM = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 260.0;
          float aa = fwidth(edgeM) + 0.5;
          float hedgeLine = 1.0 - smoothstep(3.0 - aa, 3.0 + aa, edgeM);
          albedo.rgb = mix(albedo.rgb, vec3(0.035, 0.06, 0.025), hedgeLine * 0.9);
        }
        #endif
        diffuseColor *= vec4(albedo.rgb, 1.0);
        diffuseColor.rgb *= mix(1.0, mix(0.68, 0.84, b.x), uWet);
        // Rainwater standing in a hollow: wet mud at its margin, then still, murky water, as
        // deep as the rain has filled it and never above where it would spill out.
        float waterAmt = 0.0;
        #ifdef STRATA
        {
          vec2 fs = texture2D(t_water, (vWPos.xz - uWaterXform.xy) * uWaterXform.zw).rg;
          float level = min(fs.y, fs.x + uWaterDepth);
          float wd = level - vWPos.y;
          if (fs.y - fs.x > 0.02 && uWaterDepth > 0.002 && wd > -0.03) {
            diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(-0.03, 0.0, wd) * step(wd, 0.0); // (the damp rim)
            waterAmt = smoothstep(0.0, 0.03, wd);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.55, vec3(0.06, 0.058, 0.045), smoothstep(0.03, 0.4, wd)), waterAmt);
          }
        }
        #endif

        vec2 topSlope = gN.xy * b.x + dN.xy * b.y + vN.xy * b.z;
        vec3 topWN = normalize(vec3(wn.x + topSlope.x, wn.y, wn.z + topSlope.y));
        vec3 groundWN = normalize(topWN * (1.0 - b.w) + rockWN * b.w);
      `)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>${DAMP_SHEEN}${WET}
        material.roughness = mix(material.roughness, 0.04, waterAmt);
        material.specularF90 = mix(material.specularF90, 1.0, waterAmt);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(mix(groundWN, vec3(0.0, 1.0, 0.0), waterAmt), 0.0)).xyz);
      `);
  };
  mat.customProgramCacheKey = () => `quarry-ground-v4${fields ? '-fields' : ''}${strata ? '-strata' : ''}`;
  return mat;
}

// Give any geometry the attributes the ground material needs: one surface mix and tint
// for every vertex (e.g. [1, 0, 0, 0] = all grass).
export function paintGround(geometry, splat = [1, 0, 0, 0], tint = [1, 1, 1]) {
  const n = geometry.attributes.position.count;
  const s = new Float32Array(n * 4);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    s.set(splat, i * 4);
    c.set(tint, i * 3);
  }
  geometry.setAttribute('splat', new THREE.BufferAttribute(s, 4));
  geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geometry;
}
