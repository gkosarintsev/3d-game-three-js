import * as THREE from 'three';

/**
 * Делает материал травяным: процедурный шейдерный рисунок травы/дерна
 * (дешёвый value/hash-noise в фрагментном шейдере, без текстур и доп.
 * проходов), чтобы зелёные холмы выглядели травянистыми. Шейдер
 * навешивается на MeshStandardMaterial и не меняет геометрию/освещение.
 *
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ scale?: number, strength?: number, dark?: number, slopeFade?: boolean }} [opts]
 * @returns {THREE.MeshStandardMaterial}
 */
export function applyGrass(material, opts = {}) {
  const scale = opts.scale ?? 0.45;
  const strength = opts.strength ?? 0.22;
  const dark = opts.dark ?? 0.18;
  const slopeFade = !!opts.slopeFade;
  material.userData = material.userData || {};
  material.userData.grass = { scale, strength, dark, slopeFade };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassScale = { value: scale };
    shader.uniforms.uGrassStrength = { value: strength };
    shader.uniforms.uGrassDark = { value: dark };
    shader.uniforms.uGrassSlope = { value: slopeFade ? 1.0 : 0.0 };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGrassWorldPos;
varying vec3 vGrassWorldNormal;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vGrassWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vGrassWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGrassWorldPos;
varying vec3 vGrassWorldNormal;
uniform float uGrassScale;
uniform float uGrassStrength;
uniform float uGrassDark;
uniform float uGrassSlope;

float grassHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float grassNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = grassHash(i);
  float b = grassHash(i + vec2(1.0, 0.0));
  float c = grassHash(i + vec2(0.0, 1.0));
  float d = grassHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  // Те же 3 выборки шума, что и раньше: цена по ALU/текстурам не растёт (текстур нет).
  // Вместо одного множителя яркости — цветовые пятна (свежая/густая/подсохшая трава)
  // и тонкая высокочастотная неровность, чтобы дерн читался правдоподобнее.
  vec2 gp = vGrassWorldPos.xz * uGrassScale;
  float n1 = grassNoise(gp);                 // мелкая неровность
  float n2 = grassNoise(gp * 2.7 + 19.3);    // «травинки»/зерно
  float clump = grassNoise(gp * 0.18 + 7.1); // крупные пятна (лужайка неоднородна)
  float blades = smoothstep(0.42, 0.9, n2) * 0.55 + n1 * 0.45;

  float lightK = mix(1.0 - uGrassDark, 1.0 + uGrassStrength, blades);
  lightK *= mix(0.93, 1.07, clump);
  float mask = 1.0;
  if (uGrassSlope > 0.5) {
    float up = clamp(vGrassWorldNormal.y, 0.0, 1.0);
    mask = smoothstep(0.25, 0.85, up); // на крутых откосах — меньше травяного рисунка
    lightK = mix(1.0, lightK, mask);
  }

  // Три оттенка в пределах «зелёного», без смены базового цвета материала.
  vec3 lush  = vec3(0.90, 1.06, 0.88); // гуще/свежее
  vec3 dry   = vec3(1.05, 1.02, 0.82); // чуть подсохшее
  vec3 deep  = vec3(0.92, 0.98, 0.90); // тень/влага
  vec3 tint = mix(deep, lush, smoothstep(0.25, 0.75, blades));
  tint = mix(tint, dry, smoothstep(0.58, 0.92, clump) * 0.35);
  // Лёгкий цветовой микроконтраст (дёшево, переиспользует те же шумы).
  tint *= mix(0.985, 1.015, n1);
  tint = mix(vec3(1.0), tint, mask);

  diffuseColor.rgb *= tint * lightK;
}`
      );
  };
  material.needsUpdate = true;
  return material;
}

/** Создаёт MeshStandardMaterial с травяным шейдером. */
export function makeGrassMaterial(color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.95,
    metalness: opts.metalness ?? 0.0,
  });
  return applyGrass(mat, opts);
}
