import * as THREE from 'three';

/**
 * Depth-Warped Panorama Shader (The "Magic Bubble")
 * Used when standing still for flawless, laser-accurate 6DOF parallax.
 * It physically displaces the vertices of a highly-subdivided Box using the
 * equirectangular 16-bit depth map, then samples the equirectangular color map.
 */
export const DepthWarpedPanoramaShader = {
  uniforms: {
    uColorCube: { value: null },         // Source (Scan A)
    uNextColorCube: { value: null },     // Destination (Scan B)
    uDepthCube: { value: null },         // RG-packed uint16 depth + confidence/mask
    uMinDepth: { value: 0.1 },           // From depth_ranges.json
    uMaxDepth: { value: 15.0 },          // From depth_ranges.json
    uRelRot: { value: new THREE.Matrix3() }, // Relative orientation matrix (R_A^-1 * R_B)
    uTransitionProgress: { value: 1.0 }, // 0.0 = Scan A, 1.0 = Scan B
    uOpacity: { value: 1.0 },            // For cross-fading
  },

  vertexShader: `
    uniform samplerCube uDepthCube;
    uniform float uMinDepth;
    uniform float uMaxDepth;

    out vec3 vLocalDirection;

    void main() {
      // Object-space direction = scanner-local frame (bubble rotated by scanner quaternion).
      vec3 localDir = normalize(position);
      vLocalDirection = localDir;

      // Sample the RG-packed depth cube in the scanner-local direction.
      //   R = high byte, G = low byte  -> depth16 = R*256 + G  (0..65535, 0 = invalid)
      //   A = valid_mask (1.0 valid, 0.0 hole)
      // Cube faces are native (no equirect resample), so no pole distortion.
      // Vertex-stage texture reads require an explicit LOD: use textureLod.
      vec4 packed = textureLod(uDepthCube, localDir, 0.0);
      float hi = floor(packed.r * 255.0 + 0.5);
      float lo = floor(packed.g * 255.0 + 0.5);
      float depth16 = hi * 256.0 + lo;            // 0..65535
      float valid = packed.a;                     // 1.0 valid, 0.0 hole

      // Reconstruct exact metric depth from the per-scan [min,max] range.
      float norm = depth16 / 65535.0;
      float depthMeters = uMinDepth + norm * (uMaxDepth - uMinDepth);

      // Holes / invalid texels fall back to the far shell so they read as
      // background instead of collapsing onto the camera.
      if (valid < 0.5 || depth16 <= 0.0) {
        depthMeters = uMaxDepth;
      }

      // Displace in object-space, then transform to world-space via modelMatrix
      vec3 displacedPosition = localDir * depthMeters;
      vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,

  fragmentShader: `
    precision highp float;

    uniform samplerCube uColorCube;
    uniform samplerCube uNextColorCube;
    uniform mat3 uRelRot;
    uniform float uTransitionProgress;
    uniform float uOpacity;

    in vec3 vLocalDirection;
    out vec4 fragColor;

    void main() {
      vec3 dirB = normalize(vLocalDirection);
      vec3 dirA = normalize(uRelRot * dirB);

      vec4 colorB = texture(uNextColorCube, dirB);
      vec4 colorA = texture(uColorCube, dirA);

      vec4 finalColor = mix(colorA, colorB, uTransitionProgress);
      fragColor = vec4(finalColor.rgb, uOpacity);
    }
  `,
  glslVersion: THREE.GLSL3,
};

/**
 * Global Mesh Projective Shader (The "Movie Projector")
 * Used during flight transitions. It projects the panoramic textures onto the low-res 3D GLB mesh.
 */
export const ProjectiveMeshShader = {
  uniforms: {
    uCurrentColorMap: { value: null }, // THREE.Texture (equirectangular, Scan A)
    uNextColorMap: { value: null },    // THREE.Texture (equirectangular, Scan B)
    uCurrentScanPos: { value: new THREE.Vector3() },
    uNextScanPos: { value: new THREE.Vector3() },
    uCurrentScanQuatInverse: { value: new THREE.Vector4(0, 0, 0, 1) }, // Scanner A conjugate quat
    uNextScanQuatInverse: { value: new THREE.Vector4(0, 0, 0, 1) },    // Scanner B conjugate quat
    uTransitionProgress: { value: 0.0 }, // 0.0 = Scan A, 1.0 = Scan B
    uOpacity: { value: 0.0 },            // Overall opacity of the mesh layer
  },

  vertexShader: `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,

  fragmentShader: `
    uniform sampler2D uCurrentColorMap;
    uniform sampler2D uNextColorMap;
    uniform vec3 uCurrentScanPos;
    uniform vec3 uNextScanPos;
    uniform vec4 uCurrentScanQuatInverse;
    uniform vec4 uNextScanQuatInverse;
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

    vec3 applyQuat(vec3 v, vec4 q) {
      vec3 t = 2.0 * cross(q.xyz, v);
      return v + q.w * t + cross(q.xyz, t);
    }

    void main() {
      vec3 dirA = normalize(vWorldPosition - uCurrentScanPos);
      vec3 localDirA = applyQuat(dirA, uCurrentScanQuatInverse);
      vec2 uvA = dirToEquirectUV(localDirA);
      vec4 colorA = texture(uCurrentColorMap, uvA);

      vec3 dirB = normalize(vWorldPosition - uNextScanPos);
      vec3 localDirB = applyQuat(dirB, uNextScanQuatInverse);
      vec2 uvB = dirToEquirectUV(localDirB);
      vec4 colorB = texture(uNextColorMap, uvB);

      vec3 finalColor = mix(colorA.rgb, colorB.rgb, uTransitionProgress);
      gl_FragColor = vec4(finalColor, uOpacity);
    }
  `
};
