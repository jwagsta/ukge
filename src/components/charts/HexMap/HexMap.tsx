import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { ElectionResult } from '@/types/election';
import { getPartyColor, getPartyById } from '@/types/party';
import { getSeatFillOpacity, getSeatStrokeColor, type SeatStatusInfo } from '@/utils/seatStatus';
import { useUIStore } from '@/store/uiStore';
import { useElectionStore } from '@/store/electionStore';
import type { BoundaryProperties } from '@/utils/constituencyMatching';
import { computeHexLayout, hexToPixel, hexPath } from '@/utils/hexLayout';


type BoundaryData = FeatureCollection<Polygon | MultiPolygon, BoundaryProperties> | null;

/** Compute Con-Lab swing */
function computeSwing(current: ElectionResult, pinned: ElectionResult): number {
  const getShare = (r: ElectionResult, party: string) =>
    r.results.find(p => p.partyId.toLowerCase() === party)?.voteShare ?? 0;
  return (getShare(current, 'con') - getShare(current, 'lab')) - (getShare(pinned, 'con') - getShare(pinned, 'lab'));
}

/** Arrange NI constituencies in a compact hex grid using a unit size.
 *  Returns positions in tempSize=10 space; caller scales to actual hexSize. */
function computeNIGridPositions(
  niData: ElectionResult[],
  anchorX: number,
  anchorY: number,
  tempSize: number
): Array<{ constituencyId: string; tempX: number; tempY: number }> {
  if (niData.length === 0) return [];

  const sorted = [...niData].sort((a, b) => a.constituencyName.localeCompare(b.constituencyName));
  const cols = Math.ceil(Math.sqrt(sorted.length * 1.2));

  return sorted.map((d, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = anchorX + col * Math.sqrt(3) * tempSize + (row % 2 === 1 ? Math.sqrt(3) / 2 * tempSize : 0);
    const y = anchorY + row * 1.5 * tempSize;
    return { constituencyId: d.constituencyId, tempX: x, tempY: y };
  });
}

interface HexMapProps {
  electionData: ElectionResult[];
  boundaries: BoundaryData;
  width: number;
  height: number;
  selectedConstituencyId?: string | null;
  hoveredConstituencyId?: string | null;
  onConstituencySelect?: (id: string | null) => void;
  onConstituencyHover?: (id: string | null) => void;
  pinnedElectionData?: ElectionResult[];
  hideZoomControls?: boolean;
  swingEstimatedIds?: Set<string>;
  seatStatusMap?: Map<string, SeatStatusInfo>;
}

