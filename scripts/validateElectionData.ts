/**
 * Validate Election Data
 *
 * Checks election data files for common issues:
 * - Correct country/region attribution
 * - Party-country consistency (SNP only in Scotland, PC only in Wales)
 * - Constituency count validation
 * - Duplicate ID detection
 *
 * Usage:
 *   npx tsx scripts/validateElectionData.ts
 *   npx tsx scripts/validateElectionData.ts 2024  # Validate specific year
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PartyResult {
  partyId: string;
  partyName: string;
  votes: number;
}

interface Constituency {
  constituencyId: string;
  constituencyName: string;
  region: string;
  country: string;
  winner: string;
  results: PartyResult[];
}

interface ElectionData {
  year: number;
  totalSeats: number;
  constituencies: Constituency[];
}

// Expected seat counts by era (approximate - some variation exists)
const EXPECTED_SEATS: Record<string, { total: number; scotland: number; wales: number; ni: number }> = {
  '2024': { total: 650, scotland: 57, wales: 32, ni: 18 },
  '2010': { total: 650, scotland: 59, wales: 40, ni: 18 },
  '1997': { total: 659, scotland: 72, wales: 40, ni: 18 },
  '1983': { total: 650, scotland: 72, wales: 38, ni: 17 },
  '1974': { total: 635, scotland: 71, wales: 36, ni: 12 },
  '1950': { total: 625, scotland: 71, wales: 36, ni: 12 },
};

// Scotland-only parties
const SCOTLAND_PARTIES = ['snp'];

// Wales-only parties
const WALES_PARTIES = ['pc'];

// Northern Ireland parties
const NI_PARTIES = ['dup', 'sf', 'sdlp', 'uup', 'alliance', 'tuv', 'pbp'];

interface ValidationError {
  type: 'error' | 'warning';
  message: string;
}

function validateElectionData(year: number): ValidationError[] {
  const errors: ValidationError[] = [];

  const dataPath = path.join(__dirname, '..', 'public', 'data', 'elections', `${year}.json`);

  if (!fs.existsSync(dataPath)) {
    return [{ type: 'error', message: `Data file not found: ${dataPath}` }];
  }

  const data: ElectionData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // Count by country
  const countryCounts = { scotland: 0, wales: 0, northern_ireland: 0, england: 0 };
  const seenIds = new Set<string>();

  for (const c of data.constituencies) {
    // Check for duplicate IDs
    if (seenIds.has(c.constituencyId)) {
      errors.push({ type: 'error', message: `Duplicate constituency ID: ${c.constituencyId}` });
    }
    seenIds.add(c.constituencyId);

    // Count by country
    const country = c.country || 'england';
    if (country in countryCounts) {
      countryCounts[country as keyof typeof countryCounts]++;
    }

    // Check Scotland-only parties
    for (const partyId of SCOTLAND_PARTIES) {
      const hasParty = c.results.some(r => r.partyId === partyId && r.votes > 0);
      if (hasParty && country !== 'scotland') {
        errors.push({
          type: 'error',
          message: `${partyId.toUpperCase()} found in non-Scotland constituency: ${c.constituencyName} (${c.constituencyId}) - marked as ${country}`,
        });
      }
    }

    // Check Wales-only parties
    for (const partyId of WALES_PARTIES) {
      const hasParty = c.results.some(r => r.partyId === partyId && r.votes > 0);
      if (hasParty && country !== 'wales') {
        errors.push({
          type: 'error',
          message: `${partyId.toUpperCase()} found in non-Wales constituency: ${c.constituencyName} (${c.constituencyId}) - marked as ${country}`,
        });
      }
    }

    // Check NI-only parties
    for (const partyId of NI_PARTIES) {
      const hasParty = c.results.some(r => r.partyId === partyId && r.votes > 0);
      if (hasParty && country !== 'northern_ireland') {
        errors.push({
          type: 'error',
          message: `${partyId.toUpperCase()} found in non-NI constituency: ${c.constituencyName} (${c.constituencyId}) - marked as ${country}`,
        });
      }
    }

    // Check SNP should be in Scotland
    if (c.winner === 'snp' && country !== 'scotland') {
      errors.push({
        type: 'error',
        message: `SNP won in non-Scotland constituency: ${c.constituencyName} (${c.constituencyId}) - marked as ${country}`,
      });
    }

    // Check PC should be in Wales
    if (c.winner === 'pc' && country !== 'wales') {
      errors.push({
        type: 'error',
        message: `Plaid Cymru won in non-Wales constituency: ${c.constituencyName} (${c.constituencyId}) - marked as ${country}`,
      });
    }
  }

  // Report country counts
  console.log(`\n  Country breakdown for ${year}:`);
  console.log(`    Scotland: ${countryCounts.scotland}`);
  console.log(`    Wales: ${countryCounts.wales}`);
  console.log(`    Northern Ireland: ${countryCounts.northern_ireland}`);
  console.log(`    England: ${countryCounts.england}`);
  console.log(`    Total: ${data.totalSeats}`);

  // Find closest expected seat count
  const boundaryVersion = getBoundaryVersionForYear(year);
  const expected = EXPECTED_SEATS[boundaryVersion];

  if (expected) {
    if (Math.abs(countryCounts.scotland - expected.scotland) > 2) {
      errors.push({
        type: 'warning',
        message: `Scotland seat count (${countryCounts.scotland}) differs significantly from expected (${expected.scotland})`,
      });
    }
    if (Math.abs(countryCounts.wales - expected.wales) > 2) {
      errors.push({
        type: 'warning',
        message: `Wales seat count (${countryCounts.wales}) differs significantly from expected (${expected.wales})`,
      });
    }
    if (Math.abs(countryCounts.northern_ireland - expected.ni) > 2) {
      errors.push({
        type: 'warning',
        message: `Northern Ireland seat count (${countryCounts.northern_ireland}) differs significantly from expected (${expected.ni})`,
      });
    }
  }

  return errors;
}

function getBoundaryVersionForYear(year: number): string {
  if (year >= 2024) return '2024';
  if (year >= 2010) return '2010';
  if (year >= 1997) return '1997';
  if (year >= 1983) return '1983';
  if (year >= 1974 || year === 197402 || year === 197410) return '1974';
  return '1950';
}

function main() {
  const args = process.argv.slice(2);

  // All available years
  const allYears = [
    1955, 1959, 1964, 1966, 1970,
    197402, 197410, 1979,
    1983, 1987, 1992,
    1997, 2001, 2005,
    2010, 2015, 2017, 2019, 2024
  ];

  const yearsToValidate = args.length > 0
    ? args.map(a => parseInt(a, 10))
    : allYears;

  console.log('=== Election Data Validation ===\n');

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const year of yearsToValidate) {
    console.log(`\nValidating ${year}...`);
    const errors = validateElectionData(year);

    const errCount = errors.filter(e => e.type === 'error').length;
    const warnCount = errors.filter(e => e.type === 'warning').length;

    totalErrors += errCount;
    totalWarnings += warnCount;

    if (errors.length === 0) {
      console.log(`  ✓ No issues found`);
    } else {
      for (const error of errors) {
        const prefix = error.type === 'error' ? '  ✗' : '  ⚠';
        console.log(`${prefix} ${error.message}`);
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Total warnings: ${totalWarnings}`);

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
