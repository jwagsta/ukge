/**
 * Build Boundary Transition Mappings
 *
 * Computes area-weighted polygon intersection weights between adjacent boundary eras.
 * For each constituency in the NEW era, finds overlapping constituencies in the OLD era
 * and computes the fraction of overlap (by area).
 *
 * Output: public/data/transitions/{old}_to_{new}.json
 *
 * Usage:
 *   npx tsx scripts/buildBoundaryTransitions.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon, FeatureCollection } from 'geojson';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BoundaryProperties {
  id?: string;
  Name?: string;
  normalizedName?: string;
  nation?: string;
  [key: string]: unknown;
}

type BoundaryFeature = Feature<Polygon | MultiPolygon, BoundaryProperties>;

interface TransitionMapping {
  from: string;
  to: string;
  mappings: Record<string, { oldId: string; weight: number }[]>;
}

// Adjacent boundary eras (old → new)
const TRANSITIONS: [string, string][] = [
  ['1955', '1974'],
  ['1974', '1983'],
  ['1983', '1997'],
  ['1997', '2005'],
  ['2005', '2010'],
  ['2010', '2024'],
];

function loadBoundaries(version: string): FeatureCollection<Polygon | MultiPolygon, BoundaryProperties> {
  const filePath = path.join(__dirname, '..', 'public', 'data', 'boundaries', `${version}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/** Get bounding box [minX, minY, maxX, maxY] for a feature */
function getBBox(feature: BoundaryFeature): [number, number, number, number] {
  return turf.bbox(feature) as [number, number, number, number];
}

/** Check if two bounding boxes overlap */
function bboxOverlaps(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function buildTransition(fromVersion: string, toVersion: string): TransitionMapping {
  console.log(`\nProcessing ${fromVersion} → ${toVersion}...`);

  const oldBoundaries = loadBoundaries(fromVersion);
  const newBoundaries = loadBoundaries(toVersion);

  console.log(`  Old: ${oldBoundaries.features.length} constituencies`);
  console.log(`  New: ${newBoundaries.features.length} constituencies`);

  // Pre-compute bounding boxes for old features
  const oldFeaturesWithBBox = oldBoundaries.features.map(f => ({
    feature: f as BoundaryFeature,
    bbox: getBBox(f as BoundaryFeature),
    id: (f.properties as BoundaryProperties).id || '',
  }));

  const mappings: Record<string, { oldId: string; weight: number }[]> = {};
  let nameMatchCount = 0;
  let overlapCount = 0;
  let noOverlapCount = 0;

  for (const newFeature of newBoundaries.features as BoundaryFeature[]) {
    const newId = newFeature.properties.id || '';
    const newNation = newFeature.properties.nation || '';

    // Skip NI constituencies — they have no old-era counterpart for pre-2024 eras
    if (newNation === 'northern_ireland') {
      mappings[newId] = [];
      continue;
    }

    const newBBox = getBBox(newFeature);

    // Filter old features by bounding box overlap
    const candidates = oldFeaturesWithBBox.filter(old => bboxOverlaps(newBBox, old.bbox));

    const overlaps: { oldId: string; area: number }[] = [];

    for (const candidate of candidates) {
      try {
        const intersection = turf.intersect(
          turf.featureCollection([newFeature as Feature<Polygon | MultiPolygon>, candidate.feature as Feature<Polygon | MultiPolygon>])
        );
        if (intersection) {
          const area = turf.area(intersection);
          if (area > 0) {
            overlaps.push({ oldId: candidate.id, area });
          }
        }
      } catch {
        // Some edge cases with invalid geometries — skip
      }
    }

    if (overlaps.length === 0) {
      noOverlapCount++;
      mappings[newId] = [];
      continue;
    }

    // Normalize weights to sum to 1.0
    const totalArea = overlaps.reduce((sum, o) => sum + o.area, 0);
    const weights = overlaps
      .map(o => ({
        oldId: o.oldId,
        weight: Math.round((o.area / totalArea) * 10000) / 10000,  // 4 decimal places
      }))
      .filter(w => w.weight >= 0.001)  // Drop negligible overlaps (<0.1%)
      .sort((a, b) => b.weight - a.weight);

    // Re-normalize after filtering
    const weightSum = weights.reduce((sum, w) => sum + w.weight, 0);
    if (weightSum > 0 && Math.abs(weightSum - 1) > 0.001) {
      weights.forEach(w => {
        w.weight = Math.round((w.weight / weightSum) * 10000) / 10000;
      });
    }

    // Check if top weight is 1.0 (or very close) — likely a name-matched seat
    if (weights.length === 1 && weights[0].weight >= 0.99) {
      weights[0].weight = 1.0;
      nameMatchCount++;
    } else {
      overlapCount++;
    }

    mappings[newId] = weights;
  }

  console.log(`  Name-match (single 100% overlap): ${nameMatchCount}`);
  console.log(`  Multi-source overlap: ${overlapCount}`);
  console.log(`  No overlap (NI or missing): ${noOverlapCount}`);

  return { from: fromVersion, to: toVersion, mappings };
}

// Main
const outputDir = path.join(__dirname, '..', 'public', 'data', 'transitions');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

for (const [fromVersion, toVersion] of TRANSITIONS) {
  const transition = buildTransition(fromVersion, toVersion);
  const outputPath = path.join(outputDir, `${fromVersion}_to_${toVersion}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(transition));
  console.log(`  Written to ${outputPath}`);
}

console.log('\nDone!');
