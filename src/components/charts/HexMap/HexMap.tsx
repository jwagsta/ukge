import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { ElectionResult } from '@/types/election';
import { getPartyColor } from '@/types/party';
import { useUIStore } from '@/store/uiStore';
import {
  type BoundaryProperties,
  getBoundaryDisplayName,
  getBoundaryMatchName,
  normalizeConstituencyName,
} from '@/utils/constituencyMatching';

type BoundaryData = FeatureCollection<Polygon | MultiPolygon, BoundaryProperties> | null;

interface HexMapProps {
  electionData: ElectionResult[];
  boundaries: BoundaryData;
  width: number;
  height: number;
  selectedConstituencyId?: string | null;
  hoveredConstituencyId?: string | null;
  onConstituencySelect?: (id: string | null) => void;
  onConstituencyHover?: (id: string | null) => void;
}

interface HexPosition {
  q: number; // axial coordinate
  r: number; // axial coordinate
  x: number; // pixel x (for direct positioning)
  y: number; // pixel y
  constituencyId: string;
  constituencyName: string;
}

// Calculate centroid of a GeoJSON geometry
function calculateCentroid(geometry: Polygon | MultiPolygon): [number, number] {
  // Use d3.geoCentroid for accurate geographic centroid
  return d3.geoCentroid(geometry);
}

// Convert geographic coordinates to hex grid positions
function generateGeographicHexPositions(
  constituencies: ElectionResult[],
  boundaries: BoundaryData
): HexPosition[] {
  if (!boundaries || boundaries.features.length === 0) {
    return [];
  }

  // Create a map of boundary features by normalized name
  const boundaryMap = new Map<string, { centroid: [number, number]; name: string }>();

  boundaries.features.forEach(feature => {
    const centroid = calculateCentroid(feature.geometry);
    const displayName = getBoundaryDisplayName(feature.properties);
    const matchName = getBoundaryMatchName(feature.properties);

    if (matchName) {
      boundaryMap.set(matchName, { centroid, name: displayName });
    }
  });

  // Match constituencies to their geographic positions
  const positionsWithGeo: Array<{
    constituencyId: string;
    constituencyName: string;
    lon: number;
    lat: number;
  }> = [];

  constituencies.forEach(c => {
    // Try to find matching boundary using normalized name
    const normalizedName = normalizeConstituencyName(c.constituencyName);
    const boundary = boundaryMap.get(normalizedName);

    if (boundary) {
      positionsWithGeo.push({
        constituencyId: c.constituencyId,
        constituencyName: c.constituencyName,
        lon: boundary.centroid[0],
        lat: boundary.centroid[1],
      });
    }
  });

  if (positionsWithGeo.length === 0) {
    return [];
  }

  // Find bounds of the geographic data
  const lons = positionsWithGeo.map(p => p.lon);
  const lats = positionsWithGeo.map(p => p.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // Normalize to 0-1 range and create hex grid
  // Use more columns than rows since UK is taller than wide
  const gridHeight = Math.ceil(Math.sqrt(positionsWithGeo.length * 2));
  const gridWidth = Math.ceil(positionsWithGeo.length / gridHeight);

  // Convert to hex grid positions
  const hexPositions: HexPosition[] = positionsWithGeo.map(p => {
    // Normalize coordinates (flip lat because SVG y increases downward)
    const normX = (p.lon - minLon) / (maxLon - minLon || 1);
    const normY = 1 - (p.lat - minLat) / (maxLat - minLat || 1);

    // Convert to hex grid coordinates
    // Scale to grid size
    const gridX = normX * gridWidth;
    const gridY = normY * gridHeight;

    // Convert to axial hex coordinates
    const r = Math.round(gridY);
    const q = Math.round(gridX - r / 2);

    return {
      q,
      r,
      x: 0, // Will be calculated later
      y: 0,
      constituencyId: p.constituencyId,
      constituencyName: p.constituencyName,
    };
  });

  // Resolve collisions - if two hexes have the same q,r, shift one
  const occupiedPositions = new Map<string, HexPosition>();

  hexPositions.forEach(pos => {
    let q = pos.q;
    let r = pos.r;
    let key = `${q},${r}`;

    // Spiral outward to find empty spot if occupied
    let radius = 0;
    while (occupiedPositions.has(key) && radius < 20) {
      radius++;
      // Check neighbors in expanding rings
      let found = false;
      for (let dq = -radius; dq <= radius && !found; dq++) {
        for (let dr = -radius; dr <= radius && !found; dr++) {
          if (Math.abs(dq) === radius || Math.abs(dr) === radius) {
            const newQ = pos.q + dq;
            const newR = pos.r + dr;
            const newKey = `${newQ},${newR}`;
            if (!occupiedPositions.has(newKey)) {
              q = newQ;
              r = newR;
              key = newKey;
              found = true;
            }
          }
        }
      }
    }

    pos.q = q;
    pos.r = r;
    occupiedPositions.set(key, pos);
  });

  return hexPositions;
}

// Convert axial coordinates to pixel position
function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (3/2 * q);
  const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
  return { x, y };
}

