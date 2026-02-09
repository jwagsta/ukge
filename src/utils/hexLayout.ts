/**
 * Hex layout algorithm for UK constituency cartogram.
 *
 * Uses pointy-top hexagonal grid with LAPJV optimal assignment to place
 * constituencies in geographically approximate positions while ensuring
 * each constituency gets exactly one hex cell.
 */

import * as d3 from 'd3';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { ElectionResult, Region } from '@/types/election';
import {
  type BoundaryProperties,
  getBoundaryMatchName,
  normalizeConstituencyName,
} from '@/utils/constituencyMatching';
import { lap } from '@/utils/lapjv';

type BoundaryData = FeatureCollection<Polygon | MultiPolygon, BoundaryProperties>;

export interface HexPosition {
  q: number;
  r: number;
  x: number;
  y: number;
  constituencyId: string;
  constituencyName: string;
}

// --- Hex math (pointy-top orientation) ---

const SQRT3 = Math.sqrt(3);

/** Convert axial hex coordinates to pixel position (pointy-top). */
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (SQRT3 * q + (SQRT3 / 2) * r);
  const y = size * (1.5 * r);
  return { x, y };
}

/** Convert pixel position to fractional axial hex coordinates (pointy-top). */
function pixelToHex(x: number, y: number, size: number): { q: number; r: number } {
  const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return cubeRound(q, r);
}

/** Round fractional axial coordinates to nearest hex using cube rounding. */
function cubeRound(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }

  return { q: rq, r: rr };
}

/** SVG path string for a pointy-top hexagon centered at origin. */
export function hexPath(size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(`${size * Math.cos(angle)},${size * Math.sin(angle)}`);
  }
  return `M${points.join('L')}Z`;
}

/** Hex distance between two cells in axial coordinates. */
function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

// --- Grid and layout ---

const GRID_COLS = 30;
const GRID_ROWS = 46;

// Region centroids and approximate areas for density warping (lon, lat)
// These are rough geographic centers used for density-adaptive projection
const REGION_INFO: Record<string, { lon: number; lat: number; areaWeight: number }> = {
  london:       { lon: -0.1, lat: 51.5, areaWeight: 0.15 },
  south_east:   { lon:  0.5, lat: 51.2, areaWeight: 1.0 },
  south_west:   { lon: -3.5, lat: 50.8, areaWeight: 1.2 },
  east:         { lon:  0.8, lat: 52.2, areaWeight: 1.0 },
  east_midlands:{ lon: -1.0, lat: 52.8, areaWeight: 0.9 },
  west_midlands:{ lon: -2.0, lat: 52.5, areaWeight: 0.7 },
  yorkshire:    { lon: -1.5, lat: 53.8, areaWeight: 0.9 },
  north_west:   { lon: -2.5, lat: 53.5, areaWeight: 0.7 },
  north_east:   { lon: -1.5, lat: 55.0, areaWeight: 0.8 },
  wales:        { lon: -3.5, lat: 52.0, areaWeight: 1.3 },
  scotland:     { lon: -4.0, lat: 56.5, areaWeight: 3.0 },
};

interface ConstituencyPosition {
  id: string;
  name: string;
  region: Region;
  px: number; // projected x
  py: number; // projected y
}

/** Module-level layout cache keyed by boundary version string. */
const layoutCache = new Map<string, HexPosition[]>();

/**
 * Compute hex layout for all constituencies using LAPJV optimal assignment.
 * Results are cached by boundary version since boundaries are immutable per era.
 */
