import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { disposeScene } from '../utils/threeCleanup';

/**
 * Initializes the core Three.js components and manages the render loop.
 * 
 * @param {Array<THREE.Texture>} preserveTextures - Optional textures to not dispose on unmount.
 * @returns {Object} { mountRef, sceneRef, cameraRef, rendererRef, controlsRef, keyboardEnabledRef }
 */
export const useThreeScene = (preserveTextures = []) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const rafRef = useRef(null);
  const keyboardEnabledRef = useRef(true);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);
    sceneRef.current = scene;
    setSceneReady(true);

    const width = mountRef.current.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || window.innerHeight;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.up.set(0, 0, 1);
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lighting
    // const ambientLight = new THREE.AmbientLight(0xffffff, 10);
    // scene.add(ambientLight);

    // 5. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // 6. Keyboard Free Movement
    const keysPressed = new Set();
    const MOVE_SPEED = 14.0;   // units per second
    const FAST_MULT = 2.5;    // shift multiplier
    let lastTime = performance.now();

    const onKeyDown = (e) => {
      if (!keyboardEnabledRef.current) return;
      // Ignore if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      keysPressed.add(e.code);
    };
    const onKeyUp = (e) => {
      keysPressed.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 7. Animation Loop
    const _forward = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _moveDir = new THREE.Vector3();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
      lastTime = now;

      // Apply keyboard movement
      if (keyboardEnabledRef.current && keysPressed.size > 0) {
        const speed = MOVE_SPEED * (keysPressed.has('ShiftLeft') || keysPressed.has('ShiftRight') ? FAST_MULT : 1);

        // Get camera's forward direction (projected onto XY plane for horizontal movement)
        camera.getWorldDirection(_forward);
        _forward.z = 0;
        _forward.normalize();

        // Right vector = forward × up
        _right.crossVectors(_forward, camera.up).normalize();

        _moveDir.set(0, 0, 0);

        // WASD + Arrow keys
        if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp'))    _moveDir.add(_forward);
        if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown'))  _moveDir.sub(_forward);
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft'))  _moveDir.sub(_right);
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) _moveDir.add(_right);

        // Q/E or Space/Ctrl for vertical
        if (keysPressed.has('KeyE') || keysPressed.has('Space'))      _moveDir.z += 1;
        if (keysPressed.has('KeyQ') || keysPressed.has('ControlLeft') || keysPressed.has('ControlRight')) _moveDir.z -= 1;

        if (_moveDir.lengthSq() > 0) {
          _moveDir.normalize().multiplyScalar(speed * dt);
          camera.position.add(_moveDir);
          controls.target.add(_moveDir);
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 8. Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // 9. Cleanup on Unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      if (rendererRef.current && rendererRef.current.domElement) {
        // Remove canvas from DOM
        const domElement = rendererRef.current.domElement;
        if (domElement.parentNode) {
          domElement.parentNode.removeChild(domElement);
        }
        rendererRef.current.dispose();
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
      }

      if (sceneRef.current) {
        disposeScene(sceneRef.current, preserveTextures);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // VERY IMPORTANT: Leave empty! preserveTextures inline array was causing re-renders!

  return { mountRef, sceneRef, cameraRef, rendererRef, controlsRef, keyboardEnabledRef, sceneReady };
};
