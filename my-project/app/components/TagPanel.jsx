import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { iconMap } from '../hooks/useTags';
import './TagPanel.css';
import { MINIO_URL } from '../config/api';

/**
 * TagPanel — Slide-in overlay panel for editing a selected tag's info + uploading media.
 * 
 * @param {{ tag: object, onUpdate: function, onUpload: function, onDelete: function, onClose: function }} props
 */
export default function TagPanel({ tag, onUpdate, onUploadDocument, onDeleteDocument, onDelete, onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [tagIcon, setTagIcon] = useState('info');
  const [tagColor, setTagColor] = useState('#00e5ff');
  const [tagSize, setTagSize] = useState(1.0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Sync form state when selected tag changes
  useEffect(() => {
    if (tag) {
      setTitle(tag.title || '');
      setDescription(tag.description || '');
      setTagIcon(tag.icon || 'info');
      setTagColor(tag.color || '#00e5ff');
      setTagSize(tag.size ?? 1.0);
      setDocTitle('');
    }
  }, [tag?.id]);

  if (!tag) return null;

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(tag.id, {
      title,
      description,
      icon: tagIcon,
      color: tagColor,
      size: parseFloat(tagSize)
    });
    setSaving(false);
  };

  const handleFileSelect = async (file) => {
    if (!file) return;
    const allowed = ['application/pdf'];
    if (!allowed.includes(file.type)) {
      alert('Only PDF files are accepted.');
      return;
    }
    if (!docTitle.trim()) {
      alert('Please enter a document title first.');
      return;
    }
    setUploading(true);
    await onUploadDocument(tag.id, docTitle.trim(), file);
    setDocTitle('');
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const mediaPreviewUrl = tag.mediaUrl
    ? `${MINIO_URL}/virtual-tours/${tag.mediaUrl}`
    : null;

  const isPdf = tag.mediaUrl?.endsWith('.pdf');

  return (
    <div className="tag-panel-overlay" onClick={onClose}>
      <div className="tag-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tag-panel-header">
          <div className="tag-panel-header-info">
            <div className="tag-panel-pin-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </div>
            <span className="tag-panel-title-label">Tag Details</span>
          </div>
          <button className="tag-panel-close" onClick={onClose}>✕</button>
        </div>

        {/* Form */}
        <div className="tag-panel-body">
          <label className="tag-field-label">Title</label>
          <input
            type="text"
            className="tag-field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter tag title..."
          />

          <label className="tag-field-label">Description</label>
          <textarea
            className="tag-field-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe this point of interest..."
            rows={2}
          />

          <label className="tag-field-label" style={{ marginTop: '10px' }}>Pin Color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '16px' }}>
            <input
              type="color"
              value={tagColor}
              onChange={(e) => setTagColor(e.target.value)}
              style={{ width: '40px', height: '40px', padding: '0', border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{tagColor}</span>
          </div>

          <label className="tag-field-label">Pin Icon</label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '8px',
            marginBottom: '20px',
            background: 'rgba(0,0,0,0.2)',
            padding: '12px',
            borderRadius: '8px'
          }}>
            {Object.keys(iconMap).map(iconId => (
              <button
                key={iconId}
                onClick={() => setTagIcon(iconId)}
                style={{
                  background: tagIcon === iconId ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                  border: tagIcon === iconId ? '1px solid #00e5ff' : '1px solid transparent',
                  borderRadius: '6px',
                  padding: '8px 0',
                  fontSize: '18px',
                  color: tagIcon === iconId ? '#00e5ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <FontAwesomeIcon icon={iconMap[iconId]} />
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label className="tag-field-label" style={{ margin: 0 }}>Pin Size</label>
            <span style={{ fontSize: '11px', color: '#00e5ff', fontWeight: 600, fontFamily: 'monospace' }}>
              {Math.abs(Number(tagSize) - 0.75) < 0.05
                ? 'Compact (0.75x)'
                : Math.abs(Number(tagSize) - 1.0) < 0.05
                ? 'Standard (1.0x)'
                : Math.abs(Number(tagSize) - 1.35) < 0.05
                ? 'Large (1.35x)'
                : `${Number(tagSize).toFixed(2)}x Custom`}
            </span>
          </div>

          {/* Quick Standard Size Presets */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
            {[
              { id: 'compact', label: 'Compact', value: 0.75, sub: 'Small' },
              { id: 'standard', label: 'Standard', value: 1.0, sub: 'Default' },
              { id: 'large', label: 'Large', value: 1.35, sub: 'Prominent' },
            ].map((p) => {
              const isSelectedPreset = Math.abs(Number(tagSize) - p.value) < 0.05;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTagSize(p.value)}
                  style={{
                    background: isSelectedPreset ? 'rgba(0, 229, 255, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                    border: isSelectedPreset ? '1.5px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 4px',
                    cursor: 'pointer',
                    color: isSelectedPreset ? '#00e5ff' : 'rgba(255, 255, 255, 0.8)',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                    boxShadow: isSelectedPreset ? '0 0 12px rgba(0, 229, 255, 0.25)' : 'none',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>{p.label}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>{p.sub}</div>
                </button>
              );
            })}
          </div>

          {/* Fine-Tuning Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              value={tagSize}
              onChange={(e) => setTagSize(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#00e5ff', cursor: 'pointer' }}
              title="Fine-tune pin scale"
            />
            {Math.abs(Number(tagSize) - 1.0) >= 0.05 && (
              <button
                type="button"
                onClick={() => setTagSize(1.0)}
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'rgba(255, 255, 255, 0.8)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
                title="Reset to standard 1.0x size"
              >
                Reset
              </button>
            )}
          </div>

          <button
            className={`tag-save-btn ${saving ? 'saving' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          {/* Documents Section */}
          <div className="tag-documents-section" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>Attached Documents</h4>

            {/* Existing Documents List */}
            {tag.documents && tag.documents.length > 0 ? (
              <div className="tag-documents-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {tag.documents.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <a
                      href={doc.fileUrl ? (doc.fileUrl.startsWith('http') ? doc.fileUrl : `${MINIO_URL}/virtual-inspections/${doc.fileUrl}`) : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textDecoration: 'none', flex: 1, minWidth: 0 }}
                      title="Open / Download PDF Document"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(0, 229, 255, 0.9)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <span style={{ fontSize: '12px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.title}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(0, 229, 255, 0.6)" strokeWidth="2" style={{ flexShrink: 0, marginLeft: '4px' }}>
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                    <button
                      onClick={() => onDeleteDocument(tag.id, doc.id)}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,100,100,0.8)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                      title="Remove Document"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px 0', fontStyle: 'italic' }}>No documents attached yet.</p>
            )}

            {/* Add New Document Form */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.15)' }}>
              <label className="tag-field-label" style={{ fontSize: '11px' }}>Document Title</label>
              <input
                type="text"
                className="tag-field-input"
                style={{ marginBottom: 10, padding: '8px 10px', fontSize: '12px' }}
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g. Maintenance Manual"
              />

              <div
                className={`tag-upload-zone ${dragOver ? 'drag-over' : ''}`}
                style={{ padding: '16px', minHeight: 'auto', background: 'rgba(255,255,255,0.03)' }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <div className="tag-upload-spinner" style={{ padding: '8px 0' }}>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                    <span style={{ fontSize: '12px' }}>Uploading...</span>
                  </div>
                ) : (
                  <div className="tag-upload-placeholder" style={{ padding: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 6 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span style={{ fontSize: '11px' }}>{docTitle.trim() ? "Click or drag PDF here" : "Enter title first..."}</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                  disabled={!docTitle.trim() || uploading}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Delete */}
        <div className="tag-panel-footer">
          <button className="tag-delete-btn" onClick={() => onDelete(tag.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete Tag
          </button>
        </div>
      </div>
    </div>
  );
}
