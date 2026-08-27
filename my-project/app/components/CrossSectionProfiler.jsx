import React, { useState, useMemo, useRef } from 'react';
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
  Ruler
} from 'lucide-react';

export default function CrossSectionProfiler({ 
  profileData, 
  onClose, 
  onSave, 
  inspectionId 
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [designElevation, setDesignElevation] = useState(null);
  const [sectionName, setSectionName] = useState('Cut Line Profile A-B');
  const [isSaving, setIsSaving] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Extract samples & metrics
  const samples = profileData?.samples || [];
  const length = profileData?.length || 0;
  const minElev = profileData?.minElev ?? 0;
  const maxElev = profileData?.maxElev ?? 0;
  const deltaElev = maxElev - minElev;
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

  const yRange = Math.max(1.0, deltaElev * 1.25);
  const yMin = minElev - deltaElev * 0.12;

  const points = useMemo(() => {
    if (samples.length === 0) return [];
    return samples.map((s, idx) => {
      const xRatio = samples.length > 1 ? idx / (samples.length - 1) : 0;
      const yRatio = (s.elevation - yMin) / yRange;
      const px = padLeft + xRatio * innerWidth;
      const py = padTop + innerHeight - yRatio * innerHeight;
      return { ...s, px, py, distance: (xRatio * length).toFixed(2) };
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
        startPoint: profileData.startPoint,
        endPoint: profileData.endPoint,
        sampleData: samples,
        length: Number(length.toFixed(2)),
        minElev: Number(minElev.toFixed(3)),
        maxElev: Number(maxElev.toFixed(3)),
        slope: Number(slope.toFixed(2)),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!profileData || samples.length === 0) return null;

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[95vw] max-w-5xl rounded-2xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-xl shadow-2xl transition-all duration-300 ${isMinimized ? 'h-14 overflow-hidden' : 'p-5'}`}>
      
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 mb-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                value={sectionName} 
                onChange={(e) => setSectionName(e.target.value)}
                className="bg-transparent text-sm font-semibold text-slate-100 hover:border-slate-700 focus:border-cyan-500 rounded px-1.5 py-0.5 outline-none border border-transparent transition"
              />
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 font-mono">
                {length.toFixed(2)} m Cut Line
              </span>
            </div>
            <p className="text-[11px] text-slate-400 px-1">
              Topographic elevation profile sampled directly from drone 3D reality mesh
            </p>
          </div>
        </div>

        {/* Quick Stats Pill Header */}
        <div className="hidden md:flex items-center gap-4 text-xs font-mono">
          <div className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">
            <span className="text-slate-400 mr-1.5">Min:</span>
            <span className="text-emerald-400 font-bold">{minElev.toFixed(2)} m</span>
          </div>
          <div className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">
            <span className="text-slate-400 mr-1.5">Max:</span>
            <span className="text-amber-400 font-bold">{maxElev.toFixed(2)} m</span>
          </div>
          <div className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">
            <span className="text-slate-400 mr-1.5">&Delta;Z:</span>
            <span className="text-cyan-400 font-bold">{deltaElev.toFixed(2)} m</span>
          </div>
          <div className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">
            <span className="text-slate-400 mr-1.5">Slope:</span>
            <span className="text-purple-400 font-bold">{slope.toFixed(1)}%</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button 
            onClick={handleSaveToInspection} 
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition disabled:opacity-50"
            title="Save Cross-Section"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Profile'}</span>
          </button>
          
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
            title="Export CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition border border-slate-700/50"
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>

          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition border border-slate-700/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Profile Chart Area */}
      {!isMinimized && (
        <div className="relative w-full rounded-xl bg-slate-950/80 border border-slate-800/90 p-2 select-none">
          <svg 
            viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
            className="w-full h-44 sm:h-52 overflow-visible"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="terrainGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="designCutGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines & Elevation labels */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
              const elevVal = (yMin + ratio * yRange).toFixed(1);
              const lineY = padTop + innerHeight - ratio * innerHeight;
              return (
                <g key={ratio}>
                  <line 
                    x1={padLeft} 
                    y1={lineY} 
                    x2={padLeft + innerWidth} 
                    y2={lineY} 
                    stroke="#334155" 
                    strokeDasharray="4 4" 
                    strokeWidth="0.8" 
                  />
                  <text 
                    x={padLeft - 8} 
                    y={lineY + 3.5} 
                    fill="#64748b" 
                    fontSize="9.5" 
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
                    y={padTop + innerHeight + 16} 
                    fill="#64748b" 
                    fontSize="9.5" 
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
              strokeWidth="1.5" 
              strokeDasharray="6 3" 
            />
            <text 
              x={padLeft + innerWidth - 6} 
              y={designPy - 5} 
              fill="#f59e0b" 
              fontSize="9" 
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

            {/* Interactive Points / Hover Hit Areas */}
            {points.map((p, idx) => (
              <g key={idx}>
                <rect 
                  x={p.px - (innerWidth / points.length) / 2} 
                  y={padTop} 
                  width={innerWidth / points.length} 
                  height={innerHeight} 
                  fill="transparent" 
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
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
                  stroke="#38bdf8" 
                  strokeWidth="1.5" 
                  strokeDasharray="3 3" 
                />
                <circle 
                  cx={points[hoverIndex].px} 
                  cy={points[hoverIndex].py} 
                  r="5" 
                  fill="#06b6d4" 
                  stroke="#ffffff" 
                  strokeWidth="2" 
                />

                {/* Hover Tooltip Box */}
                <g transform={`translate(${Math.min(chartWidth - 140, Math.max(padLeft, points[hoverIndex].px - 60))}, ${Math.max(10, points[hoverIndex].py - 42)})`}>
                  <rect 
                    width="120" 
                    height="34" 
                    rx="6" 
                    fill="#0f172a" 
                    stroke="#0284c7" 
                    strokeWidth="1.2" 
                    filter="drop-shadow(0 4px 6px rgba(0,0,0,0.5))"
                  />
                  <text x="60" y="14" fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="monospace">
                    Dist: {points[hoverIndex].distance}m
                  </text>
                  <text x="60" y="27" fill="#38bdf8" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                    Elev: {points[hoverIndex].elevation.toFixed(2)}m
                  </text>
                </g>
              </g>
            )}
          </svg>

          {/* Design Grade Control Slider */}
          <div className="flex items-center justify-between gap-4 mt-2 px-3 py-1.5 bg-slate-900/90 rounded-lg border border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <Layers className="h-3.5 w-3.5 text-amber-400" />
              <span>Design Level Target:</span>
              <span className="font-mono text-amber-400 font-semibold">{defaultDesign.toFixed(2)} m</span>
            </div>
            <div className="flex items-center gap-3 flex-1 max-w-xs">
              <span className="text-[10px] text-slate-500 font-mono">{minElev.toFixed(1)}m</span>
              <input 
                type="range" 
                min={minElev} 
                max={maxElev} 
                step="0.05"
                value={defaultDesign}
                onChange={(e) => setDesignElevation(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <span className="text-[10px] text-slate-500 font-mono">{maxElev.toFixed(1)}m</span>
            </div>
            <button 
              onClick={() => setDesignElevation((minElev + maxElev) / 2)}
              className="text-[11px] text-slate-400 hover:text-slate-200 underline"
            >
              Reset Mid
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
