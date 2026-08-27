import React, { useState } from 'react';
import { 
  Layers, 
  Eye, 
  EyeOff, 
  Sliders, 
  Sparkles, 
  Grid, 
  Map, 
  CircleDot, 
  Tag, 
  Activity,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function LayerControlPanel({
  layerState,
  onUpdateLayer,
  has3DTiles,
  hasOrtho,
  hasDSM,
  hasScans,
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="fixed top-20 right-4 z-30 w-72 rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-300 select-none">
      {/* Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-4 py-3 border-b border-slate-800 cursor-pointer hover:bg-slate-800/40 transition"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Layers className="h-4 w-4" />
          </div>
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            GIS Layers & Mesh
          </span>
        </div>
        <button className="text-slate-400 hover:text-slate-200">
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4 text-xs">
          
          {/* Layer 1: 3D Reality Mesh / 3D Tiles */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                3D Reality Mesh {has3DTiles ? '(3D Tiles)' : '(GLB)'}
              </span>
              <button 
                onClick={() => onUpdateLayer('meshVisible', !layerState.meshVisible)}
                className={`p-1 rounded-md transition ${layerState.meshVisible ? 'text-cyan-400 hover:bg-cyan-500/20' : 'text-slate-500 hover:bg-slate-800'}`}
              >
                {layerState.meshVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>

            {layerState.meshVisible && has3DTiles && (
              <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>LOD Quality (SSE)</span>
                  <span className="font-mono text-cyan-400">{layerState.screenSpaceError}</span>
                </div>
                <input 
                  type="range" 
                  min="2" 
                  max="32" 
                  step="1"
                  value={layerState.screenSpaceError}
                  onChange={(e) => onUpdateLayer('screenSpaceError', Number(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Grid className="h-3 w-3 text-slate-500" />
                Wireframe Mode
              </span>
              <button 
                onClick={() => onUpdateLayer('wireframe', !layerState.wireframe)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition ${
                  layerState.wireframe ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {layerState.wireframe ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Layer 2: Orthoprojection / Orthomosaic */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-2">
                <Map className="h-3.5 w-3.5 text-emerald-400" />
                Orthomosaic Layer
              </span>
              <button 
                onClick={() => onUpdateLayer('orthoVisible', !layerState.orthoVisible)}
                className={`p-1 rounded-md transition ${layerState.orthoVisible ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-slate-500 hover:bg-slate-800'}`}
              >
                {layerState.orthoVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>

            {layerState.orthoVisible && (
              <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Layer Opacity</span>
                  <span className="font-mono text-emerald-400">{Math.round(layerState.orthoOpacity * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05"
                  value={layerState.orthoOpacity}
                  onChange={(e) => onUpdateLayer('orthoOpacity', Number(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            )}
          </div>

          {/* Layer 3: 360 Scan Rings & Teleports */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-2">
              <CircleDot className="h-3.5 w-3.5 text-rose-500" />
              360&deg; Scan Rings (Red Rings)
            </span>
            <button 
              onClick={() => onUpdateLayer('scansVisible', !layerState.scansVisible)}
              className={`p-1 rounded-md transition ${layerState.scansVisible ? 'text-rose-400 hover:bg-rose-500/20' : 'text-slate-500 hover:bg-slate-800'}`}
            >
              {layerState.scansVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>

          {/* Layer 4: Inspection Tags & Pins */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-amber-400" />
              Site Issue Tags & Pins
            </span>
            <button 
              onClick={() => onUpdateLayer('tagsVisible', !layerState.tagsVisible)}
              className={`p-1 rounded-md transition ${layerState.tagsVisible ? 'text-amber-400 hover:bg-amber-500/20' : 'text-slate-500 hover:bg-slate-800'}`}
            >
              {layerState.tagsVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>

          {/* Layer 5: Elevation Contours */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-purple-400" />
                Elevation Contours
              </span>
              <button 
                onClick={() => onUpdateLayer('contoursVisible', !layerState.contoursVisible)}
                className={`p-1 rounded-md transition ${layerState.contoursVisible ? 'text-purple-400 hover:bg-purple-500/20' : 'text-slate-500 hover:bg-slate-800'}`}
              >
                {layerState.contoursVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>

            {layerState.contoursVisible && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
                <span className="text-slate-400">Interval:</span>
                <div className="flex gap-1">
                  {['0.5m', '1.0m', '5.0m'].map((iv) => (
                    <button
                      key={iv}
                      onClick={() => onUpdateLayer('contourInterval', iv)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition ${
                        layerState.contourInterval === iv 
                          ? 'bg-purple-600 text-white font-bold' 
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {iv}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
