import { useMemo } from 'react';
import { useElectionStore, getYearLabel } from '@/store/electionStore';
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
  other: 'Oth',
};

export function SeatsBarChart({ height = 120, width = 200 }: SeatsBarChartProps) {
  const { currentYear } = useElectionStore();

  const yearData = useMemo(() => {
    return NATIONAL_SEATS.find(d => d.year === currentYear);
  }, [currentYear]);

  const bars = useMemo(() => {
    if (!yearData) return [];
    const parties = (['con', 'lab', 'ld', 'other'] as const).map(id => ({
      id,
      seats: yearData[id],
      color: id === 'other' ? '#808080' : getPartyColor(id),
      label: PARTY_LABELS[id],
    }));
    return parties.filter(p => p.seats > 0).sort((a, b) => b.seats - a.seats);
  }, [yearData]);

  if (!yearData) return null;

  const padding = { top: 20, right: 8, bottom: 10, left: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barHeight = Math.min(18, (chartHeight - (bars.length - 1) * 3) / bars.length);
  const barGap = 3;
  const totalBarsHeight = bars.length * barHeight + (bars.length - 1) * barGap;
  const barsYOffset = (chartHeight - totalBarsHeight) / 2;

  const majority = Math.ceil(yearData.total / 2);
  const xScale = (seats: number) => (seats / yearData.total) * chartWidth;

  return (
    <div className="bg-white border-b border-gray-200" style={{ width, height }}>
      <svg width={width} height={height}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Year label */}
          <text
            x={chartWidth / 2}
            y={-6}
            textAnchor="middle"
            className="text-[11px] fill-gray-500 font-medium"
          >
            {getYearLabel(currentYear)}
          </text>

          {/* Bars */}
          {bars.map((bar, i) => {
            const y = barsYOffset + i * (barHeight + barGap);
            const barW = xScale(bar.seats);
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
                  {bar.seats}
                </text>
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
            x={xScale(majority)}
            y={barsYOffset + totalBarsHeight + 14}
            textAnchor="middle"
            className="text-[9px] fill-gray-400"
          >
            {majority}
          </text>
        </g>
      </svg>
    </div>
  );
}