export function computeHexLayout(
  constituencies: ElectionResult[],
  boundaries: BoundaryData | null
): HexPosition[] {
  if (!boundaries || boundaries.features.length === 0 || constituencies.length === 0) {
    return [];
  }

  // Cache key must distinguish eras with the same seat count (e.g., 2010-era and
  // 2024-era both have 632 seats but different constituency names/boundaries).
  // Use boundary feature names which differ between all eras.
  const firstBoundaryName = boundaries.features[0]?.properties?.Name ?? '';
  const midBoundaryName = boundaries.features[Math.floor(boundaries.features.length / 2)]?.properties?.Name ?? '';
  const cacheKey = `${boundaries.features.length}_${firstBoundaryName}_${midBoundaryName}`;
  const cached = layoutCache.get(cacheKey);
  if (cached) return cached;

  // Phase 0: Match constituencies to boundary centroids
  const positions = matchConstituenciesToCentroids(constituencies, boundaries);
  if (positions.length === 0) return [];

  // Phase 1: Project centroids and apply density warp
  const projected = projectAndWarp(positions);

  // Phase 2: Generate hex grid mask shaped like GB
  const gridCells = generateGridMask(projected);

  // Phase 3: Optimal assignment via LAPJV
  const result = assignWithLAPJV(projected, gridCells);

  layoutCache.set(cacheKey, result);
  return result;
}

function matchConstituenciesToCentroids(
  constituencies: ElectionResult[],
  boundaries: BoundaryData
): ConstituencyPosition[] {
  // Build boundary centroid map
  const boundaryMap = new Map<string, [number, number]>();
  for (const feature of boundaries.features) {
    const matchName = getBoundaryMatchName(feature.properties);
    if (matchName) {
      boundaryMap.set(matchName, d3.geoCentroid(feature.geometry));
    }
  }

  // Project using a fixed UK Albers projection
  const projection = d3.geoAlbers()
    .center([0, 55.4])
    .rotate([4.4, 0])
    .parallels([50, 60])
    .scale(2000)
    .translate([0, 0]);

  const positions: ConstituencyPosition[] = [];
  for (const c of constituencies) {
    const normalizedName = normalizeConstituencyName(c.constituencyName);
    const centroid = boundaryMap.get(normalizedName);
    if (!centroid) continue;

    const projected = projection(centroid);
    if (!projected) continue;

    positions.push({
      id: c.constituencyId,
      name: c.constituencyName,
      region: c.region,
      px: projected[0],
      py: projected[1],
    });
  }

  return positions;
}

function projectAndWarp(positions: ConstituencyPosition[]): ConstituencyPosition[] {
  // Count seats per region
  const regionCounts = new Map<string, number>();
  for (const p of positions) {
    regionCounts.set(p.region, (regionCounts.get(p.region) || 0) + 1);
  }

  // Compute region centroids in projected space
  const regionCentroids = new Map<string, { cx: number; cy: number }>();
  const regionAccum = new Map<string, { sx: number; sy: number; n: number }>();
  for (const p of positions) {
    const acc = regionAccum.get(p.region) || { sx: 0, sy: 0, n: 0 };
    acc.sx += p.px;
    acc.sy += p.py;
    acc.n += 1;
    regionAccum.set(p.region, acc);
  }
  for (const [region, acc] of regionAccum) {
    regionCentroids.set(region, { cx: acc.sx / acc.n, cy: acc.sy / acc.n });
  }

  // Compute density = seats / areaWeight for each region
  const densities = new Map<string, number>();
  let totalDensity = 0;
  let numRegions = 0;
  for (const [region, count] of regionCounts) {
    const info = REGION_INFO[region];
    const areaWeight = info?.areaWeight ?? 1.0;
    const density = count / areaWeight;
    densities.set(region, density);
    totalDensity += density;
    numRegions++;
  }
  const meanDensity = totalDensity / numRegions;

  // Expansion factor per region: only expand dense regions (factor >= 1.0).
  // Sparse regions keep factor=1.0 to preserve geographic connectivity
  // (compressing Scotland would pull it away from England).
  const expansionFactors = new Map<string, number>();
  for (const [region, density] of densities) {
    const raw = Math.sqrt(density / meanDensity);
    expansionFactors.set(region, Math.max(1.0, Math.min(raw, 3.0)));
  }

  // Compute overall centroid for directional push
  let overallCx = 0, overallCy = 0;
  for (const p of positions) { overallCx += p.px; overallCy += p.py; }
  overallCx /= positions.length;
  overallCy /= positions.length;

  // Directional push: nudge peripheral regions outward so Scotland, Wales, and
  // SW "poke out" as distinct peninsulas. Magnitudes are proportional to the
  // overall geographic extent but tuned per-region to avoid disconnection.
  let minY = Infinity, maxY = -Infinity;
  for (const p of positions) { minY = Math.min(minY, p.py); maxY = Math.max(maxY, p.py); }
  const extent = maxY - minY || 1;

  const REGION_PUSH: Record<string, { dx: number; dy: number }> = {
    scotland:   { dx:  0,                     dy: -extent * 0.04 },  // gentle north (stays connected)
    wales:      { dx: -extent * 0.08,         dy:  0 },              // west
    south_west: { dx: -extent * 0.06, dy: extent * 0.06 },          // southwest
  };

  // Apply radial expansion + directional push
  const warped: ConstituencyPosition[] = [];
  for (const p of positions) {
    const centroid = regionCentroids.get(p.region);
    const factor = expansionFactors.get(p.region) ?? 1.0;
    const push = REGION_PUSH[p.region];

    let px = p.px;
    let py = p.py;

    if (centroid) {
      px = centroid.cx + (px - centroid.cx) * factor;
      py = centroid.cy + (py - centroid.cy) * factor;
    }

    if (push) {
      px += push.dx;
      py += push.dy;
    }

    warped.push({ ...p, px, py });
  }

  return warped;
}

