import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import type { ElectionResult } from '@/types/election';
import { getPartyById } from '@/types/party';
import { createUKProjection } from '@/utils/d3/dotDensity';
import { useUIStore } from '@/store/uiStore';
import {
  type BoundaryProperties,
  getBoundaryDisplayName,
  getBoundaryMatchName,
  normalizeConstituencyName,
} from '@/utils/constituencyMatching';

type ConstituencyFeature = Feature<Polygon | MultiPolygon, BoundaryProperties>;

interface SmallMultiplesMapProps {
  electionData: ElectionResult[];
  boundaries: FeatureCollection<Polygon | MultiPolygon, BoundaryProperties> | null;
  width: number;
  height: number;
  selectedConstituencyId?: string | null;
  hoveredConstituencyId?: string | null;
  onConstituencyHover?: (id: string | null) => void;
  onConstituencySelect?: (id: string | null) => void;
}

interface TooltipData {
  constituencyName: string;
  partyName: string;
  voteShare: number;
  x: number;
  y: number;
}

interface TopParty {
  partyId: string;
  totalVotes: number;
  color: string;
  shortName: string;
}

// Grid positions for 2x2 layout
const GRID_POSITIONS = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
];

export function SmallMultiplesMap({
  electionData,
  boundaries,
  width,
  height,
  selectedConstituencyId,
  hoveredConstituencyId,
  onConstituencyHover,
  onConstituencySelect,
}: SmallMultiplesMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const { mapZoom, setMapZoom } = useUIStore();
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Panel dimensions
  const panelWidth = width / 2;
  const panelHeight = height / 2;

  // Create d3 transform from store state
  const transform = useMemo(
    () => d3.zoomIdentity.translate(mapZoom.x, mapZoom.y).scale(mapZoom.k),
    [mapZoom]
  );

  // Create projection sized for each panel
  const projection = useMemo(
    () => createUKProjection(panelWidth, panelHeight),
    [panelWidth, panelHeight]
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

  // Calculate top 4 parties by national vote share
  const topParties = useMemo((): TopParty[] => {
    const partyVotes = new Map<string, number>();

    for (const result of electionData) {
      for (const partyResult of result.results) {
        const partyId = partyResult.partyId.toLowerCase();
        const current = partyVotes.get(partyId) || 0;
        partyVotes.set(partyId, current + partyResult.votes);
      }
    }

    return Array.from(partyVotes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([partyId, totalVotes]) => {
        const party = getPartyById(partyId);
        return {
          partyId,
          totalVotes,
          color: party.color,
          shortName: party.shortName,
        };
      });
  }, [electionData]);

  // Create vote share lookup: normalized name -> partyId -> voteShare
  const voteShareByConstituency = useMemo(() => {
    const map = new Map<string, Map<string, number>>();

    for (const result of electionData) {
      const normalizedName = normalizeConstituencyName(result.constituencyName);
      const partyShares = new Map<string, number>();

      for (const partyResult of result.results) {
        partyShares.set(partyResult.partyId.toLowerCase(), partyResult.voteShare);
      }

      map.set(normalizedName, partyShares);
    }

    return map;
  }, [electionData]);

  // Create ID lookup: normalized name -> constituency ID
  const idByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of electionData) {
      const normalizedName = normalizeConstituencyName(result.constituencyName);
      map.set(normalizedName, result.constituencyId);
    }
    return map;
  }, [electionData]);

  // Create color scales for each party (white to party color)
  const colorScales = useMemo(() => {
    const scales = new Map<string, d3.ScaleLinear<string, string>>();
    for (const party of topParties) {
      scales.set(
        party.partyId,
        d3.scaleLinear<string>()
          .domain([0, 50])
          .range(['#f8f8f8', party.color])
          .clamp(true)
      );
    }
    return scales;
  }, [topParties]);

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
  }, [width, height, setMapZoom]);

  // Handle mouse move - determine which panel and constituency
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Determine which panel
      const panelCol = screenX < panelWidth ? 0 : 1;
      const panelRow = screenY < panelHeight ? 0 : 1;
      const panelIdx = panelRow * 2 + panelCol;

      if (panelIdx >= topParties.length) return;

      const party = topParties[panelIdx];

      // Convert to local panel coordinates
      const localX = screenX - panelCol * panelWidth;
      const localY = screenY - panelRow * panelHeight;

      // Apply inverse transform to get map coordinates
      const mapX = (localX - transform.x) / transform.k;
      const mapY = (localY - transform.y) / transform.k;

      const point = projection.invert?.([mapX, mapY]);
      if (!point) {
        setTooltip(null);
        onConstituencyHover?.(null);
        return;
      }

      const constituency = features.find((f) => d3.geoContains(f, point));

      if (constituency) {
        const matchName = getBoundaryMatchName(constituency.properties);
        const displayName = getBoundaryDisplayName(constituency.properties);
        const electionId = idByName.get(matchName) || '';
        const voteShare = voteShareByConstituency.get(matchName)?.get(party.partyId) || 0;

        setTooltip({
          constituencyName: displayName,
          partyName: party.shortName,
          voteShare,
          x: e.clientX,
          y: e.clientY,
        });
        onConstituencyHover?.(electionId || null);
      } else {
        setTooltip(null);
        onConstituencyHover?.(null);
      }
    },
    [features, projection, onConstituencyHover, transform, topParties, panelWidth, panelHeight, idByName, voteShareByConstituency]
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

      // Determine which panel
      const panelCol = screenX < panelWidth ? 0 : 1;
      const panelRow = screenY < panelHeight ? 0 : 1;

      // Convert to local panel coordinates
      const localX = screenX - panelCol * panelWidth;
      const localY = screenY - panelRow * panelHeight;

      // Apply inverse transform to get map coordinates
      const mapX = (localX - transform.x) / transform.k;
      const mapY = (localY - transform.y) / transform.k;

      const point = projection.invert?.([mapX, mapY]);
      if (!point) return;

      const constituency = features.find((f) => d3.geoContains(f, point));
      const matchName = constituency ? getBoundaryMatchName(constituency.properties) : '';
      const electionId = matchName ? idByName.get(matchName) : undefined;

      onConstituencySelect?.(
        selectedConstituencyId === electionId ? null : electionId || null
      );
    },
    [features, projection, selectedConstituencyId, onConstituencySelect, transform, panelWidth, panelHeight, idByName]
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
        aria-label="Small multiples map showing vote share by party"
      >
        <title>UK Election Results - Vote Share by Party</title>

        {/* Clip paths for each panel */}
        <defs>
          {GRID_POSITIONS.map((_, idx) => (
            <clipPath key={idx} id={`panel-clip-${idx}`}>
              <rect width={panelWidth} height={panelHeight} />
            </clipPath>
          ))}
          {/* Gradient definitions for legends */}
          {topParties.map((party) => (
            <linearGradient key={party.partyId} id={`gradient-${party.partyId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f8f8f8" />
              <stop offset="100%" stopColor={party.color} />
            </linearGradient>
          ))}
        </defs>

        {/* Render each panel */}
        {topParties.map((party, idx) => {
          const pos = GRID_POSITIONS[idx];
          const colorScale = colorScales.get(party.partyId);

          return (
            <g
              key={party.partyId}
              transform={`translate(${pos.col * panelWidth}, ${pos.row * panelHeight})`}
              clipPath={`url(#panel-clip-${idx})`}
            >
              {/* Panel background */}
              <rect width={panelWidth} height={panelHeight} fill="#f3f4f6" />

              {/* Map group with zoom transform */}
              <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
                {features.map((feat, featIdx) => {
                  const matchName = getBoundaryMatchName(feat.properties);
                  const electionId = idByName.get(matchName);
                  const voteShare = voteShareByConstituency.get(matchName)?.get(party.partyId) || 0;
                  const isHighlighted = hoveredConstituencyId === electionId || selectedConstituencyId === electionId;

                  return (
                    <path
                      key={electionId || featIdx}
                      d={pathGenerator(feat) ?? ''}
                      fill={colorScale ? colorScale(voteShare) : '#ddd'}
                      stroke={isHighlighted ? '#000' : '#fff'}
                      strokeWidth={(isHighlighted ? 1.5 : 0.3) / transform.k}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                })}
              </g>

              {/* Party label */}
              <rect x={4} y={4} width={60} height={20} fill="white" fillOpacity={0.9} rx={2} />
              <text x={8} y={18} className="text-xs font-semibold" fill={party.color}>
                {party.shortName}
              </text>

              {/* Legend */}
              <g transform={`translate(${panelWidth - 75}, ${panelHeight - 24})`}>
                <rect x={0} y={0} width={70} height={20} fill="white" fillOpacity={0.9} rx={2} />
                <rect x={4} y={8} width={40} height={6} fill={`url(#gradient-${party.partyId})`} rx={1} />
                <text x={4} y={6} className="text-[8px]" fill="#666">0%</text>
                <text x={34} y={6} className="text-[8px]" fill="#666">50%</text>
              </g>

              {/* Panel border */}
              <rect
                width={panelWidth}
                height={panelHeight}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth={1}
              />
            </g>
          );
        })}
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
          <div className="flex items-center gap-2 mt-1">
            <span className="text-gray-600 text-xs">
              {tooltip.partyName}: {tooltip.voteShare.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
