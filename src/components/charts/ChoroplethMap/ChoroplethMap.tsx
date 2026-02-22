import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import type { ElectionResult } from '@/types/election';
import { getPartyColor, getPartyById } from '@/types/party';
import { createUKProjection } from '@/utils/d3/dotDensity';
import { shiftIslandFeatures } from '@/utils/islandInset';
import { splitGBAndNI, getNIInsetBounds, createNIProjection } from '@/utils/d3/niInset';
import { useUIStore } from '@/store/uiStore';
import { useElectionStore } from '@/store/electionStore';
import {
  type BoundaryProperties,
  getBoundaryDisplayName,
  getBoundaryMatchName,
  createElectionLookup,
} from '@/utils/constituencyMatching';

type ConstituencyFeature = Feature<Polygon | MultiPolygon, BoundaryProperties>;

interface ChoroplethMapProps {
  electionData: ElectionResult[];
  boundaries: FeatureCollection<Polygon | MultiPolygon, BoundaryProperties> | null;
  width: number;
  height: number;
  selectedConstituencyId?: string | null;
  hoveredConstituencyId?: string | null;
  onConstituencyHover?: (id: string | null) => void;
  onConstituencySelect?: (id: string | null) => void;
  pinnedElectionData?: ElectionResult[];
  hideZoomControls?: boolean;
  swingEstimatedIds?: Set<string>;
}

interface TooltipData {
  constituencyName: string;
  winner: string;
  winnerCandidate?: string;
  partyVoteShare?: number;
  partyName?: string;
  swing?: number;
  isEstimated?: boolean;
  x: number;
  y: number;
}

/** Compute Con-Lab swing: change in Con-Lab vote share margin */
function computeSwing(current: ElectionResult, pinned: ElectionResult): number {
  const getShare = (r: ElectionResult, party: string) =>
    r.results.find(p => p.partyId.toLowerCase() === party)?.voteShare ?? 0;
  const curMargin = getShare(current, 'con') - getShare(current, 'lab');
  const pinMargin = getShare(pinned, 'con') - getShare(pinned, 'lab');
  return curMargin - pinMargin;
}

/** Compute fill color for a constituency */
function getConstituencyFill(
  matchName: string,
  mapColorMode: string,
  partyColorScale: d3.ScaleLinear<string, string> | null,
  winnerByName: Map<string, string>,
  dataByName: Map<string, ElectionResult>,
  swingColorScale?: d3.ScaleLinear<string, string> | null,
  pinnedDataByName?: Map<string, ElectionResult> | null,
): string {
  // Swing mode
  if (mapColorMode === 'swing' && swingColorScale && pinnedDataByName) {
    const current = dataByName.get(matchName);
    const pinned = pinnedDataByName.get(matchName);
    if (current && pinned) {
      return swingColorScale(computeSwing(current, pinned));
    }
    return '#ddd';
  }
  if (mapColorMode === 'winner' || !partyColorScale) {
    const winner = winnerByName.get(matchName);
    return winner ? getPartyColor(winner) : '#ddd';
  }
  const data = dataByName.get(matchName);
  const partyResult = data?.results.find(r => r.partyId.toLowerCase() === mapColorMode);
  return partyResult ? partyColorScale(partyResult.voteShare) : '#f8f8f8';
}

