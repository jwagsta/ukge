import { useEffect, useState, useMemo, useRef } from 'react';
import { useElectionStore, getYearLabel } from '@/store/electionStore';
import { getPartyColor } from '@/types/party';
import type { ElectionResult } from '@/types/election';

// Search component for constituency lookup
function ConstituencySearch() {
  const { electionData, setSelectedConstituency } = useElectionStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredConstituencies = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return electionData
      .filter((c) => c.constituencyName.toLowerCase().includes(query))
      .slice(0, 8);
  }, [searchQuery, electionData]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedConstituency(id);
    setSearchQuery('');
    setIsOpen(false);
  };

  return (
    <div className="relative w-64">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search constituency..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      {isOpen && filteredConstituencies.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
        >
          {filteredConstituencies.map((c) => (
            <button
              key={c.constituencyId}
              onClick={() => handleSelect(c.constituencyId)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
            >
              <span>{c.constituencyName}</span>
              <span
                className="w-2 h-2 rounded"
                style={{ backgroundColor: getPartyColor(c.winner) }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface HistoricalResult {
  year: number;
  results: Array<{ partyId: string; votes: number; voteShare: number }>;
  winner: string;
  validVotes: number;
  electorate: number;
  turnout: number;
}

interface ConstituencyPanelProps {
  height: number;
}

// Cache for historical data - limited to control memory
const historicalDataCache = new Map<string, HistoricalResult[]>();
const MAX_HISTORICAL_CACHE = 5;

export function ConstituencyPanel({ height }: ConstituencyPanelProps) {
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
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  // Get current constituency data
  const currentConstituency = useMemo(() => {
    if (!selectedConstituencyId) return null;
    return electionData.find((c) => c.constituencyId === selectedConstituencyId);
  }, [selectedConstituencyId, electionData]);

  // Load historical data for the selected constituency
  useEffect(() => {
    if (!selectedConstituencyId || !currentConstituency) {
      setHistoricalData([]);
      return;
    }

    // Check cache
    const cached = historicalDataCache.get(selectedConstituencyId);
    if (cached) {
      setHistoricalData(cached);
      return;
    }

    setIsLoading(true);

    // Fetch all years and find matching constituency
    const fetchHistoricalData = async () => {
      const results: HistoricalResult[] = [];

      for (const year of availableYears) {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}data/elections/${year}.json`);
          if (!response.ok) continue;

          const data = await response.json();
          const constituencies: ElectionResult[] = data.constituencies || [];

          // Try to find the constituency by ID first, then by name
          let match = constituencies.find(
            (c) => c.constituencyId === selectedConstituencyId
          );

          // If not found by ID, try matching by name (for boundary changes)
          if (!match && currentConstituency) {
            match = constituencies.find(
              (c) =>
                c.constituencyName.toLowerCase() ===
                currentConstituency.constituencyName.toLowerCase()
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

      // Sort by year (normalize 197402/197410 to 1974.x for correct ordering)
      const sortYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;
      results.sort((a, b) => sortYear(a.year) - sortYear(b.year));

      // Cache the result with size limit
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

  // Determine which year's data to display (hovered year or current)
  // Must be before early return to satisfy React hooks rules
  const displayYear = hoveredYear ?? currentYear;
  const displayData = useMemo(() => {
    if (!currentConstituency) {
      return { year: currentYear, results: [], winner: '', turnout: 0, electorate: 0 };
    }
    if (hoveredYear) {
      const yearData = historicalData.find(d => d.year === hoveredYear);
      if (yearData) {
        return {
          year: hoveredYear,
          results: yearData.results,
          winner: yearData.winner,
          turnout: yearData.turnout,
          electorate: yearData.electorate,
        };
      }
    }
    return {
      year: currentYear,
      results: currentConstituency.results,
      winner: currentConstituency.winner,
      turnout: currentConstituency.turnout,
      electorate: currentConstituency.electorate,
    };
  }, [hoveredYear, currentYear, currentConstituency, historicalData]);

  // Get all unique parties across historical data for the chart
  const allParties = useMemo(() => {
    const partySet = new Set<string>();
    historicalData.forEach(d => {
      d.results.forEach(r => partySet.add(r.partyId.toLowerCase()));
    });
    // Also add current constituency parties
    if (currentConstituency) {
      currentConstituency.results.forEach(r => partySet.add(r.partyId.toLowerCase()));
    }
    return Array.from(partySet);
  }, [historicalData, currentConstituency]);

  // Empty state when no constituency selected
  if (!selectedConstituencyId || !currentConstituency) {
    return (
      <div
        className="bg-white border-t border-gray-200 flex items-center justify-center gap-8"
        style={{ height }}
      >
        <ConstituencySearch />
        <div className="text-gray-300">or</div>
        <div className="text-center text-gray-400">
          <svg className="w-6 h-6 mx-auto mb-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <p className="text-sm">Click on map or plot</p>
        </div>
      </div>
    );
  }

  // Calculate chart dimensions for horizontal layout
  const chartWidth = 400;
  const chartHeight = height - 40;
  const chartPadding = { top: 10, right: 20, bottom: 40, left: 35 };
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

  // Normalize year for scale (handle 197402/197410 as 1974.2/1974.8)
  const normalizeYear = (year: number) => {
    if (year === 197402) return 1974.2;
    if (year === 197410) return 1974.8;
    return year;
  };

  // Scale functions for mini chart
  const xScale = (year: number) => {
    if (historicalData.length <= 1) return plotWidth / 2;
    const normalizedYears = historicalData.map((d) => normalizeYear(d.year));
    const minYear = Math.min(...normalizedYears);
    const maxYear = Math.max(...normalizedYears);
    return ((normalizeYear(year) - minYear) / (maxYear - minYear)) * plotWidth;
  };

  const yScale = (share: number) => {
    // share is in percentage (0-100), convert to 0-1 for scaling
    return plotHeight - (share / 100) * plotHeight;
  };

  // Generate path for party vote share over time
  const generatePath = (partyId: string) => {
    const points = historicalData
      .map((d) => {
        const result = d.results.find(
          (r) =>
            r.partyId.toLowerCase() === partyId.toLowerCase() ||
            r.partyId.toLowerCase().startsWith(partyId.toLowerCase())
        );
        if (!result) return null;
        return { year: d.year, share: result.voteShare };
      })
      .filter((p): p is { year: number; share: number } => p !== null);

    if (points.length === 0) return '';

    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.year)} ${yScale(p.share)}`)
      .join(' ');
  };

  // Determine if constituency has boundary changes
  const hasGaps = historicalData.length < availableYears.length;
  const yearsPresent = new Set(historicalData.map((d) => d.year));
  const firstYear = historicalData.length > 0 ? historicalData[0].year : null;
  const isNew = firstYear && firstYear > availableYears[0];

  return (
    <div
      className="bg-white border-t border-gray-200 flex"
      style={{ height }}
    >
      {/* Header and current results */}
      <div className="w-64 border-r border-gray-100 p-4 overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">
              {currentConstituency.constituencyName}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="w-2.5 h-2.5 rounded"
                style={{ backgroundColor: getPartyColor(currentConstituency.winner) }}
              />
              <span className="text-xs text-gray-600">
                {currentConstituency.winner.toUpperCase()} win
              </span>
            </div>
          </div>
          <button
            onClick={() => setSelectedConstituency(null)}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
            aria-label="Close panel"
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/* Turnout info - updates on hover */}
        <div className={`text-xs mb-3 ${hoveredYear ? 'text-blue-600' : 'text-gray-500'}`}>
          <div className="flex justify-between">
            <span>Turnout</span>
            <span>{displayData.turnout.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span>Electorate</span>
            <span>{displayData.electorate.toLocaleString()}</span>
          </div>
        </div>

        {/* Boundary notice */}
        {(isNew || hasGaps) && (
          <div className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1">
            {isNew ? `Created ${firstYear}` : 'Boundary changes'}
          </div>
        )}
      </div>

      {/* Results for displayed year */}
      <div className="w-56 border-r border-gray-100 p-4 overflow-y-auto">
        <h4 className={`text-xs font-medium mb-2 ${hoveredYear ? 'text-blue-600' : 'text-gray-500'}`}>
          {getYearLabel(displayYear)} Results
        </h4>
        <div className="space-y-1.5">
          {[...displayData.results]
            .sort((a, b) => b.voteShare - a.voteShare)
            .map((r) => (
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

      {/* Historical chart with legend */}
      <div className="flex-1 p-4 flex">
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-1">Vote Share</h4>

          {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : historicalData.length > 1 ? (
          <svg width={chartWidth} height={chartHeight} className="overflow-visible">
            <g transform={`translate(${chartPadding.left}, ${chartPadding.top})`}>
              {/* Horizontal grid lines */}
              {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                  <line
                    x1={0}
                    y1={yScale(v)}
                    x2={plotWidth}
                    y2={yScale(v)}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                  <text
                    x={-5}
                    y={yScale(v)}
                    textAnchor="end"
                    alignmentBaseline="middle"
                    className="text-[9px] fill-gray-400"
                  >
                    {v}%
                  </text>
                </g>
              ))}

              {/* Vertical election year lines */}
              {historicalData.map((d) => (
                <line
                  key={`vline-${d.year}`}
                  x1={xScale(d.year)}
                  y1={0}
                  x2={xScale(d.year)}
                  y2={plotHeight}
                  stroke="#d1d5db"
                  strokeWidth={1}
                />
              ))}

              {/* Party lines - all parties */}
              {allParties.map((party) => {
                const path = generatePath(party);
                if (!path) return null;
                // Highlight main parties with thicker lines
                const isMainParty = ['lab', 'labour', 'con', 'conservative', 'ld', 'lib', 'libdem'].some(
                  p => party.toLowerCase().startsWith(p)
                );
                return (
                  <path
                    key={party}
                    d={path}
                    fill="none"
                    stroke={getPartyColor(party)}
                    strokeWidth={isMainParty ? 2 : 1.5}
                    opacity={isMainParty ? 1 : 0.7}
                  />
                );
              })}

              {/* Current year marker */}
              {yearsPresent.has(currentYear) && (
                <line
                  x1={xScale(currentYear)}
                  y1={-5}
                  x2={xScale(currentYear)}
                  y2={plotHeight + 5}
                  stroke="#000"
                  strokeWidth={2}
                />
              )}

              {/* Hovered year marker */}
              {hoveredYear && yearsPresent.has(hoveredYear) && hoveredYear !== currentYear && (
                <line
                  x1={xScale(hoveredYear)}
                  y1={-5}
                  x2={xScale(hoveredYear)}
                  y2={plotHeight + 5}
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              )}

              {/* Interactive year hit areas */}
              {historicalData.map((d) => (
                <g key={`hit-${d.year}`}>
                  <rect
                    x={xScale(d.year) - 10}
                    y={-5}
                    width={20}
                    height={plotHeight + 25}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredYear(d.year)}
                    onMouseLeave={() => setHoveredYear(null)}
                    onClick={() => setYear(d.year)}
                  />
                  {/* Year label */}
                  <text
                    x={xScale(d.year)}
                    y={plotHeight + 12}
                    textAnchor="end"
                    transform={`rotate(-45, ${xScale(d.year)}, ${plotHeight + 12})`}
                    className={`text-[9px] ${
                      d.year === currentYear
                        ? 'fill-black font-semibold'
                        : d.year === hoveredYear
                        ? 'fill-blue-600 font-medium'
                        : 'fill-gray-500'
                    }`}
                    style={{ pointerEvents: 'none' }}
                  >
                    {getYearLabel(d.year)}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        ) : (
          <div className="text-xs text-gray-500 text-center py-4">
            No historical data available
          </div>
        )}
        </div>

        {/* Legend - show parties that appear in this constituency */}
        <div className="pl-2 flex flex-col justify-start gap-1 overflow-y-auto">
        {allParties
          .sort((a, b) => {
            // Sort main parties first, then alphabetically
            const mainOrder = ['lab', 'con', 'ld', 'lib'];
            const aIdx = mainOrder.findIndex(p => a.startsWith(p));
            const bIdx = mainOrder.findIndex(p => b.startsWith(p));
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.localeCompare(b);
          })
          .slice(0, 10)
          .map((party) => (
            <div key={party} className="flex items-center gap-1.5">
              <span
                className="w-3 h-0.5 flex-shrink-0"
                style={{ backgroundColor: getPartyColor(party) }}
              />
              <span className="text-[10px] text-gray-600 truncate">{party.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
