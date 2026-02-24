import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadBoundary } from '../helpers/data-loader';

const DATA_DIR = resolve(__dirname, '../../public/data');

interface ContinuityData {
  threshold: number;
  transitions: Record<string, string[]>;
}

interface TransitionMapping {
  from: string;
  to: string;
  mappings: Record<string, { oldId: string; weight: number }[]>;
  reverseMappings: Record<string, { newId: string; weight: number }[]>;
}

const EXPECTED_TRANSITIONS = [
  '1955_to_1974',
  '1974_to_1983',
  '1983_to_1997',
  '1997_to_2005',
  '2005_to_2010',
  '2010_to_2024',
] as const;

function loadContinuity(): ContinuityData {
  const filePath = resolve(DATA_DIR, 'continuity/constituencyContinuity.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function loadTransition(key: string): TransitionMapping {
  const filePath = resolve(DATA_DIR, `transitions/${key}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

describe('Constituency Continuity', () => {
  const continuity = loadContinuity();

  it('has valid schema', () => {
    expect(continuity.threshold).toBe(0.9);
    expect(typeof continuity.transitions).toBe('object');
  });

  it('has all 6 transition keys', () => {
    for (const key of EXPECTED_TRANSITIONS) {
      expect(continuity.transitions[key], `Missing transition key: ${key}`).toBeDefined();
      expect(Array.isArray(continuity.transitions[key]), `${key} is not an array`).toBe(true);
    }
    expect(Object.keys(continuity.transitions)).toHaveLength(EXPECTED_TRANSITIONS.length);
  });

  it('all listed IDs start with EC_', () => {
    for (const [key, ids] of Object.entries(continuity.transitions)) {
      for (const id of ids) {
        expect(id.startsWith('EC_'), `ID ${id} in ${key} does not start with EC_`).toBe(true);
      }
    }
  });

  it('all listed IDs are sorted', () => {
    for (const [key, ids] of Object.entries(continuity.transitions)) {
      const sorted = [...ids].sort();
      expect(ids, `IDs in ${key} are not sorted`).toEqual(sorted);
    }
  });

  for (const key of EXPECTED_TRANSITIONS) {
    it(`IDs in ${key} are valid in the target boundary era`, () => {
      const toEra = key.split('_to_')[1];
      const boundary = loadBoundary(toEra);
      const boundaryIds = new Set(
        boundary.features.map(f => f.properties.id)
      );

      const invalid: string[] = [];
      for (const id of continuity.transitions[key]) {
        if (!boundaryIds.has(id)) {
          invalid.push(id);
        }
      }

      expect(invalid, `Invalid IDs in ${key}:\n  ${invalid.join('\n  ')}`).toHaveLength(0);
    });

    it(`IDs in ${key} actually have >= ${continuity.threshold} same-ID weight (both directions)`, () => {
      const transition = loadTransition(key);

      const badIds: string[] = [];
      for (const id of continuity.transitions[key]) {
        // Forward check
        const fwdWeights = transition.mappings[id];
        if (!fwdWeights) {
          badIds.push(`${id} (not in forward mappings)`);
          continue;
        }
        const fwdWeight = fwdWeights.find(w => w.oldId === id);
        if (!fwdWeight || fwdWeight.weight < continuity.threshold) {
          badIds.push(`${id} (forward: ${fwdWeight?.weight ?? 0})`);
          continue;
        }

        // Reverse check
        const revWeights = transition.reverseMappings?.[id];
        if (!revWeights) {
          badIds.push(`${id} (not in reverse mappings)`);
          continue;
        }
        const revWeight = revWeights.find(w => w.newId === id);
        if (!revWeight || revWeight.weight < continuity.threshold) {
          badIds.push(`${id} (reverse: ${revWeight?.weight ?? 0})`);
        }
      }

      expect(badIds, `IDs below threshold in ${key}:\n  ${badIds.join('\n  ')}`).toHaveLength(0);
    });

    it(`no missing continuous IDs in ${key}`, () => {
      const transition = loadTransition(key);
      const listed = new Set(continuity.transitions[key]);

      const missing: string[] = [];
      for (const [newId, weights] of Object.entries(transition.mappings)) {
        // Forward: fraction of new that came from same-ID old
        const fwdWeight = weights.find(w => w.oldId === newId);
        if (!fwdWeight || fwdWeight.weight < continuity.threshold) continue;

        // Reverse: fraction of old that went to same-ID new
        const revWeights = transition.reverseMappings?.[newId];
        if (!revWeights) continue;
        const revWeight = revWeights.find(w => w.newId === newId);
        if (!revWeight || revWeight.weight < continuity.threshold) continue;

        if (!listed.has(newId)) {
          missing.push(`${newId} (fwd: ${fwdWeight.weight}, rev: ${revWeight.weight})`);
        }
      }

      expect(missing, `Missing continuous IDs in ${key}:\n  ${missing.join('\n  ')}`).toHaveLength(0);
    });
  }
});
