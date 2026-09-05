# Enterprise-Grade 3D GIS Tools: Cross-Section 3D Visualization & Sync, Cut/Fill Multi-Stockpile Accumulation, and Universal Click/Drag Protection

## Overview
This plan implements the complete set of requested features for the Drone Photogrammetry 3D Viewer:
1. **Universal Click vs. Hover/Drag Differentiation**:
   - Ensure all tools (Measurement, Cross-Section, Cut & Fill / Volume) strictly ignore camera orbit, pan, trackpad gestures, and hovers.
   - Once a tool completes a calculation (e.g. Cut & Fill), it stops listening for points until the user explicitly clicks a "+ New Calculation" button.
2. **Cross-Section Tool Upgrade**:
   - **3D Line & Topographic Contour Visualization**: Render the slice line between points A and B, including start/end markers and the sampled 3D terrain profile polyline directly on the mesh surface.
   - **Real-Time 3D Synchronized Hover Indicator**: As the user moves the cursor over the SVG elevation profile graph, a synchronized 3D beacon/indicator moves along the 3D line in real-time.
   - **Cross-Section Management**: Maintain a list of cross-sections with index, length, elevation drop, slope, 3D selection, visual highlighting, and individual deletion.
3. **Cut & Fill (Volume Calculation) Tool Upgrade**:
   - **Drawing Lock after Calculation**: Once "Calculate Stockpile Volume" is clicked, stop adding points on click.
   - **"+ New Stockpile" Flow**: Clear/reset drawing state on demand to measure another stockpile without overwriting previous ones.
   - **List, Select & Delete**: Manage multiple stockpiles in a dedicated list panel with 3D selection, highlighting, and deletion.
   - **Accumulation Mode**: Combine and accumulate multiple previously calculated stockpiles together (Total Fill, Total Cut, Total Net Volume, Total Mass, Total Area, and combined CSV export).

---

## Proposed Changes

### 1. `my-project/app/hooks/useCrossSection.js` [NEW]
- Manages:
  - `crossSections`: array of completed slices `{ id, name, p1, p2, profile, startMarker, endMarker, line, contourLine }`.
  - `selectedSectionId`: active section for the profiler graph.
  - `pendingPoints`: array of 0, 1, or 2 points currently being placed.
  - `isDrawing`: boolean (true while placing points A and B).
  - 3D visual group (`crossSectionVisualsGroup`):
    - Start point `A` (emerald sphere) and end point `B` (crimson sphere).
    - 3D terrain surface contour polyline sampled over the mesh topography.
    - Synchronized 3D hover indicator sphere/beacon that tracks the hovered sample on the graph.
  - Functions:
    - `handleCrossSectionClick(hitPoint)`: handles points 1 and 2, then automatically samples topography and locks drawing.
    - `startNewSlice()`: resets pending points and enables drawing for the next slice.
    - `selectSection(id)`: highlights selected slice in gold and switches active profile data.
    - `deleteSection(id)`: cleanly disposes Three.js objects and removes from list.
    - `clearAllSections()`: disposes all 3D objects and clears state.
    - `setHoveredSample(sample)`: updates the 3D synchronized hover marker position.

### 2. `my-project/app/components/CrossSectionProfiler.jsx` [MODIFY]
- Add `onHoverPoint(sample)` prop: fires during `onMouseEnter` / `onMouseMove` on chart points with `{ x, y, z, elevation, asl, distance }` and `null` on mouse leave.
- Support section index and stepper `< 1 of 3 >`.
- Add "+ New Slice" and Delete action buttons in the header.

### 3. `my-project/app/components/CrossSectionsListPanel.jsx` [NEW]
- Floating panel showing all cross-sections:
  - Header: "Elevation Profiles" + count + "+ New Slice" button.
  - List items: Index `#A-B`, Length, Min/Max elevation, Slope, Active highlight, and Delete trash button.
  - Status banner when waiting for Point 2: "Click Point B on terrain (Esc to cancel)".

### 4. `my-project/app/hooks/useVolumeCalculation.js` [MODIFY]
- Support multi-stockpile storage:
  - `stockpiles`: array of completed stockpiles `{ id, name, points, result, density, baseMethod, visualGroup }`.
  - `selectedStockpileId`: active stockpile for `VolumeHUD`.
  - `status`: `'idle' | 'drawing' | 'calculated'`.
  - When `status === 'calculated'`, `handleVolumeClick` does NOT add points to the finished stockpile!
  - `startNewStockpile()`: resets drawing state and sets `status = 'drawing'`.
  - `selectStockpile(id)`: highlights selected stockpile with gold boundary and tinted plane.
  - `deleteStockpile(id)`: removes from list and cleans up 3D visuals.
  - `accumulateStockpiles`: computes aggregated totals ($\sum \text{Fill}, \sum \text{Cut}, \sum \text{Net}, \sum \text{Mass}, \sum \text{Area}$) for all or checked stockpiles.

### 5. `my-project/app/components/VolumeHUD.jsx` [MODIFY]
- Update to support:
  - Stepper navigation `< Stockpile 1 of 3 >` if multiple exist.
  - Prominent "+ New Stockpile" button.
  - Delete current stockpile action.
  - Accumulation toggle / view.

### 6. `my-project/app/components/VolumeListPanel.jsx` [NEW]
- Floating panel managing all calculated stockpiles:
  - List of stockpiles with Fill, Cut, Net, Mass, and Delete button.
  - Checkbox per stockpile for accumulation.
  - **Accumulated Summary Card**: displays aggregated Volume, Mass, and Area when $\ge 2$ stockpiles are selected.
  - Export Combined CSV report.

### 7. `my-project/app/components/DroneSurveyViewer.jsx` & `engine.jsx` [MODIFY]
- Wire up `useCrossSection` and enhanced `useVolumeCalculation`.
- Ensure `onClick` in `DroneSurveyViewer.jsx` respects tool active/idle/calculated states.
- Render panels with high-polish glassmorphism design system.

---

## Verification Plan
1. Local build validation: `npm run build` in `my-project`.
2. Deploy to production VM (`197.140.41.131`).
3. Browser verification:
   - Test Cross-Section:
     - Click point A, click point B: verify 3D line & contour appears on terrain.
     - Move cursor on elevation profile graph: verify 3D synchronized beacon moves along the 3D line in real-time!
     - Create second slice via "+ New Slice": verify both slices appear in list.
     - Select between slices and verify deletion.
   - Test Cut & Fill:
     - Place 3 points and hit "Calculate Stockpile Volume".
     - Verify it calculates and stops listening to clicks (no accidental points added).
     - Click "+ New Stockpile" and calculate a second stockpile.
     - Verify both stockpiles appear in list with 3D highlighting.
     - Check "Accumulate" and verify combined totals sum correctly.