// Generate hexagon path
function hexPath(size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = size * Math.cos(angle);
    const y = size * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return `M${points.join('L')}Z`;
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
}: HexMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: ElectionResult } | null>(null);
  const { mapZoom, setMapZoom } = useUIStore();
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Generate hex positions from constituency data and boundaries
  const hexPositions = useMemo(() => {
    if (electionData.length === 0) return [];
    return generateGeographicHexPositions(electionData, boundaries);
  }, [electionData, boundaries]);

  // Create lookup map for election data
  const dataMap = useMemo(() => {
    const map = new Map<string, ElectionResult>();
    electionData.forEach(d => map.set(d.constituencyId, d));
    return map;
  }, [electionData]);

  // Calculate hex size and bounds
  const { hexSize, offsetX, offsetY } = useMemo(() => {
    if (hexPositions.length === 0) return { hexSize: 10, offsetX: 0, offsetY: 0 };

    // Find bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const tempSize = 10;

    hexPositions.forEach(pos => {
      const { x, y } = hexToPixel(pos.q, pos.r, tempSize);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    const boundsWidth = maxX - minX + tempSize * 2;
    const boundsHeight = maxY - minY + tempSize * 2;

    // Scale to fit
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

  // Set up zoom behavior
  useEffect(() => {
    if (!svgRef.current || width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 8])
      .on('zoom', (event) => {
        const { k, x, y } = event.transform;
        setMapZoom({ k, x, y });
      });

    zoomRef.current = zoomBehavior;
    svg.call(zoomBehavior);

    // Apply stored transform on mount
    if (mapZoom.k !== 1 || mapZoom.x !== 0 || mapZoom.y !== 0) {
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
      if (hexPos) {
        const { x, y } = hexToPixel(hexPos.q, hexPos.r, hexSize);
        const hexCenterX = x + offsetX;
        const hexCenterY = y + offsetY;

        // Calculate scale to make hex ~25% of view width (hex is small so use larger scale)
        const targetSize = width * 0.25;
        const scale = Math.min(targetSize / (hexSize * 4), 8);

        // Calculate translation to center the hex
        const translateX = width / 2 - hexCenterX * scale;
        const translateY = height / 2 - hexCenterY * scale;

        // Apply zoom transform with animation
        d3.select(svgRef.current)
          .transition()
          .duration(500)
          .call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
          );
      }
    }

    onConstituencySelect?.(
      selectedConstituencyId === constituencyId ? null : constituencyId
    );
  }, [selectedConstituencyId, onConstituencySelect, hexPositions, hexSize, offsetX, offsetY, width, height]);

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

  const hexPathD = hexPath(hexSize * 0.92); // Slightly smaller for gap

  return (
    <div className="relative" style={{ width, height }}>
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
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
        {isZoomed && (
          <button
            onClick={handleResetZoom}
            className="flex items-center justify-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50"
            title="Reset zoom"
          >
            Reset
          </button>
        )}
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ cursor: 'grab', background: '#f8fafc' }}
      >
        <g transform={`translate(${mapZoom.x}, ${mapZoom.y}) scale(${mapZoom.k})`}>
          <g transform={`translate(${offsetX}, ${offsetY})`}>
            {hexPositions.map(pos => {
              const data = dataMap.get(pos.constituencyId);
              if (!data) return null;

              const { x, y } = hexToPixel(pos.q, pos.r, hexSize);
              const isSelected = selectedConstituencyId === pos.constituencyId;
              const isHovered = hoveredConstituencyId === pos.constituencyId;
              const isHighlighted = isSelected || isHovered;

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
                    fill={getPartyColor(data.winner)}
                    fillOpacity={selectedConstituencyId && !isHighlighted ? 0.3 : 0.85}
                    stroke={isHighlighted ? '#000' : '#fff'}
                    strokeWidth={isHighlighted ? 2 : 0.5}
                  />
                </g>
              );
            })}
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
          <div className="text-xs text-gray-600">
            Winner: <span style={{ color: getPartyColor(tooltip.data.winner) }}>
              {tooltip.data.winner.toUpperCase()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
