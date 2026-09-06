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

        // Smooth 14% scale expansion when hovered
        float scale = 1.0 + aHover * 0.14;
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

        if (r > 1.0) discard;

        // Vector-sharp smooth edges via screen-space derivatives
        float aa = fwidth(r) * 1.5;
        if (aa < 0.001) aa = 0.015;

        // 1. Subtle Outer & Inner Contrast Shadow for crisp definition on light/white floors
        float outerShadow = smoothstep(1.0, 1.0 - aa * 2.0, r) * smoothstep(0.92 - aa, 0.92, r) * 0.28;
        float innerShadow = smoothstep(0.72, 0.72 - aa, r) * smoothstep(0.66 - aa, 0.66, r) * 0.20;

        // 2. Primary Razor-Sharp White Ring (outer edge 0.92, inner edge 0.72)
        // Center is completely empty/hollow with no point or dot
        float whiteRing = smoothstep(0.92, 0.92 - aa, r) * smoothstep(0.72 - aa, 0.72, r);

        // 3. Dynamic Hover Pulse: subtle soft breathing glow when hovered
        float hoverPulse = 0.0;
        if (vHover > 0.01) {
          float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
          float ringGlow = smoothstep(0.96, 0.92, r) * smoothstep(0.68, 0.72, r);
          hoverPulse = ringGlow * pulse * 0.22 * vHover;
        }

        // Opacity blending:
        // Resting: 0.35 for hollow ring (delicate, elegant, non-intrusive)
        // Hovered: 1.0 for solid brilliant pure white ring
        float baseOpacity = mix(0.35, 1.0, vHover);

        float whiteAlpha = (whiteRing * baseOpacity) + hoverPulse;
        float shadowAlpha = (outerShadow + innerShadow) * (1.0 - vHover * 0.5);

        // Pure crisp white for the navigation puck
        vec3 whiteColor = vec3(1.0, 1.0, 1.0);
        vec3 shadowColor = vec3(0.04, 0.05, 0.07);

        vec3 col = mix(shadowColor, whiteColor, clamp(whiteAlpha / max(whiteAlpha + shadowAlpha, 0.001), 0.0, 1.0));
        float totalAlpha = clamp(whiteAlpha + shadowAlpha, 0.0, 1.0) * vAlpha * uGlobalOpacity;

        if (totalAlpha < 0.01) discard;

        gl_FragColor = vec4(col, totalAlpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
};
