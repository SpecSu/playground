// 最终调色（v1.2 柔和：饱和度软膝 + 暖调 + 柔对比）：色差 + Lift/Gain + 饱和度 + 柔和对比 + 屏幕空间太阳辉光 + 暖色暗角 + 胶片颗粒（在色调映射之后的显示空间进行）
// 美术升级（光遇 × 猛兽派对）：暖白清爽基调；柔和对比（只轻压暗部、亮部肩部柔滑）；
// 太阳方向的大气辉光（太阳不在画面内时也会从对应屏幕边缘渗入一点暖光）；暗角很轻且偏暖，不脏不灰。
import * as THREE from 'three';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLift: { value: new THREE.Vector3(0, 0.01, 0.025) },
    uGain: { value: new THREE.Vector3(1.02, 1, 0.98) },
    uSat: { value: 1.08 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uCA: { value: 0.0015 },
    uTime: { value: 0 },
    uContrast: { value: 0.0 },                                   // 柔和 S 曲线强度（0 = 关）
    uSunUV: { value: new THREE.Vector2(0.5, 1.4) },              // 太阳屏幕坐标（可在屏幕外）
    uSunHaze: { value: new THREE.Vector3(0, 0, 0) },             // 太阳辉光颜色 × 强度（显示空间）
    uAspect: { value: 0.46 },
    uVigColor: { value: new THREE.Vector3(0.97, 0.92, 0.88) },    // 暗角染色（乘子）：v1.2 暖奶油，不发黑不发紫
    uSatKnee: { value: new THREE.Vector2(0.78, 0.6) },            // v1.2：饱和度软膝（x=起点 HSV 饱和度，y=超出部分保留比例）→ 杜绝炸眼高饱和
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform float uSat;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uCA;
    uniform float uTime;
    uniform float uContrast;
    uniform vec2 uSunUV;
    uniform vec3 uSunHaze;
    uniform float uAspect;
    uniform vec3 uVigColor;
    uniform vec2 uSatKnee;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uCA * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      col = col * uGain + uLift * (1.0 - col);
      // 柔和对比：暗部轻压、亮部肩部柔滑（不提升高光，避免发白）
      vec3 sc = col * col * (3.0 - 2.0 * col);
      col = mix(col, sc, uContrast);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      // v1.2 饱和度软膝：HSV 饱和度超过 knee 的部分按比例压缩（保持色相与亮度），任何像素都不会"炸眼"
      {
        float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
        float s = (mx - mn) / max(mx, 1e-4);
        if (s > uSatKnee.x) {
          float s2 = uSatKnee.x + (s - uSatKnee.x) * uSatKnee.y;
          float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l2), col, s2 / s);
        }
      }
      // 太阳大气辉光（screen 混合，不会过曝）
      vec2 sd = (vUv - uSunUV) * vec2(uAspect, 1.0);
      float hz = exp(-length(sd) * 2.2) * 0.75 + exp(-length(sd) * 7.0) * 0.25;
      vec3 haze = uSunHaze * hz;
      col = 1.0 - (1.0 - col) * (1.0 - clamp(haze, 0.0, 0.6));
      // 柔和暗角（轻微暖紫，不发黑）
      float v = smoothstep(0.85, 0.15, r2 * 2.2);
      col *= mix(vec3(1.0) - uVignette * (vec3(1.0) - uVigColor * 0.55), vec3(1.0), v);
      // 胶片颗粒（亮部弱、暗部强）
      float g = rand(vUv * 1000.0 + fract(uTime * 7.13)) - 0.5;
      col += g * uGrain * (1.0 - l * 0.6);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
