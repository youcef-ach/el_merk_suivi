import { useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import ProtectedRoute from '../components/ProtectedRoute';
import ModelAndScansViewer from '../components/ModelAndScansViewer';
import TagPanel from '../components/TagPanel';
import { useMeasurement } from '../hooks/useMeasurement';
import { useTags } from '../hooks/useTags';
import { useAreaPointers } from '../hooks/useAreaPointers';
import AreaPointersPanel from '../components/AreaPointersPanel';
import './studio.css';

export function meta() {
  return [{ title: "Edit Studio | VirtualTwin SaaS" }];
}

function StudioContent() {
  const navigate = useNavigate();
  const { id } = useParams();
  const viewerRef = useRef(null);
  const [measurementMode, setMeasurementMode] = useState(false);
  const [tagMode, setTagMode] = useState(false);
  const [pointersMode, setPointersMode] = useState(false);

  // ─── Tag title prompt state ───
  const [titlePrompt, setTitlePrompt] = useState(null); // { position: Vector3 } or null
  const [promptTitle, setPromptTitle] = useState('');

  // ─── Area Pointer prompt state ───
  const [pointerPrompt, setPointerPrompt] = useState(null);
  const [promptPointerName, setPromptPointerName] = useState('');

  // ─── Measurement hook ───
  const {
    measurements,
    hasPendingPoint,
    handleMeasurementClick,
    removeMeasurement,
    clearAllMeasurements,
    cancelPending
  } = useMeasurement(viewerRef);

  // ─── Tags hook ───
  const {
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
  } = useTags(viewerRef, id);

  // ─── Area Pointers hook ───
  const {
    areaPointers,
    selectedPointer,
    selectedPointerId,
    trySelectPointer,
    handlePointerClick,
    createPointer,
    updatePointer,
    deletePointer,
    selectPointer,
    deselectPointer,
    tryStartDrag,
    handleDragMove,
    handleDragEnd,
    isDragging,
  } = useAreaPointers(viewerRef, id);

  // ─── Tool toggle (mutually exclusive) ───
  const toggleMeasurement = useCallback(() => {
    setMeasurementMode(prev => {
      if (prev) cancelPending();
      return !prev;
    });
    setTagMode(false);
    setPointersMode(false);
  }, [cancelPending]);

  const toggleTagMode = useCallback(() => {
    setTagMode(prev => !prev);
    setMeasurementMode(prev => {
      if (prev) cancelPending();
      return false;
    });
    setPointersMode(false);
  }, [cancelPending]);

  const togglePointerMode = useCallback(() => {
    setPointersMode(prev => !prev);
    setTagMode(false);
    setMeasurementMode(prev => {
      if (prev) cancelPending();
      return false;
    });
  }, [cancelPending]);

  // ─── Tag click handler (wraps hook to show prompt) ───
  const onTagClickHandler = useCallback((event) => {
    handleTagClick(event, (position) => {
      // Show title prompt instead of creating immediately
      setTitlePrompt({ position });
      setPromptTitle('');
    });
  }, [handleTagClick]);

  const confirmTagPlacement = useCallback(async () => {
    if (!titlePrompt || !promptTitle.trim()) return;
    await createTag(promptTitle.trim(), titlePrompt.position);
    setTitlePrompt(null);
    setPromptTitle('');
  }, [titlePrompt, promptTitle, createTag]);

  const cancelTagPlacement = useCallback(() => {
    setTitlePrompt(null);
    setPromptTitle('');
  }, []);

  const handleDeleteTag = useCallback(async (tagId) => {
    await deleteTag(tagId);
    // Panel closes automatically when selectedTag becomes null
  }, [deleteTag]);

  // ─── Pointer click handler ───
  const onPointerClickHandler = useCallback((event) => {
    handlePointerClick(event, (position) => {
      setPointerPrompt({ position });
      setPromptPointerName('');
    });
  }, [handlePointerClick]);

  const confirmPointerPlacement = useCallback(async () => {
    if (!pointerPrompt || !promptPointerName.trim()) return;
    await createPointer(promptPointerName.trim(), '#ff0000', pointerPrompt.position);
    setPointerPrompt(null);
    setPromptPointerName('');
  }, [pointerPrompt, promptPointerName, createPointer]);

  const cancelPointerPlacement = useCallback(() => {
    setPointerPrompt(null);
    setPromptPointerName('');
  }, []);

  return (
    <div className="studio-layout">
      {/* 3D Viewport */}
      <div className={`studio-viewport ${measurementMode ? 'measurement-cursor-active' : ''} ${tagMode ? 'tag-cursor-active' : ''} ${pointersMode ? 'pointer-cursor-active' : ''}`}>
        <button className="studio-back-btn" onClick={() => navigate('/dashboard')}>
          ← Dashboard
        </button>
        <ModelAndScansViewer 
          ref={viewerRef}
          tourId={id} 
          measurementMode={measurementMode}
          onMeasurementClick={handleMeasurementClick}
          tagMode={tagMode}
          onTagClick={onTagClickHandler}
          onTagSelect={trySelectTag}
          pointersMode={pointersMode}
          onPointerClick={onPointerClickHandler}
          onPointerSelect={trySelectPointer}
          onPointerDragStart={tryStartDrag}
          onPointerDragMove={handleDragMove}
          onPointerDragEnd={handleDragEnd}
        />
      </div>

      {/* Right Sidebar */}
      <div className="studio-sidebar">
        <div className="sidebar-header">
          <h2>Studio Tools</h2>
          <p>Architecture analysis & editing</p>
        </div>

        {/* ─── Measurement Tool Section ─── */}
        <div className="tool-section">
          <h3 className="tool-section-title">Measurement</h3>
          
          <button 
            className={`measure-toggle ${measurementMode ? 'active' : ''}`}
            onClick={toggleMeasurement}
          >
            <span className="measure-toggle-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
                <path d="m14.5 12.5 2-2" />
                <path d="m11.5 9.5 2-2" />
                <path d="m8.5 6.5 2-2" />
                <path d="m17.5 15.5 2-2" />
              </svg>
            </span>
            {measurementMode ? 'Measuring...' : 'Measure Distance'}
            <span className="status-dot" />
          </button>

          {measurementMode && (
            <div className={`measure-hint ${hasPendingPoint ? 'pending' : ''}`}>
              {hasPendingPoint 
                ? '⬤ Click a second point on the model to complete the measurement.'
                : '⊕ Click any point on the 3D model to start measuring.'}
            </div>
          )}

          {/* Measurements List */}
          {measurements.length > 0 ? (
            <>
              <ul className="measurements-list">
                {measurements.map((m, idx) => (
                  <li key={m.id} className="measurement-item">
                    <div className="measurement-info">
                      <span className="measurement-index">{idx + 1}</span>
                      <span className="measurement-value">
                        {m.distance.toFixed(3)}
                        <span className="measurement-unit">m</span>
                      </span>
                    </div>
                    <button 
                      className="measurement-delete" 
                      onClick={() => removeMeasurement(m.id)}
                      title="Remove measurement"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <button className="clear-all-btn" onClick={clearAllMeasurements}>
                Clear All Measurements
              </button>
            </>
          ) : (
            <div className="empty-measurements">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
              </svg>
              No measurements yet
            </div>
          )}
        </div>

        {/* ─── Tags Tool Section ─── */}
        <div className="tool-section">
          <h3 className="tool-section-title">Tags</h3>

          <button
            className={`measure-toggle ${tagMode ? 'active' : ''}`}
            onClick={toggleTagMode}
          >
            <span className="measure-toggle-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </span>
            {tagMode ? 'Placing Tag...' : 'Place Tag'}
            <span className="status-dot" />
          </button>

          {tagMode && (
            <div className="measure-hint">
              📍 Click on the 3D model to place a tag at that location.
            </div>
          )}

          {/* Tags List */}
          {tags.length > 0 ? (
            <ul className="tags-list">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  className={`tag-list-item ${selectedTagId === tag.id ? 'selected' : ''}`}
                  onClick={() => selectTag(tag.id)}
                >
                  <div className="tag-list-info">
                    <span className="tag-list-pin">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                        <circle cx="12" cy="9" r="2.5" />
                      </svg>
                    </span>
                    <div className="tag-list-text">
                      <span className="tag-list-title">{tag.title}</span>
                      {tag.description && (
                        <span className="tag-list-desc">{tag.description}</span>
                      )}
                    </div>
                  </div>
                  {tag.mediaUrl && (
                    <span className="tag-has-media" title="Has media attached">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-measurements">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              No tags yet
            </div>
          )}
        </div>

        {/* ─── Area Pointers Tool Section ─── */}
        <div className="tool-section">
          <h3 className="tool-section-title">Area Pointers</h3>

          <button
            className={`measure-toggle ${pointersMode ? 'active' : ''}`}
            onClick={togglePointerMode}
          >
            <span className="measure-toggle-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </span>
            {pointersMode ? 'Placing Pointer...' : 'Add Area Pointer'}
            <span className="status-dot" />
          </button>

          {pointersMode && (
            <div className="measure-hint">
              🔦 Click on the 3D model floor to place an area pointer. Show up only in Dollhouse mode.
            </div>
          )}

          {/* Pointers List */}
          {areaPointers.length > 0 ? (
            <ul className="tags-list">
              {areaPointers.map((ap) => (
                <li
                  key={ap.id}
                  className={`tag-list-item ${selectedPointerId === ap.id ? 'selected' : ''}`}
                  onClick={() => selectPointer(ap.id)}
                >
                  <div className="tag-list-info">
                    <span className="tag-list-pin" style={{ color: ap.color || '#ff0000' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                      </svg>
                    </span>
                    <div className="tag-list-text">
                      <span className="tag-list-title">{ap.name}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-measurements">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              No area pointers
            </div>
          )}
        </div>
      </div>

      {/* ─── Tag Panel (edit overlay) ─── */}
      {selectedTag && (
        <TagPanel
          tag={selectedTag}
          onUpdate={updateTag}
          onUploadDocument={addTagDocument}
          onDeleteDocument={deleteTagDocument}
          onDelete={handleDeleteTag}
          onClose={deselectTag}
        />
      )}

      {/* ─── Area Pointers Panel (edit overlay) ─── */}
      {selectedPointer && (
        <AreaPointersPanel
          pointersMode={pointersMode}
          setPointersMode={togglePointerMode}
          selectedPointer={selectedPointer}
          deselectPointer={deselectPointer}
          updatePointer={updatePointer}
          deletePointer={deletePointer}
        />
      )}

      {/* ─── Title Prompt Modal (Tags) ─── */}
      {titlePrompt && (
        <div className="tag-title-prompt-overlay" onClick={cancelTagPlacement}>
          <div className="tag-title-prompt" onClick={(e) => e.stopPropagation()}>
            <h3>Name this Tag</h3>
            <p>Enter a title for the new annotation point.</p>
            <input
              type="text"
              autoFocus
              value={promptTitle}
              onChange={(e) => setPromptTitle(e.target.value)}
              placeholder="e.g. Main Entrance, Skylight, Column A4..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && promptTitle.trim()) confirmTagPlacement();
                if (e.key === 'Escape') cancelTagPlacement();
              }}
            />
            <div className="tag-title-prompt-actions">
              <button className="tag-prompt-cancel" onClick={cancelTagPlacement}>Cancel</button>
              <button
                className="tag-prompt-confirm"
                onClick={confirmTagPlacement}
                disabled={!promptTitle.trim()}
              >
                Place Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Title Prompt Modal (Pointers) ─── */}
      {pointerPrompt && (
        <div className="tag-title-prompt-overlay" onClick={cancelPointerPlacement}>
          <div className="tag-title-prompt" onClick={(e) => e.stopPropagation()}>
            <h3>Name this Area</h3>
            <p>Enter a label for the area pointed to.</p>
            <input
              type="text"
              autoFocus
              value={promptPointerName}
              onChange={(e) => setPromptPointerName(e.target.value)}
              placeholder="e.g. Living Room, Kitchen area..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && promptPointerName.trim()) confirmPointerPlacement();
                if (e.key === 'Escape') cancelPointerPlacement();
              }}
            />
            <div className="tag-title-prompt-actions">
              <button className="tag-prompt-cancel" onClick={cancelPointerPlacement}>Cancel</button>
              <button
                className="tag-prompt-confirm"
                style={{ background: '#ff4d6d' }}
                onClick={confirmPointerPlacement}
                disabled={!promptPointerName.trim()}
              >
                Place Pointer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudioPage() {
  return (
    <ProtectedRoute>
      <StudioContent />
    </ProtectedRoute>
  );
}
