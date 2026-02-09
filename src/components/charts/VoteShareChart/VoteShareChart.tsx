import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { useElectionStore } from '@/store/electionStore';
import { useUIStore } from '@/store/uiStore';
import { getPartyColor } from '@/types/party';
import { NATIONAL_VOTES } from '@/data/nationalSeats';
import { curveMonotoneX, line as d3Line } from 'd3';

interface VoteShareChartProps {
  height?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

// Stack order bottom→top: Other, LD, Con, Lab
const STACK_PARTIES = ['other', 'ld', 'con', 'lab'] as const;
const PARTY_COLORS: Record<string, string> = {
  con: getPartyColor('con'),
  lab: getPartyColor('lab'),
  ld: getPartyColor('ld'),
  other: '#808080',
};

export function VoteShareChart({ height = 100 }: VoteShareChartProps) {
  const { currentYear, availableYears, setYear } = useElectionStore();
  const { chartXZoom, setChartXZoom, resetChartXZoom, hoveredChartYear, setHoveredChartYear } = useUIStore();
  const [dimensions, setDimensions] = useState({ width: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startMouseX: number; startZoomX: number } | null>(null);
  const clipId = useRef(`vote-clip-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setDimensions({ width: entries[0].contentRect.width });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { width } = dimensions;
  const padding = { top: 10, right: 20, bottom: 45, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const data = useMemo(() => {
    return NATIONAL_VOTES.filter(d => availableYears.includes(d.year)).map(d => ({
      ...d,
      conPct: (d.con / d.total) * 100,
      labPct: (d.lab / d.total) * 100,
      ldPct: (d.ld / d.total) * 100,
      otherPct: (d.other / d.total) * 100,
    }));
  }, [availableYears]);

  const normalizeYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;

  const getShortYearLabel = (year: number): string => {
    if (year === 197402) return "Feb'74";
    if (year === 197410) return "Oct'74";
    return year.toString();
  };

  // Nudge 1974 labels apart so they don't overlap
  const getLabelXOffset = (year: number): number => {
    if (year === 197402) return -8;
    if (year === 197410) return 8;
    return 0;
  };

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

  const yScale = (pct: number) => chartHeight - (pct / 100) * chartHeight;

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

  // Compute cumulative stack positions for each year
  const stackedData = useMemo(() => {
    const pctKeys: Record<typeof STACK_PARTIES[number], 'otherPct' | 'ldPct' | 'conPct' | 'labPct'> = {
      other: 'otherPct',
      ld: 'ldPct',
      con: 'conPct',
      lab: 'labPct',
    };

    return data.map(d => {
      let cumulative = 0;
      const bands: Record<string, { y0: number; y1: number }> = {};
      for (const party of STACK_PARTIES) {
        const val = d[pctKeys[party]];
        bands[party] = { y0: cumulative, y1: cumulative + val };
        cumulative += val;
      }
      return { year: d.year, bands };
    });
  }, [data]);

  // Generate area path for a party band using D3 curveMonotoneX
  const generateAreaPath = useCallback((party: typeof STACK_PARTIES[number]) => {
    if (stackedData.length === 0) return '';

    const points = stackedData.map(d => ({
      x: xScale(d.year),
      y0: yScale(d.bands[party].y0),
      y1: yScale(d.bands[party].y1),
    }));

    // Top edge (left to right)
    const topLine = d3Line<{ x: number; y1: number }>()
      .x(d => d.x)
      .y(d => d.y1)
      .curve(curveMonotoneX);

    // Bottom edge (right to left)
    const bottomLine = d3Line<{ x: number; y0: number }>()
      .x(d => d.x)
      .y(d => d.y0)
      .curve(curveMonotoneX);

    const topPath = topLine(points);
    const bottomPath = bottomLine([...points].reverse());

    if (!topPath || !bottomPath) return '';

    // Combine: top edge forward, then bottom edge backward
    return topPath + 'L' + bottomPath.slice(1) + 'Z';
  }, [stackedData, xScale, yScale]);

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
            <rect x={-padding.left} y={-padding.top} width={chartWidth + padding.left} height={height} />
          </clipPath>
        </defs>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Y-axis labels (outside clip) */}
          {[0, 50, 100].map(pct => (
            <text
              key={pct}
              x={-5}
              y={yScale(pct)}
              textAnchor="end"
              alignmentBaseline="middle"
              className="text-[11px] fill-gray-400"
            >
              {pct}%
            </text>
          ))}

          {/* Clipped chart content */}
          <g clipPath={`url(#${clipId})`}>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map(pct => (
              <line
                key={pct}
                x1={0}
                y1={yScale(pct)}
                x2={chartWidth}
                y2={yScale(pct)}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
            ))}

            {/* Stacked area bands */}
            {STACK_PARTIES.map(party => (
              <path
                key={party}
                d={generateAreaPath(party)}
                fill={PARTY_COLORS[party]}
                opacity={0.85}
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

            {/* Blue hover vertical line */}
            {hoveredChartYear != null && hoveredChartYear !== currentYear && (() => {
              const hx = xScale(hoveredChartYear);
              return (
                <line
                  x1={hx} y1={0} x2={hx} y2={chartHeight}
                  stroke="#3b82f6" strokeWidth={2}
                />
              );
            })()}

            {/* Clickable hit areas for each year */}
            {data.map(d => {
              const isActive = d.year === currentYear;
              const isHovered = d.year === hoveredChartYear;
              const x = xScale(d.year);
              const labelX = x + getLabelXOffset(d.year);

              return (
                <g
                  key={d.year}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setYear(d.year)}
                  onMouseEnter={() => setHoveredChartYear(d.year)}
                  onMouseLeave={() => setHoveredChartYear(null)}
                >
                  <rect x={x - 15} y={0} width={30} height={chartHeight + 20} fill="transparent" />
                  <line
                    x1={x} y1={chartHeight} x2={labelX} y2={chartHeight + 5}
                    stroke={isActive ? '#000' : isHovered ? '#3b82f6' : '#999'} strokeWidth={1}
                  />
                  <text
                    x={labelX}
                    y={chartHeight + 10}
                    textAnchor="end"
                    transform={`rotate(-45, ${labelX}, ${chartHeight + 10})`}
                    className={`text-[11px] ${isActive ? 'fill-black font-bold' : isHovered ? 'fill-blue-500 font-medium' : 'fill-gray-500'}`}
                  >
                    {getShortYearLabel(d.year)}
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
