import React, { useState } from 'react';
import { 
  Ruler, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  Save, 
  X, 
  Check, 
  Maximize2 
} from 'lucide-react';

export default function MeasurementHUD({ 
  measurementData, 
  measurementIndex,
  totalMeasurements,
  onPrev,
  onNext,
  onDelete,
  onClose, 
  onSave, 
  inspectionId 
}) {
  const [label, setLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!measurementData) return null;

  const { dist3D, dist2D, distZ, slope, area, volumeCut, volumeFill, type = 'DISTANCE' } = measurementData;

  const handleSave = async () => {
    if (!onSave || !inspectionId) return;
    setIsSaving(true);
    try {
      await onSave({
        type: type || 'DISTANCE_3D',
        points: measurementData.points || [],
        values: { dist3D, dist2D, distZ, slope, area, volumeCut, volumeFill },
        label: label || `${type} Measurement #${measurementIndex || 1}`,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed top-20 right-4 z-40 w-[390px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-2xl shadow-2xl shadow-black/70 p-5 text-slate-100 select-none animate-in fade-in slide-in-from-right-4 duration-200">
      
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3.5 mb-3.5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 text-cyan-400 border border-cyan-500/30 shadow-inner">
            <Ruler className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white">Distance Measurement</h3>
              {totalMeasurements > 1 && (
                <span className="px-2 py-0.5 text-xs font-bold font-mono rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {measurementIndex || 1} of {totalMeasurements}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-normal mt-0.5">Spatial Vector Geometry</p>
          </div>
        </div>

        {/* Stepper Navigation & Action Buttons */}
        <div className="flex items-center gap-1.5">
          {totalMeasurements > 1 && (
            <div className="flex items-center bg-white/5 rounded-xl p-0.5 border border-white/10">
              <button 
                onClick={onPrev}
                title="Previous measurement"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button 
                onClick={onNext}
                title="Next measurement"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {onDelete && (
            <button 
              onClick={onDelete}
              title="Delete this measurement"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 transition flex items-center justify-center"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          <button 
            onClick={onClose}
            title="Close"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition flex items-center justify-center"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* Primary Value Display (3 Cards) */}
      <div className="grid grid-cols-3 gap-2.5 mb-3.5">
        <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/15 via-cyan-500/5 to-slate-950 p-3 text-center shadow-inner">
          <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">3D Slope Dist</div>
          <div className="text-lg font-black text-cyan-400 font-mono mt-1">
            {dist3D !== undefined ? `${dist3D}` : '--'}
            <span className="text-xs font-normal text-slate-400 ml-0.5 font-sans">m</span>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/15 via-emerald-500/5 to-slate-950 p-3 text-center shadow-inner">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold">2D Horiz</div>
          <div className="text-lg font-black text-emerald-400 font-mono mt-1">
            {dist2D !== undefined ? `${dist2D}` : '--'}
            <span className="text-xs font-normal text-slate-400 ml-0.5 font-sans">m</span>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-slate-950 p-3 text-center shadow-inner">
          <div className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">&Delta;Z Elevation</div>
          <div className="text-lg font-black text-amber-400 font-mono mt-1">
            {distZ !== undefined ? `${distZ}` : '--'}
            <span className="text-xs font-normal text-slate-400 ml-0.5 font-sans">m</span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics (Slope, Area) */}
      {(slope !== undefined || area !== undefined) && (
        <div className="grid grid-cols-2 gap-2.5 mb-3.5 text-xs">
          {slope !== undefined && (
            <div className="flex justify-between items-center bg-slate-950/80 px-3.5 py-2.5 rounded-xl border border-white/10 font-mono">
              <span className="text-slate-400 text-xs flex items-center gap-1.5 font-sans">
                <TrendingUp className="h-4 w-4 text-purple-400" />
                Slope Grade:
              </span>
              <span className="text-purple-300 font-bold">{slope}%</span>
            </div>
          )}
          {area !== undefined && (
            <div className="flex justify-between items-center bg-slate-950/80 px-3.5 py-2.5 rounded-xl border border-white/10 font-mono">
              <span className="text-slate-400 text-xs flex items-center gap-1.5 font-sans">
                <Maximize2 className="h-4 w-4 text-cyan-400" />
                Plan Area:
              </span>
              <span className="text-cyan-300 font-bold">{area} m²</span>
            </div>
          )}
        </div>
      )}

      {/* Optional Annotation & Save */}
      {inspectionId && onSave && (
        <div className="pt-3 border-t border-white/10 space-y-2.5">
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Tag this measurement..." 
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1 rounded-xl bg-slate-900/90 border border-white/10 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 outline-none transition shadow-inner"
            />
            <button 
              onClick={handleSave}
              disabled={isSaving || savedSuccess}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${
                savedSuccess 
                  ? 'bg-emerald-500 text-slate-950' 
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20'
              }`}
            >
              {savedSuccess ? <Check className="h-4 w-4 stroke-[2.5]" /> : <Save className="h-4 w-4" />}
              <span>{savedSuccess ? 'Saved' : 'Save'}</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
