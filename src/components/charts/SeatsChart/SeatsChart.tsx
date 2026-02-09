import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { useElectionStore, getYearLabel } from '@/store/electionStore';
import { useUIStore } from '@/store/uiStore';
import { getPartyColor } from '@/types/party';
import { NATIONAL_SEATS } from '@/data/nationalSeats';

interface SeatsChartProps {
  height?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export function SeatsChart({ height = 120 }: SeatsChartProps) {
  const { currentYear, availableYears, setYear } = useElectionStore();
  const { chartXZoom, setChartXZoom, resetChartXZoom } = useUIStore();
  const [dimensions, setDimensions] = useState({ width: 0 });
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startMouseX: number; startZoomX: number } | null>(null);
  const clipId = useRef(`seats-clip-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setDimensions({ width: entries[0].contentRect.width });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { width } = dimensions;
  const padding = { top: 20, right: 20, bottom: 45, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const data = useMemo(() => {
    return NATIONAL_SEATS.filter(d => availableYears.includes(d.year));
  }, [availableYears]);

  const maxSeats = useMemo(() => {
    return Math.max(...data.map(d => Math.max(d.con, d.lab)));
  }, [data]);

  const normalizeYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;

  const xScaleBase = useMemo(() => {
    const years = data.map(d => normalizeYear(d.year));
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    return (year: number) => {
      return ((normalizeYear(year) - minYear) / (maxYear - minYear)) * chartWidth;
    };
  }, [data, chartWidth]);

  const xScale = useCallback((year: number) => {
    return xScaleBase(year) * chartXZoom.k + chartXZoom.x;
  }, [xScaleBase, chartXZoom]);

  const yScale = useMemo(() => {
    return (seats: number) => {
      return chartHeight - (seats / maxSeats) * chartHeight;
    };
  }, [chartHeight, maxSeats]);

  const clampX = useCallback((x: number, k: number) => {
    return Math.min(0, Math.max(chartWidth - chartWidth * k, x));
  }, [chartWidth]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svgRect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left - padding.left;

    const { k, x } = chartXZoom;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k * factor));

    const mouseXInBase = (mouseX - x) / k;
    let newX = mouseX - mouseXInBase * newK;
    newX = clampX(newX, newK);

    setChartXZoom({ k: newK, x: newX });
  }, [chartXZoom, padding.left, setChartXZoom, clampX]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (chartXZoom.k <= 1) return;
    e.preventDefault();
    dragRef.current = { startMouseX: e.clientX, startZoomX: chartXZoom.x };
    setIsDragging(true);
  }, [chartXZoom]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startMouseX;
      const newX = clampX(dragRef.current.startZoomX + dx, chartXZoom.k);
      setChartXZoom({ k: chartXZoom.k, x: newX });
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, chartXZoom.k, setChartXZoom, clampX]);

  const generatePath = (party: 'con' | 'lab' | 'ld' | 'other') => {
    if (data.length === 0) return '';
    return data.map((d, i) => {
      const x = xScale(d.year);
      const y = yScale(d[party]);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  if (width === 0) {
    return <div ref={containerRef} className="w-full" style={{ height }} />;
  }

  const currentYearX = xScale(currentYear);
  const isZoomed = chartXZoom.k > 1;
  const cursor = isDragging ? 'grabbing' : isZoomed ? 'grab' : 'default';

  return (
    <div ref={containerRef} className="w-full bg-white border-b border-gray-200 relative">
      <svg width={width} height={height} onWheel={handleWheel} onMouseDown={handleMouseDown} style={{ cursor }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={-padding.top} width={chartWidth} height={height} />
          </clipPath>
        </defs>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Y-axis labels (outside clip) */}
          {[0, 100, 200, 300, 400].map(seats => (
            <text
              key={seats}
              x={-5}
              y={yScale(seats)}
              textAnchor="end"
              alignmentBaseline="middle"
              className="text-[11px] fill-gray-400"
            >
              {seats}
            </text>
          ))}

          {/* Clipped chart content */}
          <g clipPath={`url(#${clipId})`}>
            {/* Grid lines */}
            {[0, 100, 200, 300, 400].map(seats => (
              <line
                key={seats}
                x1={0}
                y1={yScale(seats)}
                x2={chartWidth}
                y2={yScale(seats)}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
            ))}

            {/* Current year indicator */}
            <line
              x1={currentYearX}
              y1={0}
              x2={currentYearX}
              y2={chartHeight}
              stroke="#000"
              strokeWidth={2}
            />

            {/* Party lines */}
            <path d={generatePath('con')} fill="none" stroke={getPartyColor('con')} strokeWidth={2.5} />
            <path d={generatePath('lab')} fill="none" stroke={getPartyColor('lab')} strokeWidth={2.5} />
            <path d={generatePath('ld')} fill="none" stroke={getPartyColor('ld')} strokeWidth={1.5} opacity={0.7} />
            <path d={generatePath('other')} fill="none" stroke="#808080" strokeWidth={1.5} opacity={0.6} />

            {/* Clickable hit areas for each year */}
            {data.map(d => {
              const isActive = d.year === currentYear;
              const isHovered = d.year === hoveredYear;
              const x = xScale(d.year);
              const winner = d.con > d.lab ? 'con' : 'lab';

              return (
                <g
                  key={d.year}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setYear(d.year)}
                  onMouseEnter={() => setHoveredYear(d.year)}
                  onMouseLeave={() => setHoveredYear(null)}
                >
                  <rect x={x - 15} y={0} width={30} height={chartHeight + 20} fill="transparent" />
                  <circle
                    cx={x}
                    cy={yScale(winner === 'con' ? d.con : d.lab)}
                    r={isActive || isHovered ? 5 : 3}
                    fill={getPartyColor(winner)}
                    stroke={isActive ? '#000' : isHovered ? '#666' : 'none'}
                    strokeWidth={2}
                  />
                  <line
                    x1={x} y1={chartHeight} x2={x} y2={chartHeight + 5}
                    stroke={isActive ? '#000' : '#999'} strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={chartHeight + 10}
                    textAnchor="end"
                    transform={`rotate(-45, ${x}, ${chartHeight + 10})`}
                    className={`text-[11px] ${isActive ? 'fill-black font-bold' : isHovered ? 'fill-gray-700' : 'fill-gray-500'}`}
                  >
                    {getYearLabel(d.year)}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Reset zoom button */}
      {isZoomed && (
        <button
          onClick={resetChartXZoom}
          className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-100 shadow-sm"
        >
          Reset
        </button>
      )}
    </div>
  );
}
