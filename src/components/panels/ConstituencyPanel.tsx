import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useElectionStore, getYearLabel, getBoundaryVersion } from '@/store/electionStore';
import { getPartyColor } from '@/types/party';
import type { ElectionResult } from '@/types/election';
import { useConstituencyWikipedia } from '@/hooks/useWikipedia';
import { WikipediaSnippet } from '@/components/panels/WikipediaSnippet';

// Search component for constituency lookup
function ConstituencySearch() {
  const { electionData, setSelectedConstituency, zoomToConstituency } = useElectionStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
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

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [filteredConstituencies.length, searchQuery]);

  const handleSelect = (id: string) => {
    setSelectedConstituency(id);
    zoomToConstituency();
    setSearchQuery('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filteredConstituencies.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev =>
        prev < filteredConstituencies.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev =>
        prev > 0 ? prev - 1 : filteredConstituencies.length - 1
      );
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(filteredConstituencies[activeIndex].constituencyId);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !dropdownRef.current) return;
    const items = dropdownRef.current.children;
    if (items[activeIndex]) {
      (items[activeIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

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
          onKeyDown={handleKeyDown}
          placeholder="Search constituency..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      {isOpen && filteredConstituencies.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
        >
          {filteredConstituencies.map((c, i) => (
            <button
              key={c.constituencyId}
              onClick={() => handleSelect(c.constituencyId)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between ${
                i === activeIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
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
  results: Array<{ partyId: string; candidate: string; votes: number; voteShare: number }>;
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
    pinnedYear,
    pinnedElectionData,
    pinnedBoundaryVersion,
    zoomToConstituency,
  } = useElectionStore();

  const isComparing = pinnedYear !== null;
  const isSameEra = isComparing && pinnedBoundaryVersion === getBoundaryVersion(currentYear);

  const [historicalData, setHistoricalData] = useState<HistoricalResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [chartContainerWidth, setChartContainerWidth] = useState(400);
  const chartContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setChartContainerWidth(entry.contentRect.width);
      }
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  // Get current constituency data
  const currentConstituency = useMemo(() => {
    if (!selectedConstituencyId) return null;
    return electionData.find((c) => c.constituencyId === selectedConstituencyId);
  }, [selectedConstituencyId, electionData]);

  // Get pinned constituency data for comparison
  const pinnedConstituency = useMemo(() => {
    if (!isSameEra || !selectedConstituencyId) return null;
    return pinnedElectionData.find((c) => c.constituencyId === selectedConstituencyId) ?? null;
  }, [isSameEra, selectedConstituencyId, pinnedElectionData]);

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

  // Wikipedia integration
  const { summary: wikiSummary, isLoading: wikiLoading, articleUrl: wikiUrl } = useConstituencyWikipedia(selectedConstituencyId);
  const [wikiExpanded, setWikiExpanded] = useState(false);

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
  const chartWidth = Math.max(200, chartContainerWidth);
  const chartHeight = height - 40;
  const chartPadding = { top: 10, right: 8, bottom: 40, left: 35 };
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

  // Short x-axis labels to avoid 1974 overlap
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

  // Generate path for party vote share over time, breaking the line
  // when the party didn't contest intermediate elections
  const generatePath = (partyId: string) => {
    // Map each historical election to a point or null (party absent)
    const mapped = historicalData.map((d) => {
      const result = d.results.find(
        (r) =>
          r.partyId.toLowerCase() === partyId.toLowerCase() ||
          r.partyId.toLowerCase().startsWith(partyId.toLowerCase())
      );
      if (!result) return null;
      return { year: d.year, share: result.voteShare };
    });

    // Build path with breaks: start a new sub-path after any null gap
    let path = '';
    let needsMove = true;
    for (let i = 0; i < mapped.length; i++) {
      const p = mapped[i];
      if (p === null) {
        needsMove = true;
        continue;
      }
      path += `${needsMove ? 'M' : 'L'} ${xScale(p.year)} ${yScale(p.share)} `;
      needsMove = false;
    }
    return path;
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
      {/* Left half: constituency info + year results */}
      <div className="w-1/2 flex">
      {/* Header and current results */}
      <div className="flex-1 border-r border-gray-100 p-4 overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3
              className="font-semibold text-gray-900 text-sm cursor-pointer hover:text-blue-600"
              onClick={zoomToConstituency}
              title="Zoom to constituency on map"
            >
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
            {(() => {
              const winnerResult = currentConstituency.results.find(
                r => r.partyId.toLowerCase() === currentConstituency.winner.toLowerCase()
              );
              return winnerResult?.candidate ? (
                <div className="text-xs text-gray-500 mt-0.5">{winnerResult.candidate}</div>
              ) : null;
            })()}
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
            {isNew ? `Created: ${getYearLabel(firstYear!)}` : 'Boundary changes'}
          </div>
        )}

        {/* Wikipedia section */}
        {(wikiLoading || wikiSummary || wikiUrl) && (
          <div className="mt-2">
            <button
              onClick={() => setWikiExpanded(!wikiExpanded)}
              className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${wikiExpanded ? 'rotate-90' : ''}`}>
                <path d="M2 1l4 3-4 3" />
              </svg>
              Wikipedia
            </button>
            {wikiExpanded && (
              <div className="mt-1">
                <WikipediaSnippet summary={wikiSummary} isLoading={wikiLoading} articleUrl={wikiUrl} variant="constituency" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results for displayed year */}
      <div className="flex-1 border-r border-gray-100 p-4 overflow-y-auto">
        <h4 className={`text-xs font-medium mb-2 ${hoveredYear ? 'text-blue-600' : 'text-gray-500'}`}>
          {getYearLabel(displayYear)} Results
        </h4>
        <div className="space-y-1.5">
          {(() => {
            const activeResults = [...displayData.results].sort((a, b) => b.voteShare - a.voteShare);
            const activeIds = new Set(activeResults.map(r => r.partyId.toLowerCase()));
            const inactiveParties = allParties
              .filter(p => !activeIds.has(p))
              .sort((a, b) => a.localeCompare(b));
            return (
              <>
                {activeResults.map((r) => {
                  const pinnedResult = pinnedConstituency?.results.find(
                    pr => pr.partyId.toLowerCase() === r.partyId.toLowerCase()
                  );
                  const chronoFlipped = pinnedYear !== null && normalizeYear(pinnedYear) > normalizeYear(displayYear);
                  const rawDelta = pinnedResult ? r.voteShare - pinnedResult.voteShare : null;
                  const delta = rawDelta !== null ? (chronoFlipped ? -rawDelta : rawDelta) : null;
                  return (
                    <div key={r.partyId} className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded shrink-0"
                        style={{ backgroundColor: getPartyColor(r.partyId) }}
                      />
                      <span className="text-xs shrink-0 w-12 truncate">{r.partyId.toUpperCase()}</span>
                      <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${r.voteShare}%`, backgroundColor: getPartyColor(r.partyId) }}
                        />
                      </div>
                      <span className="text-xs font-medium w-10 text-right shrink-0 ml-1">{r.voteShare.toFixed(1)}%</span>
                      <span className="text-[10px] text-gray-400 w-[3.25rem] text-left shrink-0 ">{r.votes.toLocaleString()}</span>
                      {delta !== null && Math.abs(delta) >= 0.1 && (
                        <span className={`text-[9px] font-medium w-12 text-right shrink-0 ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}pp
                        </span>
                      )}
                    </div>
                  );
                })}
                {inactiveParties.map((party) => (
                  <div key={party} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded shrink-0"
                      style={{ backgroundColor: getPartyColor(party) }}
                    />
                    <span className="text-xs text-gray-400 shrink-0 w-12 truncate">{party.toUpperCase()}</span>
                    <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden shrink-0" />
                    <span className="w-10 shrink-0" />
                    <span className="w-12 shrink-0" />
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      </div>

      </div>

      {/* Right half: Historical chart with legend */}
      <div ref={chartContainerRef} className="w-1/2 pl-2 pr-4 py-4">
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-1">Constituency Vote Share</h4>

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

              {/* Pinned year marker (amber with yellow border) */}
              {pinnedYear != null && yearsPresent.has(pinnedYear) && (
                <>
                  <line
                    x1={xScale(pinnedYear)}
                    y1={-5}
                    x2={xScale(pinnedYear)}
                    y2={plotHeight + 5}
                    stroke="#fef3c7"
                    strokeWidth={5}
                  />
                  <line
                    x1={xScale(pinnedYear)}
                    y1={-5}
                    x2={xScale(pinnedYear)}
                    y2={plotHeight + 5}
                    stroke="#92400e"
                    strokeWidth={2}
                  />
                </>
              )}

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
                  {/* Tick and year label */}
                  {(() => {
                    const labelX = xScale(d.year) + getLabelXOffset(d.year);
                    const isPinned = d.year === pinnedYear;
                    const isActive = d.year === currentYear;
                    const isHovered = d.year === hoveredYear;
                    const tickColor = isPinned ? '#b45309' : isActive ? '#000' : isHovered ? '#3b82f6' : '#999';
                    const textClass = isPinned
                      ? 'text-[9px] font-bold'
                      : isActive ? 'text-[9px] fill-black font-semibold'
                      : isHovered ? 'text-[9px] fill-blue-500 font-medium'
                      : 'text-[9px] fill-gray-500';
                    return (
                      <>
                        <line
                          x1={xScale(d.year)} y1={plotHeight}
                          x2={labelX} y2={plotHeight + 5}
                          stroke={tickColor}
                          strokeWidth={1}
                          style={{ pointerEvents: 'none' }}
                        />
                        <text
                          x={labelX}
                          y={plotHeight + 10}
                          textAnchor="end"
                          transform={`rotate(-45, ${labelX}, ${plotHeight + 10})`}
                          className={textClass}
                          style={{ pointerEvents: 'none' }}
                          {...(isPinned ? {
                            fill: '#92400e',
                            stroke: '#fef3c7',
                            strokeWidth: 3,
                            paintOrder: 'stroke' as const,
                          } : {})}
                        >
                          {getShortYearLabel(d.year)}
                        </text>
                      </>
                    );
                  })()}
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

      </div>
    </div>
  );
}
