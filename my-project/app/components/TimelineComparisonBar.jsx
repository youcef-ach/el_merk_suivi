import React, { useState, useEffect } from 'react';
import { 
  History, 
  Play, 
  Pause, 
  Calendar, 
  SplitSquareVertical, 
  X, 
  TrendingDown, 
  TrendingUp, 
  Clock, 
  Layers,
  Sparkles,
  ChevronRight
} from 'lucide-react';

const FLIGHT_DATES = [
  { id: 'flight-1', label: 'Flight #1 (Baseline)', date: '12 Jun 2026', volumeDelta: '0 m³', color: '#38bdf8' },
  { id: 'flight-2', label: 'Flight #2 (Mid Excavation)', date: '18 Jul 2026', volumeDelta: '-2,140 m³', color: '#f59e0b' },
  { id: 'flight-3', label: 'Flight #3 (Current State)', date: '27 Aug 2026', volumeDelta: '-4,890 m³', color: '#10b981' },
];

export default function TimelineComparisonBar({
  isOpen,
  onClose,
  activeFlightId = 'flight-3',
  onSelectFlight,
  isSplitSwipeActive,
  onToggleSplitSwipe
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState(activeFlightId);

  // Time-lapse loop
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setSelectedFlight((prev) => {
          const idx = FLIGHT_DATES.findIndex(f => f.id === prev);
          const nextIdx = (idx + 1) % FLIGHT_DATES.length;
          const nextFlight = FLIGHT_DATES[nextIdx].id;
          if (onSelectFlight) onSelectFlight(nextFlight);
          return nextFlight;
        });
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, onSelectFlight]);

  if (!isOpen) return null;

  const currentFlightData = FLIGHT_DATES.find(f => f.id === selectedFlight) || FLIGHT_DATES[2];

  return (
    <div className="engine-timeline-root">
      <div className="engine-timeline-container">
        {/* Left Section: Header & Play/Pause */}
        <div className="engine-timeline-header">
          <div className="engine-timeline-icon-badge">
            <History style={{ width: 16, height: 16, color: '#a855f7' }} />
          </div>
          <div>
            <div className="engine-timeline-title">4D Multi-Temporal Survey Timeline</div>
            <div className="engine-timeline-subtitle">Compare topographic elevation changes across drone flights</div>
          </div>
        </div>

        {/* Center: Flight Date Step Track */}
        <div className="engine-timeline-track">
          {FLIGHT_DATES.map((flight, idx) => {
            const isSelected = flight.id === selectedFlight;
            return (
              <button
                key={flight.id}
                onClick={() => {
                  setSelectedFlight(flight.id);
                  if (onSelectFlight) onSelectFlight(flight.id);
                }}
                className={`engine-timeline-step-btn ${isSelected ? 'active' : ''}`}
              >
                <div className="step-dot" style={{ backgroundColor: flight.color }} />
                <div style={{ textAlign: 'left' }}>
                  <div className="step-label">{flight.label}</div>
                  <div className="step-date">
                    <Calendar style={{ width: 10, height: 10, display: 'inline', marginRight: 3 }} />
                    {flight.date}
                  </div>
                </div>
                {isSelected && (
                  <span className="step-delta-badge">
                    {flight.volumeDelta}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Section: Time-Lapse Play & Split Comparison Controls */}
        <div className="engine-timeline-actions">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`engine-timeline-btn ${isPlaying ? 'active-play' : ''}`}
            title="Play automated 4D time-lapse evolution"
          >
            {isPlaying ? <Pause style={{ width: 14, height: 14 }} /> : <Play style={{ width: 14, height: 14 }} />}
            <span>{isPlaying ? 'Pause 4D' : 'Play Time-Lapse'}</span>
          </button>

          <button
            onClick={onToggleSplitSwipe}
            className={`engine-timeline-btn ${isSplitSwipeActive ? 'active-split' : ''}`}
            title="Toggle Split-Screen Swipe Comparison"
          >
            <SplitSquareVertical style={{ width: 14, height: 14 }} />
            <span>{isSplitSwipeActive ? 'Split: ON' : 'Split Swipe'}</span>
          </button>

          <button onClick={onClose} className="engine-volume-close-btn" title="Close Timeline">
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
