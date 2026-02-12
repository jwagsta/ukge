import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useElectionStore, getYearLabel } from '@/store/electionStore';
import { getPartyColor } from '@/types/party';
import type { ElectionResult } from '@/types/election';

interface HistoricalResult {
  year: number;
  results: Array<{ partyId: string; votes: number; voteShare: number }>;
  winner: string;
  validVotes: number;
  electorate: number;
  turnout: number;
}

// Shared cache with ConstituencyPanel
const historicalDataCache = new Map<string, HistoricalResult[]>();
const MAX_HISTORICAL_CACHE = 5;

export function MobileBottomSheet() {
  const {
    selectedConstituencyId,
    electionData,
    currentYear,
    availableYears,
    setSelectedConstituency,
    setYear,
  } = useElectionStore();

  const [historicalData, setHistoricalData] = useState<HistoricalResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);

  const currentConstituency = useMemo(() => {
    if (!selectedConstituencyId) return null;
    return electionData.find((c) => c.constituencyId === selectedConstituencyId);
  }, [selectedConstituencyId, electionData]);

  // Load historical data
  useEffect(() => {
    if (!selectedConstituencyId || !currentConstituency) {
      setHistoricalData([]);
      return;
    }

    const cached = historicalDataCache.get(selectedConstituencyId);
    if (cached) {
      setHistoricalData(cached);
      return;
    }

    setIsLoading(true);

    const fetchHistoricalData = async () => {
      const results: HistoricalResult[] = [];

      for (const year of availableYears) {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}data/elections/${year}.json`);
          if (!response.ok) continue;
          const data = await response.json();
          const constituencies: ElectionResult[] = data.constituencies || [];
          let match = constituencies.find((c) => c.constituencyId === selectedConstituencyId);
          if (!match && currentConstituency) {
            match = constituencies.find(
              (c) => c.constituencyName.toLowerCase() === currentConstituency.constituencyName.toLowerCase()
            );
          }
          if (match) {
            results.push({
              year,
              results: match.results,
              winner: match.winner,
              validVotes: match.validVotes,
              electorate: match.electorate,
              turnout: match.turnout,
            });
          }
        } catch {
          // Skip failed fetches
        }
      }

      const sortYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;
      results.sort((a, b) => sortYear(a.year) - sortYear(b.year));

      if (historicalDataCache.size >= MAX_HISTORICAL_CACHE) {
        const firstKey = historicalDataCache.keys().next().value;
        if (firstKey) historicalDataCache.delete(firstKey);
      }
      historicalDataCache.set(selectedConstituencyId, results);
      setHistoricalData(results);
      setIsLoading(false);
    };

    fetchHistoricalData();
  }, [selectedConstituencyId, currentConstituency, availableYears]);

  // Expand when constituency is selected
  useEffect(() => {
    if (selectedConstituencyId) {
      setExpanded(true);
    }
  }, [selectedConstituencyId]);

  // Touch drag handling for swipe-to-dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    // Only allow dragging down (positive delta)
    if (delta > 0 && sheetRef.current) {
      dragCurrentY.current = delta;
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragCurrentY.current > 100) {
      // Dismiss
      setExpanded(false);
      setTimeout(() => setSelectedConstituency(null), 300);
    }
    // Reset
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
  }, [setSelectedConstituency]);

  const handleClose = useCallback(() => {
    setExpanded(false);
    setTimeout(() => setSelectedConstituency(null), 300);
  }, [setSelectedConstituency]);

  const allParties = useMemo(() => {
    const partySet = new Set<string>();
    historicalData.forEach(d => d.results.forEach(r => partySet.add(r.partyId.toLowerCase())));
    if (currentConstituency) {
      currentConstituency.results.forEach(r => partySet.add(r.partyId.toLowerCase()));
    }
    return Array.from(partySet);
  }, [historicalData, currentConstituency]);

  if (!selectedConstituencyId || !currentConstituency) return null;

  const sortedResults = [...currentConstituency.results].sort((a, b) => b.voteShare - a.voteShare);

  // Mini chart scales
  const chartWidth = Math.min(320, window.innerWidth - 32);
  const chartHeight = 120;
  const pad = { top: 8, right: 8, bottom: 28, left: 28 };
  const plotW = chartWidth - pad.left - pad.right;
  const plotH = chartHeight - pad.top - pad.bottom;

  const normalizeYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;
  const xScale = (year: number) => {
    if (historicalData.length <= 1) return plotW / 2;
    const years = historicalData.map((d) => normalizeYear(d.year));
    const min = Math.min(...years);
    const max = Math.max(...years);
    return ((normalizeYear(year) - min) / (max - min)) * plotW;
  };
  const yScale = (share: number) => plotH - (share / 100) * plotH;

  const generatePath = (partyId: string) => {
    let path = '';
    let needsMove = true;
    for (const d of historicalData) {
      const result = d.results.find(
        (r) => r.partyId.toLowerCase() === partyId.toLowerCase() ||
          r.partyId.toLowerCase().startsWith(partyId.toLowerCase())
      );
      if (!result) {
        needsMove = true;
        continue;
      }
      path += `${needsMove ? 'M' : 'L'} ${xScale(d.year)} ${yScale(result.voteShare)} `;
      needsMove = false;
    }
    return path;
  };

  const yearsPresent = new Set(historicalData.map((d) => d.year));

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
        expanded ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ maxHeight: '65vh' }}
    >
      {/* Backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={handleClose}
        />
      )}

      <div
        ref={sheetRef}
        className="bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] overflow-y-auto"
        style={{ maxHeight: '65vh', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header row */}
        <div className="flex items-start justify-between px-4 pb-2">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">
              {currentConstituency.constituencyName}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="w-2.5 h-2.5 rounded"
                style={{ backgroundColor: getPartyColor(currentConstituency.winner) }}
              />
              <span className="text-xs text-gray-600">
                {currentConstituency.winner.toUpperCase()} win
              </span>
              <span className="text-xs text-gray-400">
                Turnout: {currentConstituency.turnout.toFixed(1)}%
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 -mr-2 -mt-1 text-gray-400 active:text-gray-600"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/* Results */}
        <div className="px-4 pb-3">
          <h4 className="text-xs font-medium text-gray-500 mb-1.5">
            {getYearLabel(currentYear)} Results
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {sortedResults.map((r) => (
              <div key={r.partyId} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded"
                    style={{ backgroundColor: getPartyColor(r.partyId) }}
                  />
                  <span className="text-xs">{r.partyId.toUpperCase()}</span>
                </div>
                <span className="text-xs font-medium">{r.voteShare.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Historical chart */}
        <div className="px-4 pb-4">
          <h4 className="text-xs font-medium text-gray-500 mb-1">Vote Share History</h4>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : historicalData.length > 1 ? (
            <svg width={chartWidth} height={chartHeight} className="overflow-visible">
              <g transform={`translate(${pad.left}, ${pad.top})`}>
                {[0, 50, 100].map((v) => (
                  <g key={v}>
                    <line x1={0} y1={yScale(v)} x2={plotW} y2={yScale(v)} stroke="#e5e7eb" strokeWidth={1} />
                    <text x={-4} y={yScale(v)} textAnchor="end" alignmentBaseline="middle" className="text-[8px] fill-gray-400">
                      {v}%
                    </text>
                  </g>
                ))}

                {allParties.map((party) => {
                  const path = generatePath(party);
                  if (!path) return null;
                  const isMain = ['lab', 'con', 'ld', 'lib'].some(p => party.startsWith(p));
                  return (
                    <path key={party} d={path} fill="none" stroke={getPartyColor(party)}
                      strokeWidth={isMain ? 2 : 1.5} opacity={isMain ? 1 : 0.7} />
                  );
                })}

                {yearsPresent.has(currentYear) && (
                  <line x1={xScale(currentYear)} y1={-4} x2={xScale(currentYear)} y2={plotH + 4}
                    stroke="#000" strokeWidth={2} />
                )}

                {/* Year labels (tap to navigate) */}
                {historicalData.map((d) => (
                  <g key={`label-${d.year}`}>
                    <rect
                      x={xScale(d.year) - 14}
                      y={-4}
                      width={28}
                      height={plotH + 20}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setYear(d.year)}
                    />
                    <text
                      x={xScale(d.year)}
                      y={plotH + 10}
                      textAnchor="end"
                      transform={`rotate(-45, ${xScale(d.year)}, ${plotH + 10})`}
                      className={`text-[8px] ${d.year === currentYear ? 'fill-black font-semibold' : 'fill-gray-400'}`}
                      style={{ pointerEvents: 'none' }}
                    >
                      {d.year === 197402 ? "Feb'74" : d.year === 197410 ? "Oct'74" : d.year}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          ) : (
            <div className="text-xs text-gray-400 text-center py-2">No historical data</div>
          )}
        </div>
      </div>
    </div>
  );
}
