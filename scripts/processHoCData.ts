/**
 * Process House of Commons Library Election Data
 *
 * Converts CSV data from CBP-8647/CBP-10009 to JSON format for the app.
 * Handles all elections from 1918-2024, including both 1974 elections.
 *
 * Usage:
 *   npx ts-node scripts/processHoCData.ts
 *
 * Input files expected in public/data/raw/:
 *   - hoc-results-1918-2019.csv
 *   - hoc-results-2024.csv
 */

import * as fs from 'fs';
import * as path from 'path';

interface RawRow {
  [key: string]: string;
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

interface ElectionData {
  year: number;
  date: string;
  totalSeats: number;
  boundaryVersion: string;
  constituencies: ElectionResult[];
}

// Extended party mapping for historical parties
const PARTY_MAP: Record<string, { id: string; name: string }> = {
  // Main GB parties
  'conservative': { id: 'con', name: 'Conservative' },
  'con': { id: 'con', name: 'Conservative' },
  'c': { id: 'con', name: 'Conservative' },
  'labour': { id: 'lab', name: 'Labour' },
  'lab': { id: 'lab', name: 'Labour' },
  'l': { id: 'lab', name: 'Labour' },
  'liberal democrat': { id: 'ld', name: 'Liberal Democrat' },
  'lib dem': { id: 'ld', name: 'Liberal Democrat' },
  'libdem': { id: 'ld', name: 'Liberal Democrat' },
  'ld': { id: 'ld', name: 'Liberal Democrat' },

  // Historical liberal parties
  'liberal': { id: 'liberal', name: 'Liberal' },
  'lib': { id: 'liberal', name: 'Liberal' },
  'national liberal': { id: 'natlib', name: 'National Liberal' },
  'nat lib': { id: 'natlib', name: 'National Liberal' },
  'liberal national': { id: 'natlib', name: 'National Liberal' },
  'liberal unionist': { id: 'natlib', name: 'Liberal Unionist' },

  // SDP and Alliance
  'sdp': { id: 'sdp', name: 'SDP' },
  'social democratic party': { id: 'sdp', name: 'SDP' },
  'sdp/liberal alliance': { id: 'sdplib', name: 'SDP-Liberal Alliance' },
  'alliance': { id: 'sdplib', name: 'SDP-Liberal Alliance' },
  'liberal/sdp alliance': { id: 'sdplib', name: 'SDP-Liberal Alliance' },

  // Scottish/Welsh nationals
  'snp': { id: 'snp', name: 'SNP' },
  'scottish national party': { id: 'snp', name: 'SNP' },
  'plaid cymru': { id: 'pc', name: 'Plaid Cymru' },
  'plaid': { id: 'pc', name: 'Plaid Cymru' },
  'pc': { id: 'pc', name: 'Plaid Cymru' },

  // Green
  'green': { id: 'grn', name: 'Green' },
  'green party': { id: 'grn', name: 'Green' },

  // Reform/UKIP/Brexit
  'ukip': { id: 'reform', name: 'UKIP' },
  'reform uk': { id: 'reform', name: 'Reform UK' },
  'reform': { id: 'reform', name: 'Reform UK' },
  'brexit party': { id: 'reform', name: 'Brexit Party' },
  'brexit': { id: 'reform', name: 'Brexit Party' },

  // Northern Ireland parties
  'dup': { id: 'dup', name: 'DUP' },
  'democratic unionist': { id: 'dup', name: 'DUP' },
  'democratic unionist party': { id: 'dup', name: 'DUP' },
  'sinn fein': { id: 'sf', name: 'Sinn Féin' },
  'sinn féin': { id: 'sf', name: 'Sinn Féin' },
  'sf': { id: 'sf', name: 'Sinn Féin' },
  'sdlp': { id: 'sdlp', name: 'SDLP' },
  'social democratic and labour': { id: 'sdlp', name: 'SDLP' },
  'uup': { id: 'uup', name: 'UUP' },
  'ulster unionist': { id: 'uup', name: 'UUP' },
  'ulster unionist party': { id: 'uup', name: 'UUP' },
  'alliance party': { id: 'alliance', name: 'Alliance' },
  'apni': { id: 'alliance', name: 'Alliance' },
  'tuv': { id: 'tuv', name: 'TUV' },
  'traditional unionist voice': { id: 'tuv', name: 'TUV' },

  // Historical NI/Irish parties
  'unionist': { id: 'ulu', name: 'Ulster Unionist' },
  'uu': { id: 'ulu', name: 'Ulster Unionist' },
  'nationalist': { id: 'ipnat', name: 'Irish Nationalist' },
  'irish nationalist': { id: 'ipnat', name: 'Irish Nationalist' },
  'ipp': { id: 'ipnat', name: 'Irish Parliamentary Party' },

  // Other historical
  'communist': { id: 'comm', name: 'Communist' },
  'cpgb': { id: 'comm', name: 'Communist' },
  'labour co-operative': { id: 'lab', name: 'Labour' }, // Treat as Labour
  'lab co-op': { id: 'lab', name: 'Labour' },
  'independent labour': { id: 'indlab', name: 'Independent Labour' },
  'ilp': { id: 'indlab', name: 'Independent Labour' },
  'national': { id: 'national', name: 'National' },
  'national government': { id: 'national', name: 'National' },
  'national labour': { id: 'national', name: 'National Labour' },

  // Speaker
  'speaker': { id: 'speaker', name: 'Speaker' },
  'spk': { id: 'speaker', name: 'Speaker' },

  // Independent
  'independent': { id: 'ind', name: 'Independent' },
  'ind': { id: 'ind', name: 'Independent' },
};

// Boundary version mapping
const BOUNDARY_VERSIONS: Record<number, string> = {
  1918: '1918', 1922: '1918', 1923: '1918', 1924: '1918',
  1929: '1918', 1931: '1918', 1935: '1918', 1945: '1918',
  1950: '1950', 1951: '1950', 1955: '1950', 1959: '1950',
  1964: '1950', 1966: '1950', 1970: '1950',
  197402: '1974', 197410: '1974', 1974: '1974', 1979: '1974',
  1983: '1983', 1987: '1983', 1992: '1983',
  1997: '1997', 2001: '1997', 2005: '1997',
  2010: '2010', 2015: '2010', 2017: '2010', 2019: '2010',
  2024: '2024',
};

// Election dates
const ELECTION_DATES: Record<number, string> = {
  1918: '1918-12-14',
  1922: '1922-11-15',
  1923: '1923-12-06',
  1924: '1924-10-29',
  1929: '1929-05-30',
  1931: '1931-10-27',
  1935: '1935-11-14',
  1945: '1945-07-05',
  1950: '1950-02-23',
  1951: '1951-10-25',
  1955: '1955-05-26',
  1959: '1959-10-08',
  1964: '1964-10-15',
  1966: '1966-03-31',
  1970: '1970-06-18',
  197402: '1974-02-28',
  197410: '1974-10-10',
  1979: '1979-05-03',
  1983: '1983-06-09',
  1987: '1987-06-11',
  1992: '1992-04-09',
  1997: '1997-05-01',
  2001: '2001-06-07',
  2005: '2005-05-05',
  2010: '2010-05-06',
  2015: '2015-05-07',
  2017: '2017-06-08',
  2019: '2019-12-12',
  2024: '2024-07-04',
};

// Region mapping based on constituency patterns
const REGION_PATTERNS: Record<string, RegExp> = {
  scotland: /^S/,
  wales: /^W/,
  northern_ireland: /^N/,
};

function normalizeParty(partyName: string): { id: string; name: string } {
  const normalized = partyName.toLowerCase().trim();
  return PARTY_MAP[normalized] || { id: 'other', name: partyName || 'Other' };
}

function detectCountry(constituencyId: string): string {
  if (constituencyId.startsWith('S')) return 'scotland';
  if (constituencyId.startsWith('W')) return 'wales';
  if (constituencyId.startsWith('N')) return 'northern_ireland';
  return 'england';
}

function detectRegion(constituencyId: string, constituencyName: string): string {
  // First check by ID prefix
  if (constituencyId.startsWith('S')) return 'scotland';
  if (constituencyId.startsWith('W')) return 'wales';
  if (constituencyId.startsWith('N')) return 'northern_ireland';

  // Default to a generic region - ideally would have more detailed mapping
  return 'england';
}

function parseCSV(content: string): RawRow[] {
  const lines = content.split('\n');
  if (lines.length === 0) return [];

  // Parse header row
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const results: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: RawRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    results.push(row);
  }

