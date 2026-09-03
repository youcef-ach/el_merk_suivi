import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeScene } from '../utils/threeCleanup';
import { getDeviceTier } from '../utils/deviceTier';

/**
 * Initializes the core Three.js components and manages the render loop.
 * Matching the exact tested configuration from 3d_tiles test for 3D Tiles rendering.
 * 
 * @param {Array<THREE.Texture>} preserveTextures - Optional textures to not dispose on unmount.
 * @returns {Object} { mountRef, sceneRef, cameraRef, rendererRef, controlsRef, keyboardEnabledRef, beforeRenderCallbacksRef, tierConfig, setDynamicDpr }
 */
export const useThreeScene = (preserveTextures = [], isZUp = false) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const rafRef = useRef(null);
  const keyboardEnabledRef = useRef(true);
  const beforeRenderCallbacksRef = useRef([]);
  const [sceneReady, setSceneReady] = useState(false);
  const tierConfigRef = useRef(getDeviceTier());

  useEffect(() => {
    if (!mountRef.current) return;

    const tierConfig = tierConfigRef.current;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    if (!isZUp) {
      scene.fog = new THREE.FogExp2(0x0b1120, 0.0012);
    }
    sceneRef.current = scene;
    setSceneReady(true);

    const width = mountRef.current.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || window.innerHeight;

    // 2. Camera Setup (Z-up for Virtual Tour, Y-up for Drone GIS)
    const aspect = width / height;
    const camera = isZUp 
      ? new THREE.PerspectiveCamera(75, aspect, tierConfig.cameraNear, tierConfig.cameraFar)
      : new THREE.PerspectiveCamera(50, aspect, 0.5, 4000);

    if (isZUp) {
      camera.up.set(0, 0, 1);
      camera.position.set(5, 5, 5);
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(0, 140, 220);
    }
    cameraRef.current = camera;

    // 3. Renderer Setup with Adaptive Mobile & Desktop Tiering
    const renderer = new THREE.WebGLRenderer({ 
      antialias: tierConfig.antialiasing,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: tierConfig.useLogDepth
    });
    const baseDpr = Math.min(window.devicePixelRatio || 1, tierConfig.maxDpr);
    renderer.setSize(width, height);
    renderer.setPixelRatio(baseDpr);
    renderer.shadowMap.enabled = !isZUp && tierConfig.tier >= 2;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Mobile touch gesture isolation and absolute positioning
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    canvas.style.overscrollBehavior = 'none';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    // Mobile WebGL Context Loss & Restoration Handlers
    const onContextLost = (e) => {
      e.preventDefault();
      console.warn("[WebGL] Context lost. Suspending render loop to protect mobile GPU...");
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const onContextRestored = () => {
      console.log("[WebGL] Context restored. Rebuilding state and resuming loop...");
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
      if (mountRef.current) {
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      }
      lastTime = performance.now();
      animate();
    };

    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);

    // Clean any existing stale canvas nodes to prevent layout stacking
    while (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }
    mountRef.current.appendChild(canvas);
    rendererRef.current = renderer;

    // Developer Diagnostic Helper for GPU Memory & WebGL Info
    window.__threeStats = () => {
      if (!renderer) return console.warn("Renderer not ready");
      const info = renderer.info;
      console.table({
        "Textures in GPU Memory": info.memory.textures,
        "Geometries in GPU Memory": info.memory.geometries,
        "Active Draw Calls / Frame": info.render.calls,
        "Triangles Rendered": info.render.triangles,
        "Lines": info.render.lines,
        "Points": info.render.points
      });
      return info;
    };
    window.__threeRenderer = renderer;

    // 4. Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, isZUp ? 1.0 : 0.85);
    scene.add(ambientLight);

    if (!isZUp) {
      const sunLight = new THREE.DirectionalLight(0xffffff, 0.35);
      sunLight.position.set(100, 250, 100);
      scene.add(sunLight);
    }

    // 5. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 1.0;
    controls.panSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.enableKeys = false;
    controls.keys = { LEFT: '', UP: '', RIGHT: '', BOTTOM: '' };
    
    if (isZUp) {
      controls.maxPolarAngle = Math.PI - 0.01;
      controls.minDistance = 0.2;
      controls.maxDistance = 500;
      controls.target.set(0, 0, 0);
    } else {
      controls.maxPolarAngle = Math.PI / 2 - 0.01;
      controls.minDistance = 2.0;
      controls.maxDistance = 2500;
      controls.target.set(0, 4, 0);
    }
    controlsRef.current = controls;

    // 6. Keyboard Movement
    const keysPressed = new Set();
    const MOVE_SPEED = 30.0;
    const FAST_MULT = 3.0;
    let lastTime = performance.now();

    const onKeyDown = (e) => {
      if (!keyboardEnabledRef.current) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      keysPressed.add(e.code);
    };
    const onKeyUp = (e) => {
      keysPressed.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 7. Continuous Animation Loop with beforeRender hooks
    const _forward = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _moveDir = new THREE.Vector3();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Keyboard navigation
      if (keyboardEnabledRef.current && keysPressed.size > 0) {
        const speed = MOVE_SPEED * (keysPressed.has('ShiftLeft') || keysPressed.has('ShiftRight') ? FAST_MULT : 1);

        camera.getWorldDirection(_forward);
        if (camera.up.z === 1) {
          _forward.z = 0;
        } else {
          _forward.y = 0;
        }
        _forward.normalize();

        _right.crossVectors(_forward, camera.up).normalize();

        _moveDir.set(0, 0, 0);
        if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp'))    _moveDir.add(_forward);
        if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown'))  _moveDir.sub(_forward);
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft'))  _moveDir.sub(_right);
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) _moveDir.add(_right);
        if (camera.up.z === 1) {
          if (keysPressed.has('KeyE') || keysPressed.has('Space'))      _moveDir.z += 1;
          if (keysPressed.has('KeyQ') || keysPressed.has('ControlLeft') || keysPressed.has('ControlRight')) _moveDir.z -= 1;
        } else {
          if (keysPressed.has('KeyE') || keysPressed.has('Space'))      _moveDir.y += 1;
          if (keysPressed.has('KeyQ') || keysPressed.has('ControlLeft') || keysPressed.has('ControlRight')) _moveDir.y -= 1;
        }

        if (_moveDir.lengthSq() > 0) {
          _moveDir.normalize().multiplyScalar(speed * dt);
          camera.position.add(_moveDir);
          controls.target.add(_moveDir);
        }
      }

      controls.update();

      // Execute beforeRender callbacks (e.g. tilesRenderer.update())
      const cbs = beforeRenderCallbacksRef.current;
      for (let i = 0; i < cbs.length; i++) {
        try {
          cbs[i]();
        } catch (e) {
          console.error("beforeRender error:", e);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // 8. Resize Handler with ResizeObserver support
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (mountRef.current) {
      resizeObserver.observe(mountRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      controls.dispose();
      disposeScene(scene, preserveTextures);
      renderer.dispose();
      delete window.__threeStats;
      delete window.__threeRenderer;
      if (mountRef.current && canvas.parentNode === mountRef.current) {
        mountRef.current.removeChild(canvas);
      }
    };
  }, []);

  // Dynamic Resolution Scaling (DRS) helper for camera transitions
  const setDynamicDpr = (factor = 1.0) => {
    if (!rendererRef.current) return;
    const tierConfig = tierConfigRef.current;
    const targetDpr = Math.min(window.devicePixelRatio || 1, tierConfig.maxDpr) * factor;
    rendererRef.current.setPixelRatio(Math.max(0.75, targetDpr));
  };

  return {
    mountRef,
    sceneRef,
    cameraRef,
    rendererRef,
    controlsRef,
    keyboardEnabledRef,
    beforeRenderCallbacksRef,
    sceneReady,
    tierConfig: tierConfigRef.current,
    setDynamicDpr,
  };
};
