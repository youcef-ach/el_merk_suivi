import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  TrendingUp, 
  ArrowDownRight, 
  ArrowUpRight, 
  Save, 
  Download, 
  X, 
  Maximize2, 
  Minimize2, 
  Layers, 
  Activity,
  Ruler,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function CrossSectionProfiler({ 
  profileData, 
  sectionIndex,
  totalSections,
  onPrev,
  onNext,
  onNewSlice,
  onDelete,
  onHoverPoint,
  onClose, 
  onSave, 
  inspectionId 
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [designElevation, setDesignElevation] = useState(null);
  const [sectionName, setSectionName] = useState('Cut Line Profile A-B');
  const [isSaving, setIsSaving] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Sync sectionName if profileData provides title
  useEffect(() => {
    if (profileData?.name) {
      setSectionName(profileData.name);
    } else if (sectionIndex) {
      setSectionName(`Profile A-B #${sectionIndex}`);
    }
  }, [profileData?.name, sectionIndex]);

  // Clean up hover on unmount
  useEffect(() => {
    return () => {
      onHoverPoint?.(null);
    };
  }, [onHoverPoint]);

  // Extract samples & metrics
  const samples = profileData?.samples || [];
  const length = profileData?.length || 0;

  // Dynamically calculate min & max elevation directly from sample data
  const { minElev, maxElev, deltaElev } = useMemo(() => {
    if (samples.length === 0) {
      const min = profileData?.minElev ?? 0;
      const max = profileData?.maxElev ?? 0;
      return { minElev: min, maxElev: max, deltaElev: Math.max(0.1, max - min) };
    }
    let min = Infinity;
    let max = -Infinity;
    samples.forEach(s => {
      const val = typeof s.elevation === 'number' ? s.elevation : (typeof s.y === 'number' ? s.y : 0);
      if (val < min) min = val;
      if (val > max) max = val;
    });
    const computedMin = min === Infinity ? 0 : min;
    const computedMax = max === -Infinity ? 0 : max;
    return {
      minElev: computedMin,
      maxElev: computedMax,
      deltaElev: Math.max(0.2, computedMax - computedMin)
    };
  }, [samples, profileData?.minElev, profileData?.maxElev]);

  const slope = profileData?.slope ?? 0;

  // Initialize design elevation at midpoint if not set
  const defaultDesign = useMemo(() => {
    if (designElevation !== null) return designElevation;
    return (minElev + maxElev) / 2;
  }, [minElev, maxElev, designElevation]);

  // Chart coordinate mapping
  const chartWidth = 720;
  const chartHeight = 220;
  const padLeft = 55;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 35;

  const innerWidth = chartWidth - padLeft - padRight;
  const innerHeight = chartHeight - padTop - padBottom;

  const yRange = Math.max(0.5, deltaElev * 1.25);
  const yMin = minElev - deltaElev * 0.12;

  const points = useMemo(() => {
    if (samples.length === 0) return [];
    return samples.map((s, idx) => {
      const elev = typeof s.elevation === 'number' ? s.elevation : (typeof s.y === 'number' ? s.y : 0);
      const xRatio = samples.length > 1 ? idx / (samples.length - 1) : 0;
      const yRatio = (elev - yMin) / yRange;
      const px = padLeft + xRatio * innerWidth;
      const py = padTop + innerHeight - yRatio * innerHeight;
      return { ...s, elevation: elev, px, py, distance: (xRatio * length).toFixed(2) };
    });
  }, [samples, length, yMin, yRange, innerWidth, innerHeight, padLeft, padTop]);

  // SVG path generation
  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.px.toFixed(1)} ${p.py.toFixed(1)}`, '');
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0];
    const last = points[points.length - 1];
    const bottomY = padTop + innerHeight;
    return `${pathD} L ${last.px.toFixed(1)} ${bottomY} L ${first.px.toFixed(1)} ${bottomY} Z`;
  }, [pathD, points, padTop, innerHeight]);

  // Design line Y position
  const designPy = useMemo(() => {
    const yRatio = (defaultDesign - yMin) / yRange;
    return padTop + innerHeight - yRatio * innerHeight;
  }, [defaultDesign, yMin, yRange, padTop, innerHeight]);

  const handleExportCSV = () => {
    if (samples.length === 0) return;
    const header = 'Distance_m,Elevation_m,X,Y,Z\n';
    const rows = points.map(p => `${p.distance},${p.elevation.toFixed(3)},${p.x || 0},${p.y || 0},${p.z || 0}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sectionName.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToInspection = async () => {
    if (!onSave || !inspectionId) return;
    setIsSaving(true);
    try {
      await onSave({
        name: sectionName,
        length,
        minElev,
        maxElev,
        deltaElev,
        slope,
        designElevation: defaultDesign,
        samples: points.map(p => ({
          x: p.x,
          y: p.y,
          z: p.z,
          distance: p.distance,
          elevation: p.elevation
        }))
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePointHover = (idx) => {
    setHoverIndex(idx);
    if (idx !== null && points[idx]) {
      onHoverPoint?.(points[idx]);
    } else {
      onHoverPoint?.(null);
    }
  };

  if (!profileData && points.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95vw] max-w-4xl rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-2xl shadow-2xl shadow-black/70 p-5 text-slate-100 select-none animate-in fade-in slide-in-from-bottom-4 duration-200">
      
      {/* ─── Header & Metadata ─── */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3.5 mb-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 text-cyan-400 border border-cyan-500/30 shadow-inner">
            <TrendingUp className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                value={sectionName} 
                onChange={(e) => setSectionName(e.target.value)}
                className="bg-white/5 hover:bg-white/10 focus:bg-slate-900 border border-white/10 hover:border-white/20 focus:border-cyan-400 rounded-xl px-2.5 py-1 text-sm font-semibold text-white outline-none transition"
              />
              <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono font-bold">
                {length.toFixed(2)} m Cut Line
              </span>
              {totalSections > 1 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono font-semibold">
                  {sectionIndex || 1} of {totalSections}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-normal">
              Topographic elevation profile sampled directly from drone 3D reality mesh
            </p>
          </div>
        </div>

        {/* Quick Stats Pill Header */}
        <div className="hidden md:flex items-center gap-2.5 text-xs font-mono">
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-emerald-500/30 shadow-inner">
            <span className="text-[11px] uppercase text-slate-400 mr-1.5 font-sans font-medium">Min</span>
            <span className="text-emerald-400 font-bold text-sm">{minElev.toFixed(2)}m</span>
          </div>
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-amber-500/30 shadow-inner">
            <span className="text-[11px] uppercase text-slate-400 mr-1.5 font-sans font-medium">Max</span>
            <span className="text-amber-400 font-bold text-sm">{maxElev.toFixed(2)}m</span>
          </div>
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-cyan-500/30 shadow-inner">
            <span className="text-[11px] uppercase text-slate-400 mr-1.5 font-sans font-medium">&Delta;Z</span>
            <span className="text-cyan-400 font-bold text-sm">{deltaElev.toFixed(2)}m</span>
          </div>
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-purple-500/30 shadow-inner">
            <span className="text-[11px] uppercase text-slate-400 mr-1.5 font-sans font-medium">Slope</span>
            <span className="text-purple-300 font-bold text-sm">{slope.toFixed(1)}%</span>
          </div>
        </div>

        {/* Actions & Navigation */}
        <div className="flex items-center gap-1.5">
          {totalSections > 1 && (
            <div className="flex items-center bg-white/5 rounded-xl p-0.5 border border-white/10">
              <button 
                onClick={onPrev}
                title="Previous profile"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button 
                onClick={onNext}
                title="Next profile"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {onNewSlice && (
            <button
              onClick={onNewSlice}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition active:scale-95 shadow-sm"
              title="Slice another profile across the terrain"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>New Slice</span>
            </button>
          )}

          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 transition"
              title="Delete this cross section profile"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          <button 
            onClick={handleSaveToInspection} 
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition active:scale-95 disabled:opacity-50 shadow-sm"
            title="Save Cross-Section"
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
          
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-semibold transition"
            title="Export CSV"
          >
            <Download className="h-4 w-4 text-slate-400" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            title={isMinimized ? "Maximize" : "Minimize"}
          >
            {isMinimized ? <Maximize2 className="h-4.5 w-4.5" /> : <Minimize2 className="h-4.5 w-4.5" />}
          </button>

          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            title="Close Profiler"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* ─── Body: Interactive Topographic Elevation Chart ─── */}
      {!isMinimized && (
        <div>
          <div className="relative w-full overflow-x-auto bg-slate-950/80 rounded-xl border border-slate-800 p-2.5">
            <svg 
              viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
              className="w-full h-52 select-none"
              onMouseLeave={() => handlePointHover(null)}
            >
              <defs>
                <linearGradient id="terrainGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines (Elevation Ticks) */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                const elevVal = (yMin + (1 - ratio) * yRange).toFixed(1);
                const lineY = padTop + ratio * innerHeight;
                return (
                  <g key={`grid-${ratio}`}>
                    <line 
                      x1={padLeft} 
                      y1={lineY} 
                      x2={padLeft + innerWidth} 
                      y2={lineY} 
                      stroke="#1e293b" 
                      strokeWidth="1" 
                    />
                    <text 
                      x={padLeft - 8} 
                      y={lineY + 4} 
                      fill="#94a3b8" 
                      fontSize="11" 
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {elevVal}m
                    </text>
                  </g>
                );
              })}

              {/* Distance Axis Markers */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                const distVal = (ratio * length).toFixed(1);
                const lineX = padLeft + ratio * innerWidth;
                return (
                  <g key={`dist-${ratio}`}>
                    <line 
                      x1={lineX} 
                      y1={padTop + innerHeight} 
                      x2={lineX} 
                      y2={padTop + innerHeight + 5} 
                      stroke="#475569" 
                      strokeWidth="1" 
                    />
                    <text 
                      x={lineX} 
                      y={padTop + innerHeight + 18} 
                      fill="#94a3b8" 
                      fontSize="11" 
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {distVal}m
                    </text>
                  </g>
                );
              })}

              {/* Shaded Area fill under elevation curve */}
              <path d={areaD} fill="url(#terrainGrad)" />

              {/* Design Reference Elevation Level (Cut / Fill Line) */}
              <line 
                x1={padLeft} 
                y1={designPy} 
                x2={padLeft + innerWidth} 
                y2={designPy} 
                stroke="#f59e0b" 
                strokeWidth="1.8" 
                strokeDasharray="6 3" 
              />
              <text 
                x={padLeft + innerWidth - 8} 
                y={designPy - 6} 
                fill="#f59e0b" 
                fontSize="11" 
                fontFamily="monospace"
                textAnchor="end"
                fontWeight="bold"
              >
                Design Plane: {defaultDesign.toFixed(2)}m
              </text>

              {/* Main Terrain Elevation Polyline */}
              <path 
                d={pathD} 
                fill="none" 
                stroke="#06b6d4" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />

              {/* Interactive Points / Hover Hit Areas (Synchronized to 3D) */}
              {points.map((p, idx) => (
                <g key={idx}>
                  <rect 
                    x={p.px - (innerWidth / points.length) / 2} 
                    y={padTop} 
                    width={innerWidth / points.length} 
                    height={innerHeight} 
                    fill="transparent" 
                    className="cursor-crosshair"
                    onMouseEnter={() => handlePointHover(idx)}
                    onMouseMove={() => {
                      if (hoverIndex !== idx) handlePointHover(idx);
                    }}
                  />
                </g>
              ))}

              {/* Active Hover Indicator */}
              {hoverIndex !== null && points[hoverIndex] && (
                <g pointerEvents="none">
                  <line 
                    x1={points[hoverIndex].px} 
                    y1={padTop} 
                    x2={points[hoverIndex].px} 
                    y2={padTop + innerHeight} 
                    stroke="#facc15" 
                    strokeWidth="1.8" 
                    strokeDasharray="3 3" 
                  />
                  <circle 
                    cx={points[hoverIndex].px} 
                    cy={points[hoverIndex].py} 
                    r="5.5" 
                    fill="#facc15" 
                    stroke="#ffffff" 
                    strokeWidth="2" 
                  />

                  {/* Hover Tooltip Box */}
                  <g transform={`translate(${Math.min(chartWidth - 150, Math.max(padLeft, points[hoverIndex].px - 65))}, ${Math.max(10, points[hoverIndex].py - 46)})`}>
                    <rect 
                      width="140" 
                      height="40" 
                      rx="8" 
                      fill="#0f172a" 
                      stroke="#facc15" 
                      strokeWidth="1.5" 
                      filter="drop-shadow(0 4px 6px rgba(0,0,0,0.6))"
                    />
                    <text x="70" y="16" fill="#94a3b8" fontSize="10.5" textAnchor="middle" fontFamily="monospace">
                      Dist: {points[hoverIndex].distance}m
                    </text>
                    <text x="70" y="32" fill="#facc15" fontSize="12.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                      Elev: {points[hoverIndex].elevation >= 0 ? '+' : ''}{points[hoverIndex].elevation.toFixed(2)}m
                    </text>
                  </g>
                </g>
              )}
            </svg>
          </div>

          {/* Sync Legend & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 px-1 text-xs text-slate-300">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#06b6d4]" />
                <span>3D Terrain Contour</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3.5 h-0.5 bg-amber-500 border-dashed" />
                <span>Design Plane Reference</span>
              </span>
              <span className="flex items-center gap-1.5 text-amber-300 font-mono font-semibold">
                <span>&#x2730; 3D Marker Sync Active</span>
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-slate-300">Adjust Design Plane:</span>
              <input 
                type="range"
                min={minElev}
                max={maxElev}
                step="0.05"
                value={defaultDesign}
                onChange={(e) => setDesignElevation(parseFloat(e.target.value))}
                className="w-28 accent-amber-500 cursor-pointer"
              />
              <span className="font-mono text-amber-400 font-bold text-xs">{defaultDesign.toFixed(2)}m</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
