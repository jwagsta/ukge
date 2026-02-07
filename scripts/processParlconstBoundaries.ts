/**
 * Process parlconst.org Boundary Files Script
 *
 * Combines GeoJSON boundary files from parlconst.org (downloaded to parlconst_boundaries/)
 * into a single file for each boundary era. Handles:
 * - England files split by region (north, midlands, south)
 * - Hybrid years (2005 uses 1997 England/Wales + 2005 Scotland)
 * - Name normalization to match Electoral Calculus data
 *
 * Usage:
 *   npx ts-node scripts/processParlconstBoundaries.ts
 *
 * Output:
 *   - public/data/boundaries/{era}.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ParlconstProperties {
  fid?: number;
  Name?: string;
  [key: string]: unknown;
}

interface OutputProperties {
  id: string;
  Name: string;
  normalizedName: string;
  nation: string;
}

type InputFeature = Feature<Polygon | MultiPolygon, ParlconstProperties>;
type OutputFeature = Feature<Polygon | MultiPolygon, OutputProperties>;
type InputCollection = FeatureCollection<Polygon | MultiPolygon, ParlconstProperties>;
type OutputCollection = FeatureCollection<Polygon | MultiPolygon, OutputProperties>;

// Source directory containing parlconst.org downloads
const SOURCE_DIR = path.join(__dirname, '..', 'parlconst_boundaries');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'boundaries');

// Configuration for each output boundary year
// Specifies which source years to use for each nation
interface YearConfig {
  england: number;
  scotland: number;
  wales: number;
}

const YEAR_CONFIG: Record<string, YearConfig> = {
  '1955': { england: 1955, scotland: 1955, wales: 1955 },
  '1974': { england: 1974, scotland: 1974, wales: 1974 },
  '1983': { england: 1983, scotland: 1983, wales: 1983 },
  '1997': { england: 1997, scotland: 1997, wales: 1997 },
  '2005': { england: 1997, scotland: 2005, wales: 1997 },  // Hybrid: Scotland reduced 72→59
  '2010': { england: 2010, scotland: 2005, wales: 2010 },  // Hybrid: Missing Scotland file
  '2024': { england: 2024, scotland: 2024, wales: 2024 },
};

// File patterns for each region - handles typos in parlconst filenames
function getEnglandFiles(year: number): string[] {
  const patterns = [
    `${year}_constituencies___england__north_.geojson`,
    `${year}_constituencies___england__midlands_.geojson`,
    `${year}_constituencies___england__south_.geojson`,
    // Handle typo variants
    `${year}_consituencies___england__north_.geojson`,
    `${year}_consituencies___england__midlands_.geojson`,
    `${year}_consituencies___england__south_.geojson`,
    `${year}_constituenies___england__north_.geojson`,
    `${year}_constituenies___england__midlands_.geojson`,
    `${year}_constituenies___england__south_.geojson`,
  ];
  return patterns;
}

function getScotlandFiles(year: number): string[] {
  return [
    `${year}_constituencies___scotland.geojson`,
    `${year}_consituencies___scotland.geojson`,
  ];
}

function getWalesFiles(year: number): string[] {
  return [
    `${year}_wales_constituencies.geojson`,
    `${year}_constituencies___wales.geojson`,
  ];
}

/**
 * Normalize constituency name from parlconst format to Electoral Calculus format.
 *
 * Transformations:
 * - "&" → "and"
 * - "-" → " " (e.g., "Newcastle-upon-Tyne" → "Newcastle upon Tyne")
 * - "NE", "NW", "SE", "SW" → "North East", "North West", etc.
 * - " N " or " N$" → " North " or " North$"  (only at word boundaries)
 * - " S " or " S$" → " South " or " South$"
 * - " E " or " E$" → " East " or " East$"
 * - " W " or " W$" → " West " or " West$"
 */
