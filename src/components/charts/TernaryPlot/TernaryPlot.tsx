import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { TernaryDataPoint, ElectionResult } from '@/types/election';
import { getPartyColor } from '@/types/party';
import { useElectionStore } from '@/store/electionStore';
import { useUIStore } from '@/store/uiStore';
import {
  transformTernaryPoints,
  generateTrianglePath,
  generateGridLines,
  barycentricToCartesian,
  TernaryCoordinate,
} from '@/utils/d3/ternaryHelpers';

interface TernaryPlotProps {
  data: TernaryDataPoint[];
  width: number;
  height: number;
  selectedConstituencyId?: string | null;
  hoveredConstituencyId?: string | null;
  onConstituencySelect?: (id: string | null) => void;
  onConstituencyHover?: (id: string | null) => void;
}

interface TooltipData {
  point: TernaryDataPoint;
  x: number;
  y: number;
}

interface AnimatedPoint extends TernaryDataPoint, TernaryCoordinate {
  targetX: number;
  targetY: number;
}

interface TrajectoryPoint {
  year: number;
  labour: number;
  conservative: number;
  other: number;
  winner: string;
  x: number;
  y: number;
}

const ANIMATION_DURATION = 800; // ms

// Cache for trajectory data
const trajectoryCache = new Map<string, TrajectoryPoint[]>();

