import * as d3 from 'd3';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { DotDensityPoint } from '@/types/election';

interface ConstituencyProperties {
  PCON13CD?: string;
  PCON13NM?: string;
  PCON24CD?: string;
  PCON24NM?: string;
  id?: string;
  name?: string;
}

interface DotGeneratorOptions {
  votesPerDot: number;
  minDistance: number;
  maxIterations: number;
}

/**
 * Generate random dots within a polygon boundary for a given set of party votes.
 * Uses rejection sampling to place dots inside the polygon.
 */
export function generateDotsForConstituency(
  feature: Feature<Polygon | MultiPolygon, ConstituencyProperties>,
  partyVotes: Map<string, number>,
  projection: d3.GeoProjection,
  options: DotGeneratorOptions
): DotDensityPoint[] {
  const { votesPerDot, maxIterations } = options;
  const dots: DotDensityPoint[] = [];

  const path = d3.geoPath().projection(projection);
  const bounds = path.bounds(feature);

  if (!bounds || bounds[0][0] === Infinity) {
    return dots;
  }

  const [minX, minY] = bounds[0];
  const [maxX, maxY] = bounds[1];
  const constituencyId = feature.properties?.PCON13CD || feature.properties?.PCON24CD || feature.properties?.id || '';

  // For each party, generate dots
  for (const [partyId, votes] of partyVotes) {
    const numDots = Math.round(votes / votesPerDot);
    let placedDots = 0;
    let iterations = 0;

    while (placedDots < numDots && iterations < maxIterations) {
      iterations++;

      // Random point within bounding box
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);

      // Convert screen coordinates back to geographic coordinates
      const point = projection.invert?.([x, y]);
      if (!point) continue;

      // Check if point is inside the polygon
      if (d3.geoContains(feature, point)) {
        dots.push({
          x,
          y,
          partyId,
          constituencyId,
        });
        placedDots++;
      }
    }
  }

  return dots;
}

/**
 * Generate all dots for all constituencies.
 * This is an expensive operation - call it once per election year.
 */
export function generateAllDots(
  features: Feature<Polygon | MultiPolygon, ConstituencyProperties>[],
  electionData: Map<string, Map<string, number>>,
  projection: d3.GeoProjection,
  options: DotGeneratorOptions
): DotDensityPoint[] {
  const allDots: DotDensityPoint[] = [];

  for (const feature of features) {
    const constituencyId = feature.properties?.PCON13CD || feature.properties?.PCON24CD || feature.properties?.id;
    if (!constituencyId) continue;

    const partyVotes = electionData.get(constituencyId);
    if (!partyVotes) continue;

    const dots = generateDotsForConstituency(feature, partyVotes, projection, options);
    allDots.push(...dots);
  }

  return allDots;
}

/**
 * Create a UK-centered Albers projection suitable for dot density maps.
 */
export function createUKProjection(width: number, height: number): d3.GeoProjection {
  return d3.geoAlbers()
    .center([0, 55.4])
    .rotate([4.4, 0])
    .parallels([50, 60])
    .scale(Math.min(width, height) * 5)
    .translate([width / 2, height / 2]);
}

/**
 * Convert election results to a map format suitable for dot generation.
 */
export function electionResultsToVoteMap(
  results: Array<{
    constituencyId: string;
    results: Array<{ partyId: string; votes: number }>;
  }>
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();

  for (const result of results) {
    const partyMap = new Map<string, number>();
    for (const partyResult of result.results) {
      partyMap.set(partyResult.partyId, partyResult.votes);
    }
    map.set(result.constituencyId, partyMap);
  }

  return map;
}
