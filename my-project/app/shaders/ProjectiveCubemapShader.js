import * as THREE from 'three';

export const ProjectiveCubemapShader = {
  uniforms: {
    uCurrentCubeMap: { value: null },   // CubeTexture for scan A
    uNextCubeMap: { value: null },      // CubeTexture for scan B
    uCurrentScanPos: { value: new THREE.Vector3() },
    uNextScanPos: { value: new THREE.Vector3() },
    uCurrentInvRot: { value: new THREE.Matrix3() },  // 3x3 inverse rotation
    uNextInvRot: { value: new THREE.Matrix3() },
    uTransitionProgress: { value: 0.0 }, // 0 = scan A, 1 = scan B
    uOpacity: { value: 0.0 },            // overall mesh opacity
  },

  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,

  fragmentShader: `
    uniform samplerCube uCurrentCubeMap;
    uniform samplerCube uNextCubeMap;
    uniform vec3 uCurrentScanPos;
    uniform vec3 uNextScanPos;
    uniform mat3 uCurrentInvRot;
    uniform mat3 uNextInvRot;
    uniform float uTransitionProgress;
    uniform float uOpacity;

    varying vec3 vWorldPosition;

    void main() {
      // Direction from scan A to this mesh point
      vec3 worldDirA = normalize(vWorldPosition - uCurrentScanPos);
      // Convert to scanner-local direction (using inverse rotation)
      vec3 localDirA = uCurrentInvRot * worldDirA;
      vec4 colorA = textureCube(uCurrentCubeMap, localDirA);

      vec3 worldDirB = normalize(vWorldPosition - uNextScanPos);
      vec3 localDirB = uNextInvRot * worldDirB;
      vec4 colorB = textureCube(uNextCubeMap, localDirB);

      vec3 finalColor = mix(colorA.rgb, colorB.rgb, uTransitionProgress);
      gl_FragColor = vec4(finalColor, uOpacity);
      
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
};
