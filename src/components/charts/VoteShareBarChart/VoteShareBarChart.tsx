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
  other: 'Oth',
};

export function VoteShareBarChart({ height = 100, width = 200 }: VoteShareBarChartProps) {
  const { currentYear } = useElectionStore();
  const { hoveredChartYear } = useUIStore();
  const displayYear = hoveredChartYear ?? currentYear;

  const yearData = useMemo(() => {
    return NATIONAL_VOTES.find(d => d.year === displayYear);
  }, [displayYear]);

  const bars = useMemo(() => {
    if (!yearData) return [];
    const parties = (['con', 'lab', 'ld', 'other'] as const).map(id => ({
      id,
      pct: (yearData[id] / yearData.total) * 100,
      color: id === 'other' ? '#808080' : getPartyColor(id),
      label: PARTY_LABELS[id],
    }));
    return parties.filter(p => p.pct > 0).sort((a, b) => b.pct - a.pct);
  }, [yearData]);

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
                <rect
                  x={0}
                  y={y}
                  width={barW}
                  height={barHeight}
                  fill={bar.color}
                  rx={2}
                />
                <text
                  x={barW + 3}
                  y={y + barHeight / 2}
                  alignmentBaseline="central"
                  className="text-[10px] fill-gray-700 font-medium"
                >
                  {bar.pct.toFixed(1)}%
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