function normalizeConstituencyName(name: string): string {
  let normalized = name;

  // Replace & with "and"
  normalized = normalized.replace(/\s*&\s*/g, ' and ');

  // Replace hyphens with spaces (e.g., "Newcastle-upon-Tyne" → "Newcastle upon Tyne")
  normalized = normalized.replace(/-/g, ' ');

  // Replace directional abbreviations at word boundaries
  // Handle compound directions first (NE, NW, SE, SW)
  normalized = normalized.replace(/\bNE\b/g, 'North East');
  normalized = normalized.replace(/\bNW\b/g, 'North West');
  normalized = normalized.replace(/\bSE\b/g, 'South East');
  normalized = normalized.replace(/\bSW\b/g, 'South West');

  // Then handle single directions at word boundaries
  normalized = normalized.replace(/\bN\b(?=\s|$)/g, 'North');
  normalized = normalized.replace(/\bS\b(?=\s|$)/g, 'South');
  normalized = normalized.replace(/\bE\b(?=\s|$)/g, 'East');
  normalized = normalized.replace(/\bW\b(?=\s|$)/g, 'West');

  // Clean up any double spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Generate a normalized ID from constituency name.
 * Matches the EC_ format used in election data.
 */
function generateId(name: string): string {
  const normalized = normalizeConstituencyName(name);
  return `EC_${normalized.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

// Coordinate precision (3 decimal places = ~100 meter accuracy, sufficient for visualization)
const COORD_PRECISION = 3;

/**
 * Round a number to specified decimal places
 */
function roundCoord(n: number): number {
  const factor = Math.pow(10, COORD_PRECISION);
  return Math.round(n * factor) / factor;
}

/**
 * Douglas-Peucker line simplification algorithm.
 * Reduces number of points while preserving shape.
 */
function douglasPeucker(coords: number[][], epsilon: number): number[][] {
  if (coords.length < 3) {
    return coords;
  }

  // Find point with maximum distance from line between first and last
  let maxDist = 0;
  let maxIdx = 0;
  const first = coords[0];
  const last = coords[coords.length - 1];

  for (let i = 1; i < coords.length - 1; i++) {
    const dist = perpendicularDistance(coords[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDist > epsilon) {
    const left = douglasPeucker(coords.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(coords.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    // All points between first and last can be removed
    return [first, last];
  }
}

/**
 * Calculate perpendicular distance from point to line.
 */
function perpendicularDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];

  if (dx === 0 && dy === 0) {
    // Line is a point
    return Math.sqrt(
      Math.pow(point[0] - lineStart[0], 2) +
      Math.pow(point[1] - lineStart[1], 2)
    );
  }

  const t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (dx * dx + dy * dy);

  let nearestX, nearestY;
  if (t < 0) {
    nearestX = lineStart[0];
    nearestY = lineStart[1];
  } else if (t > 1) {
    nearestX = lineEnd[0];
    nearestY = lineEnd[1];
  } else {
    nearestX = lineStart[0] + t * dx;
    nearestY = lineStart[1] + t * dy;
  }

  return Math.sqrt(
    Math.pow(point[0] - nearestX, 2) +
    Math.pow(point[1] - nearestY, 2)
  );
}

/**
 * Simplify coordinates using Douglas-Peucker and reduce precision.
 */
function simplifyCoordinates(coords: number[][]): number[][] {
  // Douglas-Peucker simplification with epsilon ~200 meters in degrees
  // More aggressive simplification for better performance
  const epsilon = 0.002;
  const simplified = douglasPeucker(coords, epsilon);

  // Round coordinates to reduce file size
  return simplified.map(c => [roundCoord(c[0]), roundCoord(c[1])]);
}

/**
 * Simplify a geometry by reducing coordinate precision and removing redundant points.
 */
function simplifyGeometry(geometry: Polygon | MultiPolygon): Polygon | MultiPolygon {
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map(ring => simplifyCoordinates(ring)),
    };
  } else {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map(polygon =>
        polygon.map(ring => simplifyCoordinates(ring))
      ),
    };
  }
}

function loadGeoJSON(filepath: string): InputCollection | null {
  try {
    if (!fs.existsSync(filepath)) {
      return null;
    }
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Warning: Could not load ${filepath}:`, error);
    return null;
  }
}

function findAndLoadFile(patterns: string[]): InputCollection | null {
  for (const pattern of patterns) {
    const filepath = path.join(SOURCE_DIR, pattern);
    const geojson = loadGeoJSON(filepath);
    if (geojson) {
      console.log(`    Loaded: ${pattern} (${geojson.features.length} features)`);
      return geojson;
    }
  }
  return null;
}

