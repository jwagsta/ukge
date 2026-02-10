import React, { useState, useCallback, useMemo, useRef, useEffect, useId, memo } from 'react';
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

const ANIMATION_DURATION = 600; // ms - slightly faster for snappier feel

// Cache for trajectory data - limited to control memory
const trajectoryCache = new Map<string, TrajectoryPoint[]>();
const MAX_TRAJECTORY_CACHE = 5;

// Module-level position cache - persists across component remounts
// Limited since each constituency has 2 numbers (~16 bytes) but could grow large
const positionCache = new Map<string, { x: number; y: number }>();
const MAX_POSITION_CACHE = 700; // ~1 election worth of constituencies

// Compute dynamic tick positions for a triangle edge by mapping fixed screen-space
// positions back through the inverse zoom transform to find what data-space
// percentage values are visible, then placing ticks at nice round intervals.
function computeEdgeTicks(
  p0: { x: number; y: number }, // edge start (0% end) in center-relative coords
  p1: { x: number; y: number }, // edge end (100% end) in center-relative coords
  zoom: { x: number; y: number; k: number }
): { value: number; x: number; y: number; major: boolean }[] {
  const edge = { x: p1.x - p0.x, y: p1.y - p0.y };
  const edgeLenSq = edge.x * edge.x + edge.y * edge.y;

  // Map fixed screen endpoints back to data space via inverse zoom
  const d0 = { x: (p0.x - zoom.x) / zoom.k, y: (p0.y - zoom.y) / zoom.k };
  const d1 = { x: (p1.x - zoom.x) / zoom.k, y: (p1.y - zoom.y) / zoom.k };

  // Project data-space positions onto the edge to get percentage parameters
  const t0 = ((d0.x - p0.x) * edge.x + (d0.y - p0.y) * edge.y) / edgeLenSq;
  const t1 = ((d1.x - p0.x) * edge.x + (d1.y - p0.y) * edge.y) / edgeLenSq;

  // Visible data range clamped to [0, 1]
  const visMin = Math.max(0, Math.min(t0, t1));
  const visMax = Math.min(1, Math.max(t0, t1));
  const range = visMax - visMin;
  if (range <= 0) return [];

  // Pick the coarsest nice step that gives at least 3 intervals.
  // Searched coarse-to-fine so we always pick the simplest sufficient step.
  const niceSteps = [0.25, 0.1, 0.05, 0.02, 0.01];
  const step = niceSteps.find(s => range / s >= 3) || 0.01;

  // Major ticks (labeled) at coarser intervals to avoid label clutter
  const majorStep = step <= 0.02 ? 0.1 : step <= 0.05 ? 0.25 : step <= 0.1 ? 0.25 : 0.25;

  const ticks: { value: number; x: number; y: number; major: boolean }[] = [];
  const first = Math.ceil((visMin - 1e-9) / step) * step;

  for (let t = first; t <= visMax + step * 0.01; t += step) {
    const val = Math.round(t * 100) / 100;
    if (val < 0 || val > 1) continue;

    // Convert data parameter back to screen position on the fixed edge
    const s = (val - t0) / (t1 - t0);
    if (s < -0.001 || s > 1.001) continue;
    const sc = Math.max(0, Math.min(1, s));

    const isMajor =
      Math.abs(val % majorStep) < 0.001 ||
      Math.abs(val % majorStep - majorStep) < 0.001;

    ticks.push({
      value: val,
      x: p0.x + sc * edge.x,
      y: p0.y + sc * edge.y,
      major: isMajor,
    });
  }

  return ticks;
}

// Outward normal for a triangle edge (clockwise winding in screen coords)
function edgeOutwardNormal(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return { nx: dy / len, ny: -dx / len };
}

