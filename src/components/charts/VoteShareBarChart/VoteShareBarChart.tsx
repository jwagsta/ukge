import { useMemo } from 'react';
import { useElectionStore } from '@/store/electionStore';
import { useUIStore } from '@/store/uiStore';
import { getPartyColor } from '@/types/party';
import { NATIONAL_VOTES } from '@/data/nationalSeats';

interface VoteShareBarChartProps {
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

export function VoteShareBarChart({ height = 100, width = 200 }: VoteShareBarChartProps) {
  const { currentYear, pinnedYear } = useElectionStore();
  const { hoveredChartYear } = useUIStore();
  const displayYear = hoveredChartYear ?? currentYear;
  const isComparing = pinnedYear !== null;
  const chronoFlipped = isComparing && normalizeYear(pinnedYear!) > normalizeYear(displayYear);

  const yearData = useMemo(() => {
    return NATIONAL_VOTES.find(d => d.year === displayYear);
  }, [displayYear]);

  const pinnedData = useMemo(() => {
    if (!pinnedYear) return null;
    return NATIONAL_VOTES.find(d => d.year === pinnedYear) ?? null;
  }, [pinnedYear]);

  const previousData = useMemo(() => {
    const idx = NATIONAL_VOTES.findIndex(d => d.year === displayYear);
    if (idx <= 0) return null;
    return NATIONAL_VOTES[idx - 1];
  }, [displayYear]);

  const bars = useMemo(() => {
    if (!yearData) return [];
    const parties = (['con', 'lab', 'ld', 'snp', 'other'] as const).map(id => ({
      id,
      pct: (yearData[id] / yearData.total) * 100,
      pinnedPct: pinnedData ? (pinnedData[id] / pinnedData.total) * 100 : 0,
      previousPct: previousData ? (previousData[id] / previousData.total) * 100 : 0,
      color: id === 'other' ? '#808080' : getPartyColor(id),
      label: PARTY_LABELS[id],
    }));
    return parties.filter(p => p.pct > 0 || (isComparing && p.pinnedPct > 0)).sort((a, b) => b.pct - a.pct);
  }, [yearData, pinnedData, previousData, isComparing]);

  if (!yearData) return null;

  const padding = { top: 8, right: 8, bottom: 4, left: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barGap = 2;
  const barHeight = Math.min(16, (chartHeight - (bars.length - 1) * barGap) / bars.length);
  const totalBarsHeight = bars.length * barHeight + (bars.length - 1) * barGap;
  const barsYOffset = Math.max(0, (chartHeight - totalBarsHeight) / 2);

  const xScale = (pct: number) => (pct / 100) * chartWidth;

  return (
    <div className="bg-white border-b border-gray-200" style={{ width, height }}>
      <svg width={width} height={height}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Bars */}
          {bars.map((bar, i) => {
            const y = barsYOffset + i * (barHeight + barGap);
            const barW = xScale(bar.pct);
            const pinnedW = isComparing ? xScale(bar.pinnedPct) : 0;
            const rawDelta = bar.pct - bar.pinnedPct;
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
                {isComparing && bar.pinnedPct > 0 && (
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
                    {bar.pct.toFixed(1)}%
                  </text>
                ) : (
                  <text
                    x={barW + 3}
                    y={y + barHeight / 2}
                    alignmentBaseline="central"
                    className="text-[10px] fill-gray-700 font-medium"
                  >
                    {bar.pct.toFixed(1)}%
                  </text>
                )}
                {/* Delta annotation */}
                {isComparing && Math.abs(delta) >= 0.1 && (
                  <text
                    x={chartWidth}
                    y={y + barHeight / 2}
                    textAnchor="end"
                    alignmentBaseline="central"
                    className={`text-[9px] font-medium ${delta > 0 ? 'fill-green-600' : 'fill-red-600'}`}
                  >
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}pp
                  </text>
                )}
                {/* Previous-election delta annotation (single view) */}
                {!isComparing && previousData && (() => {
                  const prevDelta = bar.pct - bar.previousPct;
                  return (
                    <text
                      x={chartWidth}
                      y={y + barHeight / 2}
                      textAnchor="end"
                      alignmentBaseline="central"
                      className={`text-[9px] font-medium ${prevDelta > 0.05 ? 'fill-green-600' : prevDelta < -0.05 ? 'fill-red-600' : 'fill-gray-400'}`}
                    >
                      {prevDelta > 0 ? '+' : ''}{prevDelta.toFixed(1)}pp
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