function transformFeature(feature: InputFeature, nation: string): OutputFeature {
  const originalName = feature.properties?.Name || '';
  const normalizedName = normalizeConstituencyName(originalName);
  const id = generateId(originalName);

  return {
    type: 'Feature',
    geometry: simplifyGeometry(feature.geometry),
    properties: {
      id,
      Name: originalName,
      normalizedName,
      nation,
    },
  };
}

function loadEnglandFeatures(year: number): OutputFeature[] {
  const features: OutputFeature[] = [];
  const patterns = getEnglandFiles(year);

  // Group patterns by region
  const regions = ['north', 'midlands', 'south'];

  for (const region of regions) {
    const regionPatterns = patterns.filter(p => p.includes(`__${region}_`));
    const geojson = findAndLoadFile(regionPatterns);

    if (geojson) {
      for (const feature of geojson.features) {
        features.push(transformFeature(feature, 'england'));
      }
    } else {
      console.warn(`    Warning: No ${region} England file found for ${year}`);
    }
  }

  return features;
}

function loadScotlandFeatures(year: number): OutputFeature[] {
  const patterns = getScotlandFiles(year);
  const geojson = findAndLoadFile(patterns);

  if (!geojson) {
    console.warn(`    Warning: No Scotland file found for ${year}`);
    return [];
  }

  return geojson.features.map(f => transformFeature(f, 'scotland'));
}

function loadWalesFeatures(year: number): OutputFeature[] {
  const patterns = getWalesFiles(year);
  const geojson = findAndLoadFile(patterns);

  if (!geojson) {
    console.warn(`    Warning: No Wales file found for ${year}`);
    return [];
  }

  return geojson.features.map(f => transformFeature(f, 'wales'));
}

function processYear(outputYear: string): void {
  const config = YEAR_CONFIG[outputYear];
  if (!config) {
    console.error(`No configuration for year ${outputYear}`);
    return;
  }

  console.log(`\nProcessing boundary year: ${outputYear}`);
  console.log(`  England from: ${config.england}, Scotland from: ${config.scotland}, Wales from: ${config.wales}`);

  const allFeatures: OutputFeature[] = [];

  // Load England (from possibly different source year)
  console.log(`  Loading England (${config.england}):`);
  const englandFeatures = loadEnglandFeatures(config.england);
  allFeatures.push(...englandFeatures);
  console.log(`    Total England: ${englandFeatures.length} features`);

  // Load Scotland (from possibly different source year)
  console.log(`  Loading Scotland (${config.scotland}):`);
  const scotlandFeatures = loadScotlandFeatures(config.scotland);
  allFeatures.push(...scotlandFeatures);
  console.log(`    Total Scotland: ${scotlandFeatures.length} features`);

  // Load Wales (from possibly different source year)
  console.log(`  Loading Wales (${config.wales}):`);
  const walesFeatures = loadWalesFeatures(config.wales);
  allFeatures.push(...walesFeatures);
  console.log(`    Total Wales: ${walesFeatures.length} features`);

  if (allFeatures.length === 0) {
    console.error(`  ERROR: No features loaded for ${outputYear}`);
    return;
  }

  // Create combined GeoJSON
  const combined: OutputCollection = {
    type: 'FeatureCollection',
    features: allFeatures,
  };

  const outputPath = path.join(OUTPUT_DIR, `${outputYear}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(combined));
  console.log(`  Created: ${outputPath} (${allFeatures.length} total constituencies)`);
}

function main(): void {
  console.log('parlconst.org Boundary Processing Script');
  console.log('========================================\n');

  // Check source directory exists
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`ERROR: Source directory not found: ${SOURCE_DIR}`);
    console.log('\nPlease download boundary files from parlconst.org to parlconst_boundaries/');
    return;
  }

  // List available files
  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.geojson'));
  console.log(`Found ${files.length} GeoJSON files in ${SOURCE_DIR}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Process each configured year
  for (const year of Object.keys(YEAR_CONFIG)) {
    processYear(year);
  }

  console.log('\n=== Processing Complete ===\n');

  // Summary
  console.log('Output files created:');
  for (const year of Object.keys(YEAR_CONFIG)) {
    const outputPath = path.join(OUTPUT_DIR, `${year}.json`);
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`  ${year}.json - ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    }
  }

  console.log('\nNext steps:');
  console.log('1. Run validateBoundaryMatching.ts to check constituency name matches');
  console.log('2. Run removeNorthernIreland.ts to update election data');
  console.log('3. Test the app with npm run dev');
}

main();
