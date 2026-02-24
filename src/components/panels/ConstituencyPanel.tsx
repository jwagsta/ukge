import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useElectionStore, getYearLabel } from '@/store/electionStore';
import { getPartyColor, getPartyById } from '@/types/party';
import type { SeatStatusInfo } from '@/utils/seatStatus';
import { useConstituencyWikipediaUrl } from '@/hooks/useWikipedia';
import { WikipediaLinkIcons } from '@/components/panels/WikipediaSnippet';
import { useHistoricalData } from '@/hooks/useHistoricalData';

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

interface ConstituencyPanelProps {
  height: number;
  seatStatusMap?: Map<string, SeatStatusInfo>;
}

export function ConstituencyPanel({ height, seatStatusMap }: ConstituencyPanelProps) {
  const {
    selectedConstituencyId,
    electionData,
    currentYear,
    availableYears,
    setSelectedConstituency,
    setYear,
    pinnedYear,
    pinnedElectionData,
    zoomToConstituency,
  } = useElectionStore();

  const isComparing = pinnedYear !== null;

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
    return electionData.find((c) => c.constituencyId === selectedConstituencyId) ?? null;
  }, [selectedConstituencyId, electionData]);

  // Get pinned constituency data for comparison
  const pinnedConstituency = useMemo(() => {
    if (!isComparing || !selectedConstituencyId) return null;
    return pinnedElectionData.find((c) => c.constituencyId === selectedConstituencyId) ?? null;
  }, [isComparing, selectedConstituencyId, pinnedElectionData]);

  // Historical data with boundary break detection
  const { historicalData, breakPoints, isLoading, allParties } = useHistoricalData(
    selectedConstituencyId,
    currentConstituency,
    availableYears,
  );

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

  // Wikipedia link
  const wikiUrl = useConstituencyWikipediaUrl(selectedConstituencyId);

  // Empty state when no constituency selected
  if (!selectedConstituencyId || !currentConstituency) {
    return (
      <div
        data-tutorial="constituency-panel"
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
  const dotPadding = 4; // extra inset so dots at first/last year aren't clipped
  const xScale = (year: number) => {
    if (historicalData.length <= 1) return plotWidth / 2;
    const normalizedYears = historicalData.map((d) => normalizeYear(d.year));
    const minYear = Math.min(...normalizedYears);
    const maxYear = Math.max(...normalizedYears);
    return dotPadding + ((normalizeYear(year) - minYear) / (maxYear - minYear)) * (plotWidth - 2 * dotPadding);
  };

  const yScale = (share: number) => {
    // share is in percentage (0-100), convert to 0-1 for scaling
    return plotHeight - (share / 100) * plotHeight;
  };

  // Generate path for party vote share over time, breaking the line
  // when the party didn't contest intermediate elections or at boundary breaks
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

    // Build path with breaks: start a new sub-path after any null gap or boundary break
    let path = '';
    let needsMove = true;
    for (let i = 0; i < mapped.length; i++) {
      if (breakPoints.has(i)) needsMove = true;
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
      data-tutorial="constituency-panel"
      className="bg-white border-t border-gray-200 flex"
      style={{ height }}
    >
      {/* Left half: constituency info + year results */}
      <div className="w-1/2 flex">
      {/* Header and current results */}
      <div className={`flex-1 border-r border-gray-100 overflow-y-auto ${isComparing && pinnedConstituency ? 'p-3' : 'p-4'}`}>
        <div className={`flex items-start justify-between ${isComparing && pinnedConstituency ? 'mb-1' : 'mb-3'}`}>
          <div>
            <h3
              className="font-semibold text-gray-900 text-sm cursor-pointer hover:text-blue-600"
              onClick={zoomToConstituency}
              title="Zoom to constituency on map"
            >
              {currentConstituency.constituencyName}
            </h3>
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

        {isComparing && pinnedConstituency ? (() => {
          // Dual-year stacked display in comparison mode
          const earlierIsPinned = normalizeYear(pinnedYear!) < normalizeYear(currentYear);
          const earlierYear = earlierIsPinned ? pinnedYear! : currentYear;
          const laterYear = earlierIsPinned ? currentYear : pinnedYear!;
          const earlierData = earlierIsPinned ? pinnedConstituency : currentConstituency;
          const laterData = earlierIsPinned ? currentConstituency : pinnedConstituency;

          const renderYearBlock = (year: number, data: typeof currentConstituency, isPinned: boolean) => {
            const winnerResult = data.results.find(
              r => r.partyId.toLowerCase() === data.winner.toLowerCase()
            );
            // Compute hold/gain by comparing winners of both years
            const otherData = data === earlierData ? laterData : earlierData;
            const isGain = data.winner.toLowerCase() !== otherData.winner.toLowerCase();
            const statusLabel = isGain
              ? <>{data.winner.toUpperCase()} <span className="font-semibold">gain</span> from <span style={{ color: getPartyColor(otherData.winner) }}>{otherData.winner.toUpperCase()}</span></>
              : <>{data.winner.toUpperCase()} hold</>;

            return (
              <div key={year} className={`rounded px-2 py-1 ${isPinned ? 'bg-amber-50' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-gray-400 shrink-0">{getYearLabel(year)}</span>
                  <span className="w-2 h-2 rounded shrink-0" style={{ backgroundColor: getPartyColor(data.winner) }} />
                  <span className="text-[11px] text-gray-600 leading-tight">{statusLabel}</span>
                </div>
                {winnerResult?.candidate && (
                  <div className="text-[10px] text-gray-500 ml-[3.25rem] leading-tight">{winnerResult.candidate}</div>
                )}
                <div className="text-[10px] text-gray-500 ml-[3.25rem] leading-tight">
                  T/O {data.turnout.toFixed(1)}% &middot; {data.electorate.toLocaleString()} elect.
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-0.5">
              {renderYearBlock(earlierYear, earlierData, earlierIsPinned)}
              {renderYearBlock(laterYear, laterData, !earlierIsPinned)}
            </div>
          );
        })() : (
          <>
            {/* Single-year display */}
            <div className="flex items-center gap-2 -mt-1 mb-1">
              <span
                className="w-2.5 h-2.5 rounded"
                style={{ backgroundColor: getPartyColor(currentConstituency.winner) }}
              />
              <span className="text-xs text-gray-600">
                {(() => {
                  const statusInfo = seatStatusMap?.get(currentConstituency.constituencyId);
                  if (statusInfo?.status === 'gain' && statusInfo.previousWinner) {
                    const prevParty = getPartyById(statusInfo.previousWinner);
                    return <>{currentConstituency.winner.toUpperCase()} <span className="font-semibold">gain</span> from <span style={{ color: prevParty.color }}>{statusInfo.previousWinner.toUpperCase()}</span></>;
                  }
                  if (statusInfo?.status === 'hold') return <>{currentConstituency.winner.toUpperCase()} hold</>;
                  if (statusInfo?.status === 'new_boundaries') return <>{currentConstituency.winner.toUpperCase()} win <span className="text-gray-400">(new seat)</span></>;
                  return <>{currentConstituency.winner.toUpperCase()} win</>;
                })()}
              </span>
            </div>
            {(() => {
              const winnerResult = currentConstituency.results.find(
                r => r.partyId.toLowerCase() === currentConstituency.winner.toLowerCase()
              );
              return winnerResult?.candidate ? (
                <div className="text-xs text-gray-500 mt-0.5 mb-1">{winnerResult.candidate}</div>
              ) : null;
            })()}

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
          </>
        )}

        {/* Wikipedia link */}
        {wikiUrl && (
          <a
            href={wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 mt-2 text-[10px] text-blue-600 hover:underline"
          >
            Wikipedia <WikipediaLinkIcons size={10} />
          </a>
        )}
      </div>

      {/* Results / Bumps chart for displayed year */}
      <div className="flex-1 border-r border-gray-100 p-4 overflow-y-auto">
        {isComparing && pinnedConstituency ? (() => {
          // Bumps/slopegraph chart in comparison mode
          const earlierIsPinned = normalizeYear(pinnedYear!) < normalizeYear(currentYear);
          const earlierYear = earlierIsPinned ? pinnedYear! : currentYear;
          const laterYear = earlierIsPinned ? currentYear : pinnedYear!;
          const earlierData = earlierIsPinned ? pinnedConstituency : currentConstituency;
          const laterData = earlierIsPinned ? currentConstituency : pinnedConstituency;

          const earlierResults = [...earlierData.results].sort((a, b) => b.voteShare - a.voteShare);
          const laterResults = [...laterData.results].sort((a, b) => b.voteShare - a.voteShare);

          // Build union of party IDs with >= 2% in either year
          const partyUnion = new Map<string, { earlierRank: number | null; laterRank: number | null; earlierShare: number | null; laterShare: number | null }>();
          earlierResults.forEach((r, i) => {
            partyUnion.set(r.partyId.toLowerCase(), { earlierRank: i + 1, laterRank: null, earlierShare: r.voteShare, laterShare: null });
          });
          laterResults.forEach((r, i) => {
            const existing = partyUnion.get(r.partyId.toLowerCase());
            if (existing) {
              existing.laterRank = i + 1;
              existing.laterShare = r.voteShare;
            } else {
              partyUnion.set(r.partyId.toLowerCase(), { earlierRank: null, laterRank: i + 1, earlierShare: null, laterShare: r.voteShare });
            }
          });

          // Filter to parties with >= 2% in either year
          const bumpsParties = Array.from(partyUnion.entries())
            .filter(([, d]) => (d.earlierShare ?? 0) >= 2 || (d.laterShare ?? 0) >= 2);

          const svgWidth = 200;
          const headerY = 12;
          const startY = headerY + 14;
          const rowHeight = 20;
          const svgHeight = startY + bumpsParties.length * rowHeight + 4;
          const leftX = 56;
          const rightX = svgWidth - 56;
          const isMainParty = (p: string) => ['lab', 'con', 'ld', 'lib'].some(m => p.startsWith(m));

          return (
            <svg width={svgWidth} height={svgHeight} className="overflow-visible">
              {/* Header: "YYYY -> YYYY" with amber for pinned year */}
              <text x={svgWidth / 2} y={headerY} textAnchor="middle" className="text-[10px] font-semibold">
                <tspan
                  {...(earlierIsPinned ? {
                    fill: '#92400e',
                    stroke: '#fef3c7',
                    strokeWidth: 3,
                    paintOrder: 'stroke' as const,
                  } : { fill: '#000' })}
                >
                  {getYearLabel(earlierYear)}
                </tspan>
                <tspan fill="#9ca3af">{' \u2192 '}</tspan>
                <tspan
                  {...(!earlierIsPinned ? {
                    fill: '#92400e',
                    stroke: '#fef3c7',
                    strokeWidth: 3,
                    paintOrder: 'stroke' as const,
                  } : { fill: '#000' })}
                >
                  {getYearLabel(laterYear)}
                </tspan>
              </text>

              {bumpsParties.map(([partyId, d]) => {
                const party = getPartyById(partyId);
                const color = getPartyColor(partyId);
                const isMain = isMainParty(partyId);
                const strokeW = isMain ? 2.5 : 1.5;
                const opacity = isMain ? 1 : 0.7;

                const bothPresent = d.earlierRank !== null && d.laterRank !== null;
                const leftRank = d.earlierRank ?? d.laterRank!;
                const rightRank = d.laterRank ?? d.earlierRank!;
                const leftY = startY + (leftRank - 1) * rowHeight;
                const rightY = startY + (rightRank - 1) * rowHeight;

                // Delta for later year (positive = gained share)
                const delta = d.earlierShare !== null && d.laterShare !== null
                  ? d.laterShare - d.earlierShare : null;

                return (
                  <g key={partyId}>
                    {bothPresent ? (
                      <>
                        {/* Connecting line */}
                        <line x1={leftX} y1={leftY} x2={rightX} y2={rightY}
                          stroke={color} strokeWidth={strokeW} opacity={opacity} />
                        {/* Dots */}
                        <circle cx={leftX} cy={leftY} r={3} fill={color} />
                        <circle cx={rightX} cy={rightY} r={3} fill={color} />
                        {/* Left label: abbreviation + share */}
                        <text x={leftX - 6} y={leftY + 3.5} textAnchor="end" className="text-[9px]" fill="#374151">
                          {party.abbreviation.toUpperCase()} {d.earlierShare!.toFixed(1)}%
                        </text>
                        {/* Right label: share + delta */}
                        <text x={rightX + 6} y={rightY + 3.5} textAnchor="start" className="text-[9px]" fill="#374151">
                          {d.laterShare!.toFixed(1)}%
                          {delta !== null && Math.abs(delta) >= 0.1 && (
                            <tspan fill={delta > 0 ? '#16a34a' : '#dc2626'}>
                              {` ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
                            </tspan>
                          )}
                        </text>
                      </>
                    ) : d.earlierRank !== null ? (
                      <>
                        {/* Only in earlier year */}
                        <line x1={leftX} y1={leftY} x2={rightX} y2={leftY}
                          stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.3} />
                        <circle cx={leftX} cy={leftY} r={3} fill={color} />
                        <text x={leftX - 6} y={leftY + 3.5} textAnchor="end" className="text-[9px]" fill="#374151">
                          {party.abbreviation.toUpperCase()} {d.earlierShare!.toFixed(1)}%
                        </text>
                      </>
                    ) : (
                      <>
                        {/* Only in later year */}
                        <line x1={leftX} y1={rightY} x2={rightX} y2={rightY}
                          stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.3} />
                        <circle cx={rightX} cy={rightY} r={3} fill={color} />
                        <text x={rightX + 6} y={rightY + 3.5} textAnchor="start" className="text-[9px]" fill="#374151">
                          {d.laterShare!.toFixed(1)}% {party.abbreviation.toUpperCase()}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          );
        })() : isComparing && !pinnedConstituency ? (
          <>
            {/* Fallback: results list with cross-boundary notice */}
            <div className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1 mb-2">
              Different boundary era — comparison unavailable
            </div>
            <h4 className={`text-xs font-medium mb-2 ${hoveredYear ? 'text-blue-600' : 'text-gray-500'}`}>
              {getYearLabel(displayYear)} Results
            </h4>
            <div className="space-y-1.5">
              {[...displayData.results].sort((a, b) => b.voteShare - a.voteShare).map((r) => (
                <div key={r.partyId} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded shrink-0" style={{ backgroundColor: getPartyColor(r.partyId) }} />
                  <span className="text-xs shrink-0 w-8 truncate">{getPartyById(r.partyId).abbreviation.toUpperCase()}</span>
                  <div className="flex-1 min-w-0 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${r.voteShare}%`, backgroundColor: getPartyColor(r.partyId) }} />
                  </div>
                  <span className="text-xs font-medium w-10 text-right shrink-0">{r.voteShare.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Standard single-year results */}
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

                // Reference constituency: current year when hovering in single-year mode
                const refConstituency = hoveredYear ? currentConstituency : null;
                const refYear = currentYear;

                // Pre-compute deltas so we can decide column visibility once
                const chronoFlipped = normalizeYear(refYear) > normalizeYear(displayYear);
                const deltas = activeResults.map(r => {
                  const refResult = refConstituency?.results.find(
                    pr => pr.partyId.toLowerCase() === r.partyId.toLowerCase()
                  );
                  const rawDelta = refResult ? r.voteShare - refResult.voteShare : null;
                  return rawDelta !== null ? (chronoFlipped ? -rawDelta : rawDelta) : null;
                });
                const showSwingCol = deltas.some(d => d !== null && Math.abs(d) >= 0.1);

                return (
                  <>
                    {activeResults.map((r, i) => {
                      const delta = deltas[i];
                      return (
                        <div key={r.partyId} className="flex items-center gap-1">
                          <span
                            className="w-2 h-2 rounded shrink-0"
                            style={{ backgroundColor: getPartyColor(r.partyId) }}
                          />
                          <span className="text-xs shrink-0 w-8 truncate">{getPartyById(r.partyId).abbreviation.toUpperCase()}</span>
                          <div className="flex-1 min-w-0 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${r.voteShare}%`, backgroundColor: getPartyColor(r.partyId) }}
                            />
                          </div>
                          <span className="text-xs font-medium w-10 text-right shrink-0">{r.voteShare.toFixed(1)}%</span>
                          <span className="text-[10px] text-gray-400 w-[3.25rem] text-left shrink-0 hidden min-[900px]:inline">{r.votes.toLocaleString()}</span>
                          {showSwingCol && (
                            <span className={`text-[9px] font-medium w-12 text-right shrink-0 ${delta !== null && Math.abs(delta) >= 0.1 ? (delta > 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                              {delta !== null && Math.abs(delta) >= 0.1 ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp` : ''}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {inactiveParties.map((party) => (
                      <div key={party} className="flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded shrink-0"
                          style={{ backgroundColor: getPartyColor(party) }}
                        />
                        <span className="text-xs text-gray-400 shrink-0 w-8 truncate">{getPartyById(party).abbreviation.toUpperCase()}</span>
                        <div className="flex-1 min-w-0 h-1 bg-gray-100 rounded-full overflow-hidden" />
                        <span className="w-10 shrink-0" />
                        <span className="w-[3.25rem] shrink-0 hidden min-[900px]:inline" />
                        {showSwingCol && <span className="w-12 shrink-0" />}
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </>
        )}
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

              {/* Boundary break markers */}
              {Array.from(breakPoints).map((idx) => {
                const prevX = xScale(historicalData[idx - 1].year);
                const currX = xScale(historicalData[idx].year);
                const midX = (prevX + currX) / 2;
                return (
                  <g key={`break-${idx}`}>
                    <line
                      x1={midX} y1={-2}
                      x2={midX} y2={plotHeight + 2}
                      stroke="#d97706"
                      strokeWidth={1}
                      strokeDasharray="3,3"
                    />
                    <text
                      x={midX}
                      y={-4}
                      textAnchor="middle"
                      className="fill-amber-600"
                      style={{ fontSize: '7px', pointerEvents: 'none' }}
                    >
                      New boundaries
                    </text>
                  </g>
                );
              })}

              {/* Party lines - all parties */}
              {allParties.map((party) => {
                const path = generatePath(party);
                if (!path) return null;
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
                  />
                );
              })}

              {/* Pinned year marker (amber with yellow border) — over lines, under dots */}
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

              {/* Current year marker (gray halo when comparing) */}
              {pinnedYear != null && pinnedYear !== currentYear && yearsPresent.has(currentYear) && (
                <line
                  x1={xScale(currentYear)}
                  y1={-5}
                  x2={xScale(currentYear)}
                  y2={plotHeight + 5}
                  stroke="#d1d5db"
                  strokeWidth={5}
                />
              )}
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

              {/* Non-winner dots */}
              {allParties.map((party) =>
                historicalData.map((d) => {
                  if (d.winner.toLowerCase() === party.toLowerCase()) return null;
                  const result = d.results.find(
                    (res) =>
                      res.partyId.toLowerCase() === party.toLowerCase() ||
                      res.partyId.toLowerCase().startsWith(party.toLowerCase())
                  );
                  if (!result) return null;
                  return (
                    <circle
                      key={`dot-${party}-${d.year}`}
                      cx={xScale(d.year)}
                      cy={yScale(result.voteShare)}
                      r={3.5}
                      fill={getPartyColor(party)}
                    />
                  );
                })
              )}

              {/* Winner dots — drawn last with black stroke */}
              {historicalData.map((d) => {
                const winnerParty = allParties.find(p => p.toLowerCase() === d.winner.toLowerCase());
                if (!winnerParty) return null;
                const result = d.results.find(
                  (res) =>
                    res.partyId.toLowerCase() === winnerParty.toLowerCase() ||
                    res.partyId.toLowerCase().startsWith(winnerParty.toLowerCase())
                );
                if (!result) return null;
                return (
                  <circle
                    key={`dot-winner-${d.year}`}
                    cx={xScale(d.year)}
                    cy={yScale(result.voteShare)}
                    r={3.5}
                    fill={getPartyColor(winnerParty)}
                    stroke="#000"
                    strokeWidth={1}
                  />
                );
              })}

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
