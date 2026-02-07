import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { loadElection } from '../helpers/data-loader';
import { ELECTION_YEARS, VALID_REGIONS, VALID_COUNTRIES, REGION_TO_COUNTRY } from '../helpers/constants';

const DATA_DIR = resolve(__dirname, '../../public/data');

describe('Election Schema', () => {
  for (const year of ELECTION_YEARS) {
    describe(`${year}`, () => {
      it('file exists', () => {
        const filePath = resolve(DATA_DIR, `elections/${year}.json`);
        expect(existsSync(filePath)).toBe(true);
      });

      it('parses as valid JSON with required top-level fields', () => {
        const data = loadElection(year);
        expect(data).toHaveProperty('year');
        expect(data).toHaveProperty('date');
        expect(data).toHaveProperty('totalSeats');
        expect(data).toHaveProperty('boundaryVersion');
        expect(data).toHaveProperty('constituencies');
        expect(Array.isArray(data.constituencies)).toBe(true);
      });

      it('year field matches filename year', () => {
        const data = loadElection(year);
        expect(data.year).toBe(year);
      });

      it('date is a valid date string', () => {
        const data = loadElection(year);
        expect(typeof data.date).toBe('string');
        expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(isNaN(Date.parse(data.date))).toBe(false);
      });

      it('totalSeats matches constituencies.length', () => {
        const data = loadElection(year);
        expect(data.totalSeats).toBe(data.constituencies.length);
      });

      it('boundaryVersion is a non-empty string', () => {
        const data = loadElection(year);
        expect(typeof data.boundaryVersion).toBe('string');
        expect(data.boundaryVersion.length).toBeGreaterThan(0);
      });

      it('each constituency has required fields with correct types', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          if (typeof c.constituencyId !== 'string' || !c.constituencyId.startsWith('EC_')) {
            errors.push(`${c.constituencyId ?? 'undefined'}: constituencyId must be string starting with EC_`);
          }
          if (typeof c.constituencyName !== 'string' || c.constituencyName.length === 0) {
            errors.push(`${c.constituencyId}: empty constituencyName`);
          }
          if (typeof c.region !== 'string') {
            errors.push(`${c.constituencyId}: region is not a string`);
          }
          if (typeof c.country !== 'string') {
            errors.push(`${c.constituencyId}: country is not a string`);
          }
          if (typeof c.electorate !== 'number') {
            errors.push(`${c.constituencyId}: electorate is not a number`);
          }
          if (typeof c.turnout !== 'number') {
            errors.push(`${c.constituencyId}: turnout is not a number`);
          }
          if (typeof c.validVotes !== 'number') {
            errors.push(`${c.constituencyId}: validVotes is not a number`);
          }
          if (typeof c.winner !== 'string' || c.winner.length === 0) {
            errors.push(`${c.constituencyId}: missing winner`);
          }
          if (typeof c.majority !== 'number') {
            errors.push(`${c.constituencyId}: majority is not a number`);
          }
          if (!Array.isArray(c.results) || c.results.length === 0) {
            errors.push(`${c.constituencyId}: results must be a non-empty array`);
          }
        }

        expect(errors, `Schema errors:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('each result has required fields with correct types', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          for (const r of c.results) {
            if (typeof r.partyId !== 'string' || r.partyId.length === 0) {
              errors.push(`${c.constituencyId}: result missing partyId`);
            }
            if (typeof r.partyName !== 'string') {
              errors.push(`${c.constituencyId}/${r.partyId}: partyName is not a string`);
            }
            if (typeof r.votes !== 'number') {
              errors.push(`${c.constituencyId}/${r.partyId}: votes is not a number`);
            }
            if (typeof r.voteShare !== 'number') {
              errors.push(`${c.constituencyId}/${r.partyId}: voteShare is not a number`);
            }
          }
        }

        expect(errors, `Result schema errors:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('regions are valid GB regions', () => {
        const data = loadElection(year);
        const invalid: string[] = [];

        for (const c of data.constituencies) {
          if (!VALID_REGIONS.includes(c.region as typeof VALID_REGIONS[number])) {
            invalid.push(`${c.constituencyId}: invalid region "${c.region}"`);
          }
        }

        expect(invalid, `Invalid regions:\n${invalid.join('\n')}`).toHaveLength(0);
      });

      it('countries are valid GB countries', () => {
        const data = loadElection(year);
        const invalid: string[] = [];

        for (const c of data.constituencies) {
          if (!VALID_COUNTRIES.includes(c.country as typeof VALID_COUNTRIES[number])) {
            invalid.push(`${c.constituencyId}: invalid country "${c.country}"`);
          }
        }

        expect(invalid, `Invalid countries:\n${invalid.join('\n')}`).toHaveLength(0);
      });

      it('region is consistent with country', () => {
        const data = loadElection(year);
        const mismatches: string[] = [];

        for (const c of data.constituencies) {
          const expected = REGION_TO_COUNTRY[c.region];
          if (expected && expected !== c.country) {
            mismatches.push(
              `${c.constituencyId}: region "${c.region}" implies country "${expected}" but got "${c.country}"`
            );
          }
        }

        expect(mismatches, `Region/country mismatches:\n${mismatches.join('\n')}`).toHaveLength(0);
      });
    });
  }
});
