export const CubemapTransitionShader = {
    uniforms: {
      uCurrentFace0: { value: null },
      uCurrentFace1: { value: null },
      uCurrentFace2: { value: null },
      uCurrentFace3: { value: null },
      uCurrentFace4: { value: null },
      uCurrentFace5: { value: null },
      
      uNextFace0: { value: null },
      uNextFace1: { value: null },
      uNextFace2: { value: null },
      uNextFace3: { value: null },
      uNextFace4: { value: null },
      uNextFace5: { value: null },
      
      uCurrentScanPos: { value: null }, // THREE.Vector3
      uNextScanPos: { value: null },    // THREE.Vector3
      uCurrentScanInvRot: { value: null }, // THREE.Matrix3
      uNextScanInvRot: { value: null },    // THREE.Matrix3
      uProgress: { value: 0.0 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uCurrentFace0;
      uniform sampler2D uCurrentFace1;
      uniform sampler2D uCurrentFace2;
      uniform sampler2D uCurrentFace3;
      uniform sampler2D uCurrentFace4;
      uniform sampler2D uCurrentFace5;

      uniform sampler2D uNextFace0;
      uniform sampler2D uNextFace1;
      uniform sampler2D uNextFace2;
      uniform sampler2D uNextFace3;
      uniform sampler2D uNextFace4;
      uniform sampler2D uNextFace5;
      
      uniform vec3 uCurrentScanPos;
      uniform vec3 uNextScanPos;
      
      uniform mat3 uCurrentScanInvRot;
      uniform mat3 uNextScanInvRot;
      
      uniform float uProgress;
      
      varying vec3 vWorldPosition;
  
      vec4 sampleBoxMap(vec3 dir, int isNext) {
        vec3 aDir = abs(dir);
        float maxAxis = max(aDir.x, max(aDir.y, aDir.z));
        vec2 uv;
        int faceIndex;
        
        if (maxAxis == aDir.x) {
            if (dir.x > 0.0) {
                faceIndex = 0; // +X
                uv = vec2(-dir.z / aDir.x, dir.y / aDir.x);
            } else {
                faceIndex = 1; // -X
                uv = vec2(dir.z / aDir.x, dir.y / aDir.x);
            }
        } else if (maxAxis == aDir.y) {
            if (dir.y > 0.0) {
                faceIndex = 2; // +Y
                uv = vec2(dir.x / aDir.y, -dir.z / aDir.y);
            } else {
                faceIndex = 3; // -Y
                uv = vec2(dir.x / aDir.y, dir.z / aDir.y);
            }
        } else {
            if (dir.z > 0.0) {
                faceIndex = 4; // +Z
                uv = vec2(dir.x / aDir.z, dir.y / aDir.z);
            } else {
                faceIndex = 5; // -Z
                uv = vec2(-dir.x / aDir.z, dir.y / aDir.z);
            }
        }
        
        uv = uv * 0.5 + 0.5;
        
        if (isNext == 1) {
          if (faceIndex == 0) return texture2D(uNextFace0, uv);
          if (faceIndex == 1) return texture2D(uNextFace1, uv);
          if (faceIndex == 2) return texture2D(uNextFace2, uv);
          if (faceIndex == 3) return texture2D(uNextFace3, uv);
          if (faceIndex == 4) return texture2D(uNextFace4, uv);
          return texture2D(uNextFace5, uv);
        } else {
          if (faceIndex == 0) return texture2D(uCurrentFace0, uv);
          if (faceIndex == 1) return texture2D(uCurrentFace1, uv);
          if (faceIndex == 2) return texture2D(uCurrentFace2, uv);
          if (faceIndex == 3) return texture2D(uCurrentFace3, uv);
          if (faceIndex == 4) return texture2D(uCurrentFace4, uv);
          return texture2D(uCurrentFace5, uv);
        }
      }

      void main() {
        vec3 worldDirA = normalize(vWorldPosition - uCurrentScanPos);
        vec3 worldDirB = normalize(vWorldPosition - uNextScanPos);
        
        vec3 localDirA = uCurrentScanInvRot * worldDirA;
        vec3 localDirB = uNextScanInvRot * worldDirB;
        
        vec4 colorA = sampleBoxMap(localDirA, 0);
        vec4 colorB = sampleBoxMap(localDirB, 1);
        
        vec3 finalColor = mix(colorA.rgb, colorB.rgb, uProgress);
        gl_FragColor = vec4(finalColor, 1.0);
        
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  };