export function ChoroplethMap({
  electionData,
  boundaries,
  width,
  height,
  selectedConstituencyId,
  hoveredConstituencyId,
  onConstituencyHover,
  onConstituencySelect,
  pinnedElectionData,
  hideZoomControls,
  swingEstimatedIds,
}: ChoroplethMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const { mapZoom, setMapZoom, mapColorMode } = useUIStore();
  const { zoomToConstituencyTrigger } = useElectionStore();

  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const localSelectRef = useRef(false);
  const prevSelectedRef = useRef<string | null | undefined>(undefined);

  // Create d3 transform from store state
  const transform = useMemo(() =>
    d3.zoomIdentity.translate(mapZoom.x, mapZoom.y).scale(mapZoom.k),
    [mapZoom]
  );

  // Split boundaries into GB and NI, apply island shifts only to GB
  const { gbFeatures, niFeatures, shiftedGBCollection } = useMemo(() => {
    if (!boundaries) return { gbFeatures: [] as ConstituencyFeature[], niFeatures: [] as ConstituencyFeature[], shiftedGBCollection: null };
    const { gbFeatures: gb, niFeatures: ni } = splitGBAndNI(boundaries.features as ConstituencyFeature[]);
    const gbCollection: FeatureCollection<Polygon | MultiPolygon, BoundaryProperties> = {
      type: 'FeatureCollection',
      features: gb,
    };
    const shifted = shiftIslandFeatures(gbCollection);
    return {
      gbFeatures: shifted.features as ConstituencyFeature[],
      niFeatures: ni,
      shiftedGBCollection: shifted,
    };
  }, [boundaries]);

  // GB projection (fits only to GB features)
  const projection = useMemo(
    () => createUKProjection(width, height, shiftedGBCollection ?? undefined),
    [width, height, shiftedGBCollection]
  );

  // Path generator for GB
  const pathGenerator = useMemo(() => d3.geoPath().projection(projection), [projection]);

  // NI inset config and projection (in projection coordinate space, zooms with GB)
  const niInset = useMemo(() => {
    if (!shiftedGBCollection) return { x: 0, y: 0, width: 0, height: 0 };
    return getNIInsetBounds(shiftedGBCollection, pathGenerator);
  }, [shiftedGBCollection, pathGenerator]);
  const niProjection = useMemo(
    () => createNIProjection(niFeatures, niInset),
    [niFeatures, niInset]
  );
  const niPathGenerator = useMemo(
    () => niProjection ? d3.geoPath().projection(niProjection) : null,
    [niProjection]
  );

  // Election data lookups
  const { winnerByName, idByName, dataByName } = useMemo(() => {
    return createElectionLookup(electionData);
  }, [electionData]);

  // Pinned data lookup (for swing mode)
  const pinnedDataByName = useMemo(() => {
    if (!pinnedElectionData?.length) return null;
    return createElectionLookup(pinnedElectionData).dataByName;
  }, [pinnedElectionData]);

  // Color scale for party vote share mode
  const partyColorScale = useMemo(() => {
    if (mapColorMode === 'winner' || mapColorMode === 'swing') return null;
    const party = getPartyById(mapColorMode);
    return d3.scaleLinear<string>().domain([0, 50]).range(['#f8f8f8', party.color]).clamp(true);
  }, [mapColorMode]);

  // Swing color scale: Lab red ← neutral → Con blue
  const swingColorScale = useMemo(() => {
    if (mapColorMode !== 'swing') return null;
    return d3.scaleLinear<string>().domain([-20, 0, 20]).range(['#DC241f', '#f5f5f5', '#0063A6']).clamp(true);
  }, [mapColorMode]);

  // Reverse lookup: election ID → { feature, isNI } (for external zoom-to-constituency)
  const featureByElectionId = useMemo(() => {
    const map = new Map<string, { feature: ConstituencyFeature; isNI: boolean }>();
    gbFeatures.forEach(f => {
      const matchName = getBoundaryMatchName(f.properties);
      const id = idByName.get(matchName);
      if (id) map.set(id, { feature: f, isNI: false });
    });
    niFeatures.forEach(f => {
      const matchName = getBoundaryMatchName(f.properties);
      const id = idByName.get(matchName);
      if (id) map.set(id, { feature: f, isNI: true });
    });
    return map;
  }, [gbFeatures, niFeatures, idByName]);

  // Initialize zoom behavior
  useEffect(() => {
    if (!svgRef.current) return;

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 20])
      .on('zoom', (event) => {
        const { k, x, y } = event.transform;
        setMapZoom({ k, x, y });
      });

    zoomRef.current = zoom;
    d3.select(svgRef.current).call(zoom);

    // If a constituency is selected, let the zoom-to-constituency effect
    // handle positioning; otherwise restore the stored transform
    if (selectedConstituencyId) {
      prevSelectedRef.current = undefined;
    } else if (mapZoom.k !== 1 || mapZoom.x !== 0 || mapZoom.y !== 0) {
      d3.select(svgRef.current).call(
        zoom.transform,
        d3.zoomIdentity.translate(mapZoom.x, mapZoom.y).scale(mapZoom.k)
      );
    }

    return () => {
      d3.select(svgRef.current).on('.zoom', null);
    };
  }, [width, height, setMapZoom]);

  /** Find a constituency at screen coords (both GB and NI use zoom-inverted coords) */
  const findConstituencyAtPoint = useCallback(
    (screenX: number, screenY: number): { feature: ConstituencyFeature; isNI: boolean } | null => {
      // Both GB and NI are in the zoom-transformed group
      const mapX = (screenX - transform.x) / transform.k;
      const mapY = (screenY - transform.y) / transform.k;

      // Check NI first (smaller area, more specific)
      if (niProjection && niFeatures.length > 0) {
        const niGeo = niProjection.invert?.([mapX, mapY]);
        if (niGeo) {
          const niHit = niFeatures.find(f => d3.geoContains(f, niGeo));
          if (niHit) return { feature: niHit, isNI: true };
        }
      }
      // Check GB
      const gbGeo = projection.invert?.([mapX, mapY]);
      if (gbGeo) {
        const gbHit = gbFeatures.find(f => d3.geoContains(f, gbGeo));
        if (gbHit) return { feature: gbHit, isNI: false };
      }
      return null;
    },
    [niProjection, niFeatures, projection, gbFeatures, transform]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const hit = findConstituencyAtPoint(screenX, screenY);

      if (hit) {
        const matchName = getBoundaryMatchName(hit.feature.properties);
        const displayName = getBoundaryDisplayName(hit.feature.properties);
        const electionId = idByName.get(matchName) || '';
        const winner = winnerByName.get(matchName) || '';

        let partyVoteShare: number | undefined;
        let partyName: string | undefined;
        let swing: number | undefined;
        if (mapColorMode === 'swing' && pinnedDataByName) {
          const current = dataByName.get(matchName);
          const pinned = pinnedDataByName.get(matchName);
          if (current && pinned) swing = computeSwing(current, pinned);
        } else if (mapColorMode !== 'winner') {
          const data = dataByName.get(matchName);
          const partyResult = data?.results.find(r => r.partyId.toLowerCase() === mapColorMode);
          partyVoteShare = partyResult?.voteShare;
          partyName = getPartyById(mapColorMode).shortName;
        }

        const constData = dataByName.get(matchName);
        const winnerCandidate = constData?.results.find(
          r => r.partyId.toLowerCase() === winner.toLowerCase()
        )?.candidate;

        setTooltip({
          constituencyName: displayName,
          winner,
          winnerCandidate,
          partyVoteShare,
          partyName,
          swing,
          isEstimated: !!(electionId && swingEstimatedIds?.has(electionId)),
          x: e.clientX,
          y: e.clientY,
        });
        onConstituencyHover?.(electionId || null);
      } else {
        setTooltip(null);
        onConstituencyHover?.(null);
      }
    },
    [findConstituencyAtPoint, onConstituencyHover, winnerByName, idByName, mapColorMode, dataByName, swingEstimatedIds]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    onConstituencyHover?.(null);
  }, [onConstituencyHover]);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const hit = findConstituencyAtPoint(screenX, screenY);

      const matchName = hit ? getBoundaryMatchName(hit.feature.properties) : '';
      const electionId = matchName ? idByName.get(matchName) : undefined;

      // Zoom to clicked constituency (both GB and NI are in same zoom group)
      if (hit && electionId && selectedConstituencyId !== electionId && svgRef.current && zoomRef.current) {
        const gen = hit.isNI && niPathGenerator ? niPathGenerator : pathGenerator;
        const bounds = gen.bounds(hit.feature);
        const [[x0, y0], [x1, y1]] = bounds;
        const bboxWidth = x1 - x0;
        const bboxHeight = y1 - y0;
        const bboxCenterX = (x0 + x1) / 2;
        const bboxCenterY = (y0 + y1) / 2;

        const targetWidth = width * 0.25;
        const scale = Math.min(targetWidth / bboxWidth, (height * 0.5) / bboxHeight, 8);
        const translateX = width / 2 - bboxCenterX * scale;
        const translateY = height / 2 - bboxCenterY * scale;

        d3.select(svgRef.current)
          .transition()
          .duration(500)
          .call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
          );
      }

      localSelectRef.current = true;
      onConstituencySelect?.(
        selectedConstituencyId === electionId ? null : electionId || null
      );
    },
    [findConstituencyAtPoint, selectedConstituencyId, onConstituencySelect, pathGenerator, width, height, idByName]
  );

  // Zoom to constituency when selected externally or triggered via store
  useEffect(() => {
    if (selectedConstituencyId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedConstituencyId;

    if (localSelectRef.current) {
      localSelectRef.current = false;
      return;
    }

    if (!selectedConstituencyId || !svgRef.current || !zoomRef.current) return;

    const entry = featureByElectionId.get(selectedConstituencyId);
    if (!entry) return;

    const gen = entry.isNI && niPathGenerator ? niPathGenerator : pathGenerator;
    const bounds = gen.bounds(entry.feature);
    const [[x0, y0], [x1, y1]] = bounds;
    const bboxWidth = x1 - x0;
    const bboxHeight = y1 - y0;
    const bboxCenterX = (x0 + x1) / 2;
    const bboxCenterY = (y0 + y1) / 2;

    const targetWidth = width * 0.25;
    const scale = Math.min(targetWidth / bboxWidth, (height * 0.5) / bboxHeight, 8);
    const translateX = width / 2 - bboxCenterX * scale;
    const translateY = height / 2 - bboxCenterY * scale;

    d3.select(svgRef.current)
      .transition()
      .duration(500)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(translateX, translateY).scale(scale)
      );
  }, [selectedConstituencyId, featureByElectionId, pathGenerator, width, height, zoomToConstituencyTrigger]);

  // Reset prevSelectedRef when zoom trigger fires so the effect re-runs
  useEffect(() => {
    if (zoomToConstituencyTrigger > 0) {
      prevSelectedRef.current = undefined;
    }
  }, [zoomToConstituencyTrigger]);

  if (width === 0 || height === 0) {
    return null;
  }

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="bg-gray-100"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        role="img"
        aria-label="Choropleth map of UK election results"
      >

        {/* Hatching pattern for estimated swing constituencies */}
        <defs>
          <pattern id="estimated-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* GB constituency fills (zoom-transformed) */}
        <g
          ref={gRef}
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
        >
          {gbFeatures.map((feat, idx) => {
            const matchName = getBoundaryMatchName(feat.properties);
            const electionId = idByName.get(matchName);
            const winner = winnerByName.get(matchName);
            const isEstimated = electionId && swingEstimatedIds?.has(electionId);

            const fill = getConstituencyFill(matchName, mapColorMode, partyColorScale, winnerByName, dataByName, swingColorScale, pinnedDataByName);
            const pathD = pathGenerator(feat) ?? '';

            return (
              <g key={electionId || `gb-${idx}`}>
                <path
                  d={pathD}
                  fill={fill}
                  fillOpacity={winner ? 1 : 0.5}
                  stroke="#fff"
                  strokeWidth={0.5 / transform.k}
                  style={{ cursor: 'pointer' }}
                />
                {isEstimated && (
                  <path
                    d={pathD}
                    fill="url(#estimated-hatch)"
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}

          {/* Dashed inset indicator for shifted island features */}
          {gbFeatures.filter(f => (f.properties as Record<string, unknown>)._islandShifted).map((feat, idx) => {
            const bounds = pathGenerator.bounds(feat);
            const [[x0, y0], [x1, y1]] = bounds;
            const pad = 4;
            return (
              <rect
                key={`inset-${idx}`}
                x={x0 - pad}
                y={y0 - pad}
                width={x1 - x0 + 2 * pad}
                height={y1 - y0 + 2 * pad}
                rx={3}
                ry={3}
                fill="none"
                stroke="#999"
                strokeWidth={1 / transform.k}
                strokeDasharray={`${4 / transform.k} ${3 / transform.k}`}
              />
            );
          })}

          {/* NI inset (inside zoom group — pans and zooms with GB) */}
          {niFeatures.length > 0 && niPathGenerator && (
            <g>
              <rect
                x={niInset.x}
                y={niInset.y}
                width={niInset.width}
                height={niInset.height}
                rx={3}
                ry={3}
                fill="#f3f4f6"
                stroke="#999"
                strokeWidth={1 / transform.k}
                strokeDasharray={`${4 / transform.k} ${3 / transform.k}`}
              />

              {niFeatures.map((feat, idx) => {
                const matchName = getBoundaryMatchName(feat.properties);
                const electionId = idByName.get(matchName);
                const winner = winnerByName.get(matchName);
                const isEstimated = electionId && swingEstimatedIds?.has(electionId);

                const fill = getConstituencyFill(matchName, mapColorMode, partyColorScale, winnerByName, dataByName, swingColorScale, pinnedDataByName);
                const pathD = niPathGenerator(feat) ?? '';

                return (
                  <g key={electionId || `ni-${idx}`}>
                    <path
                      d={pathD}
                      fill={fill}
                      fillOpacity={winner ? 1 : 0.5}
                      stroke="#fff"
                      strokeWidth={0.5 / transform.k}
                      style={{ cursor: 'pointer' }}
                    />
                    {isEstimated && (
                      <path
                        d={pathD}
                        fill="url(#estimated-hatch)"
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}

              <text
                x={niInset.x + 3}
                y={niInset.y + niInset.height - 3}
                fontSize={9 / transform.k}
                fill="#666"
                fontFamily="sans-serif"
              >
                NI
              </text>
            </g>
          )}

          {/* Selected constituency: permanent black outline */}
          {selectedConstituencyId && (() => {
            const gbFeat = gbFeatures.find(f => idByName.get(getBoundaryMatchName(f.properties)) === selectedConstituencyId);
            if (gbFeat) {
              return (
                <path
                  d={pathGenerator(gbFeat) ?? ''}
                  fill="none"
                  stroke="#000"
                  strokeWidth={2 / transform.k}
                  pointerEvents="none"
                />
              );
            }
            if (niPathGenerator) {
              const niFeat = niFeatures.find(f => idByName.get(getBoundaryMatchName(f.properties)) === selectedConstituencyId);
              if (niFeat) {
                return (
                  <path
                    d={niPathGenerator(niFeat) ?? ''}
                    fill="none"
                    stroke="#000"
                    strokeWidth={2 / transform.k}
                    pointerEvents="none"
                  />
                );
              }
            }
            return null;
          })()}

          {/* Hovered constituency: blue outline */}
          {hoveredConstituencyId && hoveredConstituencyId !== selectedConstituencyId && (() => {
            const gbFeat = gbFeatures.find(f => idByName.get(getBoundaryMatchName(f.properties)) === hoveredConstituencyId);
            if (gbFeat) {
              return (
                <path
                  d={pathGenerator(gbFeat) ?? ''}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2 / transform.k}
                  pointerEvents="none"
                />
              );
            }
            if (niPathGenerator) {
              const niFeat = niFeatures.find(f => idByName.get(getBoundaryMatchName(f.properties)) === hoveredConstituencyId);
              if (niFeat) {
                return (
                  <path
                    d={niPathGenerator(niFeat) ?? ''}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2 / transform.k}
                    pointerEvents="none"
                  />
                );
              }
            }
            return null;
          })()}
        </g>
      </svg>

      {/* Zoom controls */}
      {!hideZoomControls && (
        <div className="absolute bottom-2 right-2 z-10 flex gap-1">
          {(transform.k !== 1 || transform.x !== 0 || transform.y !== 0) && (
            <button
              onClick={() => {
                if (svgRef.current && zoomRef.current) {
                  d3.select(svgRef.current).transition().duration(300).call(
                    zoomRef.current.transform,
                    d3.zoomIdentity
                  );
                }
              }}
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
              onClick={() => {
                if (svgRef.current && zoomRef.current) {
                  d3.select(svgRef.current).transition().duration(300).call(
                    zoomRef.current.scaleBy,
                    1.5
                  );
                }
              }}
              className="px-2 py-1 text-sm hover:bg-gray-50 border-r border-gray-300"
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => {
                if (svgRef.current && zoomRef.current) {
                  d3.select(svgRef.current).transition().duration(300).call(
                    zoomRef.current.scaleBy,
                    0.67
                  );
                }
              }}
              className="px-2 py-1 text-sm hover:bg-gray-50"
              title="Zoom out"
            >
              −
            </button>
          </div>
        </div>
      )}

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
          <div className="font-medium">{tooltip.constituencyName}</div>
          {tooltip.winnerCandidate && (
            <div className="text-xs text-gray-500">{tooltip.winnerCandidate}</div>
          )}
          {tooltip.swing != null ? (
            <div className="text-xs mt-1" style={{ color: tooltip.swing > 0 ? '#0063A6' : '#DC241f' }}>
              {tooltip.swing > 0 ? '+' : ''}{tooltip.swing.toFixed(1)}pp swing to {tooltip.swing > 0 ? 'Con' : 'Lab'}{tooltip.isEstimated ? ' (est.)' : ''}
            </div>
          ) : tooltip.partyName != null ? (
            <div className="text-gray-600 text-xs mt-1">
              {tooltip.partyName}: {tooltip.partyVoteShare != null ? `${tooltip.partyVoteShare.toFixed(1)}%` : 'N/A'}
            </div>
          ) : tooltip.winner ? (
            <div className="flex items-center gap-2 mt-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getPartyColor(tooltip.winner) }}
              />
              <span className="text-gray-600 text-xs">{tooltip.winner.toUpperCase()}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