function generateGridMask(positions: ConstituencyPosition[]): Array<{ q: number; r: number }> {
  // Find bounds of projected positions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p.px);
    maxX = Math.max(maxX, p.px);
    minY = Math.min(minY, p.py);
    maxY = Math.max(maxY, p.py);
  }

  // Map projected positions onto hex grid
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  // Choose hex size so that grid spans GRID_COLS x GRID_ROWS
  const hexW = rangeX / (GRID_COLS * SQRT3);
  const hexH = rangeY / (GRID_ROWS * 1.5);
  const hexSize = Math.max(hexW, hexH);

  // Convert each constituency position to its nearest hex cell
  const occupiedCells = new Set<string>();
  for (const p of positions) {
    const nx = p.px - minX;
    const ny = p.py - minY;
    const hex = pixelToHex(nx, ny, hexSize);
    occupiedCells.add(`${hex.q},${hex.r}`);
  }

  // Generate mask: include all cells within radius 3 of any occupied cell, plus buffer
  const maskCells = new Set<string>();
  for (const key of occupiedCells) {
    const [cq, cr] = key.split(',').map(Number);
    for (let dq = -3; dq <= 3; dq++) {
      for (let dr = -3; dr <= 3; dr++) {
        if (hexDistance(0, 0, dq, dr) <= 3) {
          maskCells.add(`${cq + dq},${cr + dr}`);
        }
      }
    }
  }

  // Add 1-cell buffer around the mask
  const buffered = new Set(maskCells);
  for (const key of maskCells) {
    const [cq, cr] = key.split(',').map(Number);
    const neighbors = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
    ];
    for (const [dq, dr] of neighbors) {
      buffered.add(`${cq + dq},${cr + dr}`);
    }
  }

  const cells: Array<{ q: number; r: number }> = [];
  for (const key of buffered) {
    const [q, r] = key.split(',').map(Number);
    cells.push({ q, r });
  }

  return cells;
}

