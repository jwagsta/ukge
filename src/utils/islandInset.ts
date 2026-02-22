import type { FeatureCollection, Feature, Polygon, MultiPolygon, Position } from 'geojson';
import type { BoundaryProperties } from '@/utils/constituencyMatching';

/**
 * Island inset configuration.
 * Shifts remote island constituencies closer to the mainland for better map display.
 * Standard UK cartographic practice (BBC, ONS, Electoral Commission).
 */

interface IslandShift {
  /** Regex to match constituency Name property */
  namePattern: RegExp;
  /** Latitude offset (negative = south) */
  latOffset: number;
  /** Longitude offset (positive = east) */
  lonOffset: number;
  /** Drop polygons smaller than this area (sq degrees) from MultiPolygons */
  minPolygonArea?: number;
}

const ISLAND_SHIFTS: IslandShift[] = [
  {
    namePattern: /^Orkney and Shetland$/,
    latOffset: -2.5,
    lonOffset: 3.0,
    minPolygonArea: 0.0015,
  },
];

interface ShiftedBoundaryProperties extends BoundaryProperties {
  _islandShifted?: boolean;
}

/**
 * Recursively shift all coordinates in a position array by the given offset.
 * Works for Polygon rings (Position[][]) and MultiPolygon (Position[][][]).
 */
function shiftPositions(positions: Position[], latOffset: number, lonOffset: number): Position[] {
  return positions.map(pos => [pos[0] + lonOffset, pos[1] + latOffset, ...pos.slice(2)]);
}

function shiftPolygonCoords(rings: Position[][], latOffset: number, lonOffset: number): Position[][] {
  return rings.map(ring => shiftPositions(ring, latOffset, lonOffset));
}

function shiftMultiPolygonCoords(polygons: Position[][][], latOffset: number, lonOffset: number): Position[][][] {
  return polygons.map(polygon => shiftPolygonCoords(polygon, latOffset, lonOffset));
}

/** Shoelace formula for polygon area in coordinate space (sq degrees). */
function ringArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(area) / 2;
}

/** Filter out polygons smaller than minArea from a MultiPolygon coordinate array. */
function filterSmallPolygons(polygons: Position[][][], minArea: number): Position[][][] {
  return polygons.filter(polygon => ringArea(polygon[0]) >= minArea);
}

/**
 * Apply island shifts to boundary features.
 * Returns a new FeatureCollection with shifted coordinates for matching constituencies.
 * Non-matching features are passed through unchanged.
 *
 * Shifted features are marked with `_islandShifted: true` in their properties.
 */
export function shiftIslandFeatures(
  boundaries: FeatureCollection<Polygon | MultiPolygon, BoundaryProperties>
): FeatureCollection<Polygon | MultiPolygon, ShiftedBoundaryProperties> {
  const shiftedFeatures = boundaries.features.map(feature => {
    const name = feature.properties?.Name || '';

    const shift = ISLAND_SHIFTS.find(s => s.namePattern.test(name));
    if (!shift) return feature as Feature<Polygon | MultiPolygon, ShiftedBoundaryProperties>;

    // Deep clone the feature to avoid mutating the original
    const shifted: Feature<Polygon | MultiPolygon, ShiftedBoundaryProperties> = {
      type: 'Feature',
      properties: {
        ...feature.properties,
        _islandShifted: true,
      },
      geometry: feature.geometry.type === 'MultiPolygon'
        ? {
            type: 'MultiPolygon',
            coordinates: shiftMultiPolygonCoords(
              shift.minPolygonArea
                ? filterSmallPolygons((feature.geometry as MultiPolygon).coordinates, shift.minPolygonArea)
                : (feature.geometry as MultiPolygon).coordinates,
              shift.latOffset,
              shift.lonOffset
            ),
          }
        : {
            type: 'Polygon',
            coordinates: shiftPolygonCoords(
              (feature.geometry as Polygon).coordinates,
              shift.latOffset,
              shift.lonOffset
            ),
          },
    };

    return shifted;
  });

  return {
    type: 'FeatureCollection',
    features: shiftedFeatures,
  };
}
