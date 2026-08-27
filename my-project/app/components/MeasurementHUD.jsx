import React, { useState } from 'react';
import { 
  Ruler, 
  ArrowRight, 
  ArrowUp, 
  TrendingUp, 
  Box, 
  Save, 
  X, 
  Check, 
  Maximize 
} from 'lucide-react';

export default function MeasurementHUD({ 
  measurementData, 
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
        label: label || `${type} Measurement`,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-auto min-w-[340px] max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-4 text-slate-100 select-none animate-in fade-in slide-in-from-top-4 duration-200">
      
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
            <Ruler className="h-4 w-4" />
          </div>
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            Precision Survey Measurement
          </span>
        </div>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 p-1 rounded-md hover:bg-slate-800 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Primary Value Display */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 text-center">
          <div className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1">
            <span>3D Distance</span>
          </div>
          <div className="text-lg font-bold text-cyan-400 font-mono mt-0.5">
            {dist3D ? `${dist3D} m` : '--'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 text-center">
          <div className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1">
            <span>2D Horiz</span>
          </div>
          <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
            {dist2D ? `${dist2D} m` : '--'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 text-center">
          <div className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1">
            <span>&Delta;Z Height</span>
          </div>
          <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">
            {distZ ? `${distZ} m` : '--'}
          </div>
        </div>
      </div>

      {/* Secondary Metrics (Slope, Area, Volume if applicable) */}
      {(slope !== undefined || area !== undefined || volumeCut !== undefined) && (
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          {slope !== undefined && (
            <div className="flex justify-between items-center bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800/60 font-mono">
              <span className="text-slate-400 text-[11px] flex items-center gap-1 font-sans">
                <TrendingUp className="h-3 w-3 text-purple-400" />
                Slope Grade:
              </span>
              <span className="text-purple-300 font-bold">{slope}%</span>
            </div>
          )}
          {area !== undefined && (
            <div className="flex justify-between items-center bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800/60 font-mono">
              <span className="text-slate-400 text-[11px] flex items-center gap-1 font-sans">
                <Maximize className="h-3 w-3 text-cyan-400" />
                Surface Area:
              </span>
              <span className="text-cyan-300 font-bold">{area} m&sup2;</span>
            </div>
          )}
          {volumeCut !== undefined && (
            <div className="flex justify-between items-center bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800/60 font-mono col-span-2">
              <span className="text-slate-400 text-[11px] flex items-center gap-1 font-sans">
                <Box className="h-3 w-3 text-amber-400" />
                Earthwork Volume:
              </span>
              <span className="text-amber-300 font-bold">Cut: {volumeCut} m&sup3; | Fill: {volumeFill || 0} m&sup3;</span>
            </div>
          )}
        </div>
      )}

      {/* Save Action */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
        <input 
          type="text" 
          placeholder="Optional label (e.g. Trench Span 4)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
        />
        <button 
          onClick={handleSave} 
          disabled={isSaving}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            savedSuccess 
              ? 'bg-emerald-600 text-white' 
              : 'bg-cyan-600 hover:bg-cyan-500 text-white'
          }`}
        >
          {savedSuccess ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          <span>{savedSuccess ? 'Saved' : isSaving ? 'Saving...' : 'Save'}</span>
        </button>
      </div>

    </div>
  );
}
