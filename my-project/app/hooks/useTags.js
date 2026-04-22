import { useRef, useCallback, useState, useEffect } from 'react';
import * as THREE from 'three';
import { 
  faInfoCircle, faExclamationTriangle, faCommentDots, faQuestionCircle, 
  faHandPaper, faLightbulb, faWrench, faCamera, faDoorClosed, faBuilding, 
  faWheelchair, faBolt, faLock, faTint, faFire 
} from '@fortawesome/free-solid-svg-icons';

const API = 'http://localhost:3000';

/**
 * Converts a hex color string to rgba format.
 */
export function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') hex = '#00e5ff';
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${isNaN(r) ? 0 : r}, ${isNaN(g) ? 229 : g}, ${isNaN(b) ? 255 : b}, ${alpha})`;
}

export const iconMap = {
  info: faInfoCircle, alert: faExclamationTriangle, remark: faCommentDots, question: faQuestionCircle, stop: faHandPaper, 
  idea: faLightbulb, wrench: faWrench, camera: faCamera, door: faDoorClosed, building: faBuilding, 
  accessibility: faWheelchair, lightning: faBolt, lock: faLock, water: faTint, fire: faFire
};

/**
 * Creates a Matterport-style tag-pin sprite texture via Canvas API.
 */
export function createTagSpriteMaterial(title, icon = 'info', color = '#00e5ff', isSelected = false) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 200;
  canvas.height = 300;
  const cx = 100;

  const baseColor = color;

  // 1. Base Dot (This will physically touch the 3D model)
  ctx.beginPath();
  ctx.arc(cx, 290, 6, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(baseColor, 0.9);
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0; // reset

  // 2. Stem Line (Connecting base to the main circle)
  ctx.beginPath();
  ctx.moveTo(cx, 140);
  ctx.lineTo(cx, 284);
  ctx.strokeStyle = hexToRgba(baseColor, 0.9);
  ctx.lineWidth = 4;
  ctx.stroke();

  // 3. Main Circle (Head)
  ctx.beginPath();
  ctx.arc(cx, 100, 42, 0, Math.PI * 2);
  
  const grad = ctx.createRadialGradient(cx, 100, 5, cx, 100, 42);
  grad.addColorStop(0, hexToRgba(baseColor, 1));
  grad.addColorStop(1, hexToRgba(baseColor, 0.7));
  ctx.fillStyle = grad;
  ctx.shadowColor = hexToRgba(baseColor, isSelected ? 0.9 : 0.6);
  ctx.shadowBlur = isSelected ? 30 : 20;
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // 4. Inner Ring/Icon
  ctx.beginPath();
  ctx.arc(cx, 100, 24, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();

  const iconDef = iconMap[icon] || faInfoCircle;
  // FontAwesome icon format: [width, height, ligatures, unicode, svgPath]
  const [width, height, _ligatures, _unicode, svgPath] = iconDef.icon;

  ctx.save();
  const targetSize = 26; // 26x26 icon scaling inside 48x48 space
  const scale = targetSize / Math.max(width, height);
  
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  
  ctx.translate(cx - scaledWidth / 2, 100 - scaledHeight / 2);
  ctx.scale(scale, scale);
  
  const p = new Path2D(svgPath);
  ctx.fillStyle = '#1e293b'; // professional slate-800 color for the icon core
  ctx.fill(p);
  ctx.restore();

  // 5. Title Label (Floating above the head)
  if (title) {
    const label = title.length > 15 ? title.slice(0, 14) + '…' : title;
    ctx.font = 'bold 16px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(label, cx, 40);
    ctx.fillText(label, cx, 40);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  return new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
    sizeAttenuation: true,
  });
}

/**
 * Tag management hook for the Studio editor.
 * Places interactive tag sprites on the GLB model surface.
 *
 * @param {React.MutableRefObject} viewerRef - Ref to the ModelAndScansViewer imperative handle
 * @param {string} tourId - Current tour id
 */
export const useTags = (viewerRef, tourId) => {
  const [tags, setTags] = useState([]);
  const [selectedTagId, setSelectedTagId] = useState(null);
  const tagsGroupRef = useRef(null);

  const getToken = () => localStorage.getItem('access_token');

  // ─── Ensure Tags Group ────────────────────────────
  const ensureTagsGroup = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (!tagsGroupRef.current && scene) {
      // Check if useTourData already created a read-only tagMarkers group
      const existing = scene.getObjectByName('tagMarkers');
      if (existing) {
        // Take ownership: clear the read-only sprites so we can manage interactive ones
        while (existing.children.length > 0) {
          const child = existing.children[0];
          existing.remove(child);
          if (child.material?.map) child.material.map.dispose();
          if (child.material) child.material.dispose();
        }
        tagsGroupRef.current = existing;
      } else {
        const group = new THREE.Group();
        group.name = 'tagMarkers';
        group.renderOrder = 998;
        scene.add(group);
        tagsGroupRef.current = group;
      }
    }
    return tagsGroupRef.current;
  }, [viewerRef]);

  // ─── Force Viewer Render ──────────────────────────
  const triggerRender = useCallback(() => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const scene = viewerRef.current?.sceneRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }, [viewerRef]);

  // ─── Add Sprite to Scene ──────────────────────────
  const addTagSprite = useCallback((tag) => {
    const group = ensureTagsGroup();
    if (!group) return null;

    const mat = createTagSpriteMaterial(tag.title, tag.icon, tag.color, false);
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(tag.posX, tag.posY, tag.posZ);
    
    // Set the anchor point so that the stem touches the exact 3D vertex
    // (X: 0.5 is center, Y: 0.0 is the complete bottom of the canvas)
    sprite.center.set(0.5, 0.0);
    
    // Base scale modified by custom tag size value
    const sizeMult = tag.size ?? 1.0;
    sprite.scale.set(0.4 * sizeMult, 0.6 * sizeMult, 1);
    
    sprite.renderOrder = 1000;
    sprite.userData = {
      tagId: tag.id,
      title: tag.title,
      icon: tag.icon,
      color: tag.color,
      size: tag.size ?? 1.0,
      isActive: false
    };
    group.add(sprite);
    return sprite;
  }, [ensureTagsGroup]);

  // ─── Load Existing Tags ───────────────────────────
  useEffect(() => {
    if (!tourId) return;
    const token = getToken();
    if (!token) return;

    fetch(`${API}/tours/${tourId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(tour => {
        if (tour.tags && tour.tags.length > 0) {
          const loaded = tour.tags.map(t => ({
            ...t,
            sprite: null, // will be set once group is ready
          }));
          setTags(loaded);
        }
      })
      .catch(err => console.error('Failed to load tags:', err));
  }, [tourId]);

  // Materialize sprites once Three.js scene + data are both ready
  useEffect(() => {
    if (tags.length === 0) return;

    // We must wait until the sceneRef is populated by the viewer component
    const tryInitSprites = () => {
      const scene = viewerRef.current?.sceneRef?.current;
      if (!scene) return false;
      
      const group = ensureTagsGroup();
      if (!group) return false;

      let changed = false;
      const nextTags = tags.map((tag) => {
        if (!tag.sprite) {
          const sprite = addTagSprite(tag);
          if (sprite) {
            changed = true;
            return { ...tag, sprite };
          }
        }
        return tag;
      });

      if (changed) {
        setTags(nextTags);
      }
      return true;
    };

    // Attempt immediately
    if (!tryInitSprites()) {
      // If scene is not ready, poll for it
      const interval = setInterval(() => {
        if (tryInitSprites()) {
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [tags, ensureTagsGroup, addTagSprite, viewerRef]);

  // ─── Try Select Existing Tag ────────────────────────
  const trySelectTag = useCallback((event) => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    if (!renderer || !camera) return false;

    const group = ensureTagsGroup();
    if (group && group.children.length > 0) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      const spriteIntersects = raycaster.intersectObjects(group.children, false);
      if (spriteIntersects.length > 0) {
        const clickedTagId = spriteIntersects[0].object.userData.tagId;
        setSelectedTagId(clickedTagId);
        updateSpriteSelection(clickedTagId);
        return true;
      }
    }
    return false;
  }, [viewerRef, ensureTagsGroup]);

  // ─── Handle Tag Placement Click ───────────────────
  const handleTagClick = useCallback((event, onPromptTitle) => {
    // 1. Try to select a tag first
    if (trySelectTag(event)) return;

    // 2. Otherwise raycast against the model to place a new tag
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    const model = viewerRef.current?.modelRef?.current;
    if (!renderer || !camera || !model) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const meshes = [];
    model.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });

    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) return;

    const hitPoint = intersects[0].point.clone();

    // Prompt for title
    if (onPromptTitle) {
      onPromptTitle(hitPoint);
    }
  }, [viewerRef, trySelectTag]);

  // ─── Create Tag (after title prompt) ──────────────
  const createTag = useCallback(async (title, position) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/tours/${tourId}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          posX: position.x,
          posY: position.y,
          posZ: position.z,
        }),
      });

      if (!res.ok) throw new Error('Failed to create tag');
      const newTag = await res.json();

      const sprite = addTagSprite(newTag);
      setTags(prev => [...prev, { ...newTag, sprite }]);
      setSelectedTagId(newTag.id);
      updateSpriteSelection(newTag.id);

      return newTag;
    } catch (err) {
      console.error('Tag creation failed:', err);
    }
  }, [tourId, addTagSprite]);

  // ─── Update Tag Info ──────────────────────────────
  const updateTag = useCallback(async (tagId, data) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/tours/${tourId}/tags/${tagId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Failed to update tag');
      const updated = await res.json();

      setTags(prev => prev.map(t => {
        if (t.id === tagId) {
          if (t.sprite) {
            if (data.title !== undefined || data.icon !== undefined || data.color !== undefined) {
              const newTitle = data.title !== undefined ? data.title : t.title;
              const newIcon = data.icon !== undefined ? data.icon : t.icon;
              const newColor = data.color !== undefined ? data.color : t.color;
              const mat = createTagSpriteMaterial(newTitle, newIcon, newColor, selectedTagId === tagId);
              t.sprite.material.map?.dispose();
              t.sprite.material.dispose();
              t.sprite.material = mat;
              
              t.sprite.userData.title = newTitle;
              t.sprite.userData.icon = newIcon;
              t.sprite.userData.color = newColor;
            }
            if (data.size !== undefined) {
              const sizeMult = data.size;
              t.sprite.scale.set(0.4 * sizeMult, 0.6 * sizeMult, 1);
              t.sprite.userData.size = sizeMult;
            }
          }
          return { ...t, ...updated };
        }
        return t;
      }));
      // Force 3D viewer to render the new tag parameters instantly
      triggerRender();
    } catch (err) {
      console.error('Tag update failed:', err);
    }
  }, [tourId, selectedTagId, triggerRender]);

  // ─── Add Tag Document ──────────────────────────────
  const addTagDocument = useCallback(async (tagId, title, file) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      // 1. Get presigned URL and create document record
      const urlRes = await fetch(`${API}/tours/${tourId}/tags/${tagId}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title, fileName: file.name }),
      });

      if (!urlRes.ok) throw new Error('Failed to create document record');
      const { presignedUrl, document } = await urlRes.json();

      // 2. Upload file directly to MinIO
      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });

      if (!uploadRes.ok) throw new Error('File upload failed');

      // Update local state with the new document
      setTags(prev => prev.map(t => {
        if (t.id === tagId) {
          return { ...t, documents: [...(t.documents || []), document] };
        }
        return t;
      }));

      return document;
    } catch (err) {
      console.error('Tag document upload failed:', err);
    }
  }, [tourId]);

  // ─── Delete Tag Document ───────────────────────────
  const deleteTagDocument = useCallback(async (tagId, docId) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/tours/${tourId}/tags/${tagId}/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to delete document');

      // Update local state
      setTags(prev => prev.map(t => {
        if (t.id === tagId) {
          return { ...t, documents: (t.documents || []).filter(d => d.id !== docId) };
        }
        return t;
      }));

    } catch (err) {
      console.error('Tag document deletion failed:', err);
    }
  }, [tourId]);


  // ─── Delete Tag ───────────────────────────────────
  const deleteTag = useCallback(async (tagId) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/tours/${tourId}/tags/${tagId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to delete tag');

      // Remove sprite from scene
      setTags(prev => {
        const target = prev.find(t => t.id === tagId);
        if (target?.sprite && tagsGroupRef.current) {
          tagsGroupRef.current.remove(target.sprite);
          if (target.sprite.material.map) target.sprite.material.map.dispose();
          target.sprite.material.dispose();
        }
        return prev.filter(t => t.id !== tagId);
      });

      if (selectedTagId === tagId) setSelectedTagId(null);
    } catch (err) {
      console.error('Tag deletion failed:', err);
    }
  }, [tourId, selectedTagId]);

  // ─── Select Tag ───────────────────────────────────
  const selectTag = useCallback((tagId) => {
    setSelectedTagId(tagId);
    updateSpriteSelection(tagId);
  }, []);

  const deselectTag = useCallback(() => {
    setSelectedTagId(null);
    updateSpriteSelection(null);
  }, []);

  // ─── Sprite Selection Visuals ─────────────────────
  const updateSpriteSelection = (activeId) => {
    if (!tagsGroupRef.current) return;
    tagsGroupRef.current.children.forEach(sprite => {
      const isActive = sprite.userData.tagId === activeId;
      const baseMult = sprite.userData.size ?? 1.0;
      
      // Update Selection Scale
      sprite.scale.set(
        (isActive ? 0.48 : 0.4) * baseMult, 
        (isActive ? 0.72 : 0.6) * baseMult, 
        1
      );
      
      // Update the Material Color if we want to show it as selected
      // Since sprite material generation is expensive, we only re-render if its active state changed
      if (sprite.userData.isActive !== isActive) {
        sprite.userData.isActive = isActive;
        if (sprite.userData.title !== undefined) {
           const mat = createTagSpriteMaterial(
             sprite.userData.title, 
             sprite.userData.icon, 
             sprite.userData.color, 
             isActive
           );
           if (sprite.material.map) sprite.material.map.dispose();
           sprite.material.dispose();
           sprite.material = mat;
        }
      }
    });
    
    // Force a canvas redraw because we are manually replacing static materials while passive
    triggerRender();
  };

  const selectedTag = tags.find(t => t.id === selectedTagId) || null;

  return {
    tags,
    selectedTag,
    selectedTagId,
    trySelectTag,
    handleTagClick,
    createTag,
    updateTag,
    addTagDocument,
    deleteTagDocument,
    deleteTag,
    selectTag,
    deselectTag,
  };
};