// Clamp center-relative zoom offset (zx, zy) so the fixed triangle window
// always shows data within [0,1] on all three axes. The feasible region for
// (zx, zy) at scale k is itself a triangle defined by three half-plane constraints
// derived from requiring each fixed-frame vertex's inverse-zoom to stay inside
// the data triangle.
function clampZoomToTriangle(zx: number, zy: number, k: number, R: number): { x: number; y: number } {
  const a = R * (1 - k) / 2;   // lower bound: zy >= a
  const b = R * (k - 1);       // upper bound: ±√3·zx + zy <= b
  const sqrt3 = Math.sqrt(3);

  const v1 = zy < a;                     // below bottom edge
  const v2 = sqrt3 * zx + zy > b;        // past left data edge
  const v3 = -sqrt3 * zx + zy > b;       // past right data edge

  if (!v1 && !v2 && !v3) return { x: zx, y: zy };

  // Two constraints violated → snap to corner of feasible triangle
  if (v1 && v2) return { x: (b - a) / sqrt3, y: a };
  if (v1 && v3) return { x: -(b - a) / sqrt3, y: a };
  if (v2 && v3) return { x: 0, y: b };

  // Single constraint violated → project onto the violated edge
  if (v1) {
    const xMin = -(b - a) / sqrt3;
    const xMax = (b - a) / sqrt3;
    return { x: Math.max(xMin, Math.min(xMax, zx)), y: a };
  }
  if (v2) {
    // Project onto √3·x + y = b. Normal = (√3, 1), length² = 4.
    const excess = (sqrt3 * zx + zy - b) / 4;
    const px = zx - sqrt3 * excess;
    const py = zy - excess;
    // Clamp to edge segment (between top corner and bottom-right corner)
    if (py < a) return { x: (b - a) / sqrt3, y: a };
    if (py > b) return { x: 0, y: b };
    return { x: px, y: py };
  }
  // v3
  const excess = (-sqrt3 * zx + zy - b) / 4;
  const px = zx + sqrt3 * excess;
  const py = zy - excess;
  if (py < a) return { x: -(b - a) / sqrt3, y: a };
  if (py > b) return { x: 0, y: b };
  return { x: px, y: py };
}

