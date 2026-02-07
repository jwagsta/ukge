/**
 * Remove Northern Ireland from Election Data
 *
 * Filters out Northern Ireland constituencies from all election data files
 * and updates the totalSeats count.
 *
 * Usage:
 *   npx ts-node scripts/removeNorthernIreland.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ELECTIONS_DIR = path.join(__dirname, '..', 'public', 'data', 'elections');

interface PartyResult {
  partyId: string;
  partyName: string;
  candidate: string;
  votes: number;
  voteShare: number;
}

interface Constituency {
  constituencyId: string;
  constituencyName: string;
  region: string;
  country: string;
  year: number;
  electorate: number;
  turnout: number;
  validVotes: number;
  winner: string;
  majority: number;
  results: PartyResult[];
}

interface ElectionData {
  year: number;
  date: string;
  totalSeats: number;
  boundaryVersion: string;
  constituencies: Constituency[];
}

function processElectionFile(filepath: string): void {
  const filename = path.basename(filepath);
  console.log(`\nProcessing: ${filename}`);

  // Read the file
  const content = fs.readFileSync(filepath, 'utf-8');
  const data: ElectionData = JSON.parse(content);

  const originalCount = data.constituencies.length;
  const niCount = data.constituencies.filter(c => c.country === 'northern_ireland').length;

  if (niCount === 0) {
    console.log(`  No Northern Ireland constituencies found`);
    return;
  }

  // Filter out Northern Ireland
  data.constituencies = data.constituencies.filter(c => c.country !== 'northern_ireland');

  // Update total seats
  data.totalSeats = data.constituencies.length;

  // Write back
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

  console.log(`  Removed ${niCount} NI constituencies`);
  console.log(`  Updated totalSeats: ${originalCount} → ${data.totalSeats}`);
}

function main(): void {
  console.log('Remove Northern Ireland from Election Data');
  console.log('==========================================');

  if (!fs.existsSync(ELECTIONS_DIR)) {
    console.error(`ERROR: Elections directory not found: ${ELECTIONS_DIR}`);
    return;
  }

  // Get all election files
  const files = fs.readdirSync(ELECTIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  console.log(`\nFound ${files.length} election files`);

  let totalRemoved = 0;

  for (const file of files) {
    const filepath = path.join(ELECTIONS_DIR, file);

    // Read to check NI count before processing
    const content = fs.readFileSync(filepath, 'utf-8');
    const data: ElectionData = JSON.parse(content);
    const niCount = data.constituencies.filter(c => c.country === 'northern_ireland').length;

    processElectionFile(filepath);
    totalRemoved += niCount;
  }

  console.log('\n=== Processing Complete ===\n');
  console.log(`Total NI constituencies removed: ${totalRemoved}`);
  console.log(`Files updated: ${files.length}`);
}

main();
