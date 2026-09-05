import * as THREE from 'three';

/**
 * Procedural Vector-Sharp Matterport-Style Scan Navigation Ring (Puck) Shader
 * - Crisp anti-aliased concentric rings with center bullseye
 * - Translucent glass-like disc body
 * - Dynamic interactive hover state: scales up, electric cyan glow, radiating ripple wave
 * - Zero Z-fighting via GPU polygonOffset
 */
export const createMatterportRingMaterial = () => {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      attribute float aHover;
      varying vec2 vUv;
      varying float vHover;

      void main() {
        vUv = uv;
        vHover = aHover;

        // Smooth 22% scale expansion when hovered
        float scale = 1.0 + aHover * 0.22;
        vec3 transformed = position * scale;

        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      varying vec2 vUv;
      varying float vHover;

      void main() {
        vec2 p = vUv - vec2(0.5);
        float r = length(p) * 2.0; // 0.0 at center, 1.0 at outer edge

        if (r > 1.0) discard;

        // Vector-sharp smooth edges via screen-space derivatives
        float aa = fwidth(r) * 1.5;
        if (aa < 0.001) aa = 0.015;

        // 1. Outer Ring Border (sharp vector ring from r=0.82 to r=0.96)
        float outerBorder = smoothstep(0.96, 0.96 - aa, r) * smoothstep(0.82 - aa, 0.82, r);

        // 2. Translucent Inner Disc Body (r < 0.82)
        float innerDisc = smoothstep(0.82, 0.82 - aa, r) * 0.38;

        // 3. Center Bullseye Solid Dot (r < 0.22)
        float centerDot = smoothstep(0.22, 0.22 - aa, r) * 0.95;

        // 4. Subtle Outer Ground Drop-Shadow to pop against light floors
        float dropShadow = smoothstep(1.0, 0.96, r) * 0.25;

        // 5. Dynamic Hover Ripple Wave
        float ripple = 0.0;
        if (vHover > 0.05) {
          float wave = fract(uTime * 1.6);
          float waveDist = abs(r - wave);
          ripple = smoothstep(0.14, 0.0, waveDist) * (1.0 - wave) * 0.6 * vHover;
        }

        // Color palette: crisp pure white when resting; futuristic electric cyan when hovered
        vec3 normalColor = vec3(0.98, 0.99, 1.0);
        vec3 hoverColor = vec3(0.22, 0.85, 1.0);
        vec3 col = mix(normalColor, hoverColor, vHover * 0.85);

        float alpha = clamp(outerBorder * 0.95 + innerDisc + centerDot + ripple, 0.0, 0.98);

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2.0,
    polygonOffsetUnits: -2.0,
  });
};
