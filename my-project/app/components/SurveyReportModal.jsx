import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import { 
  FileText, 
  Download, 
  X, 
  CheckSquare, 
  Square, 
  Printer, 
  Image as ImageIcon, 
  Boxes, 
  TrendingUp, 
  MapPin, 
  Globe2, 
  Calendar, 
  User, 
  ShieldCheck,
  Sparkles
} from 'lucide-react';

export default function SurveyReportModal({
  isOpen,
  onClose,
  inspectionData,
  viewerRef,
  volumeResult,
  profileData,
  tags = [],
  measurements = []
}) {
  const [reportTitle, setReportTitle] = useState(
    inspectionData?.title ? `${inspectionData.title} - Geotechnical Survey Dossier` : 'Quarry Photogrammetry & Volumetric Survey Dossier'
  );
  const [surveyorName, setSurveyorName] = useState('Chief GIS Surveyor');
  const [clientName, setClientName] = useState('Site Operations & Mining Management');
  const [executiveNotes, setExecutiveNotes] = useState(
    'This geotechnical survey dossier summarizes the 3D photogrammetric inspection, highwall slope stability assessment, earthwork cut/fill balances, and active field observation pins captured via high-resolution drone flight.'
  );

  // Inclusion checkboxes
  const [includeSnapshot, setIncludeSnapshot] = useState(true);
  const [includeVolume, setIncludeVolume] = useState(true);
  const [includeCrossSection, setIncludeCrossSection] = useState(true);
  const [includeTags, setIncludeTags] = useState(true);
  const [includeMeasurements, setIncludeMeasurements] = useState(true);

  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  /**
   * Capture live WebGL 3D canvas snapshot
   */
  const capture3DSnapshot = () => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const scene = viewerRef.current?.sceneRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;

    if (!renderer || !scene || !camera) return null;

    // Render one fresh frame to guarantee drawing buffer is full
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', 0.92);
  };

  /**
   * Export Professional Multi-Page Survey PDF via jsPDF
   */
  const generatePDF = async () => {
    setIsGenerating(true);

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 16;
      const contentWidth = pageWidth - margin * 2;
      let currentY = margin;

      // Color Palette
      const primaryColor = [15, 23, 42];    // Dark Slate
      const accentCyan = [6, 182, 212];     // Cyan
      const accentAmber = [245, 158, 11];   // Amber
      const textColor = [51, 65, 85];       // Slate Text
      const textMuted = [148, 163, 184];    // Light Slate

      // Helper: Draw Header Bar on Pages
      const drawPageHeader = (pageNum) => {
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, pageWidth, 12, 'F');
        doc.setFillColor(...accentCyan);
        doc.rect(0, 11, pageWidth, 1, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('3D DIGITAL TWIN ENGINE | GEOTECHNICAL SURVEY DOSSIER', margin, 7.5);

        doc.setFont('helvetica', 'normal');
        doc.text(`DATE: ${new Date().toLocaleDateString()}`, pageWidth - margin - 25, 7.5);
      };

      // Helper: Draw Footer on Pages
      const drawPageFooter = (pageNum, totalPages) => {
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('CONFIDENTIAL & PROPRIETARY — PHOTOGRAMMETRIC GIS SURVEY REPORT', margin, pageHeight - 7);
        doc.text(`PAGE ${pageNum}`, pageWidth - margin - 12, pageHeight - 7);
      };

      // ─── PAGE 1: COVER & EXECUTIVE SUMMARY ───
      drawPageHeader(1);
      currentY = 22;

      // Report Header Block
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, currentY, contentWidth, 32, 3, 3, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, currentY, contentWidth, 32, 3, 3, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...primaryColor);
      doc.text(reportTitle, margin + 6, currentY + 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...textColor);
      doc.text(`Client / Organization: ${clientName}`, margin + 6, currentY + 18);
      doc.text(`Surveyor / Inspector: ${surveyorName}`, margin + 6, currentY + 24);
      doc.text(`Datum: RealityScan DSM (Mean Elevation: 99.31m ASL)`, margin + 105, currentY + 18);
      doc.text(`Coordinate Reference System: EPSG:32260 (UTM Zone 31N)`, margin + 105, currentY + 24);

      currentY += 40;

      // Executive Summary
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...primaryColor);
      doc.text('1. EXECUTIVE SUMMARY & SURVEY OBJECTIVES', margin, currentY);
      currentY += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...textColor);
      const splitNotes = doc.splitTextToSize(executiveNotes, contentWidth);
      doc.text(splitNotes, margin, currentY);
      currentY += splitNotes.length * 4.5 + 4;

      // 3D Viewport Snapshot
      if (includeSnapshot) {
        const snapData = capture3DSnapshot();
        if (snapData) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(...primaryColor);
          doc.text('2. 3D TOPOGRAPHIC & PHOTOGRAMMETRIC VIEWPORT OVERVIEW', margin, currentY);
          currentY += 5;

          const imgHeight = 90;
          doc.addImage(snapData, 'JPEG', margin, currentY, contentWidth, imgHeight);
          doc.setDrawColor(203, 213, 225);
          doc.rect(margin, currentY, contentWidth, imgHeight, 'S');
          currentY += imgHeight + 4;

          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text('Figure 1: High-resolution orthorectified 3D mesh perspective showing quarry benches, stockpiles, and access ramps.', margin, currentY);
          currentY += 8;
        }
      }

      drawPageFooter(1, 2);

      // ─── PAGE 2: VOLUMETRICS, CROSS-SECTIONS & TAGS ───
      doc.addPage();
      drawPageHeader(2);
      currentY = 22;

      // Section 3: Stockpile Volume & Earthwork Inventory
      if (includeVolume && volumeResult) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...primaryColor);
        doc.text('3. STOCKPILE VOLUMETRICS & EARTHWORK INVENTORY', margin, currentY);
        currentY += 5;

        // Metric Tiles (Grid of 4)
        const tileW = (contentWidth - 6) / 4;
        const tileH = 20;

        const tiles = [
          { label: 'STOCKPILE / FILL', val: `${volumeResult.fillVolume.toFixed(1)} m³`, color: [16, 185, 129] },
          { label: 'EXCAVATION / CUT', val: `${volumeResult.cutVolume.toFixed(1)} m³`, color: [239, 68, 68] },
          { label: 'ESTIMATED MASS', val: `${volumeResult.estimatedMassTons.toFixed(1)} T`, color: [245, 158, 11] },
          { label: '2D FOOTPRINT', val: `${volumeResult.area2D.toFixed(1)} m²`, color: [6, 182, 212] }
        ];

        tiles.forEach((t, i) => {
          const tx = margin + i * (tileW + 2);
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(tx, currentY, tileW, tileH, 2, 2, 'F');
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(tx, currentY, tileW, tileH, 2, 2, 'S');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(...textMuted);
          doc.text(t.label, tx + 4, currentY + 6);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(...t.color);
          doc.text(t.val, tx + 4, currentY + 15);
        });

        currentY += tileH + 8;
      }

      // Section 4: Cross-Section Topography Analysis
      if (includeCrossSection && profileData) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...primaryColor);
        doc.text('4. TOPOGRAPHIC CROSS-SECTION & ELEVATION SLICE', margin, currentY);
        currentY += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...textColor);
        doc.text(`Profile Length: ${profileData.metrics?.length?.toFixed(2) || '---'} m | Min Elevation: ${profileData.metrics?.minElev?.toFixed(2) || '---'} m ASL | Max Elevation: ${profileData.metrics?.maxElev?.toFixed(2) || '---'} m ASL | Grade / Slope: ${profileData.metrics?.slope?.toFixed(1) || '---'}%`, margin, currentY);
        currentY += 8;
      }

      // Section 5: Georeferenced Field Observations & Defect Pins
      if (includeTags && tags.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...primaryColor);
        doc.text(`5. GEOREFERENCED FIELD OBSERVATION PINS (${tags.length} ITEMS)`, margin, currentY);
        currentY += 5;

        // Table Header
        doc.setFillColor(...primaryColor);
        doc.rect(margin, currentY, contentWidth, 7, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('#', margin + 3, currentY + 4.5);
        doc.text('TITLE / OBSERVATION', margin + 12, currentY + 4.5);
        doc.text('STATUS', margin + 80, currentY + 4.5);
        doc.text('PRIORITY', margin + 105, currentY + 4.5);
        doc.text('COORDINATES (X, Y, Z)', margin + 135, currentY + 4.5);
        currentY += 7;

        // Table Rows
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);

        tags.slice(0, 10).forEach((tag, idx) => {
          const rowY = currentY;
          if (idx % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, rowY, contentWidth, 6.5, 'F');
          }

          doc.setTextColor(...textColor);
          doc.text(`${idx + 1}`, margin + 3, rowY + 4.5);
          doc.text(tag.title || 'Inspection Note', margin + 12, rowY + 4.5);
          doc.text(tag.status || 'Active', margin + 80, rowY + 4.5);
          doc.text(tag.priority || 'Medium', margin + 105, rowY + 4.5);

          const posX = tag.position?.x?.toFixed(1) || '0.0';
          const posY = ((tag.position?.y || 0) + 99.31).toFixed(1);
          const posZ = tag.position?.z?.toFixed(1) || '0.0';
          doc.text(`${posX}, ${posY}m ASL, ${posZ}`, margin + 135, rowY + 4.5);

          currentY += 6.5;
        });

        currentY += 8;
      }

      // Section 6: Sign-off & Verification
      currentY = Math.max(currentY, pageHeight - 45);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 6;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...primaryColor);
      doc.text('SURVEY CERTIFICATION & SIGN-OFF:', margin, currentY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...textColor);
      doc.text('Lead Geodetic Surveyor Signature: __________________________', margin, currentY + 10);
      doc.text('Operations Manager Approval: __________________________', margin + 95, currentY + 10);

      drawPageFooter(2, 2);

      // Save & Download
      doc.save(`Survey_Dossier_${Date.now()}.pdf`);
      setIsGenerating(false);
      onClose();
    } catch (err) {
      console.error('Failed to generate survey PDF:', err);
      alert('Error generating PDF: ' + err.message);
      setIsGenerating(false);
    }
  };

  return (
    <div className="engine-modal-backdrop" onClick={onClose}>
      <div className="engine-report-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="engine-report-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="engine-report-icon-box">
              <FileText style={{ width: 20, height: 20, color: '#38bdf8' }} />
            </div>
            <div>
              <h2 className="engine-report-title">Export Inspection & Survey Dossier</h2>
              <p className="engine-report-subtitle">Generate a certified, branded PDF survey report with 3D visuals</p>
            </div>
          </div>
          <button onClick={onClose} className="engine-volume-close-btn">
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="engine-report-body">
          {/* Form Fields */}
          <div className="engine-report-field-group">
            <label className="engine-report-label">Dossier Report Title</label>
            <input 
              type="text" 
              value={reportTitle} 
              onChange={(e) => setReportTitle(e.target.value)}
              className="engine-report-input" 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="engine-report-field-group">
              <label className="engine-report-label">Surveyor / Inspector Name</label>
              <input 
                type="text" 
                value={surveyorName} 
                onChange={(e) => setSurveyorName(e.target.value)}
                className="engine-report-input" 
              />
            </div>
            <div className="engine-report-field-group">
              <label className="engine-report-label">Client / Organization</label>
              <input 
                type="text" 
                value={clientName} 
                onChange={(e) => setClientName(e.target.value)}
                className="engine-report-input" 
              />
            </div>
          </div>

          <div className="engine-report-field-group">
            <label className="engine-report-label">Executive Notes & Objectives</label>
            <textarea 
              value={executiveNotes} 
              onChange={(e) => setExecutiveNotes(e.target.value)}
              rows={3}
              className="engine-report-textarea" 
            />
          </div>

          {/* Section Inclusions */}
          <div className="engine-report-field-group" style={{ marginTop: 12 }}>
            <label className="engine-report-label">Sections to Include in PDF</label>
            <div className="engine-report-checkbox-grid">
              <label className="engine-report-checkbox-item">
                <input 
                  type="checkbox" 
                  checked={includeSnapshot} 
                  onChange={(e) => setIncludeSnapshot(e.target.checked)} 
                />
                <ImageIcon style={{ width: 14, height: 14, color: '#38bdf8' }} />
                <span>3D Viewport High-Res Snapshot</span>
              </label>

              <label className="engine-report-checkbox-item">
                <input 
                  type="checkbox" 
                  checked={includeVolume} 
                  onChange={(e) => setIncludeVolume(e.target.checked)} 
                />
                <Boxes style={{ width: 14, height: 14, color: '#f59e0b' }} />
                <span>Stockpile Volume & Cut/Fill Metrics</span>
              </label>

              <label className="engine-report-checkbox-item">
                <input 
                  type="checkbox" 
                  checked={includeCrossSection} 
                  onChange={(e) => setIncludeCrossSection(e.target.checked)} 
                />
                <TrendingUp style={{ width: 14, height: 14, color: '#10b981' }} />
                <span>Topographic Cross-Section Data</span>
              </label>

              <label className="engine-report-checkbox-item">
                <input 
                  type="checkbox" 
                  checked={includeTags} 
                  onChange={(e) => setIncludeTags(e.target.checked)} 
                />
                <MapPin style={{ width: 14, height: 14, color: '#a855f7' }} />
                <span>Observation Pins & Defect Tags ({tags.length})</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="engine-report-footer">
          <button onClick={onClose} className="engine-report-cancel-btn">
            Cancel
          </button>
          <button 
            onClick={generatePDF} 
            disabled={isGenerating}
            className="engine-report-download-btn"
          >
            {isGenerating ? (
              <span>Generating PDF Dossier...</span>
            ) : (
              <>
                <Download style={{ width: 16, height: 16 }} />
                <span>Download Certified PDF Dossier</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
