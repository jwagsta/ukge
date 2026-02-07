import { describe, it, expect } from 'vitest';
import { loadElection } from '../helpers/data-loader';
import { ELECTION_YEARS } from '../helpers/constants';

describe('Election Arithmetic', () => {
  for (const year of ELECTION_YEARS) {
    describe(`${year}`, () => {
      it('sum of result votes equals validVotes', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          const sumVotes = c.results.reduce((sum, r) => sum + r.votes, 0);
          if (sumVotes !== c.validVotes) {
            errors.push(
              `${c.constituencyId} "${c.constituencyName}": sum(votes)=${sumVotes} != validVotes=${c.validVotes}`
            );
          }
        }

        expect(errors, `Vote sum mismatches:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('sum of voteShare approximately equals 100%', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          const sumShare = c.results.reduce((sum, r) => sum + r.voteShare, 0);
          if (Math.abs(sumShare - 100) > 0.5) {
            errors.push(
              `${c.constituencyId} "${c.constituencyName}": sum(voteShare)=${sumShare.toFixed(2)}%`
            );
          }
        }

        expect(errors, `Vote share sum errors:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('winner matches the party with the most votes', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          if (c.results.length === 0) continue;
          const sorted = [...c.results].sort((a, b) => b.votes - a.votes);
          const topParty = sorted[0].partyId;
          if (c.winner !== topParty) {
            errors.push(
              `${c.constituencyId} "${c.constituencyName}": winner="${c.winner}" but top votes party="${topParty}" (${sorted[0].votes} votes)`
            );
          }
        }

        expect(errors, `Winner mismatches:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('turnout approximately equals validVotes / electorate * 100', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          if (c.electorate === 0) continue;
          const computed = (c.validVotes / c.electorate) * 100;
          if (Math.abs(computed - c.turnout) > 0.5) {
            errors.push(
              `${c.constituencyId} "${c.constituencyName}": computed turnout=${computed.toFixed(2)}% but reported=${c.turnout}%`
            );
          }
        }

        expect(errors, `Turnout mismatches:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('majority equals top votes minus second votes', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          if (c.results.length < 2) continue;
          const sorted = [...c.results].sort((a, b) => b.votes - a.votes);
          const expectedMajority = sorted[0].votes - sorted[1].votes;
          if (c.majority !== expectedMajority) {
            errors.push(
              `${c.constituencyId} "${c.constituencyName}": majority=${c.majority} but expected=${expectedMajority} (${sorted[0].votes} - ${sorted[1].votes})`
            );
          }
        }

        expect(errors, `Majority mismatches:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('no negative votes', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          for (const r of c.results) {
            if (r.votes < 0) {
              errors.push(`${c.constituencyId}/${r.partyId}: negative votes ${r.votes}`);
            }
          }
        }

        expect(errors, `Negative votes:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('no voteShare exceeds 100', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          for (const r of c.results) {
            if (r.voteShare > 100) {
              errors.push(`${c.constituencyId}/${r.partyId}: voteShare=${r.voteShare}%`);
            }
          }
        }

        expect(errors, `Vote share > 100:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('electorate is positive', () => {
        const data = loadElection(year);
        const errors: string[] = [];

        for (const c of data.constituencies) {
          if (c.electorate <= 0) {
            errors.push(`${c.constituencyId}: electorate=${c.electorate}`);
          }
        }

        expect(errors, `Non-positive electorates:\n${errors.join('\n')}`).toHaveLength(0);
      });
    });
  }
});
