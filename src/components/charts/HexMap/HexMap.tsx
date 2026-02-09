import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { ElectionResult } from '@/types/election';
import { getPartyColor } from '@/types/party';
import { useUIStore } from '@/store/uiStore';
import type { BoundaryProperties } from '@/utils/constituencyMatching';
import { computeHexLayout, hexToPixel, hexPath } from '@/utils/hexLayout';

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
  const localSelectRef = useRef(false);
  const prevSelectedRef = useRef<string | null | undefined>(undefined);

  // Generate hex positions from constituency data and boundaries
  const hexPositions = useMemo(() => {
    if (electionData.length === 0) return [];
    return computeHexLayout(electionData, boundaries);
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
      .scaleExtent([0.5, 20])
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

    localSelectRef.current = true;
    onConstituencySelect?.(
      selectedConstituencyId === constituencyId ? null : constituencyId
    );
  }, [selectedConstituencyId, onConstituencySelect, hexPositions, hexSize, offsetX, offsetY, width, height]);

  // Zoom to constituency when selected externally (e.g. from ternary plot)
  useEffect(() => {
    if (selectedConstituencyId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedConstituencyId;

    if (localSelectRef.current) {
      localSelectRef.current = false;
      return;
    }

    if (!selectedConstituencyId || !svgRef.current || !zoomRef.current) return;

    const hexPos = hexPositions.find(p => p.constituencyId === selectedConstituencyId);
    if (!hexPos) return;

    const { x, y } = hexToPixel(hexPos.q, hexPos.r, hexSize);
    const hexCenterX = x + offsetX;
    const hexCenterY = y + offsetY;

    const targetSize = width * 0.25;
    const scale = Math.min(targetSize / (hexSize * 4), 8);

    const translateX = width / 2 - hexCenterX * scale;
    const translateY = height / 2 - hexCenterY * scale;

    d3.select(svgRef.current)
      .transition()
      .duration(500)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(translateX, translateY).scale(scale)
      );
  }, [selectedConstituencyId, hexPositions, hexSize, offsetX, offsetY, width, height]);

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
