/**
 * Process Electoral Calculus Election Data
 *
 * Converts Electoral Calculus .txt files to JSON format for the app.
 * Handles all elections from 1955-2024.
 *
 * Usage:
 *   npx tsx scripts/processElectoralCalculus.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File mappings: filename -> { year, boundaryVersion }
const FILE_MAPPINGS = {
  'electdata_1955.txt': { year: 1955, boundaryVersion: '1950', date: '1955-05-26' },
  'electdata_1959.txt': { year: 1959, boundaryVersion: '1950', date: '1959-10-08' },
  'electdata_1964.txt': { year: 1964, boundaryVersion: '1950', date: '1964-10-15' },
  'electdata_1966.txt': { year: 1966, boundaryVersion: '1950', date: '1966-03-31' },
  'electdata_1970.txt': { year: 1970, boundaryVersion: '1950', date: '1970-06-18' },
  'electdata_1974feb.txt': { year: 197402, boundaryVersion: '1974', date: '1974-02-28' },
  'electdata_1974oct.txt': { year: 197410, boundaryVersion: '1974', date: '1974-10-10' },
  'electdata_1979.txt': { year: 1979, boundaryVersion: '1974', date: '1979-05-03' },
  'electdata_1983.txt': { year: 1983, boundaryVersion: '1983', date: '1983-06-09' },
  'electdata_1987.txt': { year: 1987, boundaryVersion: '1983', date: '1987-06-11' },
  'electdata_1992ob.txt': { year: 1992, boundaryVersion: '1983', date: '1992-04-09' },
  'electdata_1997.txt': { year: 1997, boundaryVersion: '1997', date: '1997-05-01' },
  'electdata_2001ob.txt': { year: 2001, boundaryVersion: '1997', date: '2001-06-07' },
  'electdata_2005ob.txt': { year: 2005, boundaryVersion: '1997', date: '2005-05-05' },
  'electdata_2010.txt': { year: 2010, boundaryVersion: '2010', date: '2010-05-06' },
  'electdata_2015.txt': { year: 2015, boundaryVersion: '2010', date: '2015-05-07' },
  'electdata_2017.txt': { year: 2017, boundaryVersion: '2010', date: '2017-06-08' },
  'electdata_2019.txt': { year: 2019, boundaryVersion: '2010', date: '2019-12-12' },
  'electdata_2024.txt': { year: 2024, boundaryVersion: '2024', date: '2024-07-04' },
};

// Area code to region mapping
// Electoral Calculus: 1=NI, 2=Scotland, 3=NE, 4=NW, 5=Yorks, 6=Wales, 7=WMids, 8=EMids, 9=East, 10=SW, 11=London, 12=SE
const AREA_TO_REGION = {
  '1': 'northern_ireland',
  '2': 'scotland',
  '3': 'north_east',
  '4': 'north_west',
  '5': 'yorkshire',
  '6': 'wales',
  '7': 'west_midlands',
  '8': 'east_midlands',
  '9': 'east',
  '10': 'south_west',
  '11': 'london',
  '12': 'south_east',
};

// Area code to country mapping (for non-England areas)
const AREA_TO_COUNTRY = {
  '1': 'northern_ireland',
  '2': 'scotland',
  '6': 'wales',
};

// Party column mappings
const PARTY_COLUMNS = {
  'CON': { id: 'con', name: 'Conservative' },
  'LAB': { id: 'lab', name: 'Labour' },
  'LIB': { id: 'ld', name: 'Liberal Democrat' },
  'Reform': { id: 'reform', name: 'Reform UK' },
  'Green': { id: 'grn', name: 'Green' },
  'NAT': { id: 'nat', name: 'Nationalist' }, // SNP or Plaid
  'MIN': { id: 'other', name: 'Other' },
  'OTH': { id: 'other', name: 'Other' },
};

function parseElectoralCalculusFile(filepath, metadata) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length === 0) return null;

  // Parse header
  const headers = lines[0].split(';');
  const constituencies = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';');
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });

    const constituencyName = row['Name'] || '';
    const area = row['Area'] || '';
    const electorate = parseInt(row['Electorate'] || '0', 10);

    // Build party results
    const results = [];
    let totalVotes = 0;

    for (const [col, party] of Object.entries(PARTY_COLUMNS)) {
      const votes = parseInt(row[col] || '0', 10);
      if (votes > 0) {
        totalVotes += votes;

        // Handle nationalist parties (SNP vs Plaid)
        let partyId = party.id;
        let partyName = party.name;

        if (col === 'NAT') {
          if (area === '2') { // Scotland
            partyId = 'snp';
            partyName = 'SNP';
          } else if (area === '6') { // Wales
            partyId = 'pc';
            partyName = 'Plaid Cymru';
          }
          // Note: Area 1 (Northern Ireland) doesn't use NAT column - NI parties are in MIN/OTH
        }

        results.push({
          partyId,
          partyName,
          candidate: col === 'CON' || col === 'LAB' || col === 'LIB' ? row['MP'] || '' : '',
          votes,
          voteShare: 0, // Will calculate after
        });
      }
    }

    // Merge duplicate partyId entries (e.g. MIN + OTH both mapped to 'other')
    const merged = new Map();
    for (const r of results) {
      const existing = merged.get(r.partyId);
      if (existing) {
        existing.votes += r.votes;
      } else {
        merged.set(r.partyId, { ...r });
      }
    }
    const mergedResults = Array.from(merged.values());

    // Calculate vote shares
    if (totalVotes > 0) {
      mergedResults.forEach(r => {
        r.voteShare = (r.votes / totalVotes) * 100;
      });
    }

    // Sort by votes descending
    mergedResults.sort((a, b) => b.votes - a.votes);

    const winner = mergedResults[0]?.partyId || 'unknown';
    const majority = mergedResults.length >= 2
      ? mergedResults[0].votes - mergedResults[1].votes
      : mergedResults[0]?.votes || 0;

    // Calculate turnout (Electoral Calculus doesn't provide this directly)
    const turnout = electorate > 0 ? (totalVotes / electorate) * 100 : 0;

    // Determine region and country
    const region = AREA_TO_REGION[area] || 'england';
    const country = AREA_TO_COUNTRY[area] || 'england';

    // Generate constituency ID (based on name since we don't have ONS codes)
    const constituencyId = `EC_${constituencyName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

    constituencies.push({
      constituencyId,
      constituencyName,
      region,
      country,
      year: metadata.year > 100000 ? Math.floor(metadata.year / 100) : metadata.year,
      electorate,
      turnout: Math.round(turnout * 10) / 10,
      validVotes: totalVotes,
      winner,
      majority,
      results: mergedResults,
    });
  }

  return {
    year: metadata.year > 100000 ? Math.floor(metadata.year / 100) : metadata.year,
    date: metadata.date,
    totalSeats: constituencies.length,
    boundaryVersion: metadata.boundaryVersion,
    constituencies,
  };
}

function main() {
  console.log('Processing Electoral Calculus Election Data');
  console.log('===========================================\n');

  const rawDir = path.join(__dirname, '..', 'public', 'data', 'raw');
  const outputDir = path.join(__dirname, '..', 'public', 'data', 'elections');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let processed = 0;
  let failed = 0;

  for (const [filename, metadata] of Object.entries(FILE_MAPPINGS)) {
    const inputPath = path.join(rawDir, filename);

    if (!fs.existsSync(inputPath)) {
      console.log(`Skipping ${filename} (not found)`);
      failed++;
      continue;
    }

    try {
      const data = parseElectoralCalculusFile(inputPath, metadata);

      if (data && data.constituencies.length > 0) {
        // Output filename (handle 1974 special case)
        const outputFilename = `${metadata.year}.json`;
        const outputPath = path.join(outputDir, outputFilename);

        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        console.log(`Created: ${outputFilename} (${data.constituencies.length} constituencies)`);
        processed++;
      } else {
        console.log(`Warning: No data extracted from ${filename}`);
        failed++;
      }
    } catch (error) {
      console.error(`Error processing ${filename}:`, error.message);
      failed++;
    }
  }

  console.log(`\n=== Processing Complete ===`);
  console.log(`Processed: ${processed} files`);
  console.log(`Failed: ${failed} files`);
}

main();
