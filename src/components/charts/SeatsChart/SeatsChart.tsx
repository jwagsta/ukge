import { useMemo, useEffect, useState, useRef } from 'react';
import { useElectionStore } from '@/store/electionStore';
import { getPartyColor } from '@/types/party';

interface YearSeats {
  year: number;
  con: number;
  lab: number;
  ld: number;
  other: number;
  total: number;
}

// Pre-computed national seat totals (from Electoral Calculus data)
const NATIONAL_SEATS: YearSeats[] = [
  { year: 1955, con: 344, lab: 277, ld: 6, other: 3, total: 630 },
  { year: 1959, con: 365, lab: 258, ld: 6, other: 1, total: 630 },
  { year: 1964, con: 304, lab: 317, ld: 9, other: 0, total: 630 },
  { year: 1966, con: 253, lab: 363, ld: 12, other: 2, total: 630 },
  { year: 1970, con: 330, lab: 287, ld: 6, other: 7, total: 630 },
  { year: 1979, con: 339, lab: 269, ld: 11, other: 16, total: 635 },
  { year: 1983, con: 397, lab: 209, ld: 23, other: 21, total: 650 },
  { year: 1987, con: 376, lab: 229, ld: 22, other: 23, total: 650 },
  { year: 1992, con: 336, lab: 271, ld: 20, other: 24, total: 651 },
  { year: 1997, con: 165, lab: 418, ld: 46, other: 30, total: 659 },
  { year: 2001, con: 166, lab: 412, ld: 52, other: 29, total: 659 },
  { year: 2005, con: 198, lab: 355, ld: 62, other: 35, total: 650 },
  { year: 2010, con: 306, lab: 258, ld: 57, other: 29, total: 650 },
  { year: 2015, con: 330, lab: 232, ld: 8, other: 80, total: 650 },
  { year: 2017, con: 317, lab: 262, ld: 12, other: 59, total: 650 },
  { year: 2019, con: 365, lab: 202, ld: 11, other: 72, total: 650 },
  { year: 2024, con: 121, lab: 412, ld: 72, other: 45, total: 650 },
];

interface SeatsChartProps {
  height?: number;
}

export function SeatsChart({ height = 120 }: SeatsChartProps) {
  const { currentYear, availableYears, setYear } = useElectionStore();
  const [dimensions, setDimensions] = useState({ width: 0 });
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const xScale = useMemo(() => {
    const years = data.map(d => d.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    return (year: number) => {
      return ((year - minYear) / (maxYear - minYear)) * chartWidth;
    };
  }, [data, chartWidth]);

  const yScale = useMemo(() => {
    return (seats: number) => {
      return chartHeight - (seats / maxSeats) * chartHeight;
    };
  }, [chartHeight, maxSeats]);

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

  return (
    <div ref={containerRef} className="w-full bg-white border-b border-gray-200">
      <svg width={width} height={height}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Grid lines */}
          {[0, 100, 200, 300, 400].map(seats => (
            <g key={seats}>
              <line
                x1={0}
                y1={yScale(seats)}
                x2={chartWidth}
                y2={yScale(seats)}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={-5}
                y={yScale(seats)}
                textAnchor="end"
                alignmentBaseline="middle"
                className="text-[11px] fill-gray-400"
              >
                {seats}
              </text>
            </g>
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
          <path
            d={generatePath('con')}
            fill="none"
            stroke={getPartyColor('con')}
            strokeWidth={2.5}
          />
          <path
            d={generatePath('lab')}
            fill="none"
            stroke={getPartyColor('lab')}
            strokeWidth={2.5}
          />
          <path
            d={generatePath('ld')}
            fill="none"
            stroke={getPartyColor('ld')}
            strokeWidth={1.5}
            opacity={0.7}
          />
          <path
            d={generatePath('other')}
            fill="none"
            stroke="#808080"
            strokeWidth={1.5}
            opacity={0.6}
          />

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
                {/* Invisible hit area */}
                <rect
                  x={x - 15}
                  y={0}
                  width={30}
                  height={chartHeight + 20}
                  fill="transparent"
                />
                {/* Only show dot for winning party */}
                <circle
                  cx={x}
                  cy={yScale(winner === 'con' ? d.con : d.lab)}
                  r={isActive || isHovered ? 5 : 3}
                  fill={getPartyColor(winner)}
                  stroke={isActive ? '#000' : isHovered ? '#666' : 'none'}
                  strokeWidth={2}
                />
                {/* Tick mark */}
                <line
                  x1={x}
                  y1={chartHeight}
                  x2={x}
                  y2={chartHeight + 5}
                  stroke={isActive ? '#000' : '#999'}
                  strokeWidth={1}
                />
                {/* Year label - rotated 45 degrees */}
                <text
                  x={x}
                  y={chartHeight + 10}
                  textAnchor="end"
                  transform={`rotate(-45, ${x}, ${chartHeight + 10})`}
                  className={`text-[11px] ${isActive ? 'fill-black font-bold' : isHovered ? 'fill-gray-700' : 'fill-gray-500'}`}
                >
                  {d.year}
                </text>
              </g>
            );
          })}

        </g>
      </svg>
    </div>
  );
}
