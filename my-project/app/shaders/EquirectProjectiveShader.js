import * as THREE from 'three';

/**
 * A lightweight transition shader that projects world directions to equirectangular UVs.
 * Uses a single texture2D lookup per scan with seam derivative clamping to eliminate meridian seam lines.
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
    #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
    #endif
    #ifdef GL_EXT_shader_texture_lod
    #extension GL_EXT_shader_texture_lod : enable
    #endif

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
      float v = clamp(0.5 + asin(clamp(dir.z, -1.0, 1.0)) / PI, 0.001, 0.999);
      return vec2(u, v);
    }

    vec4 sampleEquirect(sampler2D tex, vec2 uv) {
      #if defined(GL_EXT_shader_texture_lod)
        vec2 dx = dFdx(uv);
        vec2 dy = dFdy(uv);
        if (abs(dx.x) > 0.5) dx.x = 0.0;
        if (abs(dy.x) > 0.5) dy.x = 0.0;
        return texture2DGradEXT(tex, uv, dx, dy);
      #elif defined(GL_OES_standard_derivatives)
        vec2 dx = dFdx(uv);
        vec2 dy = dFdy(uv);
        if (abs(dx.x) > 0.5 || abs(dy.x) > 0.5) {
          return texture2D(tex, uv, -10.0);
        }
        return texture2D(tex, uv);
      #else
        return texture2D(tex, uv, -10.0);
      #endif
    }

    void main() {
      // Direction from Current Scan in scanner-local frame
      vec3 dirA = normalize(vWorldPosition - uCurrentScanPos);
      vec3 localDirA = normalize(uCurrentInvRot * dirA);
      vec2 uvA = dirToEquirectUV(localDirA);
      vec4 colorA = sampleEquirect(uCurrentEquirect, uvA);

      // Direction from Next Scan in scanner-local frame
      vec3 dirB = normalize(vWorldPosition - uNextScanPos);
      vec3 localDirB = normalize(uNextInvRot * dirB);
      vec2 uvB = dirToEquirectUV(localDirB);
      vec4 colorB = sampleEquirect(uNextEquirect, uvB);

      // Blend based on transition progress
      vec4 finalColor = mix(colorA, colorB, uTransitionProgress);
      gl_FragColor = vec4(finalColor.rgb, uOpacity);
      
      // Standard color space conversion
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
};
