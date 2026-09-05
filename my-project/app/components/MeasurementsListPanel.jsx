import React from 'react';
import { Ruler, Trash2, X, CornerDownRight } from 'lucide-react';

/**
 * MeasurementsListPanel — Floating HUD panel managing all active survey measurements.
 * Designed with modern aerospace GIS aesthetics.
 */
export default function MeasurementsListPanel({
  measurements = [],
  selectedMeasurementId,
  onSelectMeasurement,
  onDeleteMeasurement,
  onClearAll,
  hasPendingPoint,
  onCancelPending,
  onClose,
  isOpen = true
}) {
  if (!isOpen) return null;

  return (
    <aside 
      aria-label="Measurements Panel" 
      className="fixed top-[136px] left-5 z-40 w-96 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-2xl shadow-2xl shadow-black/70 p-5 text-slate-100 select-none animate-in fade-in slide-in-from-left-4 duration-200"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3.5 mb-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 text-cyan-400 border border-cyan-500/30 shadow-inner">
            <Ruler className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white">Survey Distances</h3>
              <span className="px-2 py-0.5 text-xs font-bold font-mono rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                {measurements.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal mt-0.5">3D Distance, Height & Slope</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {measurements.length > 0 && onClearAll && (
            <button
              onClick={onClearAll}
              title="Clear all measurements"
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
      {hasPendingPoint && (
        <div className="mb-3.5 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between gap-2.5 shadow-inner">
          <div className="flex items-center gap-2.5 min-w-0">
            <CornerDownRight className="h-4.5 w-4.5 text-cyan-400 shrink-0 animate-bounce" />
            <span className="text-xs font-medium text-cyan-200 truncate">
              Click 2nd point on terrain to complete
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
      {measurements.length === 0 && !hasPendingPoint && (
        <div className="py-8 px-4 text-center flex flex-col items-center justify-center space-y-3 text-slate-400">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 shadow-inner">
            <Ruler className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-200 font-semibold">No measurements taken</p>
          <p className="text-xs text-slate-400 max-w-[240px] leading-relaxed">
            Click anywhere on the 3D surface to set the starting point.
          </p>
        </div>
      )}

      {/* Measurements List Items */}
      {measurements.length > 0 && (
        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
          {measurements.map((m, idx) => {
            const isSelected = m.id === selectedMeasurementId || (selectedMeasurementId === null && idx === measurements.length - 1);
            return (
              <div
                key={m.id}
                onClick={() => onSelectMeasurement?.(m.id)}
                className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent border-cyan-400/60 shadow-md shadow-cyan-500/5 ring-1 ring-cyan-400/30'
                    : 'bg-white/[0.03] border-white/5 hover:border-white/15 hover:bg-white/[0.06]'
                }`}
              >
                {/* Left: Index & Distances */}
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
                        {m.dist3D ?? m.distance} m
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        (3D)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                      <span>2D: {m.dist2D ?? '--'}m</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-amber-300 font-medium">&Delta;Z: {m.distZ ?? '--'}m</span>
                      {m.slope !== undefined && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-purple-300 font-medium">{m.slope}%</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Delete Action */}
                <div className="flex items-center shrink-0 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteMeasurement?.(m.id);
                    }}
                    title="Delete measurement"
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
        <span>Click item to focus 3D line</span>
        <span className="text-[11px] text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
          Esc cancels
        </span>
      </div>
    </aside>
  );
}
