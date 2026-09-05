import { useRef, useCallback, useState, useEffect } from 'react';
import * as THREE from 'three';
import { 
  faInfoCircle, faExclamationTriangle, faCommentDots, faQuestionCircle, 
  faHandPaper, faLightbulb, faWrench, faCamera, faDoorClosed, faBuilding, 
  faWheelchair, faBolt, faLock, faTint, faFire 
} from '@fortawesome/free-solid-svg-icons';
import { API_URL as API } from '../config/api';

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

// Standard screen-space base scale for tags (invariant to distance, crisp and legible from 1m to 1000m)
export const TAG_BASE_SCALE_Y = 0.11;
export const TAG_BASE_SCALE_X = TAG_BASE_SCALE_Y * (384 / 512); // 0.0825 (matches 384x512 aspect ratio)

/**
 * Creates a modern, high-DPI Matterport-style tag-pin sprite texture via Canvas API.
 * Features:
 * - Ground target ring at the exact 3D surface contact point
 * - Sleek connecting stem
 * - Glowing circular pin head with centered FontAwesome icon
 * - Dark-glass pill badge with glowing border for 100% title legibility against any terrain
 * - Screen-space constant sizing (sizeAttenuation: false)
 */
export function createTagSpriteMaterial(title, icon = 'info', color = '#00e5ff', isSelected = false) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 384;
  canvas.height = 512;
  const cx = 192;

  const baseColor = color || '#00e5ff';

  // 1. Ground Target Ring & Anchor Point (contacts 3D model at center.set(0.5, 0.0))
  // Elliptical ground contact pulse ring
  ctx.beginPath();
  ctx.ellipse(cx, 500, 22, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(baseColor, 0.25);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hexToRgba(baseColor, 0.85);
  ctx.stroke();

  // Contact center dot
  ctx.beginPath();
  ctx.arc(cx, 500, 6, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(baseColor, 1.0);
  ctx.shadowColor = hexToRgba(baseColor, 0.9);
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 2. Stem Line (Connecting ground anchor to pin head)
  ctx.beginPath();
  ctx.moveTo(cx, 262);
  ctx.lineTo(cx, 494);
  ctx.strokeStyle = hexToRgba(baseColor, 0.45);
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, 262);
  ctx.lineTo(cx, 494);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 3. Main Pin Head Circle
  const headY = 215;
  const headRadius = 46;

  // Outer glowing halo when selected
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(cx, headY, 62, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(baseColor, 0.65);
    ctx.lineWidth = 4;
    ctx.shadowColor = hexToRgba(baseColor, 0.95);
    ctx.shadowBlur = 25;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Outer circular head with radial gradient
  ctx.beginPath();
  ctx.arc(cx, headY, headRadius, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(cx, headY - 10, 5, cx, headY, headRadius);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, hexToRgba(baseColor, 1.0));
  grad.addColorStop(1, hexToRgba(baseColor, 0.85));
  ctx.fillStyle = grad;
  ctx.shadowColor = hexToRgba(baseColor, isSelected ? 0.95 : 0.65);
  ctx.shadowBlur = isSelected ? 24 : 14;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.stroke();

  // Inner white circle
  ctx.beginPath();
  ctx.arc(cx, headY, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;

  // FontAwesome Icon inside inner circle
  const iconDef = iconMap[icon] || faInfoCircle;
  const [width, height, _ligatures, _unicode, svgPath] = iconDef.icon;

  ctx.save();
  const targetSize = 32;
  const scale = targetSize / Math.max(width, height);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  ctx.translate(cx - scaledWidth / 2, headY - scaledHeight / 2);
  ctx.scale(scale, scale);

  const p = new Path2D(svgPath);
  ctx.fillStyle = '#0f172a'; // Crisp slate-900 icon core
  ctx.fill(p);
  ctx.restore();

  // 4. Title Label (Floating above the head with sleek dark-glass pill)
  if (title) {
    const label = title.length > 20 ? title.slice(0, 19) + '…' : title;
    ctx.font = 'bold 22px Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textMetrics = ctx.measureText(label);
    const pillWidth = Math.min(350, Math.max(120, textMetrics.width + 36));
    const pillHeight = 44;
    const pillX = cx - pillWidth / 2;
    const pillY = 95;

    // Dark-glass pill background
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 22);
    } else {
      ctx.rect(pillX, pillY, pillWidth, pillHeight);
    }
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.shadowColor = isSelected ? hexToRgba(baseColor, 0.85) : 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = isSelected ? 16 : 8;
    ctx.fill();

    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeStyle = isSelected ? '#ffffff' : hexToRgba(baseColor, 0.75);
    ctx.stroke();
    ctx.restore();

    // Bottom pointer arrow
    ctx.beginPath();
    ctx.moveTo(cx - 8, pillY + pillHeight);
    ctx.lineTo(cx, pillY + pillHeight + 8);
    ctx.lineTo(cx + 8, pillY + pillHeight);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fill();

    // Text inside pill
    ctx.font = 'bold 22px Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, cx, pillY + pillHeight / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
    sizeAttenuation: false,
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
  const isCreatingRef = useRef(false);

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

    // Remove any pre-existing sprite for this tagId to guarantee no duplicate 3D pins
    const existing = group.children.find(child => child.userData?.tagId === tag.id);
    if (existing) {
      group.remove(existing);
      if (existing.material?.map) existing.material.map.dispose();
      if (existing.material) existing.material.dispose();
    }

    const mat = createTagSpriteMaterial(tag.title, tag.icon, tag.color, false);
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(tag.posX, tag.posY, tag.posZ);
    
    // Set the anchor point so that the stem touches the exact 3D vertex
    // (X: 0.5 is center, Y: 0.0 is the complete bottom of the canvas)
    sprite.center.set(0.5, 0.0);
    
    // Base scale modified by custom tag size value
    const sizeMult = Math.min(2.0, Math.max(0.6, Number(tag.size) || 1.0));
    sprite.scale.set(TAG_BASE_SCALE_X * sizeMult, TAG_BASE_SCALE_Y * sizeMult, 1);
    
    sprite.renderOrder = 1000;
    sprite.userData = {
      tagId: tag.id,
      title: tag.title,
      icon: tag.icon,
      color: tag.color,
      size: sizeMult,
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

    fetch(`${API}/inspections/${tourId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(tour => {
        if (tour.tags && tour.tags.length > 0) {
          // Deduplicate tags by id
          const seen = new Set();
          const loaded = [];
          for (const t of tour.tags) {
            if (!seen.has(t.id)) {
              seen.add(t.id);
              loaded.push({ ...t, sprite: null });
            }
          }
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
    if (event?.clientX !== undefined && trySelectTag(event)) return;

    // 2. Otherwise raycast against the model to place a new tag
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    const model = viewerRef.current?.modelRef?.current;
    const tilesGroup = viewerRef.current?.tilesetEngine?.getGroup?.() || viewerRef.current?.tilesetEngineRef?.current?.getGroup?.();
    if (!renderer || !camera) return;

    let hitPoint = null;
    if (event?.isVector3) {
      hitPoint = event.clone();
    } else if (event?.clientX !== undefined) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      const meshes = [];
      if (model) {
        model.traverse((child) => {
          if (child.isMesh) meshes.push(child);
        });
      }
      if (tilesGroup) {
        tilesGroup.traverse((child) => {
          if (child.isMesh) meshes.push(child);
        });
      }

      if (meshes.length === 0) return;

      const intersects = raycaster.intersectObjects(meshes, true);
      if (intersects.length === 0) return;

      hitPoint = intersects[0].point.clone();
    }

    if (!hitPoint) return;

    // Prompt for title
    if (onPromptTitle) {
      onPromptTitle(hitPoint);
    }
  }, [viewerRef, trySelectTag]);

  // ─── Create Tag (after title prompt) ──────────────
  const createTag = useCallback(async (title, position) => {
    const token = getToken();
    if (!token || !tourId) return null;
    if (isCreatingRef.current) return null; // Prevent double-trigger
    isCreatingRef.current = true;

    try {
      const res = await fetch(`${API}/inspections/${tourId}/tags`, {
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
      setTags(prev => {
        if (prev.some(t => t.id === newTag.id)) return prev;
        return [...prev, { ...newTag, sprite }];
      });
      setSelectedTagId(newTag.id);
      updateSpriteSelection(newTag.id);

      return newTag;
    } catch (err) {
      console.error('Tag creation failed:', err);
      return null;
    } finally {
      isCreatingRef.current = false;
    }
  }, [tourId, addTagSprite]);

  // ─── Update Tag Info ──────────────────────────────
  const updateTag = useCallback(async (tagId, data) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/inspections/${tourId}/tags/${tagId}`, {
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
          const sprite = t.sprite || tagsGroupRef.current?.children.find(c => c.userData?.tagId === tagId);
          if (sprite) {
            if (data.title !== undefined || data.icon !== undefined || data.color !== undefined) {
              const newTitle = data.title !== undefined ? data.title : t.title;
              const newIcon = data.icon !== undefined ? data.icon : t.icon;
              const newColor = data.color !== undefined ? data.color : t.color;
              const mat = createTagSpriteMaterial(newTitle, newIcon, newColor, selectedTagId === tagId);
              if (sprite.material.map) sprite.material.map.dispose();
              sprite.material.dispose();
              sprite.material = mat;
              
              sprite.userData.title = newTitle;
              sprite.userData.icon = newIcon;
              sprite.userData.color = newColor;
            }
            if (data.size !== undefined) {
              const sizeMult = Math.min(2.0, Math.max(0.6, Number(data.size) || 1.0));
              const isActive = selectedTagId === tagId;
              const activeBump = isActive ? 1.15 : 1.0;
              sprite.scale.set(TAG_BASE_SCALE_X * sizeMult * activeBump, TAG_BASE_SCALE_Y * sizeMult * activeBump, 1);
              sprite.userData.size = sizeMult;
            }
          }
          return { ...t, ...updated, sprite: sprite || t.sprite };
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
      const urlRes = await fetch(`${API}/inspections/${tourId}/tags/${tagId}/documents`, {
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
      const res = await fetch(`${API}/inspections/${tourId}/tags/${tagId}/documents/${docId}`, {
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
      const res = await fetch(`${API}/inspections/${tourId}/tags/${tagId}`, {
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
      const baseMult = Math.min(2.0, Math.max(0.6, Number(sprite.userData.size) || 1.0));
      const activeBump = isActive ? 1.15 : 1.0;
      
      // Update Selection Scale
      sprite.scale.set(
        TAG_BASE_SCALE_X * baseMult * activeBump, 
        TAG_BASE_SCALE_Y * baseMult * activeBump, 
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
