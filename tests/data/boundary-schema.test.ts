import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { loadBoundary } from '../helpers/data-loader';
import { BOUNDARY_VERSIONS, VALID_COUNTRIES } from '../helpers/constants';
import { normalizeConstituencyName } from '@/utils/constituencyMatching';

const DATA_DIR = resolve(__dirname, '../../public/data');

describe('Boundary Schema', () => {
  for (const version of BOUNDARY_VERSIONS) {
    describe(`${version}`, () => {
      it('file exists', () => {
        const filePath = resolve(DATA_DIR, `boundaries/${version}.json`);
        expect(existsSync(filePath)).toBe(true);
      });

      it('is a valid GeoJSON FeatureCollection', () => {
        const data = loadBoundary(version);
        expect(data.type).toBe('FeatureCollection');
        expect(Array.isArray(data.features)).toBe(true);
        expect(data.features.length).toBeGreaterThan(0);
      });

      it('reports feature count', () => {
        const data = loadBoundary(version);
        // This test always passes -- it reports the count for reference
        console.log(`  Boundary ${version}: ${data.features.length} features`);
        expect(data.features.length).toBeGreaterThan(0);
      });

      it('all features have required properties: id, Name, normalizedName, nation', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (let i = 0; i < data.features.length; i++) {
          const f = data.features[i];
          const props = f.properties;
          if (!props) {
            errors.push(`Feature[${i}]: no properties`);
            continue;
          }
          if (typeof props.id !== 'string' || props.id.length === 0) {
            errors.push(`Feature[${i}]: missing or empty id`);
          }
          if (typeof props.Name !== 'string' || props.Name.length === 0) {
            errors.push(`Feature[${i}] (${props.id}): missing or empty Name`);
          }
          if (typeof props.normalizedName !== 'string' || props.normalizedName.length === 0) {
            errors.push(`Feature[${i}] (${props.id}): missing or empty normalizedName`);
          }
          if (typeof props.nation !== 'string' || props.nation.length === 0) {
            errors.push(`Feature[${i}] (${props.id}): missing or empty nation`);
          }
        }

        expect(errors, `Missing properties:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('all feature IDs start with EC_', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (const f of data.features) {
          if (!f.properties?.id?.startsWith('EC_')) {
            errors.push(`${f.properties?.id ?? 'undefined'}: does not start with EC_`);
          }
        }

        expect(errors, `Invalid IDs:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('nation values are only england/scotland/wales', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (const f of data.features) {
          const nation = f.properties?.nation;
          if (!VALID_COUNTRIES.includes(nation as typeof VALID_COUNTRIES[number])) {
            errors.push(`${f.properties?.id}: invalid nation "${nation}"`);
          }
        }

        expect(errors, `Invalid nations:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('geometry type is Polygon or MultiPolygon', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (const f of data.features) {
          const geoType = f.geometry?.type;
          if (geoType !== 'Polygon' && geoType !== 'MultiPolygon') {
            errors.push(`${f.properties?.id}: geometry type "${geoType}"`);
          }
        }

        expect(errors, `Invalid geometry types:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('no duplicate feature IDs', () => {
        const data = loadBoundary(version);
        const seen = new Map<string, number>();
        const duplicates: string[] = [];

        for (const f of data.features) {
          const id = f.properties?.id;
          if (!id) continue;
          const count = (seen.get(id) ?? 0) + 1;
          seen.set(id, count);
          if (count === 2) {
            duplicates.push(id);
          }
        }

        if (duplicates.length > 0) {
          console.log(`  Boundary ${version}: ${duplicates.length} duplicate IDs: ${duplicates.join(', ')}`);
        }

        expect(duplicates, `Duplicate IDs:\n${duplicates.join('\n')}`).toHaveLength(0);
      });

      it('normalizedName is consistent with normalizeConstituencyName(Name)', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (const f of data.features) {
          const props = f.properties;
          if (!props?.Name || !props?.normalizedName) continue;

          const expected = normalizeConstituencyName(props.Name);
          // Compare lowercase since normalizeConstituencyName returns lowercase
          const actual = props.normalizedName.toLowerCase();
          if (actual !== expected) {
            errors.push(
              `${props.id}: normalizedName="${props.normalizedName}" but expected="${expected}" (from Name="${props.Name}")`
            );
          }
        }

        expect(errors, `Normalization mismatches:\n${errors.join('\n')}`).toHaveLength(0);
      });
    });
  }
});
