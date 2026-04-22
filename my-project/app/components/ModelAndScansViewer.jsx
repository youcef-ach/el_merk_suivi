import { useRef, useState, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../hooks/useThreeScene';
import { useTourData } from '../hooks/useTourData';
import { executeFlightAnimation, toggleBoxFading, toggleModelFading } from '../utils/tourAnimations';

const ModelAndScansViewer = forwardRef(({ tourId, measurementMode, onMeasurementClick, tagMode, onTagClick, onTagSelect, pointersMode, onPointerClick, onPointerSelect }, ref) => {
  // --- Persistent dummy texture to prevent shader recompilation lag ---
  const dummyTex = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const { mountRef, sceneRef, cameraRef, rendererRef, controlsRef, sceneReady } = useThreeScene([dummyTex]);
  const { 
    modelRef, box1Ref, panoramaGroup1Ref, box2Ref, panoramaGroup2Ref, 
    scanSpheres, loadPanoramaTextures, isDataLoaded 
  } = useTourData(sceneRef, dummyTex, tourId, sceneReady);

  // Expose Three.js internals to parent via ref (for measurement tool)
  useImperativeHandle(ref, () => ({
    sceneRef,
    cameraRef,
    rendererRef,
    modelRef,
    controlsRef,
  }), [sceneRef, cameraRef, rendererRef, modelRef, controlsRef]);

  // Track measurement mode state in a ref for the click handler
  const measurementModeRef = useRef(false);
  const onMeasurementClickRef = useRef(null);
  measurementModeRef.current = measurementMode;
  onMeasurementClickRef.current = onMeasurementClick;

  const tagModeRef = useRef(false);
  const onTagClickRef = useRef(null);
  const onTagSelectRef = useRef(null);
  tagModeRef.current = tagMode;
  onTagClickRef.current = onTagClick;
  onTagSelectRef.current = onTagSelect;

  const pointersModeRef = useRef(false);
  const onPointerClickRef = useRef(null);
  const onPointerSelectRef = useRef(null);
  pointersModeRef.current = pointersMode;
  onPointerClickRef.current = onPointerClick;
  onPointerSelectRef.current = onPointerSelect;

  // Active state trackers
  const activeBoxIndexRef = useRef(1);
  const activeSphereRef = useRef(null);

  // Hotspot Overlay view state
  const [isInscan, setIsInscan] = useState(false);
  const [isMeshView, setIsMeshView] = useState(false);

  // Tag info popup state (for engine/read-only view)
  const [activeTagInfo, setActiveTagInfo] = useState(null);


  const handleToggleMeshView = () => {
    const currentBox = activeBoxIndexRef.current === 1 ? box1Ref.current : box2Ref.current;
    
    toggleBoxFading(currentBox, !isMeshView);
    toggleModelFading(modelRef.current, isMeshView);
    
    setIsMeshView(!isMeshView);
  };

  // Synchronize Area Pointers visibility (Only display in Dollhouse mode)
  useEffect(() => {
    const group = sceneRef.current?.getObjectByName('areaPointers');
    if (group) {
      group.visible = !isInscan || isMeshView;
    }
  }, [isInscan, isMeshView, sceneRef]);

  // --- Click Event & Raycasting ---
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!renderer || !camera || !controls || !isDataLoaded) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event) => {
      // Unconditionally try to click/select a pointer first (studio mode)
      if (onPointerSelectRef.current) {
        const didHitPointer = onPointerSelectRef.current(event);
        if (didHitPointer) return;
      }

      // Unconditionally try to click/select a tag (studio mode)
      if (onTagSelectRef.current) {
        const didHitTag = onTagSelectRef.current(event);
        if (didHitTag) return; // intercepted click, don't trigger anything else
      }

      // Engine mode: detect tag clicks and show info popup
      if (!onTagSelectRef.current) {
        const tagGroup = sceneRef.current?.getObjectByName('tagMarkers');
        if (tagGroup && tagGroup.children.length > 0) {
          const rect = renderer.domElement.getBoundingClientRect();
          const tagMouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
          );
          const tagRaycaster = new THREE.Raycaster();
          tagRaycaster.setFromCamera(tagMouse, camera);
          const tagHits = tagRaycaster.intersectObjects(tagGroup.children, false);
          if (tagHits.length > 0) {
            const hitSprite = tagHits[0].object;
            const tagId = hitSprite.userData.tagId;
            // Fetch tag info from backend
            const token = localStorage.getItem('access_token');
            fetch(`http://localhost:3000/tours/${tourId}`, {
              headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            })
              .then(r => r.json())
              .then(tour => {
                const tagData = tour.tags?.find(t => t.id === tagId);
                if (tagData) {
                  setActiveTagInfo(tagData);
                }
              })
              .catch(err => console.error('Failed to fetch tag info:', err));
            return;
          }
        }
        // Clicking empty space dismisses the popup
        setActiveTagInfo(null);
      }

      // If measurement mode is active, delegate to measurement handler
      if (measurementModeRef.current && onMeasurementClickRef.current) {
        onMeasurementClickRef.current(event);
        return;
      }

      // If tag mode is active, delegate to tag handler
      if (tagModeRef.current && onTagClickRef.current) {
        onTagClickRef.current(event);
        return;
      }

      // If pointer mode is active, delegate to pointer handler
      if (pointersModeRef.current && onPointerClickRef.current) {
        onPointerClickRef.current(event);
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scanSpheres);

      if (intersects.length > 0) {
        const clickedSphere = intersects[0].object;
        if (activeSphereRef.current === clickedSphere) return;

        const targetPos = clickedSphere.userData.realPosition;
        const targetQuat = clickedSphere.userData.rotation_quaternion;
        const scanId = clickedSphere.userData.id;

        document.body.style.cursor = 'wait';

        loadPanoramaTextures(scanId, renderer).then((loadedTextures) => {
          document.body.style.cursor = 'default';
          controls.enabled = false;

          const lookAtDirection = new THREE.Vector3();
          camera.getWorldDirection(lookAtDirection);

          // Identify box roles
          const currentBox = activeBoxIndexRef.current === 1 ? box1Ref.current : box2Ref.current;
          const nextBox = activeBoxIndexRef.current === 1 ? box2Ref.current : box1Ref.current;
          const nextGroup = activeBoxIndexRef.current === 1 ? panoramaGroup2Ref.current : panoramaGroup1Ref.current;

          const isFirstClick = activeSphereRef.current === null;

          // Prepare the NEXT box with new textures immediately
          nextBox.material.forEach((mat, i) => {
            if (mat.map && mat.map !== dummyTex) mat.map.dispose();
            mat.map = loadedTextures[i];
            mat.needsUpdate = true;
          });

          // Teleport NEXT group to destination
          nextGroup.position.copy(targetPos);
          if (targetQuat) {
            const q = new THREE.Quaternion(targetQuat[1], targetQuat[2], targetQuat[3], targetQuat[0]);
            nextGroup.setRotationFromQuaternion(q);
            nextGroup.rotateZ(Math.PI / 2);
          }

          // Force renderer to acknowledge new textures before animating
          renderer.compile(sceneRef.current, camera);

          // Wrap in RAF to prevent GSAP/WebGL start-of-frame lag
          requestAnimationFrame(() => {
            executeFlightAnimation({
              camera,
              controls,
              targetPos,
              lookAtDirection,
              currentBox,
              nextBox,
              model: modelRef.current,
              isFirstClick,
              onComplete: () => {
                // Final State cleanup
                if (modelRef.current) {
                  modelRef.current.visible = true;
                  modelRef.current.traverse((child) => {
                    if (child.isMesh && child.material) {
                      const mats = Array.isArray(child.material) ? child.material : [child.material];
                      mats.forEach(mat => {
                        mat.colorWrite = false;
                        mat.depthWrite = true;
                        mat.transparent = true;
                        mat.side = THREE.DoubleSide;
                        mat.needsUpdate = true;
                      });
                    }
                  });
                }
                if (!isFirstClick && currentBox) {
                  currentBox.visible = false;
                  // Immediately free GPU memory from the old panorama
                  currentBox.material.forEach((mat) => {
                    if (mat.map && mat.map !== dummyTex) {
                      mat.map.dispose();
                      mat.map = dummyTex;
                      mat.needsUpdate = true;
                    }
                  });
                }

                // Swap Active Box index
                activeBoxIndexRef.current = activeBoxIndexRef.current === 1 ? 2 : 1;

                setIsInscan(true);
                setIsMeshView(false);

                controls.enabled = true;
                controls.update();

                if (activeSphereRef.current) activeSphereRef.current.visible = true;
                clickedSphere.visible = false;
                activeSphereRef.current = clickedSphere;
              }
            });
          });
        });
      }
    };

    renderer.domElement.addEventListener('click', onClick);

    return () => {
      renderer.domElement.removeEventListener('click', onClick);
    };
  }, [isDataLoaded, scanSpheres, cameraRef, rendererRef, controlsRef, sceneRef, modelRef, box1Ref, box2Ref, panoramaGroup1Ref, panoramaGroup2Ref, loadPanoramaTextures, dummyTex]);


  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {isInscan && (
        <>
          <button 
            onClick={(e) => { e.stopPropagation(); handleToggleMeshView(); }}
            style={{
              position: 'absolute',
              bottom: 30,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              padding: '12px 24px',
              background: 'rgba(15, 15, 15, 0.85)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '30px',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              fontWeight: 'bold',
              fontSize: '14px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(40, 40, 40, 0.95)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(15, 15, 15, 0.85)'}
          >
            {isMeshView ? 'Return to 360 View' : 'Inspect 3D Mesh'}
          </button>
        </>
      )}

      {/* Tag Info Popup (Engine/Read-only mode) */}
      {activeTagInfo && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1100,
            background: 'rgba(12, 12, 20, 0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 229, 255, 0.25)',
            borderRadius: '16px',
            padding: '24px',
            minWidth: '300px',
            maxWidth: '420px',
            color: '#fff',
            boxShadow: '0 12px 48px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 229, 255, 0.08)',
            animation: 'tagInfoSlideUp 0.3s ease-out',
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setActiveTagInfo(null)}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.6)',
              borderRadius: '50%',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              lineHeight: 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            ✕
          </button>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(0, 150, 200, 0.6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 0 16px rgba(0, 229, 255, 0.3)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </div>
            <div style={{ paddingRight: 20 }}>
              <h3 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: '#fff',
              }}>
                {activeTagInfo.title}
              </h3>
              <span style={{ fontSize: '11px', color: 'rgba(0, 229, 255, 0.7)', fontWeight: 500 }}>Annotation Point</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(0,229,255,0.3), transparent)', marginBottom: 14 }} />

          {/* Description */}
          {activeTagInfo.description ? (
            <p style={{
              margin: '0 0 16px 0',
              fontSize: '13px',
              lineHeight: 1.6,
              color: 'rgba(255,255,255,0.75)',
            }}>
              {activeTagInfo.description}
            </p>
          ) : (
            <p style={{
              margin: '0 0 16px 0',
              fontSize: '13px',
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.35)',
            }}>
              No description provided.
            </p>
          )}

          {/* Documents */}
          {activeTagInfo.documents && activeTagInfo.documents.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attached Documents</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeTagInfo.documents.map(doc => (
                  <a
                    key={doc.id}
                    href={`http://localhost:9000/virtual-tours/${doc.fileUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 14px',
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: '8px',
                      color: 'rgba(0, 229, 255, 0.95)',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 500,
                      border: '1px solid rgba(255,255,255,0.08)',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doc.title}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Animation keyframes for tag info popup */}
      <style>{`
        @keyframes tagInfoSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
});

ModelAndScansViewer.displayName = 'ModelAndScansViewer';

export default ModelAndScansViewer;