export function TernaryPlot({
  data,
  width,
  height,
  selectedConstituencyId,
  hoveredConstituencyId,
  onConstituencySelect,
  onConstituencyHover,
}: TernaryPlotProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [animatedPoints, setAnimatedPoints] = useState<AnimatedPoint[]>([]);
  const [trajectoryData, setTrajectoryData] = useState<TrajectoryPoint[]>([]);
  const previousPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const animationRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { availableYears, currentYear } = useElectionStore();
  const { ternaryZoom, setTernaryZoom, resetTernaryZoom } = useUIStore();

  // Margins for labels: top needs less, bottom/sides need more for labels
  const marginTop = 25;
  const marginBottom = 45;
  const marginSide = 45;

  // Triangle geometry: extends radius up, 0.5*radius down, 0.866*radius to sides
  // Calculate max radius that fits in each dimension
  const maxRadiusFromWidth = (width - 2 * marginSide) / (2 * 0.866);
  const maxRadiusFromHeight = (height - marginTop - marginBottom) / 1.5;
  const radius = Math.min(maxRadiusFromWidth, maxRadiusFromHeight);

  // Position center so triangle fits with margins
  const centerX = width / 2;
  const centerY = marginTop + radius; // Top vertex at marginTop from top

  const config = useMemo(
    () => ({
      width,
      height,
      padding: Math.min(marginTop, marginSide),
      labels: ['Labour', 'Conservative', 'Other'] as [string, string, string],
    }),
    [width, height]
  );

  const targetPoints = useMemo(
    () => transformTernaryPoints(data, config, radius, centerX, centerY),
    [data, config, radius, centerX, centerY]
  );

  // Animate points when data changes
  useEffect(() => {
    if (targetPoints.length === 0) {
      setAnimatedPoints([]);
      return;
    }

    // Cancel any running animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startTime = performance.now();
    const previousPositions = previousPositionsRef.current;

    // Initialize animated points with starting positions
    const initialPoints: AnimatedPoint[] = targetPoints.map(point => {
      const prev = previousPositions.get(point.constituencyId);
      return {
        ...point,
        x: prev?.x ?? point.x,
        y: prev?.y ?? point.y,
        targetX: point.x,
        targetY: point.y,
      };
    });

    setAnimatedPoints(initialPoints);

    // Animation loop
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

      // Ease-out function for smoother animation
      const eased = 1 - Math.pow(1 - progress, 3);

      const updatedPoints: AnimatedPoint[] = initialPoints.map(point => {
        const startX = previousPositions.get(point.constituencyId)?.x ?? point.targetX;
        const startY = previousPositions.get(point.constituencyId)?.y ?? point.targetY;

        return {
          ...point,
          x: startX + (point.targetX - startX) * eased,
          y: startY + (point.targetY - startY) * eased,
        };
      });

      setAnimatedPoints(updatedPoints);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete - save final positions
        const newPositions = new Map<string, { x: number; y: number }>();
        updatedPoints.forEach(p => {
          newPositions.set(p.constituencyId, { x: p.targetX, y: p.targetY });
        });
        previousPositionsRef.current = newPositions;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetPoints]);

  // Fetch trajectory data for selected constituency
  useEffect(() => {
    if (!selectedConstituencyId) {
      setTrajectoryData([]);
      return;
    }

    // Check cache first
    const cached = trajectoryCache.get(selectedConstituencyId);
    if (cached) {
      // Recalculate coordinates for current radius
      const updated = cached.map(p => {
        const coord = barycentricToCartesian(p.labour, p.conservative, p.other, radius);
        return { ...p, x: coord.x + centerX, y: coord.y + centerY };
      });
      setTrajectoryData(updated);
      return;
    }

    // Get current constituency name for matching
    const currentPoint = data.find(d => d.constituencyId === selectedConstituencyId);
    if (!currentPoint) return;

    const fetchTrajectory = async () => {
      const points: TrajectoryPoint[] = [];

      for (const year of availableYears) {
        try {
          const response = await fetch(`/data/elections/${year}.json`);
          if (!response.ok) continue;

          const electionData = await response.json();
          const constituencies: ElectionResult[] = electionData.constituencies || [];

          // Find by ID or name
          let match = constituencies.find(c => c.constituencyId === selectedConstituencyId);
          if (!match) {
            match = constituencies.find(
              c => c.constituencyName.toLowerCase() === currentPoint.constituencyName.toLowerCase()
            );
          }

          if (match) {
            const labResult = match.results.find(r =>
              r.partyId.toLowerCase() === 'lab' || r.partyId.toLowerCase() === 'labour'
            );
            const conResult = match.results.find(r =>
              r.partyId.toLowerCase() === 'con' || r.partyId.toLowerCase() === 'conservative'
            );

            const labVotes = labResult?.votes ?? 0;
            const conVotes = conResult?.votes ?? 0;
            const otherVotes = match.validVotes - labVotes - conVotes;
            const total = match.validVotes || 1;

            const labour = labVotes / total;
            const conservative = conVotes / total;
            const other = Math.max(0, otherVotes / total);

            const coord = barycentricToCartesian(labour, conservative, other, radius);

            points.push({
              year,
              labour,
              conservative,
              other,
              winner: match.winner,
              x: coord.x + centerX,
              y: coord.y + centerY,
            });
          }
        } catch {
          // Skip failed fetches
        }
      }

      points.sort((a, b) => a.year - b.year);

      // Cache without coordinates (we'll recalculate on retrieval)
      trajectoryCache.set(selectedConstituencyId, points.map(p => ({
        ...p,
        x: 0, y: 0 // Will be recalculated
      })));

      setTrajectoryData(points);
    };

    fetchTrajectory();
  }, [selectedConstituencyId, data, availableYears, radius, centerX, centerY]);

  // Set up d3 zoom behavior
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    if (!svgRef.current || width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 8])
      .on('zoom', (event) => {
        const { k, x, y } = event.transform;
        setTernaryZoom({ k, x, y });
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    // Apply stored transform on mount
    if (ternaryZoom.k !== 1 || ternaryZoom.x !== 0 || ternaryZoom.y !== 0) {
      svg.call(
        zoom.transform,
        d3.zoomIdentity.translate(ternaryZoom.x, ternaryZoom.y).scale(ternaryZoom.k)
      );
    }

    return () => {
      svg.on('.zoom', null);
    };
  }, [width, height, setTernaryZoom]); // Don't include ternaryZoom to avoid infinite loop

  // Handle zoom reset
  const handleResetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity);
    }
    resetTernaryZoom();
  }, [resetTernaryZoom]);

  // Handle zoom in/out
  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.5);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.67);
    }
  }, []);

  const trianglePath = useMemo(
    () => generateTrianglePath(radius),
    [radius]
  );

  const gridLines = useMemo(
    () => generateGridLines(radius, 10),
    [radius]
  );

  const handlePointMouseEnter = useCallback(
    (point: AnimatedPoint, event: React.MouseEvent) => {
      setTooltip({
        point,
        x: event.clientX,
        y: event.clientY,
      });
      onConstituencyHover?.(point.constituencyId);
    },
    [onConstituencyHover]
  );

  const handlePointMouseLeave = useCallback(() => {
    setTooltip(null);
    onConstituencyHover?.(null);
  }, [onConstituencyHover]);

  const handlePointClick = useCallback(
    (point: TernaryDataPoint) => {
      onConstituencySelect?.(
        selectedConstituencyId === point.constituencyId ? null : point.constituencyId
      );
    },
    [selectedConstituencyId, onConstituencySelect]
  );

  if (width === 0 || height === 0) {
    return null;
  }

  const isZoomed = ternaryZoom.k !== 1 || ternaryZoom.x !== 0 || ternaryZoom.y !== 0;

  return (
    <div className="relative" style={{ width, height }}>
      {/* Zoom controls */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
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
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-gray-500">
              <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
              <path d="M8 1v3.5l2.5-1.75L8 1z" />
            </svg>
            Reset
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label="Ternary plot showing vote share distribution across constituencies"
        style={{ cursor: 'grab' }}
      >
        <title>UK Election Results Ternary Plot</title>
        <desc>
          Triangle plot showing Labour, Conservative, and Other party vote shares
          for {data.length} constituencies
        </desc>

        {/* Zoom container */}
        <g transform={`translate(${ternaryZoom.x}, ${ternaryZoom.y}) scale(${ternaryZoom.k})`}>
        <g transform={`translate(${centerX}, ${centerY})`}>
          {/* Grid lines */}
          <g className="grid-lines" opacity={0.15}>
            {gridLines.map((line, i) => (
              <line
                key={i}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="#999"
                strokeWidth={0.5}
              />
            ))}
          </g>

          {/* Triangle boundary */}
          <path
            d={trianglePath}
            fill="none"
            stroke="#333"
            strokeWidth={2}
          />

          {/* Triangle vertices */}
          {(() => {
            const top = { x: 0, y: -radius }; // Labour (top)
            const bottomRight = { x: radius * Math.cos(Math.PI / 6), y: radius * Math.sin(Math.PI / 6) }; // Conservative
            const bottomLeft = { x: -radius * Math.cos(Math.PI / 6), y: radius * Math.sin(Math.PI / 6) }; // Other

            // Tick marks along each edge (0%, 25%, 50%, 75%, 100%)
            const ticks = [0, 0.25, 0.5, 0.75, 1];
            const tickLength = 6;

            return (
              <>
                {/* Left edge: Other to Labour (Labour % increases going up) - ticks point left (outward) */}
                {ticks.map((t, i) => {
                  const x = bottomLeft.x + (top.x - bottomLeft.x) * t;
                  const y = bottomLeft.y + (top.y - bottomLeft.y) * t;
                  // Perpendicular outward (to the left)
                  const angle = Math.atan2(top.y - bottomLeft.y, top.x - bottomLeft.x) - Math.PI / 2;
                  return (
                    <g key={`left-${i}`}>
                      <line
                        x1={x}
                        y1={y}
                        x2={x + Math.cos(angle) * tickLength}
                        y2={y + Math.sin(angle) * tickLength}
                        stroke="#666"
                        strokeWidth={1}
                      />
                      {t > 0 && (
                        <text
                          x={x + Math.cos(angle) * (tickLength + 10)}
                          y={y + Math.sin(angle) * (tickLength + 10)}
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          className="text-[10px] fill-gray-400"
                        >
                          {Math.round(t * 100)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Right edge: Labour to Conservative (Conservative % increases going down-right) - ticks point right (outward) */}
                {ticks.map((t, i) => {
                  const x = top.x + (bottomRight.x - top.x) * t;
                  const y = top.y + (bottomRight.y - top.y) * t;
                  // Perpendicular outward (to the right): use opposite rotation from left edge
                  const edgeAngle = Math.atan2(bottomRight.y - top.y, bottomRight.x - top.x);
                  const angle = edgeAngle - Math.PI / 2;
                  return (
                    <g key={`right-${i}`}>
                      <line
                        x1={x}
                        y1={y}
                        x2={x + Math.cos(angle) * tickLength}
                        y2={y + Math.sin(angle) * tickLength}
                        stroke="#666"
                        strokeWidth={1}
                      />
                      {t > 0 && (
                        <text
                          x={x + Math.cos(angle) * (tickLength + 10)}
                          y={y + Math.sin(angle) * (tickLength + 10)}
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          className="text-[10px] fill-gray-400"
                        >
                          {Math.round(t * 100)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Bottom edge: Conservative to Other (Other % increases going left) - ticks point down (outward) */}
                {ticks.map((t, i) => {
                  const x = bottomRight.x + (bottomLeft.x - bottomRight.x) * t;
                  const y = bottomRight.y;
                  return (
                    <g key={`bottom-${i}`}>
                      <line
                        x1={x}
                        y1={y}
                        x2={x}
                        y2={y + tickLength}
                        stroke="#666"
                        strokeWidth={1}
                      />
                      {t > 0 && (
                        <text
                          x={x}
                          y={y + tickLength + 10}
                          textAnchor="middle"
                          className="text-[10px] fill-gray-400"
                        >
                          {Math.round(t * 100)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Edge labels with arrows - centered on edges, offset to avoid tick marks */}
                {/* Left edge label: Labour */}
                <g transform={`translate(${(bottomLeft.x + top.x) / 2 - 35}, ${(bottomLeft.y + top.y) / 2}) rotate(-60)`}>
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    className="text-[12px] font-semibold"
                    fill="#DC241f"
                  >
                    Labour %
                  </text>
                  <path
                    d="M 30 0 L 40 0 M 37 -3 L 40 0 L 37 3"
                    stroke="#DC241f"
                    strokeWidth={1.5}
                    fill="none"
                  />
                </g>

                {/* Right edge label: Conservative */}
                <g transform={`translate(${(top.x + bottomRight.x) / 2 + 35}, ${(top.y + bottomRight.y) / 2}) rotate(60)`}>
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    className="text-[12px] font-semibold"
                    fill="#0087DC"
                  >
                    Conservative %
                  </text>
                  <path
                    d="M 50 0 L 60 0 M 57 -3 L 60 0 L 57 3"
                    stroke="#0087DC"
                    strokeWidth={1.5}
                    fill="none"
                  />
                </g>

                {/* Bottom edge label: Other */}
                <g transform={`translate(${(bottomRight.x + bottomLeft.x) / 2}, ${bottomRight.y + 35})`}>
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    className="text-[12px] font-semibold"
                    fill="#666"
                  >
                    Other %
                  </text>
                  <path
                    d="M -40 0 L -30 0 M -37 -3 L -40 0 L -37 3"
                    stroke="#666"
                    strokeWidth={1.5}
                    fill="none"
                  />
                </g>
              </>
            );
          })()}
        </g>

        {/* Trajectory for selected constituency */}
        {selectedConstituencyId && trajectoryData.length > 1 && (
          <g className="trajectory">
            {/* Path connecting points */}
            <path
              d={trajectoryData.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              fill="none"
              stroke="#333"
              strokeWidth={2}
              opacity={0.8}
            />
            {/* Points with year labels */}
            {trajectoryData.map((p) => {
              const isCurrent = p.year === currentYear;
              return (
                <g key={p.year}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isCurrent ? 5 : 3}
                    fill={getPartyColor(p.winner)}
                    stroke={isCurrent ? '#000' : '#fff'}
                    strokeWidth={isCurrent ? 2 : 1}
                  />
                  <text
                    x={p.x}
                    y={p.y - 8}
                    textAnchor="middle"
                    className={`text-[10px] ${isCurrent ? 'font-bold fill-black' : 'font-medium fill-gray-700'}`}
                  >
                    {p.year.toString().slice(-2)}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Data points */}
        <g className="data-points">
          {animatedPoints.map((point) => {
            const isSelected = selectedConstituencyId === point.constituencyId;
            const isHovered = hoveredConstituencyId === point.constituencyId;
            const isHighlighted = isSelected || isHovered;
            const hasSelection = selectedConstituencyId !== null;

            return (
              <circle
                key={point.constituencyId}
                cx={point.x}
                cy={point.y}
                r={isHighlighted ? 6 : 4}
                fill={getPartyColor(point.winner)}
                fillOpacity={hasSelection && !isHighlighted ? 0.2 : 0.7}
                stroke={isHighlighted ? '#000' : 'none'}
                strokeWidth={isHighlighted ? 2 : 0}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => handlePointMouseEnter(point, e)}
                onMouseLeave={handlePointMouseLeave}
                onClick={() => handlePointClick(point)}
                role="graphics-symbol"
                aria-label={`${point.constituencyName}: Labour ${(point.labour * 100).toFixed(1)}%, Conservative ${(point.conservative * 100).toFixed(1)}%, Other ${(point.other * 100).toFixed(1)}%`}
              />
            );
          })}
        </g>
        </g>{/* Close zoom container */}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-sm"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="font-semibold mb-1">{tooltip.point.constituencyName}</div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: '#DC241f' }}
              />
              <span>Labour: {(tooltip.point.labour * 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: '#0087DC' }}
              />
              <span>Conservative: {(tooltip.point.conservative * 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: '#808080' }}
              />
              <span>Other: {(tooltip.point.other * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t text-xs text-gray-500">
            Winner: {tooltip.point.winner.toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
