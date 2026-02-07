import { describe, it, expect } from 'vitest';
import { loadElection } from '../helpers/data-loader';
import {
  ELECTION_YEARS,
  YEAR_TO_BOUNDARY,
  SNP_PARTY_IDS,
  PLAID_PARTY_IDS,
  NI_PARTY_IDS,
} from '../helpers/constants';

describe('Election Constraints', () => {
  for (const year of ELECTION_YEARS) {
    describe(`${year}`, () => {
      it('no duplicate constituency IDs', () => {
        const data = loadElection(year);
        const seen = new Map<string, string>();
        const duplicates: string[] = [];

        for (const c of data.constituencies) {
          if (seen.has(c.constituencyId)) {
            duplicates.push(
              `${c.constituencyId}: "${c.constituencyName}" duplicates "${seen.get(c.constituencyId)}"`
            );
          }
          seen.set(c.constituencyId, c.constituencyName);
        }

        expect(duplicates, `Duplicate IDs:\n${duplicates.join('\n')}`).toHaveLength(0);
      });

      it('no duplicate constituency names', () => {
        const data = loadElection(year);
        const seen = new Map<string, string>();
        const duplicates: string[] = [];

        for (const c of data.constituencies) {
          if (seen.has(c.constituencyName)) {
            duplicates.push(
              `"${c.constituencyName}": ${c.constituencyId} duplicates ${seen.get(c.constituencyName)}`
            );
          }
          seen.set(c.constituencyName, c.constituencyId);
        }

        expect(duplicates, `Duplicate names:\n${duplicates.join('\n')}`).toHaveLength(0);
      });

      it('SNP only appears in Scotland', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          for (const r of c.results) {
            if (SNP_PARTY_IDS.includes(r.partyId.toLowerCase() as typeof SNP_PARTY_IDS[number])) {
              if (c.region !== 'scotland') {
                errors.push(
                  `${c.constituencyId} "${c.constituencyName}" (${c.region}): has SNP candidate`
                );
              }
            }
          }
        }

        expect(errors, `SNP outside Scotland:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('Plaid Cymru only appears in Wales', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          for (const r of c.results) {
            if (PLAID_PARTY_IDS.includes(r.partyId.toLowerCase() as typeof PLAID_PARTY_IDS[number])) {
              if (c.region !== 'wales') {
                errors.push(
                  `${c.constituencyId} "${c.constituencyName}" (${c.region}): has Plaid Cymru candidate`
                );
              }
            }
          }
        }

        expect(errors, `Plaid Cymru outside Wales:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('no Northern Ireland constituencies', () => {
        const data = loadElection(year);
        const niConstituencies: string[] = [];

        for (const c of data.constituencies) {
          if (c.country === 'northern_ireland' || c.region === 'northern_ireland') {
            niConstituencies.push(`${c.constituencyId} "${c.constituencyName}"`);
          }
        }

        expect(
          niConstituencies,
          `NI constituencies found:\n${niConstituencies.join('\n')}`
        ).toHaveLength(0);
      });

      it('no Northern Ireland parties', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          for (const r of c.results) {
            if (NI_PARTY_IDS.includes(r.partyId.toLowerCase() as typeof NI_PARTY_IDS[number])) {
              errors.push(
                `${c.constituencyId}/${r.partyId}: NI party "${r.partyName}" found`
              );
            }
          }
        }

        expect(errors, `NI parties found:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('boundaryVersion matches expected mapping', () => {
        const data = loadElection(year);
        const expected = YEAR_TO_BOUNDARY[year];
        expect(
          data.boundaryVersion,
          `Year ${year}: boundaryVersion="${data.boundaryVersion}" but expected="${expected}"`
        ).toBe(expected);
      });

      it('year field in each constituency matches file year', () => {
        const data = loadElection(year);
        const mismatches: string[] = [];

        for (const c of data.constituencies) {
          if (c.year !== year) {
            mismatches.push(`${c.constituencyId}: constituency year=${c.year} but file year=${year}`);
          }
        }

        expect(mismatches, `Year mismatches:\n${mismatches.join('\n')}`).toHaveLength(0);
      });
    });
  }
});
