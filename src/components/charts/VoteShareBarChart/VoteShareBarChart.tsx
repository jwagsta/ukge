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
  const isComparing = pinnedYear !== null && pinnedYear !== displayYear;
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
  // Single-view layout
  const barGap = 2;
  const barHeight = Math.min(16, (chartHeight - (bars.length - 1) * barGap) / bars.length);
  // Comparison paired-bar layout (dynamic sizing to fit available height)
  const pairGap = 3;
  const n = bars.length;
  const rawSub = Math.floor((chartHeight - n * pairGap) / (3 * n - 1));
  const subBarHeight = Math.min(8, Math.max(4, rawSub));
  const groupHeight = subBarHeight * 2 + pairGap;
  const groupGap = n > 1 ? Math.min(subBarHeight + 1, Math.floor((chartHeight - n * groupHeight) / (n - 1))) : 0;

  const totalBarsHeight = isComparing
    ? n * groupHeight + Math.max(n - 1, 0) * groupGap
    : bars.length * barHeight + (bars.length - 1) * barGap;
  const barsYOffset = Math.max(0, (chartHeight - totalBarsHeight) / 2);

  const xScale = (pct: number) => (pct / 100) * chartWidth;

  return (
    <div className="bg-white border-b border-gray-200" style={{ width, height }}>
      <svg width={width} height={height}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Bars */}
          {bars.map((bar, i) => {
            if (isComparing) {
              const groupY = barsYOffset + i * (groupHeight + groupGap);
              const topPct = chronoFlipped ? bar.pct : bar.pinnedPct;
              const bottomPct = chronoFlipped ? bar.pinnedPct : bar.pct;
              const yellowOnTop = !chronoFlipped;
              const topY = groupY;
              const bottomY = groupY + subBarHeight + pairGap;
              const rawDelta = bar.pct - bar.pinnedPct;
              const delta = chronoFlipped ? -rawDelta : rawDelta;
              const centerY = groupY + groupHeight / 2;

              return (
                <g key={bar.id}>
                  {/* Yellow background for pinned bar */}
                  <rect
                    x={-2}
                    y={(yellowOnTop ? topY : bottomY) - 1}
                    width={chartWidth - 40}
                    height={subBarHeight + 2}
                    fill="#fef3c7"
                    rx={1}
                  />
                  {/* Top sub-bar (earlier year) */}
                  {topPct > 0 && (
                    <rect x={0} y={topY} width={xScale(topPct)} height={subBarHeight} fill={bar.color} rx={1} {...(bar.id === 'snp' ? { stroke: '#000', strokeWidth: 0.5 } : {})} />
                  )}
                  <text x={Math.max(xScale(topPct), 0) + 3} y={topY + subBarHeight / 2} alignmentBaseline="central" className="text-[9px] fill-gray-700 font-medium">
                    {topPct.toFixed(1)}%
                  </text>
                  {/* Bottom sub-bar (later year) */}
                  {bottomPct > 0 && (
                    <rect x={0} y={bottomY} width={xScale(bottomPct)} height={subBarHeight} fill={bar.color} rx={1} {...(bar.id === 'snp' ? { stroke: '#000', strokeWidth: 0.5 } : {})} />
                  )}
                  <text x={Math.max(xScale(bottomPct), 0) + 3} y={bottomY + subBarHeight / 2} alignmentBaseline="central" className="text-[9px] fill-gray-700 font-medium">
                    {bottomPct.toFixed(1)}%
                  </text>
                  {/* Party label - centered on pair */}
                  <text x={-4} y={centerY} textAnchor="end" alignmentBaseline="central" className="text-[10px] fill-gray-600 font-medium">
                    {bar.label}
                  </text>
                  {/* Delta - centered on pair */}
                  {Math.abs(delta) >= 0.1 && (
                    <text x={chartWidth} y={centerY} textAnchor="end" alignmentBaseline="central" className={`text-[9px] font-medium ${delta > 0 ? 'fill-green-600' : 'fill-red-600'}`}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)}pp
                    </text>
                  )}
                </g>
              );
            } else {
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
                    {...(bar.id === 'snp' ? { stroke: '#000', strokeWidth: 0.5 } : {})}
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
                  {/* Previous-election delta annotation (single view) */}
                  {previousData && (() => {
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
            }
          })}
        </g>
      </svg>
    </div>
  );
}
