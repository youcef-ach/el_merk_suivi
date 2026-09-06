import * as THREE from 'three';

/**
 * Procedural Vector-Sharp Matterport-Style Scan Navigation Ring (Puck) Shader
 * - Crisp anti-aliased hollow white ring
 * - Pure white aesthetic matching commercial Matterport 3D Showcase
 * - Resting: delicate translucent white (opacity ~0.35)
 * - Hovered: brilliant solid white (opacity ~1.0) with subtle scale expansion (1.14x)
 * - Contrast shadow edge for high legibility on light concrete, limestone, or dark metal
 * - Supports instance alpha (aAlpha) for smooth distance, pitch, and floor fading
 */
export const createMatterportRingMaterial = () => {
  return new THREE.ShaderMaterial({
    name: 'MatterportRingMaterial',
    uniforms: {
      uTime: { value: 0 },
      uGlobalOpacity: { value: 1.0 },
    },
    vertexShader: `
      uniform float uTime;
      attribute float aHover;
      attribute float aAlpha;
      varying vec2 vUv;
      varying float vHover;
      varying float vAlpha;

      void main() {
        vUv = uv;
        vHover = aHover;
        vAlpha = aAlpha;

        // Smooth 10% scale expansion when hovered
        float scale = 1.0 + aHover * 0.10;
        vec3 transformed = position * scale;

        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform float uGlobalOpacity;
      varying vec2 vUv;
      varying float vHover;
      varying float vAlpha;

      void main() {
        vec2 p = vUv - vec2(0.5);
        float r = length(p) * 2.0; // 0.0 at center, 1.0 at outer edge

        // Outer boundary culling
        if (r > 1.0) discard;

        // Screen-space derivative anti-aliasing
        float aa = fwidth(r) * 1.5;
        if (aa < 0.001) aa = 0.015;

        // Primary Vector White Ring (outer edge 0.90, inner edge 0.74)
        // Center (r < 0.74) is completely hollow/empty (no white point, no center dot)
        float whiteRing = smoothstep(0.90, 0.90 - aa, r) * smoothstep(0.74 - aa, 0.74, r);

        if (whiteRing < 0.005) discard;

        // Opacity:
        // Resting: subtle, elegant translucent white (0.42)
        // Hovered: brilliant solid pure white (0.96)
        float baseOpacity = mix(0.42, 0.96, vHover);

        // Dynamic hover pulse
        float pulse = 0.0;
        if (vHover > 0.01) {
          pulse = (0.5 + 0.5 * sin(uTime * 4.0)) * 0.12 * vHover;
        }

        float alpha = clamp((whiteRing * baseOpacity) + pulse, 0.0, 1.0) * vAlpha * uGlobalOpacity;

        if (alpha < 0.01) discard;

        // Pure crisp white with ZERO black borders or shadows
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
};
