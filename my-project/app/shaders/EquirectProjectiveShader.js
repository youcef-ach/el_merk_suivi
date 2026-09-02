import * as THREE from 'three';

/**
 * A lightweight transition shader that projects world directions to equirectangular UVs.
 * Uses a single texture2D lookup per scan instead of a heavy 6-texture cubemap lookup.
 */
export const EquirectProjectiveShader = {
  uniforms: {
    uCurrentEquirect: { value: null },
    uNextEquirect: { value: null },
    uCurrentScanPos: { value: new THREE.Vector3() },
    uNextScanPos: { value: new THREE.Vector3() },
    uCurrentInvRot: { value: new THREE.Matrix3() },
    uNextInvRot: { value: new THREE.Matrix3() },
    uCurrentRot: { value: new THREE.Matrix3() },
    uNextRot: { value: new THREE.Matrix3() },
    uTransitionProgress: { value: 0.0 },
    uOpacity: { value: 1.0 }
  },

  vertexShader: `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    void main() {
      // Calculate world position
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,

  fragmentShader: `
    uniform sampler2D uCurrentEquirect;
    uniform sampler2D uNextEquirect;
    uniform vec3 uCurrentScanPos;
    uniform vec3 uNextScanPos;
    uniform mat3 uCurrentInvRot;
    uniform mat3 uNextInvRot;
    uniform mat3 uCurrentRot;
    uniform mat3 uNextRot;
    uniform float uTransitionProgress;
    uniform float uOpacity;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    #define PI 3.14159265359

    vec2 dirToEquirectUV(vec3 dir) {
      float theta = atan(dir.x, dir.y);
      float u = fract((theta / (2.0 * PI)) + 0.5);
      float v = 0.5 + asin(clamp(dir.z, -1.0, 1.0)) / PI;
      return vec2(u, v);
    }

    void main() {
      // Direction from Current Scan in scanner-local frame
      vec3 dirA = normalize(vWorldPosition - uCurrentScanPos);
      vec3 localDirA = normalize(uCurrentInvRot * dirA);
      vec2 uvA = dirToEquirectUV(localDirA);
      vec4 colorA = texture2D(uCurrentEquirect, uvA);

      // Direction from Next Scan in scanner-local frame
      vec3 dirB = normalize(vWorldPosition - uNextScanPos);
      vec3 localDirB = normalize(uNextInvRot * dirB);
      vec2 uvB = dirToEquirectUV(localDirB);
      vec4 colorB = texture2D(uNextEquirect, uvB);

      // Blend based on transition progress
      vec4 finalColor = mix(colorA, colorB, uTransitionProgress);
      gl_FragColor = vec4(finalColor.rgb, uOpacity);
      
      // Standard color space conversion
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
};