  return results;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function groupByConstituencyAndYear(
  rows: RawRow[]
): Map<string, Map<number, RawRow[]>> {
  const grouped = new Map<string, Map<number, RawRow[]>>();

  for (const row of rows) {
    const constituencyId = row['ons_id'] || row['pcon_code'] || row['constituency_id'] || '';
    const constituencyName = row['constituency_name'] || row['constituency'] || '';
    const key = constituencyId || constituencyName;

    // Determine year - handle 1974 special case
    let year = parseInt(row['election'] || row['year'] || '0', 10);
    const electionDate = row['election_date'] || row['date'] || '';

    if (year === 1974 && electionDate) {
      // Check if it's February or October 1974
      if (electionDate.includes('02') || electionDate.includes('Feb')) {
        year = 197402;
      } else if (electionDate.includes('10') || electionDate.includes('Oct')) {
        year = 197410;
      }
    }

    if (!year || !key) continue;

    if (!grouped.has(key)) {
      grouped.set(key, new Map());
    }

    const yearMap = grouped.get(key)!;
    if (!yearMap.has(year)) {
      yearMap.set(year, []);
    }

    yearMap.get(year)!.push(row);
  }

  return grouped;
}

function processElectionYear(
  grouped: Map<string, Map<number, RawRow[]>>,
  year: number
): ElectionResult[] {
  const results: ElectionResult[] = [];

  for (const [key, yearMap] of grouped) {
    const rows = yearMap.get(year);
    if (!rows || rows.length === 0) continue;

    const first = rows[0];
    const constituencyId = first['ons_id'] || first['pcon_code'] || first['constituency_id'] || `UNMAPPED_${key.toUpperCase().replace(/\s+/g, '_')}`;
    const constituencyName = first['constituency_name'] || first['constituency'] || key;

    const partyResults: PartyResult[] = [];

    for (const row of rows) {
      const partyRaw = row['party'] || row['party_name'] || '';
      const party = normalizeParty(partyRaw);
      const votes = parseInt(row['votes'] || '0', 10);
      const voteShare = parseFloat(row['vote_share'] || row['share'] || '0');
      const candidate = row['candidate'] || row['candidate_name'] || '';

      if (votes > 0 || partyRaw) {
        partyResults.push({
          partyId: party.id,
          partyName: party.name,
          candidate,
          votes,
          voteShare,
        });
      }
    }

    // Sort by votes descending
    partyResults.sort((a, b) => b.votes - a.votes);

    if (partyResults.length === 0) continue;

    const validVotes = partyResults.reduce((sum, r) => sum + r.votes, 0);
    const winner = partyResults[0]?.partyId || 'unknown';
    const majority = partyResults.length >= 2
      ? partyResults[0].votes - partyResults[1].votes
      : partyResults[0]?.votes || 0;

    // Recalculate vote shares if needed
    if (validVotes > 0) {
      for (const pr of partyResults) {
        if (!pr.voteShare || pr.voteShare === 0) {
          pr.voteShare = (pr.votes / validVotes) * 100;
        }
      }
    }

    const electorate = parseInt(first['electorate'] || '0', 10);
    const turnout = parseFloat(first['turnout'] || '0');

    results.push({
      constituencyId,
      constituencyName,
      region: detectRegion(constituencyId, constituencyName),
      country: detectCountry(constituencyId),
      year: year > 100000 ? Math.floor(year / 100) : year, // Convert 197402 back to 1974 for display
      electorate,
      turnout,
      validVotes,
      winner,
      majority,
      results: partyResults,
    });
  }

  return results;
}

function writeElectionData(year: number, results: ElectionResult[]): void {
  const outputDir = path.join(__dirname, '..', 'public', 'data', 'elections');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const data: ElectionData = {
    year: year > 100000 ? Math.floor(year / 100) : year,
    date: ELECTION_DATES[year] || `${year}-01-01`,
    totalSeats: results.length,
    boundaryVersion: BOUNDARY_VERSIONS[year] || 'unknown',
    constituencies: results,
  };

  // Use appropriate filename for 1974 elections
  const filename = year === 197402 ? '197402.json'
    : year === 197410 ? '197410.json'
    : `${year}.json`;

  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Created: ${outputPath} (${results.length} constituencies)`);
}

async function main(): Promise<void> {
  console.log('Processing House of Commons Library Election Data');
  console.log('=================================================\n');

  const rawDir = path.join(__dirname, '..', 'public', 'data', 'raw');

  // Check for input files
  const historicalFile = path.join(rawDir, 'hoc-results-1918-2019.csv');
  const file2024 = path.join(rawDir, 'hoc-results-2024.csv');

  let allRows: RawRow[] = [];

  // Process historical data
  if (fs.existsSync(historicalFile)) {
    console.log(`Reading: ${historicalFile}`);
    const content = fs.readFileSync(historicalFile, 'utf-8');
    const rows = parseCSV(content);
    console.log(`Parsed ${rows.length} rows from historical data`);
    allRows = allRows.concat(rows);
  } else {
    console.log(`Warning: ${historicalFile} not found`);
    console.log('Please download from: https://researchbriefings.files.parliament.uk/documents/CBP-8647/');
  }

  // Process 2024 data
  if (fs.existsSync(file2024)) {
    console.log(`Reading: ${file2024}`);
    const content = fs.readFileSync(file2024, 'utf-8');
    const rows = parseCSV(content);
    console.log(`Parsed ${rows.length} rows from 2024 data`);
    allRows = allRows.concat(rows);
  } else {
    console.log(`Warning: ${file2024} not found`);
    console.log('Please download from: https://researchbriefings.files.parliament.uk/documents/CBP-10009/');
  }

  if (allRows.length === 0) {
    console.log('\nNo data to process. Please download the required CSV files first.');
    console.log('Run: npx ts-node scripts/downloadData.ts');
    return;
  }

  // Group by constituency and year
  console.log('\nGrouping data by constituency and year...');
  const grouped = groupByConstituencyAndYear(allRows);

  // Get all years present in the data
  const years = new Set<number>();
  for (const yearMap of grouped.values()) {
    for (const year of yearMap.keys()) {
      years.add(year);
    }
  }

  console.log(`Found elections for years: ${Array.from(years).sort((a, b) => a - b).join(', ')}`);

  // Process each year
  console.log('\nProcessing elections...');
  for (const year of Array.from(years).sort((a, b) => a - b)) {
    const results = processElectionYear(grouped, year);
    if (results.length > 0) {
      writeElectionData(year, results);
    }
  }

  console.log('\nProcessing complete!');
}

main().catch(console.error);
