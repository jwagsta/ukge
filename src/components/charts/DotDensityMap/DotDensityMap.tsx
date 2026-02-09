import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import type { ElectionResult, DotDensityPoint } from '@/types/election';
import { getPartyColor } from '@/types/party';
import {
  generateAllDots,
  createUKProjection,
  electionResultsToVoteMap,
} from '@/utils/d3/dotDensity';
import { useUIStore } from '@/store/uiStore';
import {
  type BoundaryProperties,
  getBoundaryDisplayName,
  getBoundaryMatchName,
  createElectionLookup,
} from '@/utils/constituencyMatching';

type ConstituencyFeature = Feature<Polygon | MultiPolygon, BoundaryProperties>;

// Module-level cache for generated dots (persists across re-renders)
const dotsCache = new Map<string, DotDensityPoint[]>();
const MAX_CACHE_SIZE = 2; // Limit to 2 entries to control memory

function getCacheKey(electionData: ElectionResult[], votesPerDot: number): string {
  // Use first constituency's total votes as a simple fingerprint for the year
  if (electionData.length === 0) return '';
  const firstResult = electionData[0];
  const totalVotes = firstResult.results.reduce((sum, r) => sum + r.votes, 0);
  return `${electionData.length}-${totalVotes}-${votesPerDot}`;
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
}

