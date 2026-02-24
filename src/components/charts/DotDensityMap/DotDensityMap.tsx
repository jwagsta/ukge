import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import type { ElectionResult, DotDensityPoint } from '@/types/election';
import { getPartyColor, getPartyById } from '@/types/party';
import {
  generateAllDots,
  createUKProjection,
  electionResultsToVoteMap,
} from '@/utils/d3/dotDensity';
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

// Module-level cache for generated dots (persists across re-renders)
const dotsCache = new Map<string, { gbDots: DotDensityPoint[]; niDots: DotDensityPoint[] }>();
const MAX_CACHE_SIZE = 2;

function getCacheKey(electionData: ElectionResult[], votesPerDot: number, width: number, height: number, numFeatures: number): string {
  if (electionData.length === 0) return '';
  const firstResult = electionData[0];
  const totalVotes = firstResult.results.reduce((sum, r) => sum + r.votes, 0);
  return `${electionData.length}-${totalVotes}-${votesPerDot}-${width}x${height}-${numFeatures}`;
}

interface DotDensityMapProps {
  electionData: ElectionResult[];
  boundaries: FeatureCollection<Polygon | MultiPolygon, BoundaryProperties> | null;
  width: number;
  height: number;
  votesPerDot: number;
  selectedConstituencyId?: string | null;
  hoveredConstituencyId?: string | null;
  onConstituencyHover?: (id: string | null) => void;
  onConstituencySelect?: (id: string | null) => void;
  hideZoomControls?: boolean;
  hideSettingsControls?: boolean;
}

interface TooltipData {
  constituencyName: string;
  winner?: string;
  winnerCandidate?: string;
  x: number;
  y: number;
}

