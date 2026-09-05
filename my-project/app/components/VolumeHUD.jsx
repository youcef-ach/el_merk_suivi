import React from 'react';
import { 
  Boxes, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  X, 
  Download, 
  Check, 
  Layers, 
  Scale, 
  TrendingDown, 
  TrendingUp, 
  Maximize2, 
  Compass, 
  ArrowUpRight 
} from 'lucide-react';

const DENSITY_PRESETS = [
  { label: 'Crushed Limestone (1.65 t/m³)', value: '1.65' },
  { label: 'Gravel / Aggregate (1.75 t/m³)', value: '1.75' },
  { label: 'Dry Sand (1.60 t/m³)', value: '1.60' },
  { label: 'Wet Sand / Compact (1.90 t/m³)', value: '1.90' },
  { label: 'Topsoil (1.25 t/m³)', value: '1.25' },
  { label: 'Excavated Clay (1.80 t/m³)', value: '1.80' },
  { label: 'Iron Ore / Heavy (2.80 t/m³)', value: '2.80' },
  { label: 'Coal / Lignite (1.30 t/m³)', value: '1.30' },
  { label: 'Asphalt Millings (1.50 t/m³)', value: '1.50' }
];

export default function VolumeHUD({
  polygonPoints = [],
  isDrawing = false,
  volumeResult,
  points,
  result,
  stockpileIndex,
  totalStockpiles = 0,
  onPrev,
  onNext,
  onDelete,
  onNewStockpile,
  isCalculating = false,
  baseMethod = 'tin',
  customBaseAsl = 100.0,
  density = '1.65',
  onComplete,
  onClear,
  onBaseMethodChange,
  onCustomBaseAslChange,
  onDensityChange,
  onClose,
  inspectionId,
  isVisible = true
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
      ['Perimeter Polygon Vertices (Local Coordinates)'],
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
    <div className="fixed top-20 right-4 z-40 w-[390px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-2xl shadow-2xl shadow-black/70 p-5 text-slate-100 select-none animate-in fade-in slide-in-from-right-4 duration-200">
      
      {/* Card Header */}
      <div className="flex items-center justify-between gap-3 pb-3.5 mb-3.5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-400 border border-amber-500/30 shadow-inner">
            <Boxes className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white">Stockpile Volumetrics</h3>
              {totalStockpiles > 1 && (
                <span className="px-2 py-0.5 text-xs font-bold font-mono rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {stockpileIndex || 1} of {totalStockpiles}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-normal mt-0.5">
              {isCalculating 
                ? 'Integrating 3D Mesh Topography...' 
                : actualResult 
                  ? 'Volumetric Analysis Ready' 
                  : `Drawing Perimeter (${pointsCount} points)`}
            </p>
          </div>
        </div>

        {/* Stepper Navigation & Controls */}
        <div className="flex items-center gap-1.5">
          {totalStockpiles > 1 && (
            <div className="flex items-center bg-white/5 rounded-xl p-0.5 border border-white/10">
              <button 
                onClick={onPrev}
                title="Previous stockpile"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button 
                onClick={onNext}
                title="Next stockpile"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {onNewStockpile && actualResult && (
            <button
              onClick={onNewStockpile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold shadow-sm transition active:scale-95"
              title="Add another stockpile calculation"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>New</span>
            </button>
          )}

          {onDelete && actualResult && (
            <button
              onClick={onDelete}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 transition"
              title="Delete this stockpile"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            title="Close Volume Tool"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* ─── Mode 1: Drawing Polygon ─── */}
      {!actualResult && (
        <div className="space-y-3.5">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-2.5 shadow-inner">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <span className="text-xs font-medium text-amber-200">Click terrain surface to outline stockpile</span>
            </div>
            <span className="font-mono text-xs bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-md border border-amber-500/30 font-semibold shrink-0">
              {pointsCount} / min 3
            </span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400">
              Perimeter vertices: <strong className="text-amber-300 font-mono text-sm">{pointsCount}</strong>
            </span>
            {pointsCount > 0 && (
              <button 
                onClick={onClear}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Reset Points</span>
              </button>
            )}
          </div>

          <button
            onClick={onComplete}
            disabled={pointsCount < 3 || isCalculating}
            className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all shadow-lg active:scale-[0.98] ${
              pointsCount >= 3 && !isCalculating
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 shadow-emerald-500/20 cursor-pointer'
                : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
            }`}
          >
            {isCalculating ? (
              <span>Integrating 3D Topography...</span>
            ) : (
              <>
                <Check className="h-4.5 w-4.5 stroke-[2.5]" />
                <span>Calculate Stockpile Volume</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ─── Mode 2: Calculated Volume Results ─── */}
      {actualResult && (
        <div className="space-y-3.5">
          {/* Primary Volume & Mass Hero Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-slate-950 p-3.5 shadow-lg">
              <div className="flex items-center gap-1.5 text-[11px] uppercase font-bold tracking-wider text-emerald-300 mb-1">
                <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                <span>Fill Volume</span>
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                {(actualResult.fillVolume ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="text-xs font-normal text-emerald-300/70 ml-1 font-sans">m³</span>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-slate-950 p-3.5 shadow-lg">
              <div className="flex items-center gap-1.5 text-[11px] uppercase font-bold tracking-wider text-amber-300 mb-1">
                <Scale className="h-4 w-4 text-amber-400" />
                <span>Est. Mass</span>
              </div>
              <div className="text-2xl font-black text-amber-400 font-mono tracking-tight">
                {(actualResult.estimatedMassTons ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="text-xs font-normal text-amber-300/70 ml-1 font-sans">Tons</span>
              </div>
            </div>
          </div>

          {/* Secondary 4-Metric Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Cut / Excavation</div>
              <div className="text-sm font-bold text-rose-400 font-mono mt-0.5">
                {(actualResult.cutVolume ?? 0).toFixed(1)} <span className="text-xs font-normal text-slate-500 font-sans">m³</span>
              </div>
            </div>

            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Net Earthwork</div>
              <div className={`text-sm font-bold font-mono mt-0.5 ${(actualResult.netVolume ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {(actualResult.netVolume ?? 0) >= 0 ? '+' : ''}{(actualResult.netVolume ?? 0).toFixed(1)} <span className="text-xs font-normal text-slate-500 font-sans">m³</span>
              </div>
            </div>

            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">2D Footprint</div>
              <div className="text-sm font-bold text-slate-200 font-mono mt-0.5">
                {(actualResult.area2D ?? 0).toFixed(1)} <span className="text-xs font-normal text-slate-500 font-sans">m²</span>
              </div>
            </div>

            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">3D Surface Area</div>
              <div className="text-sm font-bold text-cyan-400 font-mono mt-0.5">
                {(actualResult.surfaceArea3D ?? 0).toFixed(1)} <span className="text-xs font-normal text-slate-500 font-sans">m²</span>
              </div>
            </div>
          </div>

          {/* Material Density Selector */}
          <div className="pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2">
              <Scale className="h-3.5 w-3.5 text-amber-400" />
              <span>Material Density Preset</span>
            </label>
            <select
              value={density}
              onChange={(e) => onDensityChange(e.target.value)}
              className="w-full bg-slate-900/90 border border-white/10 hover:border-white/20 rounded-xl px-3.5 py-2 text-xs text-slate-200 outline-none cursor-pointer transition shadow-inner"
            >
              {DENSITY_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value} className="bg-slate-900 text-slate-200">
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {/* Base Plane Reference Method Tabs */}
          <div className="pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              <span>Base Plane Reference Method</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onBaseMethodChange('tin')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition border text-center ${
                  baseMethod === 'tin'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60 shadow-sm shadow-cyan-500/20'
                    : 'bg-white/[0.03] text-slate-400 border-white/5 hover:border-white/15 hover:text-slate-200'
                }`}
                title="Continuous Triangulated Irregular Network interpolated from boundary terrain"
              >
                Natural Terrain (TIN)
              </button>
              <button
                onClick={() => onBaseMethodChange('lowest')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition border text-center ${
                  baseMethod === 'lowest'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60 shadow-sm shadow-cyan-500/20'
                    : 'bg-white/[0.03] text-slate-400 border-white/5 hover:border-white/15 hover:text-slate-200'
                }`}
                title="Horizontal plane pinned to lowest perimeter vertex"
              >
                Lowest Point
              </button>
              <button
                onClick={() => onBaseMethodChange('mean')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition border text-center ${
                  baseMethod === 'mean'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60 shadow-sm shadow-cyan-500/20'
                    : 'bg-white/[0.03] text-slate-400 border-white/5 hover:border-white/15 hover:text-slate-200'
                }`}
                title="Horizontal plane at mean perimeter elevation"
              >
                Mean Plane
              </button>
              <button
                onClick={() => onBaseMethodChange('custom')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition border text-center ${
                  baseMethod === 'custom'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60 shadow-sm shadow-cyan-500/20'
                    : 'bg-white/[0.03] text-slate-400 border-white/5 hover:border-white/15 hover:text-slate-200'
                }`}
                title="User-defined absolute design elevation datum"
              >
                Custom ASL
              </button>
            </div>

            {baseMethod === 'custom' && (
              <div className="flex items-center gap-2.5 mt-2.5 p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/40">
                <span className="text-xs text-slate-400 font-medium">Target Datum:</span>
                <input
                  type="number"
                  step="0.2"
                  value={customBaseAsl}
                  onChange={(e) => onCustomBaseAslChange(e.target.value)}
                  className="w-24 bg-slate-950 border border-cyan-500/50 rounded-lg px-2.5 py-1.5 text-xs text-cyan-300 font-mono outline-none"
                />
                <span className="text-xs text-cyan-400 font-mono font-semibold">m ASL</span>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-2.5 flex items-center gap-2.5">
            <button
              onClick={exportCSV}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-semibold text-slate-200 transition shadow-sm"
              title="Download detailed CSV survey report"
            >
              <Download className="h-4 w-4 text-slate-400" />
              <span>Export CSV</span>
            </button>
            {onNewStockpile && (
              <button
                onClick={onNewStockpile}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 text-xs font-bold transition shadow-lg shadow-emerald-500/15"
                title="Measure a new stockpile"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                <span>New Stockpile</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
