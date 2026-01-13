/**
 * Process Boundary Files Script
 *
 * Combines GeoJSON boundary files for England, Wales, Scotland, and Northern Ireland
 * from parlconst.org into a single file for each boundary era.
 *
 * Usage:
 *   npx ts-node scripts/processBoundaries.ts
 *
 * Expected input files in public/data/boundaries/raw/:
 *   - {era}/england.geojson
 *   - {era}/wales.geojson
 *   - {era}/scotland.geojson
 *   - {era}/ni.geojson (Northern Ireland)
 *
 * Output:
 *   - public/data/boundaries/{era}.json
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';

interface ConstituencyProperties {
  PCON_CODE?: string;
  PCON_NAME?: string;
  PCON13CD?: string;
  PCON13NM?: string;
  PCON24CD?: string;
  PCON24NM?: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
}

type ConstituencyFeature = Feature<Polygon | MultiPolygon, ConstituencyProperties>;
type ConstituencyCollection = FeatureCollection<Polygon | MultiPolygon, ConstituencyProperties>;

const BOUNDARY_ERAS = ['1918', '1950', '1974', '1983', '1997', '2010', '2024'];
const NATIONS = ['england', 'wales', 'scotland', 'ni'];

const RAW_DIR = path.join(__dirname, '..', 'public', 'data', 'boundaries', 'raw');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'boundaries');

function normalizeProperties(feature: ConstituencyFeature, nation: string): ConstituencyFeature {
  const props = feature.properties || {};

  // Extract constituency code and name from various possible property names
  const code = props.PCON_CODE || props.PCON13CD || props.PCON24CD || props.id || props.code || '';
  const name = props.PCON_NAME || props.PCON13NM || props.PCON24NM || props.name || '';

  return {
    type: 'Feature',
    geometry: feature.geometry,
    properties: {
      // Keep original properties
      ...props,
      // Normalize to standard property names
      PCON13CD: code,
      PCON13NM: name,
      // Add nation info
      nation,
    },
  };
}

function loadGeoJSON(filepath: string): ConstituencyCollection | null {
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

function processEra(era: string): void {
  console.log(`\nProcessing era: ${era}`);

  const allFeatures: ConstituencyFeature[] = [];

  for (const nation of NATIONS) {
    // Try various file naming conventions
    const possibleFiles = [
      path.join(RAW_DIR, era, `${nation}.geojson`),
      path.join(RAW_DIR, era, `${nation}.json`),
      path.join(RAW_DIR, `${era}_${nation}.geojson`),
      path.join(RAW_DIR, `${era}_${nation}.json`),
    ];

    let geojson: ConstituencyCollection | null = null;
    for (const file of possibleFiles) {
      geojson = loadGeoJSON(file);
      if (geojson) {
        console.log(`  Loaded: ${file} (${geojson.features.length} features)`);
        break;
      }
    }

    if (geojson) {
      for (const feature of geojson.features) {
        allFeatures.push(normalizeProperties(feature, nation));
      }
    }
  }

  if (allFeatures.length === 0) {
    console.log(`  No data found for era ${era}`);
    return;
  }

  // Create combined GeoJSON
  const combined: ConstituencyCollection = {
    type: 'FeatureCollection',
    features: allFeatures,
  };

  const outputPath = path.join(OUTPUT_DIR, `${era}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(combined));
  console.log(`  Created: ${outputPath} (${allFeatures.length} constituencies)`);
}

function main(): void {
  console.log('UK Boundary Processing Script');
  console.log('=============================\n');

  // Ensure directories exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
    console.log(`Created raw directory: ${RAW_DIR}`);
    console.log('\nPlease download boundary files from parlconst.org:');
    console.log('1. Visit https://www.parlconst.org/constituency-maps');
    console.log('2. Select each year/nation and download as GeoJSON');
    console.log(`3. Save files to: ${RAW_DIR}/{era}/{nation}.geojson`);
    console.log('\nExample structure:');
    for (const era of BOUNDARY_ERAS) {
      for (const nation of NATIONS) {
        console.log(`  ${RAW_DIR}/${era}/${nation}.geojson`);
      }
    }
    return;
  }

  // Process each boundary era
  for (const era of BOUNDARY_ERAS) {
    processEra(era);
  }

  console.log('\n=== Processing Complete ===\n');
  console.log('Next steps:');
  console.log('1. Verify boundary files in public/data/boundaries/');
  console.log('2. Run the app to test with different election years');
}

main();
