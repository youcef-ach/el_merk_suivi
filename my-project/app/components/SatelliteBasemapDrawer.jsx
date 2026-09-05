import React from 'react';
import { 
  Globe2, 
  X, 
  Eye, 
  EyeOff, 
  SlidersHorizontal,
  Layers,
  MapPin,
  Maximize
} from 'lucide-react';
import { MAP_PROVIDERS } from '../utils/SatelliteBasemapLayer';

export default function SatelliteBasemapDrawer({
  isOpen,
  onClose,
  basemapEnabled,
  onToggleBasemap,
  basemapOpacity,
  onChangeBasemapOpacity,
  basemapProvider,
  onChangeBasemapProvider,
  basemapZoom,
  onChangeBasemapZoom,
  basemapRadius,
  onChangeBasemapRadius,
  coordinates,
}) {
  if (!isOpen) return null;

  return (
    <div className="engine-ortho-drawer" style={{ borderColor: 'rgba(16, 185, 129, 0.35)', boxShadow: '0 20px 48px rgba(0, 0, 0, 0.7), 0 0 24px rgba(16, 185, 129, 0.18)', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
      {/* Header */}
      <div className="engine-ortho-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="engine-ortho-icon-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            <Globe2 style={{ width: 16, height: 16, color: '#34d399' }} />
          </div>
          <div>
            <div className="engine-ortho-title">3D Satellite World Basemap</div>
            <div className="engine-ortho-subtitle">Georeferenced Regional Context</div>
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
          <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Ground Plane Visibility</span>
          <button
            onClick={onToggleBasemap}
            className={`engine-ortho-toggle ${basemapEnabled ? 'active' : ''}`}
          >
            {basemapEnabled ? (
              <>
                <Eye style={{ width: 13, height: 13 }} />
                <span>Active</span>
              </>
            ) : (
              <>
                <EyeOff style={{ width: 13, height: 13 }} />
                <span>Hidden</span>
              </>
            )}
          </button>
        </div>

        {/* Map Provider Selection */}
        <div className="engine-ortho-section">
          <label className="engine-ortho-label">
            <Layers style={{ width: 12, height: 12, color: '#34d399' }} />
            Satellite Imagery Source
          </label>
          <div className="engine-ortho-btn-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {Object.entries(MAP_PROVIDERS).map(([key, provider]) => (
              <button
                key={key}
                onClick={() => onChangeBasemapProvider?.(key)}
                className={`engine-ortho-mode-btn ${basemapProvider === key ? 'active' : ''}`}
                style={basemapProvider === key ? { background: 'rgba(16, 185, 129, 0.2)', borderColor: 'rgba(16, 185, 129, 0.5)', color: '#34d399' } : {}}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 11 }}>{provider.name}</div>
                  <div style={{ fontSize: 9, opacity: 0.7 }}>XYZ Tiles</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Opacity Slider */}
        <div className="engine-ortho-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="engine-ortho-label">
              <SlidersHorizontal style={{ width: 12, height: 12, color: '#34d399' }} />
              Basemap Opacity
            </label>
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>
              {Math.round(basemapOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.02"
            value={basemapOpacity}
            onChange={(e) => onChangeBasemapOpacity?.(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
          />
        </div>

        {/* Detail Level / Tile Zoom */}
        <div className="engine-ortho-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label className="engine-ortho-label">
              <Maximize style={{ width: 12, height: 12, color: '#60a5fa' }} />
              Resolution & Horizon Radius
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: 'High-Res (Z17)', zoom: 17, radius: 2, desc: '~2.5 km' },
              { label: 'Balanced (Z16)', zoom: 16, radius: 2, desc: '~5.0 km' },
              { label: 'Wide (Z15)', zoom: 15, radius: 2, desc: '~10 km' },
            ].map((preset) => (
              <button
                key={preset.zoom}
                onClick={() => {
                  onChangeBasemapZoom?.(preset.zoom);
                  onChangeBasemapRadius?.(preset.radius);
                }}
                className={`engine-ortho-mode-btn ${basemapZoom === preset.zoom ? 'active' : ''}`}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  justifyContent: 'center',
                  textAlign: 'center',
                  ...(basemapZoom === preset.zoom ? { background: 'rgba(96, 165, 250, 0.2)', borderColor: 'rgba(96, 165, 250, 0.5)', color: '#60a5fa' } : {})
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 10.5 }}>{preset.label}</div>
                  <div style={{ fontSize: 8.5, opacity: 0.75 }}>{preset.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Exact Georeference GPS Coordinates Badge */}
        <div className="engine-ortho-section" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <label className="engine-ortho-label" style={{ marginBottom: 6 }}>
            <MapPin style={{ width: 12, height: 12, color: '#10b981' }} />
            Exact Site GPS Georeference
          </label>
          <div style={{ 
            fontSize: 11, 
            color: '#cbd5e1', 
            background: 'rgba(16, 185, 129, 0.08)', 
            padding: '8px 10px', 
            borderRadius: 8, 
            border: '1px solid rgba(16, 185, 129, 0.25)', 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'space-between' 
          }}>
            <span style={{ fontFamily: 'monospace', color: '#34d399', fontWeight: 600 }}>
              {Number(coordinates?.lat ?? 31.9056).toFixed(5)}° N, {Number(coordinates?.lon ?? 9.1489).toFixed(5)}° E
            </span>
            <span style={{ 
              fontSize: 9.5, 
              color: '#10b981', 
              background: 'rgba(16, 185, 129, 0.2)', 
              padding: '2px 6px', 
              borderRadius: 4, 
              border: '1px solid rgba(16, 185, 129, 0.4)',
              fontWeight: 600 
            }}>
              Auto-Aligned
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
