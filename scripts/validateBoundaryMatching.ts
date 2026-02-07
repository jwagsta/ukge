/**
 * Validate Boundary Matching Script
 *
 * Checks that constituency names in boundary files match constituency names
 * in election data files. Reports mismatches to help identify normalization issues.
 *
 * Usage:
 *   npx ts-node scripts/validateBoundaryMatching.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ELECTIONS_DIR = path.join(__dirname, '..', 'public', 'data', 'elections');
const BOUNDARIES_DIR = path.join(__dirname, '..', 'public', 'data', 'boundaries');

// Boundary version mapping - same as in electionStore.ts
const BOUNDARY_VERSIONS: Record<number, string> = {
  1955: '1955', 1959: '1955', 1964: '1955', 1966: '1955', 1970: '1955',
  197402: '1974', 197410: '1974', 1979: '1974',
  1983: '1983', 1987: '1983', 1992: '1983',
  1997: '1997', 2001: '1997',
  2005: '2005',
  2010: '2010', 2015: '2010', 2017: '2010', 2019: '2010',
  2024: '2024',
};

// Name normalization - same as in constituencyMatching.ts
function normalizeConstituencyName(name: string): string {
  if (!name) return '';

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

  // Clean up whitespace and convert to lowercase
  normalized = normalized.replace(/\s+/g, ' ').trim().toLowerCase();

  return normalized;
}

interface BoundaryFeature {
  properties: {
    Name?: string;
    normalizedName?: string;
    [key: string]: unknown;
  };
}

interface BoundaryFile {
  features: BoundaryFeature[];
}

interface ElectionConstituency {
  constituencyId: string;
  constituencyName: string;
}

interface ElectionFile {
  year: number;
  constituencies: ElectionConstituency[];
}

interface ValidationResult {
  electionYear: number;
  boundaryVersion: string;
  electionCount: number;
  boundaryCount: number;
  matched: number;
  unmatchedInElection: string[];
  unmatchedInBoundary: string[];
}

function validateYear(electionYear: number): ValidationResult | null {
  const boundaryVersion = BOUNDARY_VERSIONS[electionYear];
  if (!boundaryVersion) {
    console.warn(`No boundary version for year ${electionYear}`);
    return null;
  }

  // Load election data
  const electionPath = path.join(ELECTIONS_DIR, `${electionYear}.json`);
  if (!fs.existsSync(electionPath)) {
    console.warn(`Election file not found: ${electionPath}`);
    return null;
  }
  const electionData: ElectionFile = JSON.parse(fs.readFileSync(electionPath, 'utf-8'));

  // Load boundary data
  const boundaryPath = path.join(BOUNDARIES_DIR, `${boundaryVersion}.json`);
  if (!fs.existsSync(boundaryPath)) {
    console.warn(`Boundary file not found: ${boundaryPath}`);
    return null;
  }
  const boundaryData: BoundaryFile = JSON.parse(fs.readFileSync(boundaryPath, 'utf-8'));

  // Create sets of normalized names
  const electionNames = new Map<string, string>();
  for (const c of electionData.constituencies) {
    const normalized = normalizeConstituencyName(c.constituencyName);
    electionNames.set(normalized, c.constituencyName);
  }

  const boundaryNames = new Map<string, string>();
  for (const f of boundaryData.features) {
    const originalName = f.properties.Name || '';
    const normalized = f.properties.normalizedName
      ? f.properties.normalizedName.toLowerCase()
      : normalizeConstituencyName(originalName);
    boundaryNames.set(normalized, originalName);
  }

  // Find matches and mismatches
  let matched = 0;
  const unmatchedInElection: string[] = [];
  const unmatchedInBoundary: string[] = [];

  for (const [normalized, original] of electionNames) {
    if (boundaryNames.has(normalized)) {
      matched++;
    } else {
      unmatchedInElection.push(original);
    }
  }

  for (const [normalized, original] of boundaryNames) {
    if (!electionNames.has(normalized)) {
      unmatchedInBoundary.push(original);
    }
  }

  return {
    electionYear,
    boundaryVersion,
    electionCount: electionData.constituencies.length,
    boundaryCount: boundaryData.features.length,
    matched,
    unmatchedInElection,
    unmatchedInBoundary,
  };
}

function main(): void {
  console.log('Boundary Matching Validation');
  console.log('============================\n');

  const years = Object.keys(BOUNDARY_VERSIONS).map(Number).sort((a, b) => a - b);
  let totalMismatches = 0;

  for (const year of years) {
    const result = validateYear(year);
    if (!result) continue;

    const matchRate = ((result.matched / result.electionCount) * 100).toFixed(1);
    const status = result.unmatchedInElection.length === 0 ? '✓' : '✗';

    console.log(`${status} ${year} (boundaries: ${result.boundaryVersion})`);
    console.log(`  Election: ${result.electionCount}, Boundaries: ${result.boundaryCount}, Matched: ${result.matched} (${matchRate}%)`);

    if (result.unmatchedInElection.length > 0) {
      console.log(`  Unmatched in election data (${result.unmatchedInElection.length}):`);
      result.unmatchedInElection.slice(0, 10).forEach(name => {
        console.log(`    - ${name}`);
      });
      if (result.unmatchedInElection.length > 10) {
        console.log(`    ... and ${result.unmatchedInElection.length - 10} more`);
      }
      totalMismatches += result.unmatchedInElection.length;
    }

    if (result.unmatchedInBoundary.length > 5) {
      console.log(`  Extra in boundaries (${result.unmatchedInBoundary.length}):`);
      result.unmatchedInBoundary.slice(0, 5).forEach(name => {
        console.log(`    - ${name}`);
      });
      if (result.unmatchedInBoundary.length > 5) {
        console.log(`    ... and ${result.unmatchedInBoundary.length - 5} more`);
      }
    }

    console.log('');
  }

  console.log('=== Summary ===\n');
  console.log(`Total unmatched constituencies: ${totalMismatches}`);

  if (totalMismatches === 0) {
    console.log('\nAll constituencies matched successfully!');
  } else {
    console.log('\nSome constituencies need attention. Check the output above.');
  }
}

main();
