import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useElectionStore, getYearLabel, getBoundaryVersion } from '@/store/electionStore';
import { getPartyColor, getPartyById } from '@/types/party';
import type { SeatStatusInfo } from '@/utils/seatStatus';
import { useConstituencyWikipediaUrl } from '@/hooks/useWikipedia';
import { WikipediaLinkIcons } from '@/components/panels/WikipediaSnippet';
import { useHistoricalData } from '@/hooks/useHistoricalData';

interface MobileBottomSheetProps {
  seatStatusMap?: Map<string, SeatStatusInfo>;
}

export function MobileBottomSheet({ seatStatusMap }: MobileBottomSheetProps) {
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

  const [expanded, setExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);

  const currentConstituency = useMemo(() => {
    if (!selectedConstituencyId) return null;
    return electionData.find((c) => c.constituencyId === selectedConstituencyId) ?? null;
  }, [selectedConstituencyId, electionData]);

  // Get pinned constituency data for comparison
  const pinnedConstituency = useMemo(() => {
    if (!isSameEra || !selectedConstituencyId) return null;
    return pinnedElectionData.find((c) => c.constituencyId === selectedConstituencyId) ?? null;
  }, [isSameEra, selectedConstituencyId, pinnedElectionData]);

  // Historical data with boundary break detection
  const { historicalData, breakPoints, isLoading, allParties } = useHistoricalData(
    selectedConstituencyId,
    currentConstituency,
    availableYears,
  );

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

  // Wikipedia integration
  const wikiUrl = useConstituencyWikipediaUrl(selectedConstituencyId);

  if (!selectedConstituencyId || !currentConstituency) return null;

  const sortedResults = [...currentConstituency.results].sort((a, b) => b.voteShare - a.voteShare);

  // Mini chart scales
  const chartWidth = Math.min(320, window.innerWidth - 32);
  const chartHeight = 120;
  const pad = { top: 8, right: 8, bottom: 28, left: 28 };
  const plotW = chartWidth - pad.left - pad.right;
  const plotH = chartHeight - pad.top - pad.bottom;

  const normalizeYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;
  const chronoFlipped = isComparing && normalizeYear(pinnedYear!) > normalizeYear(currentYear);
  const dotPadding = 4;
  const xScale = (year: number) => {
    if (historicalData.length <= 1) return plotW / 2;
    const years = historicalData.map((d) => normalizeYear(d.year));
    const min = Math.min(...years);
    const max = Math.max(...years);
    return dotPadding + ((normalizeYear(year) - min) / (max - min)) * (plotW - 2 * dotPadding);
  };
  const yScale = (share: number) => plotH - (share / 100) * plotH;

  const generatePath = (partyId: string) => {
    let path = '';
    let needsMove = true;
    for (let i = 0; i < historicalData.length; i++) {
      if (breakPoints.has(i)) needsMove = true;
      const d = historicalData[i];
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
      style={{ maxHeight: '65dvh' }}
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
        style={{ maxHeight: '65dvh', paddingBottom: 'env(safe-area-inset-bottom, 0px)', touchAction: 'pan-y' }}
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
            <h3
              className="font-semibold text-gray-900 text-sm cursor-pointer hover:text-blue-600"
              onClick={zoomToConstituency}
              title="Zoom to constituency on map"
            >
              {currentConstituency.constituencyName}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
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
                {(() => {
                  const wr = currentConstituency.results.find(
                    r => r.partyId.toLowerCase() === currentConstituency.winner.toLowerCase()
                  );
                  return wr?.candidate ? ` · ${wr.candidate}` : '';
                })()}
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
            {sortedResults.map((r) => {
              const pinnedResult = pinnedConstituency?.results.find(
                pr => pr.partyId.toLowerCase() === r.partyId.toLowerCase()
              );
              const rawDelta = pinnedResult ? r.voteShare - pinnedResult.voteShare : null;
              const delta = rawDelta !== null ? (chronoFlipped ? -rawDelta : rawDelta) : null;
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
                  {delta !== null && Math.abs(delta) >= 0.1 && (
                    <span className={`text-[9px] font-medium shrink-0 ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Wikipedia link */}
        {wikiUrl && (
          <div className="px-4 pb-3">
            <a
              href={wikiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
            >
              Wikipedia <WikipediaLinkIcons size={10} />
            </a>
          </div>
        )}

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

                {/* Boundary break markers */}
                {Array.from(breakPoints).map((idx) => {
                  const prevX = xScale(historicalData[idx - 1].year);
                  const currX = xScale(historicalData[idx].year);
                  const midX = (prevX + currX) / 2;
                  return (
                    <g key={`break-${idx}`}>
                      <line
                        x1={midX} y1={-2}
                        x2={midX} y2={plotH + 2}
                        stroke="#d97706"
                        strokeWidth={1}
                        strokeDasharray="3,3"
                      />
                      <text
                        x={midX}
                        y={-3}
                        textAnchor="middle"
                        className="fill-amber-600"
                        style={{ fontSize: '6px', pointerEvents: 'none' }}
                      >
                        New boundaries
                      </text>
                    </g>
                  );
                })}

                {allParties.map((party) => {
                  const path = generatePath(party);
                  if (!path) return null;
                  const isMain = ['lab', 'con', 'ld', 'lib'].some(p => party.startsWith(p));
                  return (
                    <path key={party} d={path} fill="none" stroke={getPartyColor(party)}
                      strokeWidth={isMain ? 2 : 1.5} />
                  );
                })}

                {/* Pinned year marker (amber/brown double-layer) — over lines, under dots */}
                {pinnedYear != null && yearsPresent.has(pinnedYear) && (
                  <>
                    <line x1={xScale(pinnedYear)} y1={-4} x2={xScale(pinnedYear)} y2={plotH + 4}
                      stroke="#fef3c7" strokeWidth={5} />
                    <line x1={xScale(pinnedYear)} y1={-4} x2={xScale(pinnedYear)} y2={plotH + 4}
                      stroke="#92400e" strokeWidth={2} />
                  </>
                )}

                {/* Current year marker (gray halo when comparing) */}
                {pinnedYear != null && pinnedYear !== currentYear && yearsPresent.has(currentYear) && (
                  <line x1={xScale(currentYear)} y1={-4} x2={xScale(currentYear)} y2={plotH + 4}
                    stroke="#d1d5db" strokeWidth={5} />
                )}
                {yearsPresent.has(currentYear) && (
                  <line x1={xScale(currentYear)} y1={-4} x2={xScale(currentYear)} y2={plotH + 4}
                    stroke="#000" strokeWidth={2} />
                )}

                {/* Non-winner dots */}
                {allParties.map((party) =>
                  historicalData.map((d) => {
                    if (d.winner.toLowerCase() === party.toLowerCase()) return null;
                    const result = d.results.find(
                      (res) => res.partyId.toLowerCase() === party.toLowerCase() ||
                        res.partyId.toLowerCase().startsWith(party.toLowerCase())
                    );
                    if (!result) return null;
                    return (
                      <circle key={`dot-${party}-${d.year}`} cx={xScale(d.year)} cy={yScale(result.voteShare)}
                        r={3.5} fill={getPartyColor(party)} />
                    );
                  })
                )}

                {/* Winner dots — drawn last with black stroke */}
                {historicalData.map((d) => {
                  const winnerParty = allParties.find(p => p.toLowerCase() === d.winner.toLowerCase());
                  if (!winnerParty) return null;
                  const result = d.results.find(
                    (res) => res.partyId.toLowerCase() === winnerParty.toLowerCase() ||
                      res.partyId.toLowerCase().startsWith(winnerParty.toLowerCase())
                  );
                  if (!result) return null;
                  return (
                    <circle key={`dot-winner-${d.year}`} cx={xScale(d.year)} cy={yScale(result.voteShare)}
                      r={3.5} fill={getPartyColor(winnerParty)} stroke="#000" strokeWidth={1} />
                  );
                })}

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
                      className={`text-[8px] ${d.year === pinnedYear ? 'font-bold' : d.year === currentYear ? 'fill-black font-semibold' : 'fill-gray-400'}`}
                      style={{ pointerEvents: 'none' }}
                      {...(d.year === pinnedYear ? {
                        fill: '#92400e',
                        stroke: '#fef3c7',
                        strokeWidth: 3,
                        paintOrder: 'stroke' as const,
                      } : {})}
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