export function DotDensityMap({
  electionData,
  boundaries,
  width,
  height,
  votesPerDot,
  selectedConstituencyId,
  hoveredConstituencyId,
  onConstituencyHover,
  onConstituencySelect,
  hideZoomControls,
  hideSettingsControls,
}: DotDensityMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boundariesRef = useRef<SVGGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [gbDots, setGBDots] = useState<DotDensityPoint[]>([]);
  const [niDots, setNIDots] = useState<DotDensityPoint[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { mapZoom, setMapZoom, dotPartyFilter, toggleDotParty } = useUIStore();
  const { zoomToConstituencyTrigger } = useElectionStore();
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const localSelectRef = useRef(false);
  const prevSelectedRef = useRef<string | null | undefined>(undefined);

  const transform = useMemo(() =>
    d3.zoomIdentity.translate(mapZoom.x, mapZoom.y).scale(mapZoom.k),
    [mapZoom]
  );

  // Split boundaries into GB and NI
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

  // Projections (fixed reference extent — identical across all boundary eras)
  const projection = useMemo(
    () => createUKProjection(width, height),
    [width, height]
  );
  // Path generator for GB
  const pathGenerator = useMemo(() => d3.geoPath().projection(projection), [projection]);

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

  const { idByName, dataByName } = useMemo(() => createElectionLookup(electionData), [electionData]);

  const NI_PARTY_IDS = useMemo(() => new Set(['dup', 'sf', 'sdlp', 'uup', 'alliance', 'tuv', 'pup', 'ulu']), []);

  // Unique parties present in current dots, split into GB and NI
  const { gbParties, niParties } = useMemo(() => {
    const gbSet = new Set<string>();
    const niSet = new Set<string>();
    gbDots.forEach(d => {
      const id = d.partyId.toLowerCase();
      if (NI_PARTY_IDS.has(id)) niSet.add(id); else gbSet.add(id);
    });
    niDots.forEach(d => {
      const id = d.partyId.toLowerCase();
      if (NI_PARTY_IDS.has(id)) niSet.add(id); else gbSet.add(id);
    });
    const majorOrder = ['lab', 'con', 'ld', 'snp', 'pc', 'grn', 'ref', 'ukip', 'bre'];
    const niOrder = ['dup', 'sf', 'sdlp', 'uup', 'alliance', 'tuv', 'pup', 'ulu'];
    const sortByOrder = (set: Set<string>, order: string[]) => {
      const sorted: string[] = [];
      for (const p of order) { if (set.has(p)) { sorted.push(p); set.delete(p); } }
      sorted.push(...Array.from(set).sort());
      return sorted;
    };
    return { gbParties: sortByOrder(gbSet, majorOrder), niParties: sortByOrder(niSet, niOrder) };
  }, [gbDots, niDots, NI_PARTY_IDS]);

  const [niExpanded, setNIExpanded] = useState(false);

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
    if (selectedConstituencyId) {
      prevSelectedRef.current = undefined;
    } else if (mapZoom.k !== 1 || mapZoom.x !== 0 || mapZoom.y !== 0) {
      d3.select(svgRef.current).call(
        zoom.transform,
        d3.zoomIdentity.translate(mapZoom.x, mapZoom.y).scale(mapZoom.k)
      );
    }
    return () => { d3.select(svgRef.current).on('.zoom', null); };
  }, [width, height, setMapZoom]);

  // Lookup for zoom-to-constituency
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

  // Zoom to constituency when selected externally
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
  }, [selectedConstituencyId, featureByElectionId, pathGenerator, niPathGenerator, width, height, zoomToConstituencyTrigger]);

  // Reset prevSelectedRef when zoom trigger fires so the effect re-runs
  useEffect(() => {
    if (zoomToConstituencyTrigger > 0) {
      prevSelectedRef.current = undefined;
    }
  }, [zoomToConstituencyTrigger]);

  // Generate dots for both GB and NI
  useEffect(() => {
    const allFeatures = [...gbFeatures, ...niFeatures];
    if (allFeatures.length === 0 || electionData.length === 0) {
      setGBDots([]);
      setNIDots([]);
      return;
    }

    const cacheKey = getCacheKey(electionData, votesPerDot, width, height, gbFeatures.length);
    if (dotsCache.has(cacheKey)) {
      const cached = dotsCache.get(cacheKey)!;
      setGBDots(cached.gbDots);
      setNIDots(cached.niDots);
      setIsGenerating(false);
      return;
    }

    setIsGenerating(true);
    const handle = requestIdleCallback(
      () => {
        const voteMap = electionResultsToVoteMap(electionData);
        const opts = { votesPerDot, minDistance: 2, maxIterations: 1000 };

        // Generate GB dots with main projection
        const generatedGBDots = generateAllDots(gbFeatures, voteMap, projection, opts);

        // Generate NI dots with NI projection
        let generatedNIDots: DotDensityPoint[] = [];
        if (niProjection && niFeatures.length > 0) {
          generatedNIDots = generateAllDots(niFeatures, voteMap, niProjection, opts);
        }

        if (dotsCache.size >= MAX_CACHE_SIZE) {
          const firstKey = dotsCache.keys().next().value;
          if (firstKey) dotsCache.delete(firstKey);
        }
        dotsCache.set(cacheKey, { gbDots: generatedGBDots, niDots: generatedNIDots });

        setGBDots(generatedGBDots);
        setNIDots(generatedNIDots);
        setIsGenerating(false);
      },
      { timeout: 5000 }
    );
    return () => cancelIdleCallback(handle);
  }, [gbFeatures, niFeatures, electionData, projection, niProjection, votesPerDot]);

  // Draw dots on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Draw NI inset background on canvas so dots appear over a clean white bg
    if (niFeatures.length > 0 && niInset.width > 0) {
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);
      ctx.fillStyle = 'white';
      ctx.fillRect(niInset.x, niInset.y, niInset.width, niInset.height);
      ctx.restore();
    }

    // Draw all dots (both GB and NI) with zoom transform
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    const scaledRadius = 2 / transform.k;
    const hasFilter = dotPartyFilter.size > 0;
    const drawDot = (dot: DotDensityPoint) => {
      if (hasFilter && !dotPartyFilter.has(dot.partyId.toLowerCase())) return;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, scaledRadius, 0, 2 * Math.PI);
      ctx.fillStyle = getPartyColor(dot.partyId);
      ctx.globalAlpha = 0.8;
      ctx.fill();
    };
    gbDots.forEach(drawDot);
    niDots.forEach(drawDot);
    ctx.restore();
  }, [gbDots, niDots, width, height, transform, dotPartyFilter, niFeatures, niInset]);

  /** Find constituency at screen coords (both GB and NI use zoom-inverted coords) */
  const findConstituencyAtPoint = useCallback(
    (screenX: number, screenY: number): { feature: ConstituencyFeature; isNI: boolean } | null => {
      const mapX = (screenX - transform.x) / transform.k;
      const mapY = (screenY - transform.y) / transform.k;

      if (niProjection && niFeatures.length > 0) {
        const niGeo = niProjection.invert?.([mapX, mapY]);
        if (niGeo) {
          const niHit = niFeatures.find(f => d3.geoContains(f, niGeo));
          if (niHit) return { feature: niHit, isNI: true };
        }
      }
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
        const electionId = idByName.get(matchName) || null;
        const constData = dataByName.get(matchName);
        const winner = constData?.winner;
        const winnerCandidate = constData?.results.find(
          r => r.partyId.toLowerCase() === winner?.toLowerCase()
        )?.candidate;
        setTooltip({ constituencyName: getBoundaryDisplayName(hit.feature.properties), winner, winnerCandidate, x: e.clientX, y: e.clientY });
        onConstituencyHover?.(electionId);
      } else {
        setTooltip(null);
        onConstituencyHover?.(null);
      }
    },
    [findConstituencyAtPoint, onConstituencyHover, idByName, dataByName]
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

      if (hit && !hit.isNI && electionId && selectedConstituencyId !== electionId && svgRef.current && zoomRef.current) {
        const bounds = pathGenerator.bounds(hit.feature);
        const [[x0, y0], [x1, y1]] = bounds;
        const bboxWidth = x1 - x0;
        const bboxHeight = y1 - y0;
        const bboxCenterX = (x0 + x1) / 2;
        const bboxCenterY = (y0 + y1) / 2;
        const targetWidth = width * 0.25;
        const scale = Math.min(targetWidth / bboxWidth, (height * 0.5) / bboxHeight, 8);
        const translateX = width / 2 - bboxCenterX * scale;
        const translateY = height / 2 - bboxCenterY * scale;
        d3.select(svgRef.current).transition().duration(500).call(
          zoomRef.current.transform,
          d3.zoomIdentity.translate(translateX, translateY).scale(scale)
        );
      }

      localSelectRef.current = true;
      onConstituencySelect?.(selectedConstituencyId === electionId ? null : electionId || null);
    },
    [findConstituencyAtPoint, selectedConstituencyId, onConstituencySelect, pathGenerator, width, height, idByName]
  );

  if (width === 0 || height === 0) return null;

  return (
    <div className="relative" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width, height, pointerEvents: 'none' }}
      />

      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="absolute inset-0"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        role="img"
        aria-label="Dot density map of UK election results"
      >

        {/* GB boundaries (zoom-transformed) */}
        <g
          ref={boundariesRef}
          className="boundaries"
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
        >
          {gbFeatures.map((feat, idx) => {
            const matchName = getBoundaryMatchName(feat.properties);
            const electionId = idByName.get(matchName);
            return (
              <path
                key={electionId || `gb-${idx}`}
                d={pathGenerator(feat) ?? ''}
                fill="transparent"
                stroke="#9ca3af"
                strokeWidth={0.5 / transform.k}
                style={{ cursor: 'pointer' }}
              />
            );
          })}

          {gbFeatures.filter(f => (f.properties as Record<string, unknown>)._islandShifted).map((feat, idx) => {
            const bounds = pathGenerator.bounds(feat);
            const [[x0, y0], [x1, y1]] = bounds;
            const pad = 4;
            return (
              <rect
                key={`inset-${idx}`}
                x={x0 - pad} y={y0 - pad}
                width={x1 - x0 + 2 * pad} height={y1 - y0 + 2 * pad}
                rx={3} ry={3}
                fill="none" stroke="#999"
                strokeWidth={1 / transform.k}
                strokeDasharray={`${4 / transform.k} ${3 / transform.k}`}
              />
            );
          })}

          {/* NI inset boundaries (inside zoom group — pans and zooms with GB) */}
          {niFeatures.length > 0 && niPathGenerator && (
            <g>
              <rect
                x={niInset.x} y={niInset.y}
                width={niInset.width} height={niInset.height}
                rx={3} ry={3}
                fill="none"
                stroke="#999" strokeWidth={1 / transform.k}
                strokeDasharray={`${4 / transform.k} ${3 / transform.k}`}
              />
              {niFeatures.map((feat, idx) => {
                const matchName = getBoundaryMatchName(feat.properties);
                const electionId = idByName.get(matchName);
                return (
                  <path
                    key={electionId || `ni-${idx}`}
                    d={niPathGenerator(feat) ?? ''}
                    fill="transparent"
                    stroke="#9ca3af"
                    strokeWidth={0.5 / transform.k}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
              <text x={niInset.x + 3} y={niInset.y + niInset.height - 3} fontSize={9 / transform.k} fill="#666" fontFamily="sans-serif">NI</text>
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
              onClick={() => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.transform, d3.zoomIdentity); }}
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
              onClick={() => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.5); }}
              className="px-2 py-1 text-sm hover:bg-gray-50 border-r border-gray-300"
              title="Zoom in"
            >+</button>
            <button
              onClick={() => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.67); }}
              className="px-2 py-1 text-sm hover:bg-gray-50"
              title="Zoom out"
            >−</button>
          </div>
        </div>
      )}

      {/* Dots per vote picker */}
      {!hideSettingsControls && <div className="absolute bottom-2 left-2 bg-white/90 rounded-lg shadow px-2 py-1.5 text-xs flex items-center gap-1.5">
        <span className="text-gray-600">1 dot =</span>
        <select
          value={votesPerDot}
          onChange={(e) => useUIStore.getState().setVotesPerDot(Number(e.target.value))}
          className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white"
        >
          <option value={1000}>1,000</option>
          <option value={2500}>2,500</option>
          <option value={5000}>5,000</option>
          <option value={10000}>10,000</option>
          <option value={25000}>25,000</option>
        </select>
        <span className="text-gray-600">votes</span>
      </div>}

      {/* Party legend (vertical, left side — offset below map type picker) */}
      {!hideSettingsControls && <div className="absolute top-10 left-2 bg-white/90 rounded-lg shadow p-1.5 text-xs flex flex-col gap-0.5">
        {gbParties.map((partyId) => {
          const party = getPartyById(partyId);
          const active = dotPartyFilter.size === 0 || dotPartyFilter.has(partyId);
          return (
            <button
              key={partyId}
              className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-gray-100 cursor-pointer"
              onClick={() => toggleDotParty(partyId)}
              title={`Toggle ${party.shortName}`}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm border shrink-0"
                style={{
                  backgroundColor: active ? getPartyColor(partyId) : 'transparent',
                  borderColor: getPartyColor(partyId),
                }}
              />
              <span className={active ? 'text-gray-700' : 'text-gray-400 line-through'}>{party.abbreviation}</span>
            </button>
          );
        })}
        {niParties.length > 0 && (
          <>
            <button
              className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-gray-100 cursor-pointer text-gray-500"
              onClick={() => setNIExpanded(!niExpanded)}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${niExpanded ? 'rotate-90' : ''}`}>
                <path d="M2 1l4 3-4 3" />
              </svg>
              <span>NI</span>
            </button>
            {niExpanded && niParties.map((partyId) => {
              const party = getPartyById(partyId);
              const active = dotPartyFilter.size === 0 || dotPartyFilter.has(partyId);
              return (
                <button
                  key={partyId}
                  className="flex items-center gap-1.5 px-1 py-0.5 pl-3 rounded hover:bg-gray-100 cursor-pointer"
                  onClick={() => toggleDotParty(partyId)}
                  title={`Toggle ${party.shortName}`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm border shrink-0"
                    style={{
                      backgroundColor: active ? getPartyColor(partyId) : 'transparent',
                      borderColor: getPartyColor(partyId),
                    }}
                  />
                  <span className={active ? 'text-gray-700' : 'text-gray-400 line-through'}>{party.abbreviation}</span>
                </button>
              );
            })}
          </>
        )}
      </div>}

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 text-sm"
          style={{ left: tooltip.x + 10, top: tooltip.y - 10, transform: 'translateY(-100%)' }}
        >
          <div className="font-medium">{tooltip.constituencyName}</div>
          {tooltip.winnerCandidate && (
            <div className="text-xs text-gray-500">{tooltip.winnerCandidate}</div>
          )}
          {tooltip.winner && (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getPartyColor(tooltip.winner) }} />
              <span className="text-gray-600 text-xs">{tooltip.winner.toUpperCase()}</span>
            </div>
          )}
        </div>
      )}

      {isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50">
          <div className="flex items-center gap-2 bg-white rounded-lg shadow px-4 py-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Generating dots...</span>
          </div>
        </div>
      )}
    </div>
  );
}
