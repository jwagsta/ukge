import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadElection } from '../helpers/data-loader';
import { ELECTION_YEARS } from '../helpers/constants';

const DATA_DIR = resolve(__dirname, '../../public/data');

interface WikipediaMapping {
  version: number;
  generated: string;
  constituencies: Record<string, string>;
}

function loadMapping(): WikipediaMapping {
  const filePath = resolve(DATA_DIR, 'wikipedia/constituencyMapping.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

describe('Wikipedia Mapping', () => {
  const mapping = loadMapping();

  it('has valid schema', () => {
    expect(mapping.version).toBe(1);
    expect(typeof mapping.generated).toBe('string');
    expect(mapping.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof mapping.constituencies).toBe('object');
    expect(Object.keys(mapping.constituencies).length).toBeGreaterThan(0);
  });

  it('all values are non-empty strings', () => {
    for (const [id, title] of Object.entries(mapping.constituencies)) {
      expect(title, `Empty title for ${id}`).toBeTruthy();
      expect(typeof title, `Non-string title for ${id}`).toBe('string');
    }
  });

  it('all keys start with EC_', () => {
    for (const id of Object.keys(mapping.constituencies)) {
      expect(id.startsWith('EC_'), `Key ${id} does not start with EC_`).toBe(true);
    }
  });

  it('titles contain no spaces (use underscores)', () => {
    for (const [id, title] of Object.entries(mapping.constituencies)) {
      expect(title.includes(' '), `Title for ${id} contains spaces: "${title}"`).toBe(false);
    }
  });

  for (const year of ELECTION_YEARS) {
    it(`covers all constituencies in ${year}`, () => {
      const election = loadElection(year);
      const unmapped: string[] = [];

      for (const c of election.constituencies) {
        if (!mapping.constituencies[c.constituencyId]) {
          unmapped.push(`${c.constituencyId} (${c.constituencyName})`);
        }
      }

      expect(unmapped, `Unmapped constituencies in ${year}:\n  ${unmapped.join('\n  ')}`).toHaveLength(0);
    });
  }
});
