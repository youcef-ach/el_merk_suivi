import * as THREE from 'three';

/**
 * Cinematic Motion Blur & Radial Speed Streak Shader
 * Applied during flight transitions between scans to smooth out geometric transitions.
 */
export const CinematicMotionBlurShader = {
  uniforms: {
    uIntensity: { value: 0.0 }, // 0.0 (still) -> 1.0 (peak velocity)
    uTime: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uIntensity;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      if (uIntensity <= 0.001) {
        discard;
      }

      vec2 center = vec2(0.5, 0.5);
      vec2 toCenter = vUv - center;
      float dist = length(toCenter);

      // Radial speed streak lines (converging to center)
      float angle = atan(toCenter.y, toCenter.x);
      float streak = sin(angle * 70.0 + uTime * 25.0) * 0.5 + 0.5;
      streak = pow(streak, 4.0);

      // Edge vignette weighting: stronger at the edges, zero in the center
      float edgeWeight = smoothstep(0.2, 0.85, dist);

      // Subtle forward velocity streaks
      float alpha = uIntensity * edgeWeight * (0.18 + 0.32 * streak);

      vec3 streakColor = mix(vec3(0.92, 0.96, 1.0), vec3(1.0, 1.0, 1.0), streak);

      gl_FragColor = vec4(streakColor, alpha);
    }
  `
  
};
