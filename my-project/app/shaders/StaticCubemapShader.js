import * as THREE from 'three';

export const StaticCubemapShader = {
    uniforms: {
      uCubeMap: { value: null },         // Source (Scan A)
      uNextCubeMap: { value: null },     // Destination (Scan B)
      uRelRot: { value: new THREE.Matrix3() }, // Relative orientation matrix
      uTransitionProgress: { value: 1.0 }, // 0.0 = Scan A, 1.0 = Scan B
      uOpacity: { value: 1.0 }
    },
    vertexShader: `
      varying vec3 vLocalDirection;
      void main() {
        vLocalDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform samplerCube uCubeMap;
      uniform samplerCube uNextCubeMap;
      uniform mat3 uRelRot;
      uniform float uTransitionProgress;
      uniform float uOpacity;
      varying vec3 vLocalDirection;
  
      void main() {
        vec3 dirB = normalize(vLocalDirection);
        vec3 dirA = normalize(uRelRot * dirB);

        vec4 colorB = textureCube(uNextCubeMap, dirB);
        vec4 colorA = textureCube(uCubeMap, dirA);

        vec4 finalColor = mix(colorA, colorB, uTransitionProgress);
        gl_FragColor = vec4(finalColor.rgb, uOpacity);
        
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  };
