import React from 'react';
import { TrendingUp, Plus, Trash2, X, CornerDownRight } from 'lucide-react';

/**
 * CrossSectionsListPanel — Floating HUD panel managing all topographic cross-sections.
 * Designed with modern aerospace GIS aesthetics.
 */
export default function CrossSectionsListPanel({
  crossSections = [],
  selectedSectionId,
  onSelectSection,
  onDeleteSection,
  onClearAll,
  onNewSlice,
  pendingPoints = [],
  onCancelPending,
  onClose,
  isOpen = true
}) {
  if (!isOpen) return null;

  return (
    <aside 
      aria-label="Elevation Profiles Panel" 
      className="fixed top-[136px] left-5 z-40 w-96 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-2xl shadow-2xl shadow-black/70 p-5 text-slate-100 select-none animate-in fade-in slide-in-from-left-4 duration-200"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3.5 mb-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-inner">
            <TrendingUp className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white">Topographic Profiles</h3>
              <span className="px-2 py-0.5 text-xs font-bold font-mono rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                {crossSections.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal mt-0.5">Terrain Elevation Slices</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onNewSlice && (
            <button
              onClick={onNewSlice}
              title="Slice another profile across terrain"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 hover:border-emerald-500/50 shadow-sm transition active:scale-95"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>New</span>
            </button>
          )}

          {crossSections.length > 0 && onClearAll && (
            <button
              onClick={onClearAll}
              title="Clear all cross sections"
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

      {/* Pending Point Active Status Banner */}
      {pendingPoints.length === 1 && (
        <div className="mb-3.5 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between gap-2.5 shadow-inner">
          <div className="flex items-center gap-2.5 min-w-0">
            <CornerDownRight className="h-4.5 w-4.5 text-cyan-400 shrink-0 animate-bounce" />
            <span className="text-xs font-medium text-cyan-200 truncate">
              Point A set. Click Point B on terrain
            </span>
          </div>
          {onCancelPending && (
            <button
              onClick={onCancelPending}
              className="px-2.5 py-1 text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-cyan-300 rounded-lg border border-cyan-500/40 shrink-0 transition"
            >
              Cancel (Esc)
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {crossSections.length === 0 && pendingPoints.length === 0 && (
        <div className="py-8 px-4 text-center flex flex-col items-center justify-center space-y-3 text-slate-400">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 shadow-inner">
            <TrendingUp className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-200 font-semibold">No cross-sections sliced</p>
          <p className="text-xs text-slate-400 max-w-[240px] leading-relaxed">
            Click two points on the terrain surface to slice a 3D elevation profile graph.
          </p>
        </div>
      )}

      {/* Cross-Sections List Items */}
      {crossSections.length > 0 && (
        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
          {crossSections.map((s, idx) => {
            const isSelected = s.id === selectedSectionId || (selectedSectionId === null && idx === crossSections.length - 1);
            return (
              <div
                key={s.id}
                onClick={() => onSelectSection?.(s.id)}
                className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent border-cyan-400/60 shadow-md shadow-cyan-500/5 ring-1 ring-cyan-400/30'
                    : 'bg-white/[0.03] border-white/5 hover:border-white/15 hover:bg-white/[0.06]'
                }`}
              >
                {/* Left: Index & Metrics */}
                <div className="flex items-center gap-3 min-w-0 pl-0.5">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold font-mono shrink-0 ${
                    isSelected 
                      ? 'bg-cyan-400 text-slate-950 shadow-sm' 
                      : 'bg-white/10 text-slate-300'
                  }`}>
                    #{idx + 1}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-sm font-bold font-mono ${
                        isSelected ? 'text-cyan-300' : 'text-slate-100'
                      }`}>
                        {Number(s.length).toFixed(1)} m
                      </span>
                      <span className="text-xs text-slate-300 font-medium truncate max-w-[140px]">
                        {s.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                      <span className="text-cyan-400 font-medium">&Delta;Z: {Number(s.deltaElev).toFixed(2)}m</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-purple-300 font-medium">Slope: {Number(s.slope).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                {/* Right: Delete Action */}
                <div className="flex items-center shrink-0 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSection?.(s.id);
                    }}
                    title="Delete cross section"
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

      {/* Footer Info */}
      <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
        <span>Click item to sync with 3D line</span>
        <span className="text-[11px] text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
          Esc cancels
        </span>
      </div>
    </aside>
  );
}
