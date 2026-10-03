import {
  AdditiveBlending,
  Color,
  DoubleSide,
  NormalBlending,
  ShaderMaterial,
} from "three";

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
`;

const UV_VERTEX = `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const OUTPUT = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

export function auroraMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: UV_VERTEX,
    fragmentShader: `
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
${NOISE}
float ribbon(vec2 uv, float base, float t, float seed) {
  float center = base + 0.06 * sin(uv.x * 5.0 + t * 2.0 + seed * 9.0)
    + 0.09 * (fbm(vec2(uv.x * 2.2 + t * 0.6, seed * 7.0)) - 0.5);
  float d = uv.y - center;
  float body = smoothstep(-0.01, 0.015, d) * exp(-max(d, 0.0) * 7.0);
  float streaks = 0.45 + 0.55 * fbm(vec2(uv.x * 46.0 + seed * 3.0, t * 0.8));
  return body * streaks;
}
void main() {
  vec2 uv = vec2(vWorld.x / 160.0, vUv.y);
  vec3 low = vec3(0.05, 0.16, 0.24);
  vec3 mid = vec3(0.012, 0.045, 0.11);
  vec3 top = vec3(0.004, 0.008, 0.03);
  vec3 col = mix(low, mid, smoothstep(0.05, 0.5, uv.y));
  col = mix(col, top, smoothstep(0.5, 1.0, uv.y));
  float t = uTime * 0.05;
  col += vec3(0.05, 0.9, 0.45) * ribbon(uv, 0.52, t, 0.3) * 0.5;
  col += vec3(0.2, 0.5, 1.0) * ribbon(uv, 0.64, t * 1.3, 1.7) * 0.32;
  col += vec3(0.6, 0.25, 0.9) * ribbon(uv, 0.74, t * 0.8, 2.9) * 0.16;
  vec2 cell = floor(vWorld.xy * 2.2);
  float star = step(0.9975, hash(cell));
  float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 7.0) * 40.0);
  col += vec3(star * twinkle * smoothstep(0.45, 0.95, uv.y) * 0.9);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT}
}
`,
    depthWrite: false,
  });
}

export function waterMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new Color(0x031a2a) },
      uShallow: { value: new Color(0x0d6a86) },
    },
    vertexShader: `
uniform float uTime;
varying vec3 vWorld;
varying float vWave;
void main() {
  vec3 p = position;
  vec4 world = modelMatrix * vec4(p, 1.0);
  float wave = sin(world.x * 0.55 + uTime * 1.3) * 0.12
    + sin(world.x * 1.7 - uTime * 1.9 + world.z * 0.8) * 0.05
    + sin(world.z * 0.9 + uTime * 0.7) * 0.06;
  world.y += wave;
  vWave = wave;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`,
    fragmentShader: `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
varying vec3 vWorld;
varying float vWave;
${NOISE}
void main() {
  float depthFade = smoothstep(-30.0, 30.0, vWorld.z);
  vec3 col = mix(uDeep, uShallow, depthFade * 0.7 + vWave * 1.5);
  float foamNoise = fbm(vec2(vWorld.x * 0.22 + uTime * 0.12, vWorld.z * 0.35 - uTime * 0.08));
  float foam = smoothstep(0.66, 0.86, foamNoise + vWave * 1.2);
  float edge = exp(-abs(vWorld.z - 4.0) * 0.9) * (0.45 + 0.55 * noise(vec2(vWorld.x * 1.6 - uTime * 0.6, uTime * 0.3)));
  col += vec3(0.75, 0.92, 1.0) * (foam * 0.55 + edge * 0.5);
  float glint = pow(max(noise(vec2(vWorld.x * 1.2 + uTime * 0.5, vWorld.z * 1.4)), 0.0), 18.0);
  col += vec3(0.6, 0.9, 1.0) * glint * 0.7;
  gl_FragColor = vec4(col, 0.94);
  ${OUTPUT}
}
`,
    transparent: true,
  });
}

export function portalMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: UV_VERTEX,
    fragmentShader: `
uniform float uTime;
uniform float uFlash;
varying vec2 vUv;
${NOISE}
void main() {
  float dx = abs(vUv.x - 0.5) * 2.0;
  float core = exp(-dx * 9.0);
  float haze = exp(-dx * 2.6);
  float flow = fbm(vec2(vUv.x * 5.0, vUv.y * 4.0 - uTime * 0.9));
  float streak = smoothstep(0.55, 0.9, fbm(vec2(vUv.x * 18.0, vUv.y * 1.5 - uTime * 1.6)));
  float fade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
  float intensity = (core * 1.6 + haze * (0.35 + 0.65 * flow) + streak * haze * 0.9) * fade;
  intensity *= 1.0 + uFlash * 2.5;
  vec3 col = mix(vec3(0.1, 0.95, 0.45), vec3(0.75, 1.0, 0.8), core);
  gl_FragColor = vec4(col * intensity, 1.0);
}
`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function shieldMaterial(color: number) {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(color) },
      uOpacity: { value: 0 },
    },
    vertexShader: `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`,
    fragmentShader: `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
  vec2 hex = vec2(vLocal.x * 6.0 + vLocal.y * 3.46, vLocal.y * 6.93);
  vec2 cell = abs(fract(hex) - 0.5);
  float grid = smoothstep(0.42, 0.5, max(cell.x, cell.y));
  float pulse = 0.5 + 0.5 * sin(vLocal.y * 9.0 - uTime * 5.0);
  float intensity = rim * 1.4 + grid * 0.25 + pulse * 0.08;
  gl_FragColor = vec4(uColor * intensity * uOpacity * 1.6, 1.0);
}
`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

