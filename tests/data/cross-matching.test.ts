import { describe, it, expect } from 'vitest';
import { loadElection, loadBoundary } from '../helpers/data-loader';
import { ELECTION_YEARS, YEAR_TO_BOUNDARY } from '../helpers/constants';
import { normalizeConstituencyName } from '@/utils/constituencyMatching';

/**
 * Known unfixable mismatches between election and boundary data.
 *
 * 1992 Milton Keynes: The constituency was a single seat in 1983/1987 but split
 * into Milton Keynes NE and Milton Keynes SW for 1992, without a corresponding
 * boundary change. The boundary file has 1 feature (EC_MILTON_KEYNES) but
 * the election has 2 constituencies (EC_MILTON_KEYNES_NORTH_EAST, EC_MILTON_KEYNES_SOUTH_WEST).
 * Fixing this would require manually splitting the geometry.
 */
const KNOWN_EXCEPTIONS: Record<number, {
  extraElectionIds: string[];
  extraBoundaryIds: string[];
  countDelta: number; // election count - boundary count
}> = {
  1992: {
    extraElectionIds: ['EC_MILTON_KEYNES_NORTH_EAST', 'EC_MILTON_KEYNES_SOUTH_WEST'],
    extraBoundaryIds: ['EC_MILTON_KEYNES'],
    countDelta: 1, // 634 election seats, 633 boundary features
  },
};

describe('Cross-Matching: Elections ↔ Boundaries', () => {
  for (const year of ELECTION_YEARS) {
    const boundaryVersion = YEAR_TO_BOUNDARY[year];
    const exceptions = KNOWN_EXCEPTIONS[year];

    describe(`${year} (boundary: ${boundaryVersion})`, () => {
      it('constituency counts match', () => {
        const election = loadElection(year);
        const boundary = loadBoundary(boundaryVersion);

        // Deduplicate boundary features by ID
        const uniqueBoundaryIds = new Set(
          boundary.features.map((f) => f.properties?.id).filter(Boolean)
        );

        console.log(
          `  ${year}: ${election.constituencies.length} election constituencies, ` +
          `${boundary.features.length} boundary features (${uniqueBoundaryIds.size} unique IDs)`
        );

        const expectedDelta = exceptions?.countDelta ?? 0;
        expect(election.constituencies.length).toBe(uniqueBoundaryIds.size + expectedDelta);
      });

      it('every election constituency ID exists in boundary features', () => {
        const election = loadElection(year);
        const boundary = loadBoundary(boundaryVersion);

        const boundaryIds = new Set(
          boundary.features.map((f) => f.properties?.id).filter(Boolean)
        );

        const knownExtra = new Set(exceptions?.extraElectionIds ?? []);

        const missing: string[] = [];
        for (const c of election.constituencies) {
          if (!boundaryIds.has(c.constituencyId) && !knownExtra.has(c.constituencyId)) {
            missing.push(`${c.constituencyId} "${c.constituencyName}"`);
          }
        }

        if (missing.length > 0) {
          console.log(`  ${year}: ${missing.length} election IDs missing from boundaries:`);
          for (const m of missing.slice(0, 20)) {
            console.log(`    - ${m}`);
          }
          if (missing.length > 20) {
            console.log(`    ... and ${missing.length - 20} more`);
          }
        }

        expect(missing, `Election IDs missing from boundaries:\n${missing.join('\n')}`).toHaveLength(0);
      });

      it('every boundary feature ID exists in election data', () => {
        const election = loadElection(year);
        const boundary = loadBoundary(boundaryVersion);

        const electionIds = new Set(
          election.constituencies.map((c) => c.constituencyId)
        );

        const knownExtra = new Set(exceptions?.extraBoundaryIds ?? []);

        // Deduplicate boundary IDs
        const boundaryIds = new Set(
          boundary.features.map((f) => f.properties?.id).filter(Boolean)
        );

        const missing: string[] = [];
        for (const id of boundaryIds) {
          if (!electionIds.has(id) && !knownExtra.has(id)) {
            const feature = boundary.features.find((f) => f.properties?.id === id);
            missing.push(`${id} "${feature?.properties?.Name ?? 'unknown'}"`);
          }
        }

        if (missing.length > 0) {
          console.log(`  ${year}: ${missing.length} boundary IDs missing from election data:`);
          for (const m of missing.slice(0, 20)) {
            console.log(`    - ${m}`);
          }
          if (missing.length > 20) {
            console.log(`    ... and ${missing.length - 20} more`);
          }
        }

        expect(missing, `Boundary IDs missing from election data:\n${missing.join('\n')}`).toHaveLength(0);
      });

      it('name-based matching via normalizeConstituencyName succeeds for all', () => {
        const election = loadElection(year);
        const boundary = loadBoundary(boundaryVersion);

        // Build normalized name lookup from boundary features
        const boundaryNameToId = new Map<string, string>();
        for (const f of boundary.features) {
          const name = f.properties?.Name;
          if (!name) continue;
          const normalized = normalizeConstituencyName(name);
          boundaryNameToId.set(normalized, f.properties.id);
        }

        const knownExtra = new Set(exceptions?.extraElectionIds ?? []);

        const unmatched: string[] = [];
        for (const c of election.constituencies) {
          if (knownExtra.has(c.constituencyId)) continue;
          const normalized = normalizeConstituencyName(c.constituencyName);
          if (!boundaryNameToId.has(normalized)) {
            unmatched.push(
              `"${c.constituencyName}" (normalized: "${normalized}") [${c.constituencyId}]`
            );
          }
        }

        if (unmatched.length > 0) {
          console.log(`  ${year}: ${unmatched.length} election names not matched in boundaries:`);
          for (const u of unmatched.slice(0, 20)) {
            console.log(`    - ${u}`);
          }
          if (unmatched.length > 20) {
            console.log(`    ... and ${unmatched.length - 20} more`);
          }
        }

        expect(
          unmatched,
          `Unmatched names:\n${unmatched.join('\n')}`
        ).toHaveLength(0);
      });

      it('country/nation values agree between matched pairs', () => {
        const election = loadElection(year);
        const boundary = loadBoundary(boundaryVersion);

        // Build ID lookup from boundary
        const boundaryById = new Map<string, { nation: string; Name: string }>();
        for (const f of boundary.features) {
          const id = f.properties?.id;
          if (!id) continue;
          boundaryById.set(id, {
            nation: f.properties.nation,
            Name: f.properties.Name,
          });
        }

        const knownExtraIds = new Set(exceptions?.extraElectionIds ?? []);
        const mismatches: string[] = [];
        for (const c of election.constituencies) {
          if (knownExtraIds.has(c.constituencyId)) continue;
          const bFeature = boundaryById.get(c.constituencyId);
          if (!bFeature) continue; // Already tested in ID matching test

          if (c.country !== bFeature.nation) {
            mismatches.push(
              `${c.constituencyId} "${c.constituencyName}": election country="${c.country}" but boundary nation="${bFeature.nation}"`
            );
          }
        }

        if (mismatches.length > 0) {
          console.log(`  ${year}: ${mismatches.length} country/nation mismatches:`);
          for (const m of mismatches.slice(0, 10)) {
            console.log(`    - ${m}`);
          }
        }

        expect(
          mismatches,
          `Country/nation mismatches:\n${mismatches.join('\n')}`
        ).toHaveLength(0);
      });
    });
  }
});