// Memoized axis labels and ticks - recomputes when radius or zoom changes
const AxisDecorations = memo(function AxisDecorations({
  radius,
  zoomX,
  zoomY,
  zoomK,
}: {
  radius: number;
  zoomX: number;
  zoomY: number;
  zoomK: number;
}) {
  const top = { x: 0, y: -radius };
  const bottomRight = { x: radius * Math.cos(Math.PI / 6), y: radius * Math.sin(Math.PI / 6) };
  const bottomLeft = { x: -radius * Math.cos(Math.PI / 6), y: radius * Math.sin(Math.PI / 6) };

  const zoom = { x: zoomX, y: zoomY, k: zoomK };
  const leftTicks = computeEdgeTicks(bottomLeft, top, zoom);
  const rightTicks = computeEdgeTicks(top, bottomRight, zoom);
  const bottomTicks = computeEdgeTicks(bottomRight, bottomLeft, zoom);

  const leftNorm = edgeOutwardNormal(bottomLeft, top);
  const rightNorm = edgeOutwardNormal(top, bottomRight);
  const bottomNorm = edgeOutwardNormal(bottomRight, bottomLeft);

  const tickLen = 6;

  function renderTicks(
    ticks: ReturnType<typeof computeEdgeTicks>,
    norm: { nx: number; ny: number },
    keyPrefix: string
  ) {
    return ticks.map(({ value, x, y }) => (
      <g key={`${keyPrefix}-${value}`}>
        <line
          x1={x} y1={y}
          x2={x + norm.nx * tickLen} y2={y + norm.ny * tickLen}
          stroke="#666"
          strokeWidth={1}
        />
        <text
          x={x + norm.nx * (tickLen + 10)}
          y={y + norm.ny * (tickLen + 10)}
          textAnchor="middle"
          alignmentBaseline="middle"
          className="text-[10px] fill-gray-400"
        >
          {Math.round(value * 100)}
        </text>
      </g>
    ));
  }

  return (
    <>
      {renderTicks(leftTicks, leftNorm, 'left')}
      {renderTicks(rightTicks, rightNorm, 'right')}
      {renderTicks(bottomTicks, bottomNorm, 'bottom')}
      {/* Edge labels */}
      <g transform={`translate(${(bottomLeft.x + top.x) / 2 - 35}, ${(bottomLeft.y + top.y) / 2}) rotate(-60)`}>
        <text x={0} y={0} textAnchor="middle" className="text-[12px] font-semibold" fill="#DC241f">Labour %</text>
        <path d="M 30 0 L 40 0 M 37 -3 L 40 0 L 37 3" stroke="#DC241f" strokeWidth={1.5} fill="none" transform="translate(0, -6) rotate(-30, 35, 0)" />
      </g>
      <g transform={`translate(${(top.x + bottomRight.x) / 2 + 35}, ${(top.y + bottomRight.y) / 2}) rotate(60)`}>
        <text x={0} y={0} textAnchor="middle" className="text-[12px] font-semibold" fill="#0087DC">Conservative %</text>
        <path d="M 50 0 L 60 0 M 57 -3 L 60 0 L 57 3" stroke="#0087DC" strokeWidth={1.5} fill="none" transform="translate(0, -6) rotate(-30, 55, 0)" />
      </g>
      <g transform={`translate(${(bottomRight.x + bottomLeft.x) / 2}, ${bottomRight.y + 35})`}>
        <text x={0} y={0} textAnchor="middle" className="text-[12px] font-semibold" fill="#666">Other %</text>
        <path d="M -40 0 L -30 0 M -37 -3 L -40 0 L -37 3" stroke="#666" strokeWidth={1.5} fill="none" transform="translate(0, -6) rotate(-30, -35, 0)" />
      </g>
    </>
  );
});

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
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const [animatedPoints, setAnimatedPoints] = useState<AnimatedPoint[]>([]);
  const [trajectoryData, setTrajectoryData] = useState<TrajectoryPoint[]>([]);
  const animationRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dataIdRef = useRef<string>(''); // Track data identity to detect real changes
  const { availableYears, currentYear } = useElectionStore();
  const { ternaryZoom, setTernaryZoom, resetTernaryZoom } = useUIStore();
  const clipId = useId();

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

  // Create a stable data identity based on year (not array reference)
  const dataId = useMemo(() => {
    if (data.length === 0) return '';
    return `${data[0]?.year || 'unknown'}-${data.length}`;
  }, [data]);

  // Animate points when data changes
  useEffect(() => {
    if (targetPoints.length === 0) {
      setAnimatedPoints([]);
      return;
    }

    // Cancel any running animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Check if this is actually new data (not just a re-render)
    const isNewData = dataIdRef.current !== dataId;

    // Capture start positions from module-level cache BEFORE updating dataIdRef
    const startPositions = new Map<string, { x: number; y: number }>();
    if (isNewData) {
      targetPoints.forEach(point => {
        const cached = positionCache.get(point.constituencyId);
        if (cached) {
          startPositions.set(point.constituencyId, cached);
        }
      });
    }

    dataIdRef.current = dataId;
    const startTime = performance.now();

    // Animation loop
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      const updatedPoints: AnimatedPoint[] = targetPoints.map(point => {
        const start = startPositions.get(point.constituencyId);
        // If we have a starting position and this is new data, interpolate
        const x = (isNewData && start) ? start.x + (point.x - start.x) * eased : point.x;
        const y = (isNewData && start) ? start.y + (point.y - start.y) * eased : point.y;

        return {
          ...point,
          x,
          y,
          targetX: point.x,
          targetY: point.y,
        };
      });

      // Update module-level position cache on every frame (with limit)
      updatedPoints.forEach(p => {
        if (!positionCache.has(p.constituencyId) && positionCache.size >= MAX_POSITION_CACHE) {
          const firstKey = positionCache.keys().next().value;
          if (firstKey) positionCache.delete(firstKey);
        }
        positionCache.set(p.constituencyId, { x: p.x, y: p.y });
      });

      setAnimatedPoints(updatedPoints);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [targetPoints, dataId]);

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
          const response = await fetch(`${import.meta.env.BASE_URL}data/elections/${year}.json`);
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

      const normalizeYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;
      points.sort((a, b) => normalizeYear(a.year) - normalizeYear(b.year));

      // Cache without coordinates (we'll recalculate on retrieval)
      if (trajectoryCache.size >= MAX_TRAJECTORY_CACHE) {
        const firstKey = trajectoryCache.keys().next().value;
        if (firstKey) trajectoryCache.delete(firstKey);
      }
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
      .scaleExtent([1, 10])
      .constrain((transform) => {
        const k = transform.k;
        // Convert SVG-space to center-relative
        const zx = k * centerX + transform.x - centerX;
        const zy = k * centerY + transform.y - centerY;
        // Clamp to keep visible data within the triangle
        const clamped = clampZoomToTriangle(zx, zy, k, radius);
        // Convert back to SVG-space
        const tx = clamped.x + centerX * (1 - k);
        const ty = clamped.y + centerY * (1 - k);
        return d3.zoomIdentity.translate(tx, ty).scale(k);
      })
      .on('zoom', (event) => {
        const t = event.transform;
        // Convert SVG-space transform to center-relative coordinates
        setTernaryZoom({
          k: t.k,
          x: t.k * centerX + t.x - centerX,
          y: t.k * centerY + t.y - centerY,
        });
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    // Apply stored transform on mount (reverse the center-relative conversion)
    if (ternaryZoom.k !== 1 || ternaryZoom.x !== 0 || ternaryZoom.y !== 0) {
      const svgX = ternaryZoom.x + centerX * (1 - ternaryZoom.k);
      const svgY = ternaryZoom.y + centerY * (1 - ternaryZoom.k);
      svg.call(
        zoom.transform,
        d3.zoomIdentity.translate(svgX, svgY).scale(ternaryZoom.k)
      );
    }

    return () => {
      svg.on('.zoom', null);
    };
  }, [width, height, centerX, centerY, radius, setTernaryZoom]); // Don't include ternaryZoom to avoid infinite loop

  // Close info panel on click outside
  useEffect(() => {
    if (!showInfo) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showInfo]);

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

  const gridDivisions = ternaryZoom.k >= 4 ? 50 : ternaryZoom.k >= 2 ? 20 : 10;

  const gridLines = useMemo(
    () => generateGridLines(radius, gridDivisions),
    [radius, gridDivisions]
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
      {/* Zoom controls and info button */}
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
        <div className="relative" ref={infoRef}>
          <button
            onClick={() => setShowInfo(prev => !prev)}
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
              showInfo
                ? 'border-blue-400 text-blue-600 bg-blue-50'
                : 'border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400'
            }`}
            aria-label="How to read this chart"
          >
            <span className="text-xs font-medium">i</span>
          </button>
          {showInfo && (
            <div className="absolute left-7 top-0 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs text-gray-700 leading-relaxed z-50">
              <div className="font-semibold text-gray-900 mb-1">Ternary Plot</div>
              <p className="mb-1.5">Each dot is a constituency. Its position shows the three-way vote split between Labour, Conservative, and all other parties.</p>
              <p className="mb-1.5">A dot near a corner means that party dominated. A dot near an edge means the "other" vote was low. Dots in the centre had an even three-way split.</p>
              <p>Click a constituency to see how its vote share has changed over time.</p>
            </div>
          )}
        </div>
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

        {/* Clip path for triangle boundary */}
        <defs>
          <clipPath id={clipId}>
            <path d={trianglePath} transform={`translate(${centerX}, ${centerY})`} />
          </clipPath>
        </defs>

        {/* Layer 1: Clipped zoomable content */}
        <g clipPath={`url(#${clipId})`}>
          <g transform={`translate(${centerX}, ${centerY})`}>
            <g transform={`translate(${ternaryZoom.x}, ${ternaryZoom.y}) scale(${ternaryZoom.k})`}>
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
                    strokeWidth={0.5 / ternaryZoom.k}
                  />
                ))}
              </g>

              {/* Trajectory for selected constituency */}
              {selectedConstituencyId && trajectoryData.length > 1 && (
                <g className="trajectory">
                  {/* Path connecting points */}
                  <path
                    d={trajectoryData.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - centerX} ${p.y - centerY}`).join(' ')}
                    fill="none"
                    stroke="#333"
                    strokeWidth={2 / ternaryZoom.k}
                    opacity={0.8}
                  />
                  {/* Points with year labels */}
                  {trajectoryData.map((p) => {
                    const isCurrent = p.year === currentYear;
                    return (
                      <g key={p.year}>
                        <circle
                          cx={p.x - centerX}
                          cy={p.y - centerY}
                          r={(isCurrent ? 5 : 3) / ternaryZoom.k}
                          fill={getPartyColor(p.winner)}
                          stroke={isCurrent ? '#000' : '#fff'}
                          strokeWidth={(isCurrent ? 2 : 1) / ternaryZoom.k}
                        />
                        <text
                          x={p.x - centerX}
                          y={p.y - centerY - 8 / ternaryZoom.k}
                          textAnchor="middle"
                          className={`${isCurrent ? 'font-bold fill-black' : 'font-medium fill-gray-700'}`}
                          style={{ fontSize: `${10 / ternaryZoom.k}px` }}
                        >
                          {p.year === 197402 ? "F'74" : p.year === 197410 ? "O'74" : p.year.toString().slice(-2)}
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
                      cx={point.x - centerX}
                      cy={point.y - centerY}
                      r={(isHighlighted ? 6 : 4) / ternaryZoom.k}
                      fill={getPartyColor(point.winner)}
                      fillOpacity={hasSelection && !isHighlighted ? 0.2 : 0.7}
                      stroke={isHighlighted ? '#000' : 'none'}
                      strokeWidth={isHighlighted ? 2 / ternaryZoom.k : 0}
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
            </g>
          </g>
        </g>

        {/* Layer 2: Fixed frame (triangle border + axis decorations) */}
        <g transform={`translate(${centerX}, ${centerY})`} pointerEvents="none">
          {/* Triangle boundary */}
          <path
            d={trianglePath}
            fill="none"
            stroke="#333"
            strokeWidth={2}
          />

          {/* Axis labels and tick marks */}
          <AxisDecorations radius={radius} zoomX={ternaryZoom.x} zoomY={ternaryZoom.y} zoomK={ternaryZoom.k} />
        </g>
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
