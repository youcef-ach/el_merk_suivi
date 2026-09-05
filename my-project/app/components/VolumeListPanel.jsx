import React from 'react';
import { Boxes, Plus, Trash2, X, Download, Check, Layers } from 'lucide-react';

/**
 * VolumeListPanel — Floating HUD panel managing multi-stockpile cut & fill calculations.
 * Features:
 * - Ultra-modern aerospace/GIS glassmorphic design
 * - Custom animated checkboxes for accumulation selection
 * - Refined metrics badges, typography, and card hierarchy
 * - Combined accumulated totals summary with CSV export
 */
export default function VolumeListPanel({
  stockpiles = [],
  selectedStockpileId,
  onSelectStockpile,
  onDeleteStockpile,
  onClearAll,
  onNewStockpile,
  isDrawing = false,
  accumulatedTotals,
  accumulatedStockpileIds = [],
  onToggleAccumulate,
  onClose,
  isOpen = true
}) {
  if (!isOpen) return null;

  const exportCombinedCSV = () => {
    if (!accumulatedTotals || stockpiles.length === 0) return;
    const included = stockpiles.filter(s => accumulatedStockpileIds.includes(s.id));

    const csvRows = [
      ['RealityScan 3D GIS - Combined Accumulated Stockpile & Earthwork Report'],
      ['Timestamp', new Date().toISOString()],
      ['Total Stockpiles Accumulated', included.length],
      ['Total Fill / Stockpile Volume (m3)', accumulatedTotals.totalFill.toFixed(2)],
      ['Total Cut / Excavation Volume (m3)', accumulatedTotals.totalCut.toFixed(2)],
      ['Total Net Earthwork Volume (m3)', accumulatedTotals.totalNet.toFixed(2)],
      ['Total Estimated Mass (Tons)', accumulatedTotals.totalMass.toFixed(2)],
      ['Total 2D Footprint Plan Area (m2)', accumulatedTotals.totalArea2D.toFixed(2)],
      ['Total 3D Surface Area (m2)', accumulatedTotals.totalSurfaceArea3D.toFixed(2)],
      [''],
      ['Individual Included Stockpiles Breakdown'],
      ['Index', 'Name', 'Fill Volume (m3)', 'Cut Volume (m3)', 'Net Volume (m3)', 'Est. Mass (Tons)', '2D Area (m2)', 'Base Method']
    ];

    included.forEach((s, idx) => {
      csvRows.push([
        idx + 1,
        s.name,
        (s.result?.fillVolume ?? 0).toFixed(2),
        (s.result?.cutVolume ?? 0).toFixed(2),
        (s.result?.netVolume ?? 0).toFixed(2),
        (s.result?.estimatedMassTons ?? 0).toFixed(2),
        (s.result?.area2D ?? 0).toFixed(2),
        s.baseMethod || 'TIN'
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `accumulated_earthwork_survey_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <aside 
      aria-label="Stockpiles Panel" 
      className="fixed top-[136px] left-5 z-40 w-96 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-2xl shadow-2xl shadow-black/70 p-5 text-slate-100 select-none animate-in fade-in slide-in-from-left-4 duration-200"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3.5 mb-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-400 border border-amber-500/30 shadow-inner">
            <Boxes className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white">Stockpile Inventory</h3>
              <span className="px-2 py-0.5 text-xs font-bold font-mono rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {stockpiles.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal mt-0.5">Cut & Fill Earthwork Slices</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onNewStockpile && (
            <button
              onClick={onNewStockpile}
              title="Add another stockpile calculation"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 hover:border-emerald-500/50 shadow-sm transition active:scale-95"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>New</span>
            </button>
          )}

          {stockpiles.length > 0 && onClearAll && (
            <button
              onClick={onClearAll}
              title="Clear all stockpiles"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 transition"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              title="Close panel"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </div>

      {/* Drawing Active Status */}
      {isDrawing && (
        <div className="mb-3.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-2.5 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <span className="text-xs font-medium text-amber-200">Click 3D terrain to add perimeter points</span>
          </div>
          <span className="font-mono text-xs bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-md border border-amber-500/30 font-semibold shrink-0">
            min 3 pts
          </span>
        </div>
      )}

      {/* Empty State */}
      {stockpiles.length === 0 && !isDrawing && (
        <div className="py-8 px-4 text-center flex flex-col items-center justify-center space-y-3 text-slate-400">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shadow-inner">
            <Boxes className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-200 font-semibold">No stockpiles calculated</p>
          <p className="text-xs text-slate-400 max-w-[240px] leading-relaxed">
            Click <span className="text-emerald-400 font-medium">+ New</span> and place polygon boundary points on the 3D surface.
          </p>
        </div>
      )}

      {/* Stockpiles List Items */}
      {stockpiles.length > 0 && (
        <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
          {stockpiles.map((s, idx) => {
            const isSelected = s.id === selectedStockpileId || (selectedStockpileId === null && idx === stockpiles.length - 1);
            const isAccumulated = accumulatedStockpileIds.includes(s.id);
            return (
              <div
                key={s.id}
                onClick={() => onSelectStockpile?.(s.id)}
                className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-amber-400/60 shadow-md shadow-amber-500/5 ring-1 ring-amber-400/30'
                    : 'bg-white/[0.03] border-white/5 hover:border-white/15 hover:bg-white/[0.06]'
                }`}
              >
                {/* Left: Accumulation Toggle & Stockpile Details */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Sleek Custom Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleAccumulate?.(s.id);
                    }}
                    title={isAccumulated ? 'Exclude from accumulated sum' : 'Include in accumulated sum'}
                    className={`h-5 w-5 rounded-lg border flex items-center justify-center transition shrink-0 ${
                      isAccumulated
                        ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-sm shadow-amber-500/30'
                        : 'border-slate-600 bg-slate-900/80 hover:border-amber-400'
                    }`}
                  >
                    {isAccumulated && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                  </button>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-100 truncate max-w-[120px]">
                        {s.name}
                      </span>
                      <span className="text-sm text-emerald-400 font-mono font-bold ml-auto">
                        {(s.result?.fillVolume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} m³
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                      <span className="text-rose-400 font-medium">Cut: {(s.result?.cutVolume ?? 0).toFixed(1)}m³</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-amber-300 font-medium">Mass: {(s.result?.estimatedMassTons ?? 0).toFixed(0)}t</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400">{s.baseMethod?.toUpperCase() || 'TIN'}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Delete Action */}
                <div className="flex items-center shrink-0 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteStockpile?.(s.id);
                    }}
                    title="Delete stockpile"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/25 transition opacity-60 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Accumulated Multiple Stockpiles Totals Card ─── */}
      {accumulatedTotals && (
        <div className="mt-3.5 pt-3.5 border-t border-white/10">
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-500/[0.04] to-slate-950 p-3.5 shadow-xl">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-amber-500/20">
              <span className="text-xs font-bold text-amber-300 tracking-wide flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-amber-400" />
                Accumulated Total ({accumulatedTotals.count})
              </span>
              <button
                onClick={exportCombinedCSV}
                title="Export combined CSV of accumulated stockpiles"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Fill Volume</div>
                <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                  {accumulatedTotals.totalFill.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-xs font-normal text-slate-400 font-sans">m³</span>
                </div>
              </div>

              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Est. Mass</div>
                <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                  {accumulatedTotals.totalMass.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-xs font-normal text-slate-400 font-sans">t</span>
                </div>
              </div>

              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Cut Volume</div>
                <div className="text-sm font-bold text-rose-400 font-mono mt-0.5">
                  {accumulatedTotals.totalCut.toFixed(1)} <span className="text-xs font-normal text-slate-400 font-sans">m³</span>
                </div>
              </div>

              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Net Earthwork</div>
                <div className={`text-sm font-bold font-mono mt-0.5 ${accumulatedTotals.totalNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {accumulatedTotals.totalNet >= 0 ? '+' : ''}{accumulatedTotals.totalNet.toFixed(1)} <span className="text-xs font-normal text-slate-400 font-sans">m³</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
        <span>Check boxes to sum totals</span>
        <span className="text-[11px] text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
          Select in 3D
        </span>
      </div>
    </aside>
  );
}
