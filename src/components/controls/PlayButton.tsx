import { useState, useEffect, useRef } from 'react';
import { useElectionStore } from '@/store/electionStore';
import { useUIStore } from '@/store/uiStore';

interface PlayButtonProps {
  intervalMs?: number;
}

export function PlayButton({ intervalMs = 2000 }: PlayButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { currentYear, availableYears, setYear } = useElectionStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        const currentIndex = availableYears.indexOf(currentYear);
        const nextIndex = (currentIndex + 1) % availableYears.length;
        setYear(availableYears[nextIndex]);
      }, intervalMs);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, currentYear, availableYears, setYear, intervalMs]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setYear(availableYears[availableYears.length - 1]);
    // Reset all zoom/selection state
    const ui = useUIStore.getState();
    ui.resetTernaryZoom();
    ui.resetMapZoom();
    ui.resetChartXZoom();
    ui.setHoveredChartYear(null);
    ui.setMapType('choropleth');
    useElectionStore.getState().setSelectedConstituency(null);
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    const currentIndex = availableYears.indexOf(currentYear);
    const prevIndex = currentIndex <= 0 ? availableYears.length - 1 : currentIndex - 1;
    setYear(availableYears[prevIndex]);
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    const currentIndex = availableYears.indexOf(currentYear);
    const nextIndex = (currentIndex + 1) % availableYears.length;
    setYear(availableYears[nextIndex]);
  };

  return (
    <div className="flex items-center gap-1">
      {/* Reset button - circular arrow */}
      <button
        onClick={handleReset}
        className="flex items-center justify-center w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
        aria-label="Reset to first year"
        title="Reset"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-gray-500">
          <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
          <path d="M8 1v3.5l2.5-1.75L8 1z" />
        </svg>
      </button>
      {/* Step back button */}
      <button
        onClick={handleStepBack}
        className="flex items-center justify-center w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
        aria-label="Step to previous year"
        title="Previous"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" className="text-gray-500">
          <path d="M12 2v10l-6-5 6-5zM6 2H4v10h2V2z" />
        </svg>
      </button>
      {/* Play/Pause button */}
      <button
        onClick={handlePlayPause}
        className={`
          flex items-center justify-center w-7 h-7 rounded
          transition-colors
          ${isPlaying
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-blue-500 hover:bg-blue-600 text-white'
          }
        `}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="2" width="4" height="12" rx="1" />
            <rect x="9" y="2" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5v11l9-5.5z" />
          </svg>
        )}
      </button>
      {/* Step forward button */}
      <button
        onClick={handleStepForward}
        className="flex items-center justify-center w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
        aria-label="Step to next year"
        title="Next"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" className="text-gray-500">
          <path d="M2 2l6 5-6 5V2zm6 0h2v10H8V2z" />
        </svg>
      </button>
    </div>
  );
}
