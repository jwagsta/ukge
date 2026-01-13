import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import type { ElectionResult } from '@/types/election';
import { getPartyColor } from '@/types/party';
import { createUKProjection } from '@/utils/d3/dotDensity';
import { useUIStore } from '@/store/uiStore';

interface ConstituencyProperties {
  PCON13CD?: string;
  PCON13NM?: string;
  PCON24CD?: string;
  PCON24NM?: string;
  id?: string;
  name?: string;
}

type ConstituencyFeature = Feature<Polygon | MultiPolygon, ConstituencyProperties>;

interface ChoroplethMapProps {
  electionData: ElectionResult[];
  boundaries: FeatureCollection<Polygon | MultiPolygon, ConstituencyProperties> | null;
  width: number;
  height: number;
  selectedConstituencyId?: string | null;
  hoveredConstituencyId?: string | null;
  onConstituencyHover?: (id: string | null) => void;
  onConstituencySelect?: (id: string | null) => void;
}

interface TooltipData {
  constituencyName: string;
  winner: string;
  x: number;
  y: number;
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
}: ChoroplethMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const { mapZoom, setMapZoom } = useUIStore();
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

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

  // Create a map of constituency ID to winner
  const winnerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of electionData) {
      map.set(result.constituencyId, result.winner);
    }
    return map;
  }, [electionData]);

  // Create a map of constituency ID to name
  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of electionData) {
      map.set(result.constituencyId, result.constituencyName);
    }
    return map;
  }, [electionData]);

  // Initialize zoom behavior
  useEffect(() => {
    if (!svgRef.current) return;

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const mapX = (screenX - transform.x) / transform.k;
      const mapY = (screenY - transform.y) / transform.k;
      const point = projection.invert?.([mapX, mapY]);

      if (!point) return;

      const constituency = features.find((f) => d3.geoContains(f, point));

      if (constituency) {
        const id = constituency.properties?.PCON13CD || constituency.properties?.PCON24CD || constituency.properties?.id || '';
        const name = nameMap.get(id) || constituency.properties?.PCON13NM || constituency.properties?.PCON24NM || constituency.properties?.name || '';
        const winner = winnerMap.get(id) || '';

        setTooltip({
          constituencyName: name,
          winner,
          x: e.clientX,
          y: e.clientY,
        });
        onConstituencyHover?.(id || null);
      } else {
        setTooltip(null);
        onConstituencyHover?.(null);
      }
    },
    [features, projection, onConstituencyHover, transform, winnerMap, nameMap]
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
      const mapX = (screenX - transform.x) / transform.k;
      const mapY = (screenY - transform.y) / transform.k;
      const point = projection.invert?.([mapX, mapY]);

      if (!point) return;

      const constituency = features.find((f) => d3.geoContains(f, point));
      const id = constituency?.properties?.PCON13CD || constituency?.properties?.PCON24CD || constituency?.properties?.id;

      // If clicking on a new constituency, zoom to it
      if (constituency && id && selectedConstituencyId !== id && svgRef.current && zoomRef.current) {
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

      onConstituencySelect?.(
        selectedConstituencyId === id ? null : id || null
      );
    },
    [features, projection, selectedConstituencyId, onConstituencySelect, transform, pathGenerator, width, height]
  );

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
        <title>UK Election Results Map</title>

        {/* Constituency fills */}
        <g
          ref={gRef}
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
        >
          {features.map((feat) => {
            const id = feat.properties?.PCON13CD || feat.properties?.PCON24CD || feat.properties?.id;
            const winner = id ? winnerMap.get(id) : undefined;
            const isHighlighted =
              hoveredConstituencyId === id || selectedConstituencyId === id;

            return (
              <path
                key={id}
                d={pathGenerator(feat) ?? ''}
                fill={winner ? getPartyColor(winner) : '#ddd'}
                fillOpacity={winner ? (isHighlighted ? 1 : 0.85) : 0.5}
                stroke={isHighlighted ? '#000' : '#fff'}
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
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded" style={{ backgroundColor: '#DC241f' }} />
            <span>Lab</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded" style={{ backgroundColor: '#0087DC' }} />
            <span>Con</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded" style={{ backgroundColor: '#FDBB30' }} />
            <span>LD</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded" style={{ backgroundColor: '#FDF38E' }} />
            <span>SNP</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded" style={{ backgroundColor: '#808080' }} />
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
          <div className="font-medium">{tooltip.constituencyName}</div>
          {tooltip.winner && (
            <div className="flex items-center gap-2 mt-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getPartyColor(tooltip.winner) }}
              />
              <span className="text-gray-600 text-xs">{tooltip.winner.toUpperCase()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
