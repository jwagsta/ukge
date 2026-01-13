/**
 * Data Download Script for UK Election Data
 *
 * Downloads election data and boundary files from various sources:
 * - House of Commons Library (CBP-8647 for 1918-2019, CBP-10009 for 2024)
 * - parlconst.org for historical boundary files
 *
 * Usage:
 *   npx ts-node scripts/downloadData.ts
 *
 * Prerequisites:
 *   npm install xlsx node-fetch@2
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const DATA_SOURCES = {
  // House of Commons Library - General election results 1918-2019
  hocLibrary: {
    url: 'https://researchbriefings.files.parliament.uk/documents/CBP-8647/1918-2019election_results.csv',
    filename: 'hoc-results-1918-2019.csv',
  },
  // 2024 election results
  hoc2024: {
    url: 'https://researchbriefings.files.parliament.uk/documents/CBP-10009/HoC-GE2024-results-by-constituency.csv',
    filename: 'hoc-results-2024.csv',
  },
};

// Boundary eras - years that use each boundary set
const BOUNDARY_ERAS: Record<string, number[]> = {
  '1918': [1918, 1922, 1923, 1924, 1929, 1931, 1935, 1945],
  '1950': [1950, 1951, 1955, 1959, 1964, 1966, 1970],
  '1974': [1974], // Both Feb and Oct use same boundaries
  '1983': [1983, 1987, 1992],
  '1997': [1997, 2001, 2005],
  '2010': [2010, 2015, 2017, 2019],
  '2024': [2024],
};

// Boundary download URLs from parlconst.org (GeoJSON format)
const BOUNDARY_SOURCES: Record<string, string> = {
  // These URLs need to be discovered from parlconst.org's data endpoints
  '1918': 'https://www.parlconst.org/data/england/1918.geojson',
  '1950': 'https://www.parlconst.org/data/england/1950.geojson',
  '1974': 'https://www.parlconst.org/data/england/1974.geojson',
  '1983': 'https://www.parlconst.org/data/england/1983.geojson',
  '1997': 'https://www.parlconst.org/data/england/1997.geojson',
  '2010': 'https://www.parlconst.org/data/england/2005.geojson', // 2005 boundaries used until 2024
  '2024': 'https://www.parlconst.org/data/england/2024.geojson',
};

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data');

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);

    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          console.log(`Redirecting to: ${redirectUrl}`);
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode} - ${url}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${destPath}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

async function downloadElectionData(): Promise<void> {
  const rawDir = path.join(OUTPUT_DIR, 'raw');
  ensureDirectory(rawDir);

  console.log('\n=== Downloading Election Data ===\n');

  for (const [name, source] of Object.entries(DATA_SOURCES)) {
    const destPath = path.join(rawDir, source.filename);
    try {
      await downloadFile(source.url, destPath);
    } catch (error) {
      console.error(`Failed to download ${name}:`, error);
      console.log(`\nPlease manually download from: ${source.url}`);
      console.log(`And save to: ${destPath}\n`);
    }
  }
}

async function downloadBoundaryFiles(): Promise<void> {
  const boundariesDir = path.join(OUTPUT_DIR, 'boundaries');
  ensureDirectory(boundariesDir);

  console.log('\n=== Downloading Boundary Files ===\n');
  console.log('Note: Historical boundaries may need manual download from parlconst.org');
  console.log('Visit: https://www.parlconst.org/constituency-maps\n');

  // For now, just create placeholder info file
  const infoPath = path.join(boundariesDir, 'README.md');
  const info = `# UK Parliamentary Constituency Boundaries

## Required Boundary Files

The following boundary files are needed for each era:

| Era | Elections Covered | Source |
|-----|-------------------|--------|
| 1918 | 1918, 1922, 1923, 1924, 1929, 1931, 1935, 1945 | parlconst.org |
| 1950 | 1950, 1951, 1955, 1959, 1964, 1966, 1970 | parlconst.org |
| 1974 | Feb 1974, Oct 1974, 1979 | parlconst.org |
| 1983 | 1983, 1987, 1992 | parlconst.org |
| 1997 | 1997, 2001, 2005 | parlconst.org |
| 2010 | 2010, 2015, 2017, 2019 | parlconst.org / ONS |
| 2024 | 2024 | ONS Open Geography Portal |

## Download Instructions

1. Visit https://www.parlconst.org/constituency-maps
2. Select the year you need
3. Click the share icon and download as GeoJSON
4. Save combined England/Wales/Scotland/NI file as {era}.json

For 2024 boundaries:
1. Visit https://geoportal.statistics.gov.uk
2. Search for "Westminster Parliamentary Constituencies July 2024"
3. Download the GeoJSON file

## File Format

Each boundary file should be a FeatureCollection with:
- Feature properties including constituency code and name
- Polygon or MultiPolygon geometry
`;

  fs.writeFileSync(infoPath, info);
  console.log(`Created: ${infoPath}`);
}

async function main(): Promise<void> {
  console.log('UK Election Data Download Script');
  console.log('================================\n');

  ensureDirectory(OUTPUT_DIR);

  await downloadElectionData();
  await downloadBoundaryFiles();

  console.log('\n=== Download Complete ===');
  console.log('\nNext steps:');
  console.log('1. Run: npx ts-node scripts/processHoCData.ts');
  console.log('2. Manually download boundary files from parlconst.org if automatic download failed');
  console.log('3. Run: npx ts-node scripts/processBoundaries.ts');
}

main().catch(console.error);
