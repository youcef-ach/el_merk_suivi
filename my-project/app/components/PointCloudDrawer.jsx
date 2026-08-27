import React from 'react';
import { 
  Cpu, 
  Circle, 
  Square, 
  Sliders, 
  SlidersHorizontal, 
  Palette, 
  Layers, 
  Sparkles, 
  Activity, 
  X, 
  Eye, 
  EyeOff,
  Zap,
  TrendingUp,
  Mountain
} from 'lucide-react';

export default function PointCloudDrawer({
  isOpen,
  onClose,
  pointCloudActive,
  onTogglePointCloud,
  pointSize,
  onChangePointSize,
  pointShape,
  onChangePointShape,
  pointColorMode,
  onChangePointColorMode,
  totalPointsCount = 0
}) {
  if (!isOpen) return null;

  return (
    <div className="engine-pointcloud-drawer">
      {/* Header */}
      <div className="engine-pointcloud-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="engine-pointcloud-icon-badge">
            <Cpu style={{ width: 16, height: 16, color: '#38bdf8' }} />
          </div>
          <div>
            <div className="engine-pointcloud-title">Dense Point Cloud (LIDAR)</div>
            <div className="engine-pointcloud-subtitle">Discrete 3D Laser & Photogrammetric Points</div>
          </div>
        </div>

        <button onClick={onClose} className="engine-volume-close-btn">
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Body */}
      <div className="engine-pointcloud-body">
        {/* Toggle Mode */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Rendering Mode</span>
          <button
            onClick={onTogglePointCloud}
            className={`engine-pointcloud-toggle ${pointCloudActive ? 'active' : ''}`}
          >
            {pointCloudActive ? (
              <>
                <Zap style={{ width: 13, height: 13 }} />
                <span>Point Cloud (ON)</span>
              </>
            ) : (
              <>
                <Layers style={{ width: 13, height: 13 }} />
                <span>Solid Mesh (ON)</span>
              </>
            )}
          </button>
        </div>

        {/* Color Palette Modes */}
        <div className="engine-pointcloud-section">
          <label className="engine-pointcloud-label">
            <Palette style={{ width: 12, height: 12, color: '#38bdf8' }} />
            Point Color Palette
          </label>
          <div className="engine-pointcloud-palette-grid">
            <button
              onClick={() => onChangePointColorMode('rgb')}
              className={`engine-pointcloud-palette-btn ${pointColorMode === 'rgb' ? 'active' : ''}`}
              title="True Photogrammetric RGB Photo Colors"
            >
              <Sparkles style={{ width: 13, height: 13, color: '#38bdf8' }} />
              <span>RGB Photo</span>
            </button>

            <button
              onClick={() => onChangePointColorMode('elevation')}
              className={`engine-pointcloud-palette-btn ${pointColorMode === 'elevation' ? 'active' : ''}`}
              title="Hypsometric LIDAR Elevation Gradient"
            >
              <Mountain style={{ width: 13, height: 13, color: '#f59e0b' }} />
              <span>LIDAR Height</span>
            </button>

            <button
              onClick={() => onChangePointColorMode('slope')}
              className={`engine-pointcloud-palette-btn ${pointColorMode === 'slope' ? 'active' : ''}`}
              title="Geotechnical Slope & Steepness Colormap"
            >
              <TrendingUp style={{ width: 13, height: 13, color: '#ef4444' }} />
              <span>Slope Map</span>
            </button>

            <button
              onClick={() => onChangePointColorMode('phosphor')}
              className={`engine-pointcloud-palette-btn ${pointColorMode === 'phosphor' ? 'active' : ''}`}
              title="Laser Radar Phosphor Return"
            >
              <Zap style={{ width: 13, height: 13, color: '#10b981' }} />
              <span>Laser Green</span>
            </button>
          </div>
        </div>

        {/* Point Size Slider */}
        <div className="engine-pointcloud-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="engine-pointcloud-label">
              <SlidersHorizontal style={{ width: 12, height: 12, color: '#38bdf8' }} />
              Point Kernel Size
            </label>
            <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>
              {pointSize.toFixed(1)} px
            </span>
          </div>
          <input
            type="range"
            min="1.0"
            max="10.0"
            step="0.5"
            value={pointSize}
            onChange={(e) => onChangePointSize(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </div>

        {/* Point Kernel Shape */}
        <div className="engine-pointcloud-section" style={{ marginTop: 10 }}>
          <label className="engine-pointcloud-label">Point Kernel Shape</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              onClick={() => onChangePointShape('circle')}
              className={`engine-pointcloud-shape-btn ${pointShape === 'circle' ? 'active' : ''}`}
            >
              <Circle style={{ width: 12, height: 12 }} />
              <span>Circular Soft</span>
            </button>
            <button
              onClick={() => onChangePointShape('square')}
              className={`engine-pointcloud-shape-btn ${pointShape === 'square' ? 'active' : ''}`}
            >
              <Square style={{ width: 12, height: 12 }} />
              <span>Square Laser</span>
            </button>
          </div>
        </div>

        {/* Point Count Telemetry Footer */}
        <div className="engine-pointcloud-telemetry">
          <Activity style={{ width: 13, height: 13, color: '#10b981' }} />
          <span>Active Points: <strong>{totalPointsCount > 0 ? (totalPointsCount / 1000000).toFixed(2) + 'M' : '~1.42M'}</strong> points</span>
        </div>
      </div>
    </div>
  );
}
