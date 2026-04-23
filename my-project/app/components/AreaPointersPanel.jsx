import { useState } from 'react';
import './TagPanel.css'; // Let's reuse the styling base

export default function AreaPointersPanel({
  pointersMode,
  setPointersMode,
  selectedPointer,
  deselectPointer,
  updatePointer,
  deletePointer
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editHeight, setEditHeight] = useState(15.0);
  const [editThickness, setEditThickness] = useState(0.04);
  const [editLabelSize, setEditLabelSize] = useState(1.0);
  const [editSizeX, setEditSizeX] = useState(3.0);
  const [editSizeY, setEditSizeY] = useState(3.0);
  const [editWallHeight, setEditWallHeight] = useState(3.0);

  // When selection changes, reset edit state
  if (selectedPointer && !isEditing) {
    setEditName(selectedPointer.name);
    setEditColor(selectedPointer.color || '#ff0000');
    setEditHeight(selectedPointer.height ?? 15.0);
    setEditThickness(selectedPointer.thickness ?? 0.04);
    setEditLabelSize(selectedPointer.labelSize ?? 1.0);
    setEditSizeX(selectedPointer.sizeX ?? 3.0);
    setEditSizeY(selectedPointer.sizeY ?? 3.0);
    setEditWallHeight(selectedPointer.wallHeight ?? 3.0);
    setIsEditing(true);
  } else if (!selectedPointer && isEditing) {
    setIsEditing(false);
  }

  const handleSave = () => {
    updatePointer(selectedPointer.id, { 
      name: editName, 
      color: editColor,
      height: parseFloat(editHeight),
      thickness: parseFloat(editThickness),
      labelSize: parseFloat(editLabelSize),
      sizeX: parseFloat(editSizeX),
      sizeY: parseFloat(editSizeY),
      wallHeight: parseFloat(editWallHeight)
    });
  };

  const handleDelete = () => {
    deletePointer(selectedPointer.id);
    setIsEditing(false);
  };

  return (
    <div className="tag-panel-overlay" onClick={deselectPointer}>
      <div className="tag-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tag-panel-header" style={{ borderColor: 'rgba(255, 0, 100, 0.3)' }}>
          <div className="tag-panel-header-info">
            <div className="tag-panel-pin-icon" style={{ background: 'rgba(255, 77, 109, 0.1)', color: '#ff4d6d' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </div>
            <span className="tag-panel-title-label">Area Pointer Config</span>
          </div>
          <button className="tag-panel-close" onClick={deselectPointer}>✕</button>
        </div>

        <div className="tag-panel-body">
          <label className="tag-field-label">Area Name</label>
          <input
            type="text"
            className="tag-field-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          
          <label className="tag-field-label" style={{ marginTop: '10px' }}>Pointer Color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '16px' }}>
            <input
              type="color"
              value={editColor}
              onChange={(e) => setEditColor(e.target.value)}
              style={{ width: '40px', height: '40px', padding: '0', border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{editColor}</span>
          </div>

          <label className="tag-field-label">Laser Height</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <input type="range" min="1.0" max="50.0" step="0.5" value={editHeight} onChange={(e) => setEditHeight(e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontSize: '12px', width: '35px', color: '#ff4d6d' }}>{editHeight}m</span>
          </div>

          <label className="tag-field-label">Wall Height</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <input type="range" min="0.5" max="20.0" step="0.25" value={editWallHeight} onChange={(e) => setEditWallHeight(e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontSize: '12px', width: '35px', color: '#ff4d6d' }}>{editWallHeight}m</span>
          </div>

          <label className="tag-field-label">Laser Thickness</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <input type="range" min="0.01" max="0.5" step="0.01" value={editThickness} onChange={(e) => setEditThickness(e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontSize: '12px', width: '30px', color: '#ff4d6d' }}>{editThickness}</span>
          </div>

          <label className="tag-field-label">Label Size</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <input type="range" min="0.5" max="6.0" step="0.1" value={editLabelSize} onChange={(e) => setEditLabelSize(e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontSize: '12px', width: '30px', color: '#ff4d6d' }}>{editLabelSize}x</span>
          </div>

          <label className="tag-field-label">Area Width (X)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <input type="range" min="0.5" max="30.0" step="0.25" value={editSizeX} onChange={(e) => setEditSizeX(e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontSize: '12px', width: '35px', color: '#ff4d6d' }}>{editSizeX}m</span>
          </div>

          <label className="tag-field-label">Area Depth (Y)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <input type="range" min="0.5" max="30.0" step="0.25" value={editSizeY} onChange={(e) => setEditSizeY(e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontSize: '12px', width: '35px', color: '#ff4d6d' }}>{editSizeY}m</span>
          </div>

          <button className="tag-save-btn" onClick={handleSave} style={{ background: 'linear-gradient(135deg, #ff4d6d, #c9184a)', color: 'white' }}>
            Save Configuration
          </button>
        </div>

        <div className="tag-panel-footer">
          <button className="tag-delete-btn" onClick={handleDelete} style={{ borderColor: 'rgba(255, 74, 90, 0.3)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete Pointer
          </button>
        </div>
      </div>
    </div>
  );
}
