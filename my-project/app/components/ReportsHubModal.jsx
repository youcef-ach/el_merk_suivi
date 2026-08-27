import React, { useState } from 'react';
import { 
  FileText, 
  Compass, 
  Map, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  Upload, 
  X, 
  ExternalLink,
  Layers,
  Sparkles,
  BarChart3
} from 'lucide-react';

export default function ReportsHubModal({ isOpen, onClose, inspection, onAddReport }) {
  const [activeTab, setActiveTab] = useState('alignment'); // 'alignment' | 'map' | 'ortho' | 'documents'
  const [isUploading, setIsUploading] = useState(false);
  const [newReportTitle, setNewReportTitle] = useState('');
  const [newReportType, setNewReportType] = useState('ALIGNMENT');
  const [newReportFile, setNewReportFile] = useState(null);

  if (!isOpen) return null;

  // Extract or fallback survey metadata
  const gsd = inspection?.gsd || 1.45;
  const droneModel = inspection?.droneModel || 'DJI Mavic 3 Enterprise (RTK)';
  const flightAlt = inspection?.flightAltitude || 85;
  const crs = inspection?.coordinateSystem || 'WGS84 / UTM zone 31N (EPSG:32631)';
  const surveyDate = inspection?.surveyDate ? new Date(inspection.surveyDate).toLocaleDateString() : new Date().toLocaleDateString();

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!newReportTitle || !newReportFile || !onAddReport) return;
    setIsUploading(true);
    try {
      await onAddReport({
        title: newReportTitle,
        reportType: newReportType,
        file: newReportFile,
      });
      setNewReportTitle('');
      setNewReportFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                RealityScan Survey Reports Hub
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  Photogrammetry QA/QC
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Detailed survey validation metrics, alignment statistics & drone photogrammetry reports
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 gap-2 pt-2">
          {[
            { id: 'alignment', label: 'Alignment Report', icon: Compass },
            { id: 'map', label: 'Map View & Overlap', icon: Map },
            { id: 'ortho', label: 'Ortho Projection Report', icon: Layers },
            { id: 'documents', label: 'Documents & Files', icon: FileText, count: inspection?.surveyReports?.length || 0 },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition relative ${
                  isActive 
                    ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5' 
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px]">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* TAB 1: ALIGNMENT REPORT */}
          {activeTab === 'alignment' && (
            <div className="space-y-6">
              {/* Metric Highlights Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                    <span>Cameras Aligned</span>
                    <Camera className="h-3.5 w-3.5 text-cyan-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-100 font-mono">100%</div>
                  <div className="text-[10px] text-emerald-400 mt-1">428 / 428 images</div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                    <span>Tie Points</span>
                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-100 font-mono">1,842,910</div>
                  <div className="text-[10px] text-slate-400 mt-1">Dense 3D cloud</div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                    <span>Mean Reprojection Error</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold text-emerald-400 font-mono">0.68 px</div>
                  <div className="text-[10px] text-slate-400 mt-1">Target &lt; 1.0 px (Optimal)</div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                    <span>Ground Res (GSD)</span>
                    <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-amber-400 font-mono">{gsd} cm/px</div>
                  <div className="text-[10px] text-slate-400 mt-1">Survey Grade Accuracy</div>
                </div>
              </div>

              {/* Hardware & Coordinate Reference */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Survey Setup & Georeferencing
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Drone Hardware:</span>
                    <span className="text-slate-200 font-medium">{droneModel}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Survey Flight Date:</span>
                    <span className="text-slate-200 font-medium">{surveyDate}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Flight Altitude AGL:</span>
                    <span className="text-slate-200 font-medium">{flightAlt} m</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Coordinate Datum:</span>
                    <span className="text-slate-200 font-mono">{crs}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">RTK / GCP Positioning:</span>
                    <span className="text-emerald-400 font-medium">Fixed RTK (X/Y: 1.2cm, Z: 2.1cm)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Reconstruction Engine:</span>
                    <span className="text-slate-200 font-medium">RealityScan 2.2 / High-Detail</span>
                  </div>
                </div>
              </div>

              {/* Calibration Stats */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                  Internal Camera Calibration Parameters
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">Focal Length (f)</div>
                    <div className="text-slate-200 font-bold mt-0.5">24.12 mm</div>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">Principal Point (cx, cy)</div>
                    <div className="text-slate-200 font-bold mt-0.5">2640.2, 1759.8</div>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">Radial Distortion (K1)</div>
                    <div className="text-slate-200 font-bold mt-0.5">-0.04128</div>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">Radial Distortion (K2)</div>
                    <div className="text-slate-200 font-bold mt-0.5">0.05219</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MAP VIEW & OVERLAP */}
          {activeTab === 'map' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
                  <div className="text-xs text-slate-400">Forward Overlap</div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">82%</div>
                  <div className="text-[10px] text-slate-500 mt-1">Recommended &gt; 75%</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
                  <div className="text-xs text-slate-400">Side Overlap</div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">74%</div>
                  <div className="text-[10px] text-slate-500 mt-1">Recommended &gt; 65%</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
                  <div className="text-xs text-slate-400">Total Covered Area</div>
                  <div className="text-2xl font-bold text-cyan-400 font-mono mt-1">6.14 ha</div>
                  <div className="text-[10px] text-slate-500 mt-1">61,400 m&sup2; footprint</div>
                </div>
              </div>

              {/* Overlap Heatmap Legend */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Image Overlap Multiplicity Distribution
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                      <span>9+ Overlapping Images (High Precision Core)</span>
                    </span>
                    <span className="font-mono font-bold text-slate-200">76.4%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-cyan-500"></span>
                      <span>5 - 8 Overlapping Images (Acceptable Coverage)</span>
                    </span>
                    <span className="font-mono font-bold text-slate-200">18.2%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                      <span>2 - 4 Overlapping Images (Perimeter Fringe)</span>
                    </span>
                    <span className="font-mono font-bold text-slate-200">5.4%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ORTHO PROJECTION REPORT */}
          {activeTab === 'ortho' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="text-[11px] text-slate-400 mb-1">Orthomosaic Dimensions</div>
                  <div className="text-lg font-bold text-slate-100 font-mono">11,620 &times; 26,950</div>
                  <div className="text-[10px] text-slate-400 mt-1">313.1 Megapixels</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="text-[11px] text-slate-400 mb-1">Pixel Scale (GSD)</div>
                  <div className="text-lg font-bold text-cyan-400 font-mono">1.40 cm/px</div>
                  <div className="text-[10px] text-emerald-400 mt-1">True Orthorectified</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="text-[11px] text-slate-400 mb-1">Channels & Color</div>
                  <div className="text-lg font-bold text-slate-100 font-mono">RGB (8-bit)</div>
                  <div className="text-[10px] text-slate-400 mt-1">sRGB Color Calibrated</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="text-[11px] text-slate-400 mb-1">DSM Elevation Span</div>
                  <div className="text-lg font-bold text-amber-400 font-mono">-46.6m to -38.4m</div>
                  <div className="text-[10px] text-slate-400 mt-1">&Delta; 8.2m Relief</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2 text-xs">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Deliverable Specifications
                </h4>
                <p className="text-slate-300">
                  Generated via RealityScan Orthoprojection tool with seamline blending, color equalization, and high-order DEM surface correction to eliminate building parallax distortions.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: DOCUMENTS & FILE ATTACHMENTS */}
          {activeTab === 'documents' && (
            <div className="space-y-6">
              {/* Existing Reports List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Attached Survey Reports ({inspection?.surveyReports?.length || 0})
                </h4>

                {(!inspection?.surveyReports || inspection.surveyReports.length === 0) ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-500 text-xs">
                    No external PDF or HTML survey reports uploaded yet for this flight.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {inspection.surveyReports.map((report) => (
                      <div key={report.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-200 truncate">{report.title}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {report.reportType} &bull; {new Date(report.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <a 
                          href={report.fileUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-medium transition"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Open</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload New Survey Report Form */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Upload className="h-4 w-4 text-cyan-400" />
                  Attach New RealityScan / QA Report
                </h4>
                <form onSubmit={handleUploadSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Report Title</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g., Flight 3 Alignment & Quality Report"
                        value={newReportTitle}
                        onChange={(e) => setNewReportTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Report Category</label>
                      <select 
                        value={newReportType}
                        onChange={(e) => setNewReportType(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 outline-none"
                      >
                        <option value="ALIGNMENT">Alignment Report</option>
                        <option value="MAP_VIEW">Map View Report</option>
                        <option value="ORTHO_PROJECTION">Ortho Projection Report</option>
                        <option value="QUALITY">Quality / Control QA</option>
                        <option value="CUSTOM">Custom Survey PDF</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Report File (PDF, HTML, or Image)</label>
                    <input 
                      type="file" 
                      required
                      accept=".pdf,.html,.htm,.png,.jpg,.jpeg"
                      onChange={(e) => setNewReportFile(e.target.files[0])}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:bg-slate-800 file:text-cyan-400 hover:file:bg-slate-700 cursor-pointer"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUploading || !newReportTitle || !newReportFile}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{isUploading ? 'Uploading...' : 'Upload & Attach Report'}</span>
                  </button>
                </form>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-500">
          <div>RealityScan Deliverable Pipeline &bull; Construction Site Supervision</div>
          <button 
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
          >
            Close Hub
          </button>
        </div>

      </div>
    </div>
  );
}
