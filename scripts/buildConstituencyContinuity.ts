/**
 * Build Constituency Continuity Mapping
 *
 * Reads transition files and identifies constituencies where the same-ID entry
 * has an overlap weight >= 0.90 across boundary changes. These represent genuine
 * continuity (the constituency kept its name/ID and its boundaries barely changed).
 *
 * Output: public/data/continuity/constituencyContinuity.json
 *
 * Usage:
 *   npx tsx scripts/buildConstituencyContinuity.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRANSITIONS_DIR = path.join(__dirname, '..', 'public', 'data', 'transitions');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'continuity');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'constituencyContinuity.json');

const CONTINUITY_THRESHOLD = 0.90;

// Adjacent boundary eras (must match buildBoundaryTransitions.ts)
const TRANSITIONS: [string, string][] = [
  ['1955', '1974'],
  ['1974', '1983'],
  ['1983', '1997'],
  ['1997', '2005'],
  ['2005', '2010'],
  ['2010', '2024'],
];

interface TransitionMapping {
  from: string;
  to: string;
  mappings: Record<string, { oldId: string; weight: number }[]>;
  reverseMappings: Record<string, { newId: string; weight: number }[]>;
}

function main() {
  console.log('Building constituency continuity mapping...\n');

  const transitions: Record<string, string[]> = {};

  for (const [fromVersion, toVersion] of TRANSITIONS) {
    const key = `${fromVersion}_to_${toVersion}`;
    const filePath = path.join(TRANSITIONS_DIR, `${key}.json`);

    if (!fs.existsSync(filePath)) {
      console.error(`  Missing transition file: ${filePath}`);
      process.exit(1);
    }

    const data: TransitionMapping = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const continuousIds: string[] = [];

    for (const [newId, weights] of Object.entries(data.mappings)) {
      // Forward check: what fraction of the NEW constituency came from the same-ID old one
      const forwardWeight = weights.find(w => w.oldId === newId);
      if (!forwardWeight || forwardWeight.weight < CONTINUITY_THRESHOLD) continue;

      // Reverse check: what fraction of the OLD constituency went to the same-ID new one
      const reverseWeights = data.reverseMappings?.[newId];
      if (!reverseWeights) continue;
      const reverseWeight = reverseWeights.find(w => w.newId === newId);
      if (!reverseWeight || reverseWeight.weight < CONTINUITY_THRESHOLD) continue;

      continuousIds.push(newId);
    }

    continuousIds.sort();
    transitions[key] = continuousIds;

    const totalNew = Object.keys(data.mappings).length;
    console.log(`  ${key}: ${continuousIds.length}/${totalNew} continuous (${((continuousIds.length / totalNew) * 100).toFixed(1)}%)`);
  }

  // Write output
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const output = {
    threshold: CONTINUITY_THRESHOLD,
    transitions,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));
  console.log(`\nDone! Wrote ${OUTPUT_FILE}`);
}

main();
