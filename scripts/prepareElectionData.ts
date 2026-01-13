/**
 * Data Preparation Script for UK Election Data
 *
 * This script helps convert election data from the House of Commons Library
 * CSV format to the JSON format expected by the application.
 *
 * Usage:
 * 1. Download the CSV from https://commonslibrary.parliament.uk/research-briefings/cbp-8647/
 * 2. Run: npx ts-node scripts/prepareElectionData.ts <input.csv> <year>
 *
 * The script expects CSV columns like:
 * - constituency_name or Constituency
 * - ons_id or PCON code
 * - party (or separate columns for con, lab, ld, etc.)
 * - votes
 * - vote_share
 * - electorate
 * - turnout
 */

import * as fs from 'fs';
import * as path from 'path';

interface RawResult {
  constituency: string;
  constituencyId: string;
  region: string;
  country: string;
  party: string;
  candidate: string;
  votes: number;
  voteShare: number;
  electorate: number;
  turnout: number;
}

interface PartyResult {
  partyId: string;
  partyName: string;
  candidate: string;
  votes: number;
  voteShare: number;
}

interface ElectionResult {
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

// Party name normalization map
const PARTY_MAP: Record<string, { id: string; name: string }> = {
  conservative: { id: 'con', name: 'Conservative' },
  con: { id: 'con', name: 'Conservative' },
  tory: { id: 'con', name: 'Conservative' },
  labour: { id: 'lab', name: 'Labour' },
  lab: { id: 'lab', name: 'Labour' },
  'liberal democrat': { id: 'ld', name: 'Liberal Democrat' },
  'lib dem': { id: 'ld', name: 'Liberal Democrat' },
  libdem: { id: 'ld', name: 'Liberal Democrat' },
  ld: { id: 'ld', name: 'Liberal Democrat' },
  liberal: { id: 'ld', name: 'Liberal' },
  lib: { id: 'ld', name: 'Liberal' },
  snp: { id: 'snp', name: 'SNP' },
  'scottish national': { id: 'snp', name: 'SNP' },
  'plaid cymru': { id: 'pc', name: 'Plaid Cymru' },
  plaid: { id: 'pc', name: 'Plaid Cymru' },
  pc: { id: 'pc', name: 'Plaid Cymru' },
  green: { id: 'grn', name: 'Green' },
  grn: { id: 'grn', name: 'Green' },
  ukip: { id: 'reform', name: 'UKIP' },
  'reform uk': { id: 'reform', name: 'Reform UK' },
  reform: { id: 'reform', name: 'Reform UK' },
  'brexit party': { id: 'reform', name: 'Brexit Party' },
  dup: { id: 'dup', name: 'DUP' },
  'sinn fein': { id: 'sf', name: 'Sinn Féin' },
  sf: { id: 'sf', name: 'Sinn Féin' },
  alliance: { id: 'all', name: 'Alliance' },
  sdlp: { id: 'sdlp', name: 'SDLP' },
  uup: { id: 'uup', name: 'UUP' },
};

// Region detection based on constituency name patterns or explicit mapping
const REGION_MAP: Record<string, string> = {
  scotland: 'scotland',
  wales: 'wales',
  northern_ireland: 'northern_ireland',
};

function normalizeParty(partyName: string): { id: string; name: string } {
  const normalized = partyName.toLowerCase().trim();
  return PARTY_MAP[normalized] || { id: 'other', name: partyName };
}

function detectCountry(constituencyId: string): string {
  if (constituencyId.startsWith('S')) return 'scotland';
  if (constituencyId.startsWith('W')) return 'wales';
  if (constituencyId.startsWith('N')) return 'northern_ireland';
  return 'england';
}

function parseCSV(content: string): RawResult[] {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

  const results: RawResult[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });

    // Map to our structure (adjust based on actual CSV structure)
    results.push({
      constituency: row['constituency_name'] || row['constituency'] || '',
      constituencyId: row['ons_id'] || row['pcon_code'] || '',
      region: row['region'] || '',
      country: detectCountry(row['ons_id'] || ''),
      party: row['party'] || '',
      candidate: row['candidate'] || row['candidate_name'] || '',
      votes: parseInt(row['votes'] || '0', 10),
      voteShare: parseFloat(row['vote_share'] || '0'),
      electorate: parseInt(row['electorate'] || '0', 10),
      turnout: parseFloat(row['turnout'] || '0'),
    });
  }

  return results;
}

function groupByConstituency(
  rawResults: RawResult[],
  year: number
): ElectionResult[] {
  const grouped = new Map<string, RawResult[]>();

  for (const result of rawResults) {
    const key = result.constituencyId || result.constituency;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(result);
  }

  const electionResults: ElectionResult[] = [];

  for (const [key, results] of grouped) {
    if (results.length === 0) continue;

    const first = results[0];
    const partyResults: PartyResult[] = results.map((r) => {
      const party = normalizeParty(r.party);
      return {
        partyId: party.id,
        partyName: party.name,
        candidate: r.candidate,
        votes: r.votes,
        voteShare: r.voteShare,
      };
    });

    // Sort by votes descending
    partyResults.sort((a, b) => b.votes - a.votes);

    const validVotes = partyResults.reduce((sum, r) => sum + r.votes, 0);
    const winner = partyResults[0]?.partyId || 'unknown';
    const majority =
      partyResults.length >= 2
        ? partyResults[0].votes - partyResults[1].votes
        : partyResults[0]?.votes || 0;

    electionResults.push({
      constituencyId: first.constituencyId,
      constituencyName: first.constituency,
      region: first.region as any,
      country: first.country as any,
      year,
      electorate: first.electorate,
      turnout: first.turnout,
      validVotes,
      winner,
      majority,
      results: partyResults,
    });
  }

  return electionResults;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx ts-node prepareElectionData.ts <input.csv> <year>');
    console.log('Example: npx ts-node prepareElectionData.ts elections-2019.csv 2019');
    process.exit(1);
  }

  const inputFile = args[0];
  const year = parseInt(args[1], 10);

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`Processing ${inputFile} for year ${year}...`);

  const content = fs.readFileSync(inputFile, 'utf-8');
  const rawResults = parseCSV(content);
  const electionResults = groupByConstituency(rawResults, year);

  const output = {
    year,
    date: `${year}-01-01`,
    totalSeats: electionResults.length,
    boundaryVersion: year >= 2024 ? '2024' : year >= 2010 ? '2010' : 'historical',
    constituencies: electionResults,
  };

  const outputFile = path.join(
    __dirname,
    '..',
    'public',
    'data',
    'elections',
    `${year}.json`
  );

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`Created ${outputFile} with ${electionResults.length} constituencies`);
}

main();
