/**
 * Geometry helpers for boundary validation tests.
 */

import type { Position, Polygon, MultiPolygon } from 'geojson';

/** Calculate the signed area of a polygon ring using the shoelace formula. */
export function ringArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/** Check if a polygon ring is closed (first point === last point). */
export function isRingClosed(ring: Position[]): boolean {
  if (ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/** Get bounding box of a set of coordinates [minLon, minLat, maxLon, maxLat]. */
export function bbox(coords: Position[]): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity;
  let maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

/** Calculate centroid of a set of coordinates (simple average). */
export function centroid(coords: Position[]): [number, number] {
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of coords) {
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / coords.length, sumLat / coords.length];
}

/** Extract all coordinate positions from a Polygon or MultiPolygon geometry. */
export function extractAllCoords(geometry: Polygon | MultiPolygon): Position[] {
  const coords: Position[] = [];
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      coords.push(...ring);
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        coords.push(...ring);
      }
    }
  }
  return coords;
}

/** Extract all rings from a Polygon or MultiPolygon geometry. */
export function extractAllRings(geometry: Polygon | MultiPolygon): Position[][] {
  const rings: Position[][] = [];
  if (geometry.type === 'Polygon') {
    rings.push(...geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      rings.push(...polygon);
    }
  }
  return rings;
}

/**
 * Compute the total absolute area of a geometry (sum of absolute ring areas).
 * Outer rings contribute positively, holes are counted by absolute value.
 */
export function geometryArea(geometry: Polygon | MultiPolygon): number {
  const rings = extractAllRings(geometry);
  let totalArea = 0;
  for (const ring of rings) {
    totalArea += Math.abs(ringArea(ring));
  }
  return totalArea;
}
