import React, { useState } from 'react';
import { 
  Globe2, 
  X, 
  Eye, 
  EyeOff, 
  SlidersHorizontal,
  ArrowUpDown,
  Layers,
  MapPin,
  Maximize,
  Compass,
  Check
} from 'lucide-react';
import { MAP_PROVIDERS } from '../utils/SatelliteBasemapLayer';

export default function SatelliteBasemapDrawer({
  isOpen,
  onClose,
  basemapEnabled,
  onToggleBasemap,
  basemapOpacity,
  onChangeBasemapOpacity,
  basemapElevation,
  onChangeBasemapElevation,
  basemapRotation = 0,
  onChangeBasemapRotation,
  basemapOffsetX = 0,
  basemapOffsetZ = 0,
  onChangeBasemapOffset,
  basemapProvider,
  onChangeBasemapProvider,
  basemapZoom,
  onChangeBasemapZoom,
  basemapRadius,
  onChangeBasemapRadius,
  coordinates,
  onChangeCoordinates
}) {
  const [isEditingCoords, setIsEditingCoords] = useState(false);
  const [tempLat, setTempLat] = useState(coordinates?.lat ?? 31.9056);
  const [tempLon, setTempLon] = useState(coordinates?.lon ?? 9.1489);

  if (!isOpen) return null;

  const handleApplyCoords = (e) => {
    e.preventDefault();
    onChangeCoordinates(parseFloat(tempLat), parseFloat(tempLon));
    setIsEditingCoords(false);
  };

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

        {/* Heading & True North Rotation */}
        <div className="engine-ortho-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="engine-ortho-label">
              <Compass style={{ width: 12, height: 12, color: '#38bdf8' }} />
              Heading / Rotation (Yaw)
            </label>
            <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>
              {basemapRotation > 0 ? `+${basemapRotation}°` : `${basemapRotation}°`}
            </span>
          </div>
          <input
            type="range"
            min="-180"
            max="180"
            step="0.5"
            value={basemapRotation}
            onChange={(e) => onChangeBasemapRotation?.(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </div>

        {/* Elevation Level / Vertical Offset */}
        <div className="engine-ortho-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="engine-ortho-label">
              <ArrowUpDown style={{ width: 12, height: 12, color: '#f59e0b' }} />
              Vertical Ground Offset
            </label>
            <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>
              {basemapElevation >= 0 ? `+${basemapElevation.toFixed(2)}` : basemapElevation.toFixed(2)} m
            </span>
          </div>
          <input
            type="range"
            min="-5.0"
            max="5.0"
            step="0.05"
            value={basemapElevation}
            onChange={(e) => onChangeBasemapElevation?.(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
          />
        </div>

        {/* Fine Alignment Nudgers (X & Z) */}
        <div className="engine-ortho-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="engine-ortho-label">
              <SlidersHorizontal style={{ width: 12, height: 12, color: '#a855f7' }} />
              Horizontal Fine Alignment (X / Z)
            </label>
            <button
              onClick={() => onChangeBasemapOffset?.(0, 0)}
              style={{ fontSize: 9, color: '#a855f7', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: 4, padding: '1px 5px', cursor: 'pointer' }}
            >
              Reset 0m
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9.5, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                <span>East/West:</span>
                <span className="font-mono text-purple-400">{basemapOffsetX >= 0 ? `+${basemapOffsetX.toFixed(1)}` : basemapOffsetX.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="0.5"
                value={basemapOffsetX}
                onChange={(e) => onChangeBasemapOffset?.(parseFloat(e.target.value), basemapOffsetZ)}
                style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9.5, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                <span>North/South:</span>
                <span className="font-mono text-purple-400">{basemapOffsetZ >= 0 ? `+${basemapOffsetZ.toFixed(1)}` : basemapOffsetZ.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="0.5"
                value={basemapOffsetZ}
                onChange={(e) => onChangeBasemapOffset?.(basemapOffsetX, parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer' }}
              />
            </div>
          </div>
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

        {/* Georeference GPS Coordinates */}
        <div className="engine-ortho-section" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label className="engine-ortho-label">
              <MapPin style={{ width: 12, height: 12, color: '#ec4899' }} />
              Site GPS Coordinates
            </label>
            <button
              onClick={() => {
                if (!isEditingCoords) {
                  setTempLat(coordinates?.lat ?? 31.9056);
                  setTempLon(coordinates?.lon ?? 9.1489);
                }
                setIsEditingCoords(!isEditingCoords);
              }}
              style={{
                fontSize: 10,
                color: '#ec4899',
                background: 'rgba(236, 72, 153, 0.1)',
                border: '1px solid rgba(236, 72, 153, 0.3)',
                borderRadius: 4,
                padding: '2px 6px',
                cursor: 'pointer'
              }}
            >
              {isEditingCoords ? 'Cancel' : 'Edit Center'}
            </button>
          </div>

          {isEditingCoords ? (
            <form onSubmit={handleApplyCoords} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>Latitude (°N)</div>
                  <input
                    type="number"
                    step="0.0001"
                    value={tempLat}
                    onChange={(e) => setTempLat(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 6,
                      color: '#fff',
                      padding: '4px 6px',
                      fontSize: 11
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>Longitude (°E)</div>
                  <input
                    type="number"
                    step="0.0001"
                    value={tempLon}
                    onChange={(e) => setTempLon(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 6,
                      color: '#fff',
                      padding: '4px 6px',
                      fontSize: 11
                    }}
                  />
                </div>
              </div>
              <button
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  width: '100%',
                  background: 'rgba(16, 185, 129, 0.25)',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  color: '#34d399',
                  borderRadius: 6,
                  padding: '5px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Check style={{ width: 12, height: 12 }} />
                Update Basemap Location
              </button>
            </form>
          ) : (
            <div style={{ fontSize: 10.5, color: '#cbd5e1', background: 'rgba(0, 0, 0, 0.25)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{Number(coordinates?.lat ?? 31.9056).toFixed(4)}° N, {Number(coordinates?.lon ?? 9.1489).toFixed(4)}° E</span>
              <span style={{ color: '#94a3b8', fontSize: 9.5 }}>El Merk Basin</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