interface TooltipData {
  constituencyName: string;
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
}: DotDensityMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boundariesRef = useRef<SVGGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [dots, setDots] = useState<DotDensityPoint[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { mapZoom, setMapZoom } = useUIStore();
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const localSelectRef = useRef(false);
  const prevSelectedRef = useRef<string | null | undefined>(undefined);

  // Create d3 transform from store state
  const transform = useMemo(() =>
    d3.zoomIdentity.translate(mapZoom.x, mapZoom.y).scale(mapZoom.k),
    [mapZoom]
  );

  // Create projection
  const projection = useMemo(
    () => createUKProjection(width, height),
    [width, height]
  );

  // Get features from GeoJSON
  const features = useMemo(() => {
    if (!boundaries) return [];
    return boundaries.features as ConstituencyFeature[];
  }, [boundaries]);

  // Path generator
  const pathGenerator = useMemo(
    () => d3.geoPath().projection(projection),
    [projection]
  );

  // Create election data lookup for matching boundaries to election results
  const { idByName } = useMemo(() => {
    return createElectionLookup(electionData);
  }, [electionData]);

  // Reverse lookup: election ID → boundary feature (for external zoom-to-constituency)
  const featureByElectionId = useMemo(() => {
    const map = new Map<string, ConstituencyFeature>();
    features.forEach(f => {
      const matchName = getBoundaryMatchName(f.properties);
      const id = idByName.get(matchName);
      if (id) map.set(id, f);
    });
    return map;
  }, [features, idByName]);

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

    // Apply stored transform on mount
    if (mapZoom.k !== 1 || mapZoom.x !== 0 || mapZoom.y !== 0) {
      d3.select(svgRef.current).call(
        zoom.transform,
        d3.zoomIdentity.translate(mapZoom.x, mapZoom.y).scale(mapZoom.k)
      );
    }

    return () => {
      d3.select(svgRef.current).on('.zoom', null);
    };
  }, [width, height, setMapZoom]); // Don't include mapZoom to avoid loop

  // Generate dots when data changes (with caching)
  useEffect(() => {
    if (features.length === 0 || electionData.length === 0) {
      setDots([]);
      return;
    }

    const cacheKey = getCacheKey(electionData, votesPerDot);

    // Check cache first
    if (dotsCache.has(cacheKey)) {
      setDots(dotsCache.get(cacheKey)!);
      setIsGenerating(false);
      return;
    }

    setIsGenerating(true);

    // Use requestIdleCallback for non-blocking generation
    const handle = requestIdleCallback(
      () => {
        const voteMap = electionResultsToVoteMap(electionData);
        const generatedDots = generateAllDots(features, voteMap, projection, {
          votesPerDot,
          minDistance: 2,
          maxIterations: 1000,
        });

        // Cache the result
        if (dotsCache.size >= MAX_CACHE_SIZE) {
          // Remove oldest entry
          const firstKey = dotsCache.keys().next().value;
          if (firstKey) dotsCache.delete(firstKey);
        }
        dotsCache.set(cacheKey, generatedDots);

        setDots(generatedDots);
        setIsGenerating(false);
      },
      { timeout: 5000 }
    );

    return () => cancelIdleCallback(handle);
  }, [features, electionData, projection, votesPerDot]);

  // Draw dots on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Apply zoom transform
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    // Draw each dot
    dots.forEach((dot) => {
      ctx.beginPath();
      // Scale dot size inversely with zoom to maintain visual size
      const scaledRadius = 1.5 / Math.sqrt(transform.k);
      ctx.arc(dot.x, dot.y, scaledRadius, 0, 2 * Math.PI);
      ctx.fillStyle = getPartyColor(dot.partyId);
      ctx.globalAlpha = 0.8;
      ctx.fill();
    });

    ctx.restore();
    ctx.globalAlpha = 1;
  }, [dots, width, height, transform]);

  // Handle mouse movement for constituency detection
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Get screen coordinates
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Invert the zoom transform to get map coordinates
      const mapX = (screenX - transform.x) / transform.k;
      const mapY = (screenY - transform.y) / transform.k;

      const point = projection.invert?.([mapX, mapY]);

      if (!point) return;

      // Find constituency containing point
      const constituency = features.find((f) => d3.geoContains(f, point));

      if (constituency) {
        const matchName = getBoundaryMatchName(constituency.properties);
        const electionId = idByName.get(matchName) || null;
        setTooltip({
          constituencyName: getBoundaryDisplayName(constituency.properties),
          x: e.clientX,
          y: e.clientY,
        });
        onConstituencyHover?.(electionId);
      } else {
        setTooltip(null);
        onConstituencyHover?.(null);
      }
    },
    [features, projection, onConstituencyHover, transform, idByName]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    onConstituencyHover?.(null);
  }, [onConstituencyHover]);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Get screen coordinates
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Invert the zoom transform to get map coordinates
      const mapX = (screenX - transform.x) / transform.k;
      const mapY = (screenY - transform.y) / transform.k;

      const point = projection.invert?.([mapX, mapY]);

      if (!point) return;

      const constituency = features.find((f) => d3.geoContains(f, point));
      const matchName = constituency ? getBoundaryMatchName(constituency.properties) : '';
      const electionId = matchName ? idByName.get(matchName) : undefined;

      // If clicking on a new constituency, zoom to it
      if (constituency && electionId && selectedConstituencyId !== electionId && svgRef.current && zoomRef.current) {
        // Get the bounding box of the constituency in pixel coordinates
        const bounds = pathGenerator.bounds(constituency);
        const [[x0, y0], [x1, y1]] = bounds;
        const bboxWidth = x1 - x0;
        const bboxHeight = y1 - y0;
        const bboxCenterX = (x0 + x1) / 2;
        const bboxCenterY = (y0 + y1) / 2;

        // Calculate scale to make constituency 25% of view width
        const targetWidth = width * 0.25;
        const scale = Math.min(targetWidth / bboxWidth, (height * 0.5) / bboxHeight, 8);

        // Calculate translation to center the constituency
        const translateX = width / 2 - bboxCenterX * scale;
        const translateY = height / 2 - bboxCenterY * scale;

        // Apply zoom transform with animation
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
    [features, projection, selectedConstituencyId, onConstituencySelect, transform, pathGenerator, width, height, idByName]
  );

  // Zoom to constituency when selected externally (e.g. from ternary plot)
  useEffect(() => {
    if (selectedConstituencyId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedConstituencyId;

    if (localSelectRef.current) {
      localSelectRef.current = false;
      return;
    }

    if (!selectedConstituencyId || !svgRef.current || !zoomRef.current) return;

    const feature = featureByElectionId.get(selectedConstituencyId);
    if (!feature) return;

    const bounds = pathGenerator.bounds(feature);
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
  }, [selectedConstituencyId, featureByElectionId, pathGenerator, width, height]);

  if (width === 0 || height === 0) {
    return null;
  }

  return (
    <div className="relative" style={{ width, height }}>
      {/* Canvas layer for dots */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          width,
          height,
          pointerEvents: 'none',
        }}
      />

      {/* SVG layer for boundaries and interactions */}
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
        <title>UK Election Results Map</title>

        {/* Constituency boundaries */}
        <g
          ref={boundariesRef}
          className="boundaries"
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
        >
          {features.map((feat, idx) => {
            const matchName = getBoundaryMatchName(feat.properties);
            const electionId = idByName.get(matchName);
            const isHighlighted =
              hoveredConstituencyId === electionId || selectedConstituencyId === electionId;

            return (
              <path
                key={electionId || idx}
                d={pathGenerator(feat) ?? ''}
                fill="transparent"
                stroke={isHighlighted ? '#000' : '#9ca3af'}
                strokeWidth={(isHighlighted ? 2 : 0.5) / transform.k}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
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
            className="flex items-center justify-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50"
            title="Reset zoom"
          >
            Reset
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-white/90 rounded-lg shadow p-2 text-xs">
        <div className="flex items-center gap-2 mb-2">
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
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#DC241f' }} />
            <span>Lab</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#0087DC' }} />
            <span>Con</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#FDBB30' }} />
            <span>LD</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#808080' }} />
            <span>Other</span>
          </div>
        </div>
      </div>

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
          {tooltip.constituencyName}
        </div>
      )}

      {/* Loading indicator */}
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
