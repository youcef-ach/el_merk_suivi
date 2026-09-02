import React from 'react';
import { 
  Boxes, 
  Check, 
  X, 
  Trash2, 
  Download, 
  Layers, 
  Sparkles, 
  Activity, 
  ArrowUpRight,
  TrendingDown,
  Scale
} from 'lucide-react';

const DENSITY_PRESETS = [
  { label: 'Crushed Limestone (1.65 t/m³)', value: 1.65 },
  { label: 'Gravel / Aggregate (1.55 t/m³)', value: 1.55 },
  { label: 'Dry Sand (1.60 t/m³)', value: 1.60 },
  { label: 'Compacted Clay (1.75 t/m³)', value: 1.75 },
  { label: 'Quarry Hard Rock (2.50 t/m³)', value: 2.50 },
  { label: 'Topsoil / Earth (1.30 t/m³)', value: 1.30 },
];

export default function VolumeHUD({
  polygonPoints = [],
  points,
  isDrawing = false,
  volumeResult,
  result,
  isCalculating = false,
  baseMethod = 'min',
  customBaseAsl = 99.31,
  density = 1.65,
  onComplete,
  onClear,
  onBaseMethodChange,
  onCustomBaseAslChange,
  onDensityChange,
  onClose,
  isVisible = true,
  soilType,
  onSoilChange
}) {
  const actualPoints = polygonPoints && polygonPoints.length ? polygonPoints : (points || []);
  const actualResult = volumeResult || result;
  const pointsCount = actualPoints.length;

  if (isVisible === false && !actualResult && pointsCount === 0) {
    return null;
  }

  const exportCSV = () => {
    if (!actualResult) return;
    const csvRows = [
      ['RealityScan 3D GIS - Stockpile Volume & Earthwork Report'],
      ['Timestamp', actualResult.timestamp || new Date().toISOString()],
      ['Perimeter Points Count', actualResult.pointsCount || pointsCount],
      ['Base Plane Reference Method', actualResult.baseMethod || baseMethod],
      ['2D Footprint Plan Area (m2)', (actualResult.area2D ?? 0).toFixed(2)],
      ['3D Topographic Surface Area (m2)', (actualResult.surfaceArea3D ?? 0).toFixed(2)],
      ['Stockpile / Fill Volume (m3)', (actualResult.fillVolume ?? 0).toFixed(2)],
      ['Cut / Excavation Volume (m3)', (actualResult.cutVolume ?? 0).toFixed(2)],
      ['Net Earthwork Volume (m3)', (actualResult.netVolume ?? 0).toFixed(2)],
      ['Material Density (t/m3)', density],
      ['Estimated Material Mass (Metric Tons)', (actualResult.estimatedMassTons ?? 0).toFixed(2)],
      ['Max Pile Height Above Base (m)', (actualResult.maxPileHeight ?? 0).toFixed(2)],
      ['Lowest Perimeter Elevation (m ASL)', (actualResult.minPerimeterAsl ?? 0).toFixed(2)],
      ['Mean Perimeter Elevation (m ASL)', (actualResult.meanPerimeterAsl ?? 0).toFixed(2)],
      ['Highest Perimeter Elevation (m ASL)', (actualResult.maxPerimeterAsl ?? 0).toFixed(2)],
      ['Sampled Inspection Points Grid', actualResult.sampledPointsCount ?? 0],
      [''],
      ['Perimeter Polygon Vertices (Local Three.js Coordinates)'],
      ['Index', 'X (m)', 'Y (m)', 'Z (m)', 'Elevation ASL (m)'],
      ...actualPoints.map((pt, idx) => [
        idx + 1,
        (pt.x ?? 0).toFixed(3),
        (pt.y ?? 0).toFixed(3),
        (pt.z ?? 0).toFixed(3),
        ((pt.y ?? 0) + 99.31).toFixed(2)
      ])
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `stockpile_volume_survey_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="engine-volume-card">
      {/* ─── Card Header ─── */}
      <div className="engine-volume-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="engine-volume-icon-badge">
            <Boxes style={{ width: 16, height: 16, color: '#f59e0b' }} />
          </div>
          <div>
            <div className="engine-volume-title">Stockpile Volume & Earthwork</div>
            <div className="engine-volume-subtitle">
              {isCalculating 
                ? 'Integrating 3D Mesh Topography...' 
                : actualResult 
                  ? 'Volumetric Analysis Ready' 
                  : `Drawing Perimeter (${pointsCount} Points)`}
            </div>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="engine-volume-close-btn"
          title="Close Volume Tool"
        >
          <X style={{ width: 15, height: 15 }} />
        </button>
      </div>

      {/* ─── Mode 1: Drawing Polygon ─── */}
      {!actualResult && (
        <div className="engine-volume-drawing-pane">
          <div className="engine-volume-guide-pill">
            <Activity style={{ width: 13, height: 13, color: '#f59e0b', animation: 'pulse 1.5s infinite' }} />
            <span>Click on 3D terrain to place perimeter boundary points</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Points placed: <strong style={{ color: '#f59e0b' }}>{pointsCount}</strong> / min 3
            </span>
            {pointsCount > 0 && (
              <button 
                onClick={onClear}
                className="engine-volume-secondary-btn"
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                <Trash2 style={{ width: 12, height: 12 }} />
                Reset
              </button>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              onClick={onComplete}
              disabled={pointsCount < 3 || isCalculating}
              className={`engine-volume-action-btn ${pointsCount >= 3 ? 'active' : 'disabled'}`}
            >
              {isCalculating ? (
                <span>Calculating Volume...</span>
              ) : (
                <>
                  <Check style={{ width: 16, height: 16 }} />
                  <span>Calculate Stockpile Volume</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── Mode 2: Calculated Volume Results ─── */}
      {actualResult && (
        <div className="engine-volume-results-pane">
          {/* Primary Volume & Mass Hero Grid */}
          <div className="engine-volume-hero-grid">
            <div className="engine-volume-hero-card fill">
              <div className="engine-volume-hero-label">
                <ArrowUpRight style={{ width: 12, height: 12, color: '#34d399' }} />
                Stockpile / Fill
              </div>
              <div className="engine-volume-hero-val emerald">
                {(actualResult.fillVolume ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="unit">m³</span>
              </div>
            </div>

            <div className="engine-volume-hero-card mass">
              <div className="engine-volume-hero-label">
                <Scale style={{ width: 12, height: 12, color: '#fbbf24' }} />
                Estimated Mass
              </div>
              <div className="engine-volume-hero-val amber">
                {(actualResult.estimatedMassTons ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="unit">Tons</span>
              </div>
            </div>
          </div>

          {/* Secondary Cut / Net Earthwork Row */}
          <div className="engine-volume-secondary-grid">
            <div className="engine-volume-stat-box">
              <div className="label">Cut / Excavation</div>
              <div className="val">{(actualResult.cutVolume ?? 0).toFixed(1)} m³</div>
            </div>
            <div className="engine-volume-stat-box">
              <div className="label">Net Earthwork</div>
              <div className="val" style={{ color: (actualResult.netVolume ?? 0) >= 0 ? '#34d399' : '#f87171' }}>
                {(actualResult.netVolume ?? 0) >= 0 ? '+' : ''}{(actualResult.netVolume ?? 0).toFixed(1)} m³
              </div>
            </div>
            <div className="engine-volume-stat-box">
              <div className="label">2D Footprint</div>
              <div className="val">{(actualResult.area2D ?? 0).toFixed(1)} m²</div>
            </div>
            <div className="engine-volume-stat-box">
              <div className="label">3D Surface Area</div>
              <div className="val">{(actualResult.surfaceArea3D ?? 0).toFixed(1)} m²</div>
            </div>
          </div>

          {/* Material Density Selector */}
          <div className="engine-volume-control-group" style={{ marginTop: 10 }}>
            <div className="engine-volume-control-label">
              <Scale style={{ width: 11, height: 11, color: '#f59e0b' }} />
              Material Density Preset
            </div>
            <select
              value={density}
              onChange={(e) => onDensityChange?.(e.target.value)}
              className="engine-volume-select"
            >
              {DENSITY_PRESETS.map((p, i) => (
                <option key={i} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Base Reference Plane Method */}
          <div className="engine-volume-control-group" style={{ marginTop: 8 }}>
            <div className="engine-volume-control-label">
              <Layers style={{ width: 11, height: 11, color: '#38bdf8' }} />
              Base Datum Plane
            </div>
            <div className="engine-volume-btn-group">
              <button
                onClick={() => onBaseMethodChange?.('tin')}
                className={`engine-volume-toggle-btn ${baseMethod === 'tin' ? 'active' : ''}`}
                title="Interpolated natural ground underneath pile"
              >
                TIN Base
              </button>
              <button
                onClick={() => onBaseMethodChange?.('lowest')}
                className={`engine-volume-toggle-btn ${baseMethod === 'lowest' ? 'active' : ''}`}
                title="Horizontal plane at lowest perimeter point"
              >
                Lowest ({(actualResult.minPerimeterAsl ?? 0).toFixed(1)}m)
              </button>
              <button
                onClick={() => onBaseMethodChange?.('mean')}
                className={`engine-volume-toggle-btn ${baseMethod === 'mean' ? 'active' : ''}`}
                title="Horizontal plane at average perimeter height"
              >
                Mean ({(actualResult.meanPerimeterAsl ?? 0).toFixed(1)}m)
              </button>
              <button
                onClick={() => onBaseMethodChange?.('custom')}
                className={`engine-volume-toggle-btn ${baseMethod === 'custom' ? 'active' : ''}`}
                title="Custom target elevation ASL"
              >
                Custom Level
              </button>
            </div>

            {baseMethod === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Target ASL:</span>
                <input
                  type="number"
                  step="0.2"
                  value={customBaseAsl}
                  onChange={(e) => onCustomBaseAslChange(e.target.value)}
                  className="engine-volume-input"
                  style={{ width: 90 }}
                />
                <span style={{ fontSize: 11, color: '#38bdf8' }}>m ASL</span>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="engine-volume-footer-actions">
            <button
              onClick={exportCSV}
              className="engine-volume-secondary-btn"
              title="Download detailed CSV survey report"
            >
              <Download style={{ width: 13, height: 13 }} />
              Export CSV
            </button>
            <button
              onClick={onClear}
              className="engine-volume-secondary-btn"
              title="Clear and measure a new stockpile"
            >
              <Trash2 style={{ width: 13, height: 13 }} />
              New Stockpile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
