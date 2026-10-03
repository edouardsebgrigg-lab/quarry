import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { wornTarmac, groundWeather } from './groundMaterial.js';

// What three.js hands onBeforeCompile for a standard material: its shader source, before the
// includes are expanded (the additions hook onto the include lines).
function shaderFor(material) {
  const lib = THREE.ShaderLib.physical;
  const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(shader);
  return shader;
}

describe('worn tarmac on the roads', () => {
  it("hooks into three.js's own shader at every point it changes", () => {
    const before = THREE.ShaderLib.physical.fragmentShader;
    const shader = shaderFor(wornTarmac(new THREE.MeshStandardMaterial(), 3.2));
    const f = shader.fragmentShader;
    expect(f).not.toBe(before);
    expect(f).toContain('uniform float uHalfWidth;');
    expect(f).toContain('float tPath = 0.0, tPuddle = 0.0, tGrit = 0.0;');
    expect(f).toContain('tPath = 1.0 - smoothstep'); // (the wheel paths, after the texture)
    expect(f).toContain('roughnessFactor = mix(roughnessFactor, 0.14, tPuddle);');
    expect(f).toContain('material.specularF90 = mix(material.specularF90, 0.7');
    expect(f).toContain('radiance = mix(radiance'); // (grey reflections in the rain)
    // (each include it replaces is kept, once)
    for (const inc of ['map_fragment', 'roughnessmap_fragment', 'lights_physical_fragment', 'lights_fragment_maps']) {
      expect(f.split(`#include <${inc}>`)).toHaveLength(2);
    }
  });

  it('gets wet with the rest of the ground, and knows its own width', () => {
    const a = shaderFor(wornTarmac(new THREE.MeshStandardMaterial(), 3.2));
    const b = shaderFor(wornTarmac(new THREE.MeshStandardMaterial(), 3));
    expect(a.uniforms.uWet).toBe(groundWeather.wet);
    expect(a.uniforms.uHalfWidth.value).toBe(3.2);
    expect(b.uniforms.uHalfWidth.value).toBe(3);
  });
});