function assignWithLAPJV(
  positions: ConstituencyPosition[],
  gridCells: Array<{ q: number; r: number }>
): HexPosition[] {
  const n = positions.length;
  const m = gridCells.length;

  if (n === 0 || m === 0) return [];

  // Ensure we have at least as many grid cells as constituencies
  // LAPJV needs a square matrix, so pad to max(n, m)
  const dim = Math.max(n, m);

  // Find bounds to normalize projected positions to grid cell scale
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p.px);
    maxX = Math.max(maxX, p.px);
    minY = Math.min(minY, p.py);
    maxY = Math.max(maxY, p.py);
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  // Convert grid cells to pixel-like coordinates for distance computation
  // Use the same hex size as in grid mask generation
  const hexW = rangeX / (GRID_COLS * SQRT3);
  const hexH = rangeY / (GRID_ROWS * 1.5);
  const hexSize = Math.max(hexW, hexH);

  const gridPixels: Array<{ x: number; y: number }> = gridCells.map(c => hexToPixel(c.q, c.r, hexSize));

  // Compute ideal pixel positions for each constituency (same coordinate space as grid)
  const idealPixels: Array<{ x: number; y: number }> = positions.map(p => ({
    x: p.px - minX,
    y: p.py - minY,
  }));

  // Cost function: squared distance from constituency i to grid cell j
  // Dummy rows/columns get zero cost
  const cost = (i: number, j: number): number => {
    if (i >= n || j >= m) return 0; // dummy assignment
    const dx = idealPixels[i].x - gridPixels[j].x;
    const dy = idealPixels[i].y - gridPixels[j].y;
    return dx * dx + dy * dy;
  };

  const result = lap(dim, cost);

  // Extract assignments for real constituencies (not dummy rows)
  const hexPositions: HexPosition[] = [];
  for (let i = 0; i < n; i++) {
    const j = result.row[i];
    if (j < m) {
      const cell = gridCells[j];
      hexPositions.push({
        q: cell.q,
        r: cell.r,
        x: 0, // computed during rendering
        y: 0,
        constituencyId: positions[i].id,
        constituencyName: positions[i].name,
      });
    }
  }

  // Handle Scottish islands: detect and ensure separation
  adjustScottishIslands(hexPositions, positions);

  return hexPositions;
}

/**
 * Detect Scottish island constituencies and ensure they have visual separation
 * from the mainland. Orkney/Shetland (lat > 58.5) and Western Isles (lon < -6.0).
 */
function adjustScottishIslands(
  hexPositions: HexPosition[],
  originalPositions: ConstituencyPosition[]
): void {
  // Build lookup for original positions
  const origMap = new Map<string, ConstituencyPosition>();
  for (const p of originalPositions) {
    origMap.set(p.id, p);
  }

  // Find island constituencies by name patterns
  const islandNames = [
    'orkney', 'shetland', 'western isles', 'na h-eileanan',
    'caithness', 'ross', 'skye',
  ];

  const occupied = new Set<string>();
  for (const hp of hexPositions) {
    occupied.add(`${hp.q},${hp.r}`);
  }

  for (const hp of hexPositions) {
    const nameLower = hp.constituencyName.toLowerCase();
    const isIsland = islandNames.some(n => nameLower.includes(n));
    if (!isIsland) continue;

    // Check if neighbors in all 6 directions are occupied (i.e., packed in)
    const neighbors = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
    ];

    let occupiedNeighborCount = 0;
    for (const [dq, dr] of neighbors) {
      if (occupied.has(`${hp.q + dq},${hp.r + dr}`)) {
        occupiedNeighborCount++;
      }
    }

    // If the island is surrounded, try to shift it to create a gap
    // (Only if it has 4+ occupied neighbors, indicating it's crammed in)
    if (occupiedNeighborCount >= 4) {
      // Find the direction with fewest occupied cells and shift
      let bestDq = 0, bestDr = 0, minOccupied = Infinity;
      for (const [dq, dr] of neighbors) {
        const nq = hp.q + dq;
        const nr = hp.r + dr;
        if (!occupied.has(`${nq},${nr}`)) {
          // Count occupied around this new position
          let count = 0;
          for (const [ddq, ddr] of neighbors) {
            if (occupied.has(`${nq + ddq},${nr + ddr}`)) count++;
          }
          if (count < minOccupied) {
            minOccupied = count;
            bestDq = dq;
            bestDr = dr;
          }
        }
      }
      if (bestDq !== 0 || bestDr !== 0) {
        occupied.delete(`${hp.q},${hp.r}`);
        hp.q += bestDq;
        hp.r += bestDr;
        occupied.add(`${hp.q},${hp.r}`);
      }
    }
  }
}