export function HexMap({
  electionData,
  boundaries,
  width,
  height,
  selectedConstituencyId,
  hoveredConstituencyId,
  onConstituencySelect,
  onConstituencyHover,
  pinnedElectionData,
  hideZoomControls,
  swingEstimatedIds,
  seatStatusMap,
}: HexMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: ElectionResult } | null>(null);
  const { mapZoom, setMapZoom, mapColorMode, showSeatStatus } = useUIStore();
  const { zoomToConstituencyTrigger } = useElectionStore();

  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const localSelectRef = useRef(false);
  const prevSelectedRef = useRef<string | null | undefined>(undefined);

  // Split election data into GB and NI
  const { gbData, niData } = useMemo(() => {
    const gb: ElectionResult[] = [];
    const ni: ElectionResult[] = [];
    for (const d of electionData) {
      if (d.country === 'northern_ireland') {
        ni.push(d);
      } else {
        gb.push(d);
      }
    }
    return { gbData: gb, niData: ni };
  }, [electionData]);

  // Filter boundaries to GB only for LAPJV layout
  const gbBoundaries = useMemo<BoundaryData>(() => {
    if (!boundaries) return null;
    const gbFeatures = boundaries.features.filter(f => f.properties?.nation !== 'northern_ireland');
    if (gbFeatures.length === boundaries.features.length) return boundaries;
    return { type: 'FeatureCollection', features: gbFeatures } as BoundaryData;
  }, [boundaries]);

  // Generate hex positions from GB constituency data and boundaries
  const hexPositions = useMemo(() => {
    if (gbData.length === 0) return [];
    return computeHexLayout(gbData, gbBoundaries);
  }, [gbData, gbBoundaries]);

  // NI hex grid positions in tempSize=10 space, placed west of GB at NI latitude
  const niGridPositions = useMemo(() => {
    if (niData.length === 0 || hexPositions.length === 0) return [];

    const tempSize = 10;
    let minX = Infinity, minY = Infinity, maxY = -Infinity;
    hexPositions.forEach(pos => {
      const { x, y } = hexToPixel(pos.q, pos.r, tempSize);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    const gbH = maxY - minY;
    // Anchor: 3 hex-widths west of GB, ~38% from top (southern Scotland latitude)
    const anchorX = minX - tempSize * Math.sqrt(3) * 4;
    const anchorY = minY + gbH * 0.35;

    return computeNIGridPositions(niData, anchorX, anchorY, tempSize);
  }, [niData, hexPositions]);

  // Create lookup map for election data
  const dataMap = useMemo(() => {
    const map = new Map<string, ElectionResult>();
    electionData.forEach(d => map.set(d.constituencyId, d));
    return map;
  }, [electionData]);

  // Pinned data lookup (for swing mode)
  const pinnedDataMap = useMemo(() => {
    if (!pinnedElectionData?.length) return null;
    const map = new Map<string, ElectionResult>();
    pinnedElectionData.forEach(d => map.set(d.constituencyId, d));
    return map;
  }, [pinnedElectionData]);

  // Color scale for party vote share mode
  const partyColorScale = useMemo(() => {
    if (mapColorMode === 'winner' || mapColorMode === 'swing') return null;
    const party = getPartyById(mapColorMode);
    return d3.scaleLinear<string>().domain([0, 50]).range(['#f8f8f8', party.color]).clamp(true);
  }, [mapColorMode]);

  // Swing color scale
  const swingColorScale = useMemo(() => {
    if (mapColorMode !== 'swing') return null;
    return d3.scaleLinear<string>().domain([-20, 0, 20]).range(['#DC241f', '#f5f5f5', '#0063A6']).clamp(true);
  }, [mapColorMode]);

  // Get fill color for a constituency
  const getFill = useCallback((data: ElectionResult): string => {
    if (mapColorMode === 'swing' && swingColorScale && pinnedDataMap) {
      const pinned = pinnedDataMap.get(data.constituencyId);
      if (pinned) return swingColorScale(computeSwing(data, pinned));
      return '#ddd';
    }
    if (mapColorMode === 'winner' || !partyColorScale) {
      return getPartyColor(data.winner);
    }
    const partyResult = data.results.find(r => r.partyId.toLowerCase() === mapColorMode);
    return partyResult ? partyColorScale(partyResult.voteShare) : '#f8f8f8';
  }, [mapColorMode, partyColorScale, swingColorScale, pinnedDataMap]);

  // Calculate hex size and bounds (including NI if present)
  const { hexSize, offsetX, offsetY } = useMemo(() => {
    if (hexPositions.length === 0) return { hexSize: 10, offsetX: 0, offsetY: 0 };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const tempSize = 10;

    hexPositions.forEach(pos => {
      const { x, y } = hexToPixel(pos.q, pos.r, tempSize);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    // Scale from GB bounds only — NI sits in the padding area so hex size
    // is consistent whether or not NI constituencies are present
    const boundsWidth = maxX - minX + tempSize * 2;
    const boundsHeight = maxY - minY + tempSize * 2;

    const padding = 40;
    const availableWidth = width - padding * 2;
    const availableHeight = height - padding * 2;

    const scaleX = availableWidth / boundsWidth;
    const scaleY = availableHeight / boundsHeight;
    const scale = Math.min(scaleX, scaleY);

    const hexSize = tempSize * scale;
    const offsetX = (width - boundsWidth * scale) / 2 - minX * scale;
    const offsetY = (height - boundsHeight * scale) / 2 - minY * scale;

    return { hexSize, offsetX, offsetY };
  }, [hexPositions, width, height]);

  // Scale NI positions to actual hexSize pixel space
  const niHexPositions = useMemo(() => {
    const s = hexSize / 10;
    return niGridPositions.map(p => ({
      constituencyId: p.constituencyId,
      x: p.tempX * s,
      y: p.tempY * s,
    }));
  }, [niGridPositions, hexSize]);

  // Set up zoom behavior
  useEffect(() => {
    if (!svgRef.current || width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .on('zoom', (event) => {
        const { k, x, y } = event.transform;
        setMapZoom({ k, x, y });
      });

    zoomRef.current = zoomBehavior;
    svg.call(zoomBehavior);

    // If a constituency is selected, let the zoom-to-constituency effect
    // handle positioning; otherwise restore the stored transform
    if (selectedConstituencyId) {
      prevSelectedRef.current = undefined;
    } else if (mapZoom.k !== 1 || mapZoom.x !== 0 || mapZoom.y !== 0) {
      svg.call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(mapZoom.x, mapZoom.y).scale(mapZoom.k)
      );
    }

    return () => {
      svg.on('.zoom', null);
    };
  }, [width, height, setMapZoom]); // Don't include mapZoom to avoid loop

  const handleHexMouseEnter = useCallback((
    e: React.MouseEvent,
    constituencyId: string
  ) => {
    const data = dataMap.get(constituencyId);
    if (data) {
      setTooltip({ x: e.clientX, y: e.clientY, data });
    }
    onConstituencyHover?.(constituencyId);
  }, [dataMap, onConstituencyHover]);

  const handleHexMouseLeave = useCallback(() => {
    setTooltip(null);
    onConstituencyHover?.(null);
  }, [onConstituencyHover]);

  const handleHexClick = useCallback((constituencyId: string) => {
    // If clicking on a new constituency, zoom to it
    if (selectedConstituencyId !== constituencyId && svgRef.current && zoomRef.current) {
      const hexPos = hexPositions.find(p => p.constituencyId === constituencyId);
      const niPos = !hexPos ? niHexPositions.find(p => p.constituencyId === constituencyId) : null;

      let hexCenterX: number | undefined, hexCenterY: number | undefined, scale: number | undefined;
      if (hexPos) {
        const { x, y } = hexToPixel(hexPos.q, hexPos.r, hexSize);
        hexCenterX = x + offsetX;
        hexCenterY = y + offsetY;
        scale = Math.min((width * 0.25) / (hexSize * 4), 8);
      } else if (niPos) {
        hexCenterX = niPos.x + offsetX;
        hexCenterY = niPos.y + offsetY;
        scale = Math.min((width * 0.25) / (hexSize * 4), 8);
      }

      if (hexCenterX !== undefined && hexCenterY !== undefined && scale !== undefined) {
        const translateX = width / 2 - hexCenterX * scale;
        const translateY = height / 2 - hexCenterY * scale;

        d3.select(svgRef.current)
          .transition()
          .duration(500)
          .call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
          );
      }
    }

    localSelectRef.current = true;
    onConstituencySelect?.(
      selectedConstituencyId === constituencyId ? null : constituencyId
    );
  }, [selectedConstituencyId, onConstituencySelect, hexPositions, niHexPositions, hexSize, offsetX, offsetY, width, height]);

  // Zoom to constituency when selected externally (e.g. from ternary plot)
  useEffect(() => {
    if (selectedConstituencyId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedConstituencyId;

    if (localSelectRef.current) {
      localSelectRef.current = false;
      return;
    }

    if (!selectedConstituencyId || !svgRef.current || !zoomRef.current) return;

    // Auto-zoom to GB hex or NI hex
    const hexPos = hexPositions.find(p => p.constituencyId === selectedConstituencyId);
    const niPos = !hexPos ? niHexPositions.find(p => p.constituencyId === selectedConstituencyId) : null;
    if (!hexPos && !niPos) return;

    let hexCenterX: number, hexCenterY: number, targetScale: number;
    if (hexPos) {
      const { x, y } = hexToPixel(hexPos.q, hexPos.r, hexSize);
      hexCenterX = x + offsetX;
      hexCenterY = y + offsetY;
      targetScale = Math.min((width * 0.25) / (hexSize * 4), 8);
    } else {
      hexCenterX = niPos!.x + offsetX;
      hexCenterY = niPos!.y + offsetY;
      targetScale = Math.min((width * 0.25) / (hexSize * 4), 8);
    }

    const scale = targetScale;

    const translateX = width / 2 - hexCenterX * scale;
    const translateY = height / 2 - hexCenterY * scale;

    d3.select(svgRef.current)
      .transition()
      .duration(500)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(translateX, translateY).scale(scale)
      );
  }, [selectedConstituencyId, hexPositions, hexSize, offsetX, offsetY, width, height, zoomToConstituencyTrigger]);

  // Reset prevSelectedRef when zoom trigger fires so the effect re-runs
  useEffect(() => {
    if (zoomToConstituencyTrigger > 0) {
      prevSelectedRef.current = undefined;
    }
  }, [zoomToConstituencyTrigger]);

  const handleResetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(
        zoomRef.current.transform,
        d3.zoomIdentity
      );
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(
        zoomRef.current.scaleBy,
        1.5
      );
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(
        zoomRef.current.scaleBy,
        0.67
      );
    }
  }, []);

  const isZoomed = mapZoom.k !== 1 || mapZoom.x !== 0 || mapZoom.y !== 0;

  if (width === 0 || height === 0) return null;

  // Show loading state if no positions yet
  if (hexPositions.length === 0 && electionData.length > 0) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-gray-500 text-sm">
          {boundaries ? 'Generating hex layout...' : 'Loading boundary data...'}
        </div>
      </div>
    );
  }

  const hexPathD = hexPath(hexSize);

  const hasNI = niHexPositions.length > 0;

  return (
    <div className="relative" style={{ width, height }}>
      {/* Zoom controls */}
      {!hideZoomControls && (
        <div className="absolute bottom-2 right-2 z-10 flex gap-1">
          {isZoomed && (
            <button
              onClick={handleResetZoom}
              className="flex items-center justify-center w-7 h-7 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
              title="Reset zoom"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-gray-500">
                <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
                <path d="M8 1v3.5l2.5-1.75L8 1z" />
              </svg>
            </button>
          )}
          <div className="flex rounded-md border border-gray-300 overflow-hidden shadow-sm bg-white">
            <button
              onClick={handleZoomIn}
              className="px-2 py-1 text-sm hover:bg-gray-50 border-r border-gray-300"
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={handleZoomOut}
              className="px-2 py-1 text-sm hover:bg-gray-50"
              title="Zoom out"
            >
              −
            </button>
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ cursor: 'grab', background: '#f8fafc' }}
      >
        {/* Hatching pattern for estimated swing constituencies */}
        <defs>
          <pattern id="hex-estimated-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* GB hexes (zoom-transformed) */}
        <g transform={`translate(${mapZoom.x}, ${mapZoom.y}) scale(${mapZoom.k})`}>
          <g transform={`translate(${offsetX}, ${offsetY})`}>
            {/* Render gains last so their black borders aren't occluded */}
            {(showSeatStatus && mapColorMode === 'winner'
              ? [...hexPositions].sort((a, b) => {
                  const aGain = seatStatusMap?.get(a.constituencyId)?.status === 'gain' ? 1 : 0;
                  const bGain = seatStatusMap?.get(b.constituencyId)?.status === 'gain' ? 1 : 0;
                  return aGain - bGain;
                })
              : hexPositions
            ).map(pos => {
              const data = dataMap.get(pos.constituencyId);
              if (!data) return null;

              const { x, y } = hexToPixel(pos.q, pos.r, hexSize);
              const fill = getFill(data);
              const isEstimated = swingEstimatedIds?.has(pos.constituencyId);
              const statusInfo = seatStatusMap?.get(pos.constituencyId);

              return (
                <g
                  key={pos.constituencyId}
                  transform={`translate(${x}, ${y})`}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => handleHexMouseEnter(e, pos.constituencyId)}
                  onMouseLeave={handleHexMouseLeave}
                  onClick={() => handleHexClick(pos.constituencyId)}
                >
                  <path
                    d={hexPathD}
                    fill={fill}
                    fillOpacity={getSeatFillOpacity(statusInfo?.status, mapColorMode, !!data.winner, 'hex', showSeatStatus)}
                    stroke={getSeatStrokeColor(statusInfo?.status, mapColorMode, showSeatStatus)}
                    strokeWidth={showSeatStatus && mapColorMode === 'winner' && statusInfo?.status === 'gain' ? 1 : 0.5}
                  />
                  {isEstimated && (
                    <path
                      d={hexPathD}
                      fill="url(#hex-estimated-hatch)"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}

            {/* NI hexes (same size as GB, positioned west at NI latitude) */}
            {hasNI && (
              <g>
                {(showSeatStatus && mapColorMode === 'winner'
                  ? [...niHexPositions].sort((a, b) => {
                      const aGain = seatStatusMap?.get(a.constituencyId)?.status === 'gain' ? 1 : 0;
                      const bGain = seatStatusMap?.get(b.constituencyId)?.status === 'gain' ? 1 : 0;
                      return aGain - bGain;
                    })
                  : niHexPositions
                ).map(pos => {
                  const data = dataMap.get(pos.constituencyId);
                  if (!data) return null;

                  const fill = getFill(data);
                  const isEstimated = swingEstimatedIds?.has(pos.constituencyId);
                  const statusInfo = seatStatusMap?.get(pos.constituencyId);

                  return (
                    <g
                      key={pos.constituencyId}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => handleHexMouseEnter(e, pos.constituencyId)}
                      onMouseLeave={handleHexMouseLeave}
                      onClick={() => handleHexClick(pos.constituencyId)}
                    >
                      <path
                        d={hexPathD}
                        fill={fill}
                        fillOpacity={getSeatFillOpacity(statusInfo?.status, mapColorMode, !!data.winner, 'hex', showSeatStatus)}
                        stroke={getSeatStrokeColor(statusInfo?.status, mapColorMode, showSeatStatus)}
                        strokeWidth={showSeatStatus && mapColorMode === 'winner' && statusInfo?.status === 'gain' ? 1 : 0.5}
                      />
                      {isEstimated && (
                        <path
                          d={hexPathD}
                          fill="url(#hex-estimated-hatch)"
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            )}
          {/* Selected constituency: permanent black outline */}
          {selectedConstituencyId && (() => {
            const gbPos = hexPositions.find(p => p.constituencyId === selectedConstituencyId);
            if (gbPos) {
              const { x, y } = hexToPixel(gbPos.q, gbPos.r, hexSize);
              return (
                <path
                  transform={`translate(${x}, ${y})`}
                  d={hexPathD}
                  fill="none"
                  stroke="#000"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              );
            }
            const niPos = niHexPositions.find(p => p.constituencyId === selectedConstituencyId);
            if (niPos) {
              return (
                <path
                  transform={`translate(${niPos.x}, ${niPos.y})`}
                  d={hexPathD}
                  fill="none"
                  stroke="#000"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              );
            }
            return null;
          })()}

          {/* Hovered constituency: blue outline */}
          {hoveredConstituencyId && hoveredConstituencyId !== selectedConstituencyId && (() => {
            const gbPos = hexPositions.find(p => p.constituencyId === hoveredConstituencyId);
            if (gbPos) {
              const { x, y } = hexToPixel(gbPos.q, gbPos.r, hexSize);
              return (
                <path
                  transform={`translate(${x}, ${y})`}
                  d={hexPathD}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              );
            }
            const niPos = niHexPositions.find(p => p.constituencyId === hoveredConstituencyId);
            if (niPos) {
              return (
                <path
                  transform={`translate(${niPos.x}, ${niPos.y})`}
                  d={hexPathD}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              );
            }
            return null;
          })()}
          </g>
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 text-sm"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="font-semibold">{tooltip.data.constituencyName}</div>
          {(() => {
            const wr = tooltip.data.results.find(r => r.partyId.toLowerCase() === tooltip.data.winner.toLowerCase());
            return wr?.candidate ? <div className="text-xs text-gray-500">{wr.candidate}</div> : null;
          })()}
          {mapColorMode === 'swing' && pinnedDataMap ? (() => {
            const pinned = pinnedDataMap.get(tooltip.data.constituencyId);
            if (!pinned) return <div className="text-xs text-gray-400">No pinned data</div>;
            const swing = computeSwing(tooltip.data, pinned);
            const isEst = swingEstimatedIds?.has(tooltip.data.constituencyId);
            return (
              <div className="text-xs text-gray-600">
                <div>Swing: <span className={swing > 0 ? 'text-blue-600' : 'text-red-600'}>
                  {swing > 0 ? '+' : ''}{swing.toFixed(1)}pp {swing > 0 ? '→ Con' : '→ Lab'}{isEst ? ' (est.)' : ''}
                </span></div>
                <div>Winner: <span style={{ color: getPartyColor(pinned.winner) }}>{pinned.winner.toUpperCase()}</span> → <span style={{ color: getPartyColor(tooltip.data.winner) }}>{tooltip.data.winner.toUpperCase()}</span></div>
              </div>
            );
          })() : mapColorMode !== 'winner' ? (
            <div className="text-xs text-gray-600">
              {getPartyById(mapColorMode).shortName}:{' '}
              {(() => {
                const pr = tooltip.data.results.find(r => r.partyId.toLowerCase() === mapColorMode);
                return pr ? `${pr.voteShare.toFixed(1)}%` : 'N/A';
              })()}
            </div>
          ) : (() => {
            const statusInfo = seatStatusMap?.get(tooltip.data.constituencyId);
            return (
              <div className="text-xs text-gray-600">
                {statusInfo?.status === 'gain' && statusInfo.previousWinner
                  ? <>
                      <span style={{ color: getPartyColor(tooltip.data.winner) }}>{tooltip.data.winner.toUpperCase()}</span>
                      {' '}<span className="font-semibold">GAIN</span> from{' '}
                      <span style={{ color: getPartyColor(statusInfo.previousWinner) }}>{statusInfo.previousWinner.toUpperCase()}</span>
                    </>
                  : statusInfo?.status === 'hold'
                    ? <><span style={{ color: getPartyColor(tooltip.data.winner) }}>{tooltip.data.winner.toUpperCase()}</span> hold</>
                    : statusInfo?.status === 'new_boundaries'
                      ? <><span style={{ color: getPartyColor(tooltip.data.winner) }}>{tooltip.data.winner.toUpperCase()}</span> win <span className="text-gray-400">(new seat)</span></>
                      : <>Winner: <span style={{ color: getPartyColor(tooltip.data.winner) }}>{tooltip.data.winner.toUpperCase()}</span></>
                }
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
