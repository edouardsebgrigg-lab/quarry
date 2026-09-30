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
export const groundWeather = { wet: { value: 0 } };
const WET = `
  material.roughness = mix(material.roughness, 0.42, uWet);
  material.specularColor *= 1.0 + uWet * 1.4;
  material.specularF90 = mix(material.specularF90, 0.75, uWet);`;

// For other rough outdoor materials (road, driveway): same low sheen as the ground.
export function dampSheen(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>${DAMP_SHEEN}`);
  };
  material.customProgramCacheKey = () => 'damp-sheen';
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

export function createGroundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, envMapIntensity: 0.7 });
  const uniforms = {};
  for (const name of LAYERS) {
    uniforms[`t_${name}A`] = { value: textures[`${name}A`] ?? placeholder([140, 128, 110, 255]) };
    uniforms[`t_${name}N`] = { value: textures[`${name}N`] ?? placeholder([128, 128, 128, 255]) };
  }
  uniforms.t_macro = { value: textures.macro ?? placeholder([128, 128, 128, 255]) };

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

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vSplat;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        ${LAYERS.map((n) => `uniform sampler2D t_${n}A; uniform sampler2D t_${n}N;`).join('\n')}
        uniform sampler2D t_macro;

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

        if (w.x > 0.01) {
          gA = tileless(t_grassA, top / ${TILE.grass.toFixed(1)}, mac2.r);
          gA.rgb *= mix(vec3(1.05, 1.0, 0.72), vec3(1.3, 1.12, 0.66), smoothstep(0.3, 0.7, mac.b)); // warmer, drier in patches
          gN = decodeN(tileless(t_grassN, top / ${TILE.grass.toFixed(1)}, mac2.r));
        }
        if (w.y > 0.01) {
          dA = tileless(t_dirtA, top / ${TILE.dirt.toFixed(1)}, mac2.g);
          dN = decodeN(tileless(t_dirtN, top / ${TILE.dirt.toFixed(1)}, mac2.g));
        }
        if (w.z > 0.01) {
          vA = tileless(t_gravelA, top / ${TILE.gravel.toFixed(1)}, mac2.b);
          vA.rgb *= vec3(0.84, 0.82, 0.78);
          vN = decodeN(tileless(t_gravelN, top / ${TILE.gravel.toFixed(1)}, mac2.b));
        }
        // Rock: projected from the sides (x and z), blended by which way the wall faces.
        vec3 rockWN = wn;
        if (w.w > 0.01) {
          vec2 bw = pow(abs(wn.xz), vec2(4.0));
          bw /= max(bw.x + bw.y, 1e-4);
          vec2 uvX = vec2(vWPos.z, vWPos.y) / ${TILE.rock.toFixed(1)};
          vec2 uvZ = vec2(vWPos.x, vWPos.y) / ${TILE.rock.toFixed(1)};
          vec4 aX = texture2D(t_rockA, uvX);
          vec4 aZ = texture2D(t_rockA, uvZ);
          vec3 nX = decodeN(texture2D(t_rockN, uvX));
          vec3 nZ = decodeN(texture2D(t_rockN, uvZ));
          rA = aX * bw.x + aZ * bw.y;
          rN = vec3(0.0, 0.0, nX.z * bw.x + nZ.z * bw.y);
          vec3 wX = vec3(wn.x, wn.y + nX.y, wn.z + nX.x);
          vec3 wZ = vec3(wn.x + nZ.x, wn.y + nZ.y, wn.z);
          rockWN = normalize(wX * bw.x + wZ * bw.y);
        }

        // Height blend: whichever surface sticks up more wins at the boundary.
        vec4 h = vec4(gN.z, dN.z, vN.z, rN.z) * 0.6 + w;
        float hmax = max(max(h.x, h.y), max(h.z, h.w));
        vec4 b = max(h - (hmax - 0.18), 0.0) * step(0.001, w);
        b /= max(b.x + b.y + b.z + b.w, 1e-4);

        vec4 albedo = gA * b.x + dA * b.y + vA * b.z + rA * b.w;
        // Large-scale colour and brightness variation.
        albedo.rgb *= mix(0.86, 1.1, mac.r) * mix(vec3(1.0), vec3(1.04, 1.0, 0.94), mac.g);
        diffuseColor *= vec4(albedo.rgb, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.68, uWet);

        vec2 topSlope = gN.xy * b.x + dN.xy * b.y + vN.xy * b.z;
        vec3 topWN = normalize(vec3(wn.x + topSlope.x, wn.y, wn.z + topSlope.y));
        vec3 groundWN = normalize(topWN * (1.0 - b.w) + rockWN * b.w);
      `)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>${DAMP_SHEEN}${WET}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(groundWN, 0.0)).xyz);
      `);
  };
  mat.customProgramCacheKey = () => 'quarry-ground-v2';
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
