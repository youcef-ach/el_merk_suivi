import React from 'react';
import { 
  Map, 
  Layers, 
  X, 
  Eye, 
  EyeOff, 
  Sliders, 
  SlidersHorizontal,
  ArrowUpDown,
  Sparkles,
  Mountain
} from 'lucide-react';

export default function OrthoLayerDrawer({
  isOpen,
  onClose,
  orthoEnabled,
  onToggleOrtho,
  orthoType,
  onChangeOrthoType,
  orthoOpacity,
  onChangeOrthoOpacity,
  orthoOffset,
  onChangeOrthoOffset
}) {
  if (!isOpen) return null;

  return (
    <div className="engine-ortho-drawer">
      {/* Header */}
      <div className="engine-ortho-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="engine-ortho-icon-badge">
            <Map style={{ width: 16, height: 16, color: '#38bdf8' }} />
          </div>
          <div>
            <div className="engine-ortho-title">2D High-Res Orthomosaic</div>
            <div className="engine-ortho-subtitle">Aerial Photogrammetry & DTM Projection</div>
          </div>
        </div>

        <button onClick={onClose} className="engine-volume-close-btn">
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Body */}
      <div className="engine-ortho-body">
        {/* Toggle Layer Visibility */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Layer Visibility</span>
          <button
            onClick={onToggleOrtho}
            className={`engine-ortho-toggle ${orthoEnabled ? 'active' : ''}`}
          >
            {orthoEnabled ? (
              <>
                <Eye style={{ width: 13, height: 13 }} />
                <span>Projected</span>
              </>
            ) : (
              <>
                <EyeOff style={{ width: 13, height: 13 }} />
                <span>Hidden</span>
              </>
            )}
          </button>
        </div>

        {/* Texture Type Selection */}
        <div className="engine-ortho-section">
          <label className="engine-ortho-label">
            <Layers style={{ width: 12, height: 12, color: '#38bdf8' }} />
            Map Projection Type
          </label>
          <div className="engine-ortho-btn-grid">
            <button
              onClick={() => onChangeOrthoType('dsm')}
              className={`engine-ortho-mode-btn ${orthoType === 'dsm' ? 'active' : ''}`}
            >
              <Sparkles style={{ width: 13, height: 13 }} />
              <div>
                <div style={{ fontWeight: 700 }}>DSM Orthomosaic</div>
                <div style={{ fontSize: 9.5, opacity: 0.75 }}>Full Surface with Buildings</div>
              </div>
            </button>

            <button
              onClick={() => onChangeOrthoType('dtm')}
              className={`engine-ortho-mode-btn ${orthoType === 'dtm' ? 'active' : ''}`}
            >
              <Mountain style={{ width: 13, height: 13 }} />
              <div>
                <div style={{ fontWeight: 700 }}>DTM Bare Earth</div>
                <div style={{ fontSize: 9.5, opacity: 0.75 }}>Vegetation-Stripped Relief</div>
              </div>
            </button>
          </div>
        </div>

        {/* Opacity Slider */}
        <div className="engine-ortho-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="engine-ortho-label">
              <SlidersHorizontal style={{ width: 12, height: 12, color: '#38bdf8' }} />
              Opacity Blend
            </label>
            <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>
              {Math.round(orthoOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.02"
            value={orthoOpacity}
            onChange={(e) => onChangeOrthoOpacity(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </div>

        {/* Elevation Z-Offset Slider */}
        <div className="engine-ortho-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="engine-ortho-label">
              <ArrowUpDown style={{ width: 12, height: 12, color: '#f59e0b' }} />
              Vertical Z-Offset
            </label>
            <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>
              {orthoOffset >= 0 ? `+${orthoOffset.toFixed(2)}` : orthoOffset.toFixed(2)} m
            </span>
          </div>
          <input
            type="range"
            min="-1.5"
            max="1.5"
            step="0.05"
            value={orthoOffset}
            onChange={(e) => onChangeOrthoOffset(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
          />
        </div>
      </div>
    </div>
  );
}