export function wallMaterial(color: number) {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(color) },
      uOpacity: { value: 1 },
    },
    vertexShader: UV_VERTEX,
    fragmentShader: `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
${NOISE}
void main() {
  float edgeX = min(vUv.x, 1.0 - vUv.x);
  float edgeY = min(vUv.y, 1.0 - vUv.y);
  float frame = exp(-min(edgeX * 3.0, edgeY) * 30.0);
  float bars = smoothstep(0.7, 1.0, sin(vUv.y * 40.0 - uTime * 6.0) * 0.5 + 0.5);
  float sparkle = smoothstep(0.75, 0.95, noise(vec2(vUv.x * 12.0, vUv.y * 30.0 + uTime * 3.0)));
  float intensity = 0.25 + frame * 1.8 + bars * 0.35 + sparkle * 0.6;
  gl_FragColor = vec4(uColor * intensity * uOpacity, 1.0);
}
`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function hazardMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: UV_VERTEX,
    fragmentShader: `
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float stripe = step(0.5, fract((vWorld.x + vWorld.y) * 0.9 - uTime * 0.8));
  vec3 col = mix(vec3(0.06, 0.05, 0.02), vec3(1.0, 0.78, 0.1), stripe);
  float edge = min(vUv.x, 1.0 - vUv.x);
  float border = smoothstep(0.0, 0.08, edge);
  float pulse = 0.55 + 0.45 * sin(uTime * 6.0);
  float alpha = (0.07 + (1.0 - border) * 0.4) * (0.6 + 0.4 * pulse) * smoothstep(0.0, 0.15, vUv.y);
  gl_FragColor = vec4(col, alpha);
  ${OUTPUT}
}
`,
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function hologramMaterial(color: number) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(color) } },
    vertexShader: UV_VERTEX,
    fragmentShader: `
uniform float uTime;
uniform vec3 uColor;
varying vec3 vWorld;
void main() {
  float scan = 0.55 + 0.45 * step(0.45, fract(vWorld.y * 7.0 - uTime * 1.8));
  float flicker = 0.85 + 0.15 * sin(uTime * 23.0);
  gl_FragColor = vec4(uColor * scan * flicker * 1.5, 1.0);
}
`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

export function ringMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(0xbfe9ff) },
      uOpacity: { value: 0 },
    },
    vertexShader: UV_VERTEX,
    fragmentShader: `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(uColor * uOpacity * 2.0, 1.0);
}
`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function particleMaterial(additive: boolean) {
  return new ShaderMaterial({
    uniforms: { uScale: { value: 300 } },
    vertexShader: `
uniform float uScale;
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 0.001);
  gl_Position = projectionMatrix * mv;
}
`,
    fragmentShader: `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float soft = smoothstep(0.5, 0.0, d);
  if (vAlpha <= 0.001 || soft <= 0.001) discard;
  ${additive ? "gl_FragColor = vec4(vColor * soft * vAlpha, 1.0);" : "gl_FragColor = vec4(vColor, soft * vAlpha);"}
}
`,
    transparent: true,
    blending: additive ? AdditiveBlending : NormalBlending,
    depthWrite: false,
  });
}

export function snowfallMaterial() {
  return new ShaderMaterial({
    uniforms: { uScale: { value: 300 }, uTime: { value: 0 } },
    vertexShader: `
uniform float uScale;
uniform float uTime;
attribute float aSize;
varying float vAlpha;
void main() {
  vec3 pos = position;
  pos.x += sin(uTime * 0.5 + position.y * 0.1) * 0.3;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float depth = -mv.z;
  gl_PointSize = aSize * uScale / max(depth, 0.001);
  vAlpha = smoothstep(80.0, 20.0, depth) * 0.7;
  gl_Position = projectionMatrix * mv;
}
`,
    fragmentShader: `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float soft = smoothstep(0.5, 0.1, d);
  if (vAlpha <= 0.001 || soft <= 0.001) discard;
  gl_FragColor = vec4(vec3(0.95, 0.98, 1.0), soft * vAlpha);
}
`,
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
  });
}

export function setUniform(
  material: ShaderMaterial,
  name: string,
  value: unknown,
) {
  const uniform = material.uniforms[name];
  if (uniform) uniform.value = value;
}
