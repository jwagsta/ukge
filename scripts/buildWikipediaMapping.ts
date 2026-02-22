/**
 * Build Wikipedia Constituency Mapping
 *
 * Reads all election data files and builds a mapping from constituency IDs
 * to Wikipedia article titles. Validates titles against Wikipedia's API.
 *
 * Usage:
 *   npx tsx scripts/buildWikipediaMapping.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ELECTIONS_DIR = path.join(__dirname, '..', 'public', 'data', 'elections');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'wikipedia');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'constituencyMapping.json');

const USER_AGENT = 'UKGEVisualization/1.0 (https://github.com/jwagsta/ukge; build script)';
const BATCH_SIZE = 50;
const REQUEST_DELAY = 200;

interface Constituency {
  constituencyId: string;
  constituencyName: string;
}

interface ElectionFile {
  constituencies: Constituency[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Convert constituency name to candidate Wikipedia title */
function nameToWikiTitle(name: string): string {
  // Replace & with "and" and normalize spacing
  let title = name.replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
  // Convert to Wikipedia title format (spaces to underscores)
  title = title.replace(/ /g, '_');
  return `${title}_(UK_Parliament_constituency)`;
}

/** Batch-validate Wikipedia titles using MediaWiki query API */
async function validateTitles(titles: string[]): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);
    const titlesParam = batch.join('|');

    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titlesParam)}&redirects=1&format=json&formatversion=2`;
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!response.ok) {
        console.error(`API error: ${response.status}`);
        batch.forEach((t) => results.set(t, null));
        await sleep(REQUEST_DELAY);
        continue;
      }

      const data = await response.json();

      // Build redirect map
      const redirectMap = new Map<string, string>();
      if (data.query?.redirects) {
        for (const r of data.query.redirects) {
          redirectMap.set(r.from, r.to);
        }
      }

      // Build normalized map (API normalizes titles)
      const normalizedMap = new Map<string, string>();
      if (data.query?.normalized) {
        for (const n of data.query.normalized) {
          normalizedMap.set(n.from, n.to);
        }
      }

      // Check which pages exist
      const pages = data.query?.pages || [];
      const existingTitles = new Set<string>();
      for (const page of pages) {
        if (!page.missing) {
          existingTitles.add(page.title);
        }
      }

      // Map each input title to its resolved state
      for (const title of batch) {
        const normalized = normalizedMap.get(title) || title.replace(/_/g, ' ');
        const redirected = redirectMap.get(normalized) || normalized;
        if (existingTitles.has(redirected)) {
          // Store the original title format (underscored) — the API will handle redirects
          results.set(title, title);
        } else {
          results.set(title, null);
        }
      }
    } catch (error) {
      console.error(`Fetch error for batch starting at ${i}:`, error);
      batch.forEach((t) => results.set(t, null));
    }

    await sleep(REQUEST_DELAY);
  }

  return results;
}

/** Try opensearch fallback for unresolved names */
async function searchFallback(name: string): Promise<string | null> {
  try {
    const query = `${name} UK Parliament constituency`;
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const titles: string[] = data[1] || [];

    // Look for a title matching the constituency pattern
    for (const title of titles) {
      if (title.includes('constituency') || title.includes('Parliament')) {
        return title.replace(/ /g, '_');
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('Building Wikipedia constituency mapping...\n');

  // Collect all unique constituencies from all election files
  const constituencies = new Map<string, string>(); // id -> name
  const files = fs.readdirSync(ELECTIONS_DIR).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const data: ElectionFile = JSON.parse(fs.readFileSync(path.join(ELECTIONS_DIR, file), 'utf-8'));
    for (const c of data.constituencies) {
      if (!constituencies.has(c.constituencyId)) {
        constituencies.set(c.constituencyId, c.constituencyName);
      }
    }
  }

  console.log(`Found ${constituencies.size} unique constituency IDs across ${files.length} election files\n`);

  // Build candidate titles
  const candidateTitles = new Map<string, string>(); // id -> candidate wiki title
  for (const [id, name] of constituencies) {
    candidateTitles.set(id, nameToWikiTitle(name));
  }

  // Validate all candidate titles
  const allTitles = Array.from(new Set(candidateTitles.values()));
  console.log(`Validating ${allTitles.length} unique Wikipedia titles...`);

  const validationResults = await validateTitles(allTitles);

  // Build mapping
  const mapping: Record<string, string> = {};
  const unresolved: Array<{ id: string; name: string; triedTitle: string }> = [];

  for (const [id, candidateTitle] of candidateTitles) {
    const result = validationResults.get(candidateTitle);
    if (result) {
      mapping[id] = candidateTitle;
    } else {
      unresolved.push({ id, name: constituencies.get(id)!, triedTitle: candidateTitle });
    }
  }

  console.log(`\nFirst pass: ${Object.keys(mapping).length} resolved, ${unresolved.length} unresolved\n`);

  // Try opensearch fallback for unresolved
  if (unresolved.length > 0) {
    console.log(`Trying opensearch fallback for ${unresolved.length} unresolved names...`);
    const stillUnresolved: typeof unresolved = [];

    for (const item of unresolved) {
      const fallbackTitle = await searchFallback(item.name);
      if (fallbackTitle) {
        mapping[item.id] = fallbackTitle;
        console.log(`  Resolved: ${item.name} -> ${fallbackTitle}`);
      } else {
        stillUnresolved.push(item);
      }
      await sleep(REQUEST_DELAY);
    }

    if (stillUnresolved.length > 0) {
      console.log(`\nUnresolved (${stillUnresolved.length}):`);
      for (const item of stillUnresolved) {
        console.log(`  ${item.id}: "${item.name}" (tried: ${item.triedTitle})`);
      }
    }
  }

  // Write output
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const output = {
    version: 1,
    generated: new Date().toISOString().split('T')[0],
    constituencies: mapping,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  const totalConstituencies = constituencies.size;
  const resolvedCount = Object.keys(mapping).length;
  console.log(`\nDone! Wrote ${OUTPUT_FILE}`);
  console.log(`Coverage: ${resolvedCount}/${totalConstituencies} (${((resolvedCount / totalConstituencies) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
