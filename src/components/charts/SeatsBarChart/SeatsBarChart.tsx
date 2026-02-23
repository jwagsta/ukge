import { useMemo } from 'react';
import { useElectionStore, getYearLabel } from '@/store/electionStore';
import { useUIStore } from '@/store/uiStore';
import { getPartyColor } from '@/types/party';
import { NATIONAL_SEATS } from '@/data/nationalSeats';

interface SeatsBarChartProps {
  height?: number;
  width?: number;
}

const PARTY_LABELS: Record<string, string> = {
  con: 'Con',
  lab: 'Lab',
  ld: 'LD',
  snp: 'SNP',
  other: 'Oth',
};

const normalizeYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;

export function SeatsBarChart({ height = 120, width = 200 }: SeatsBarChartProps) {
  const { currentYear, pinnedYear } = useElectionStore();
  const { hoveredChartYear } = useUIStore();
  const displayYear = hoveredChartYear ?? currentYear;
  const isComparing = pinnedYear !== null;
  const chronoFlipped = isComparing && normalizeYear(pinnedYear!) > normalizeYear(displayYear);

  const yearData = useMemo(() => {
    return NATIONAL_SEATS.find(d => d.year === displayYear);
  }, [displayYear]);

  const pinnedData = useMemo(() => {
    if (!pinnedYear) return null;
    return NATIONAL_SEATS.find(d => d.year === pinnedYear) ?? null;
  }, [pinnedYear]);

  const previousData = useMemo(() => {
    const idx = NATIONAL_SEATS.findIndex(d => d.year === displayYear);
    if (idx <= 0) return null;
    return NATIONAL_SEATS[idx - 1];
  }, [displayYear]);

  const bars = useMemo(() => {
    if (!yearData) return [];
    const parties = (['con', 'lab', 'ld', 'snp', 'other'] as const).map(id => ({
      id,
      seats: yearData[id],
      pinnedSeats: pinnedData ? pinnedData[id] : 0,
      previousSeats: previousData ? previousData[id] : 0,
      color: id === 'other' ? '#808080' : getPartyColor(id),
      label: PARTY_LABELS[id],
    }));
    return parties.filter(p => p.seats > 0 || (isComparing && p.pinnedSeats > 0)).sort((a, b) => b.seats - a.seats);
  }, [yearData, pinnedData, previousData, isComparing]);

  if (!yearData) return null;

  const padding = { top: 20, right: 8, bottom: 4, left: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barGap = 2;
  const barHeight = Math.min(16, (chartHeight - (bars.length - 1) * barGap) / bars.length);
  const totalBarsHeight = bars.length * barHeight + (bars.length - 1) * barGap;
  const barsYOffset = Math.max(0, (chartHeight - totalBarsHeight) / 2);

  const majority = Math.ceil(yearData.total / 2);
  const maxTotal = pinnedData ? Math.max(yearData.total, pinnedData.total) : yearData.total;
  const xScale = (seats: number) => (seats / maxTotal) * chartWidth;

  return (
    <div className="bg-white border-b border-gray-200" style={{ width, height }}>
      <svg width={width} height={height}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Year label */}
          {isComparing ? (
            <text
              x={chartWidth / 2}
              y={-6}
              textAnchor="middle"
              className="text-[11px] font-medium"
            >
              {chronoFlipped ? (
                <>
                  <tspan className={hoveredChartYear != null ? 'fill-blue-500' : 'fill-gray-500'}>{getYearLabel(displayYear)}</tspan>
                  <tspan className={hoveredChartYear != null ? 'fill-blue-500' : 'fill-gray-500'}>{' → '}</tspan>
                  <tspan fill="#92400e" stroke="#fef3c7" strokeWidth={3} paintOrder="stroke" className="font-bold">{getYearLabel(pinnedYear!)}</tspan>
                </>
              ) : (
                <>
                  <tspan fill="#92400e" stroke="#fef3c7" strokeWidth={3} paintOrder="stroke" className="font-bold">{getYearLabel(pinnedYear!)}</tspan>
                  <tspan className={hoveredChartYear != null ? 'fill-blue-500' : 'fill-gray-500'}>{' → '}</tspan>
                  <tspan className={hoveredChartYear != null ? 'fill-blue-500' : 'fill-gray-500'}>{getYearLabel(displayYear)}</tspan>
                </>
              )}
            </text>
          ) : (
            <text
              x={chartWidth / 2}
              y={-6}
              textAnchor="middle"
              className={`text-[11px] font-medium ${hoveredChartYear != null ? 'fill-blue-500' : 'fill-gray-500'}`}
            >
              {getYearLabel(displayYear)}
            </text>
          )}

          {/* Bars */}
          {bars.map((bar, i) => {
            const y = barsYOffset + i * (barHeight + barGap);
            const barW = xScale(bar.seats);
            const pinnedW = isComparing ? xScale(bar.pinnedSeats) : 0;
            const rawDelta = bar.seats - bar.pinnedSeats;
            const delta = chronoFlipped ? -rawDelta : rawDelta;
            return (
              <g key={bar.id}>
                <text
                  x={-4}
                  y={y + barHeight / 2}
                  textAnchor="end"
                  alignmentBaseline="central"
                  className="text-[10px] fill-gray-600 font-medium"
                >
                  {bar.label}
                </text>
                {/* Ghost bar for pinned year */}
                {isComparing && bar.pinnedSeats > 0 && (
                  <rect
                    x={0}
                    y={y}
                    width={pinnedW}
                    height={barHeight}
                    fill="none"
                    stroke={bar.color}
                    strokeWidth={1}
                    strokeDasharray="3,2"
                    rx={2}
                    opacity={0.6}
                  />
                )}
                <rect
                  x={0}
                  y={y}
                  width={barW}
                  height={barHeight}
                  fill={bar.color}
                  rx={2}
                />
                {i < 2 ? (
                  <text
                    x={4}
                    y={y + barHeight / 2}
                    alignmentBaseline="central"
                    className="text-[10px] fill-white font-medium"
                  >
                    {bar.seats}
                  </text>
                ) : (
                  <text
                    x={barW + 3}
                    y={y + barHeight / 2}
                    alignmentBaseline="central"
                    className="text-[10px] fill-gray-700 font-medium"
                  >
                    {bar.seats}
                  </text>
                )}
                {/* Delta annotation */}
                {isComparing && delta !== 0 && (
                  <text
                    x={chartWidth}
                    y={y + barHeight / 2}
                    textAnchor="end"
                    alignmentBaseline="central"
                    className={`text-[9px] font-medium ${delta > 0 ? 'fill-green-600' : 'fill-red-600'}`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </text>
                )}
                {/* Previous-election delta annotation (single view) */}
                {!isComparing && previousData && (() => {
                  const prevDelta = bar.seats - bar.previousSeats;
                  return (
                    <text
                      x={chartWidth}
                      y={y + barHeight / 2}
                      textAnchor="end"
                      alignmentBaseline="central"
                      className={`text-[9px] font-medium ${prevDelta > 0 ? 'fill-green-600' : prevDelta < 0 ? 'fill-red-600' : 'fill-gray-400'}`}
                    >
                      {prevDelta > 0 ? `+${prevDelta}` : prevDelta === 0 ? '0' : prevDelta}
                    </text>
                  );
                })()}
              </g>
            );
          })}

          {/* Majority line */}
          <line
            x1={xScale(majority)}
            y1={barsYOffset - 4}
            x2={xScale(majority)}
            y2={barsYOffset + totalBarsHeight + 4}
            stroke="#666"
            strokeWidth={1}
            strokeDasharray="3,2"
          />
          <text
            x={xScale(majority) + 4}
            y={barsYOffset + (bars.length - 1) * (barHeight + barGap) + barHeight / 2}
            textAnchor="start"
            alignmentBaseline="central"
            className="text-[9px] fill-gray-400"
          >
            {majority}
          </text>
        </g>
      </svg>
    </div>
  );
}
