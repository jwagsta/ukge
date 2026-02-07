import { describe, it, expect } from 'vitest';
import { loadBoundary } from '../helpers/data-loader';
import { BOUNDARY_VERSIONS, GB_BBOX } from '../helpers/constants';
import {
  extractAllCoords,
  extractAllRings,
  isRingClosed,
  bbox,
  centroid,
  geometryArea,
} from '../helpers/geo-utils';
import type { Polygon, MultiPolygon } from 'geojson';

/**
 * Known geometry quality issues inherent in the parlconst.org source data.
 * These are not fixable without regenerating the GeoJSON from scratch.
 */

/** Features with degenerate rings (< 4 points) per boundary version. */
const KNOWN_DEGENERATE_RINGS: Record<string, Set<string>> = {
  '1955': new Set([
    'EC_LIVERPOOL_EDGE_HILL', 'EC_THIRSK_AND_MALTON',
    'EC_BIRMINGHAM_HALL_GREEN', 'EC_BIRMINGHAM_STECHFORD',
    'EC_FIFE_WEST',
  ]),
  '1974': new Set(['EC_ABERDEENSHIRE_WEST']),
  '1983': new Set([
    'EC_BOOTHFERRY', 'EC_SHEFFIELD_BRIGHTSIDE', 'EC_MORLEY_AND_LEEDS_SOUTH',
    'EC_BIRMINGHAM_HODGE_HILL', 'EC_HOLLAND_WITH_BOSTON',
    'EC_PAISLEY_NORTH', 'EC_RENFREW_WEST_AND_INVERCLYDE', 'EC_KIRKCALDY',
    'EC_CUMBERNAULD_AND_KILSYTH', 'EC_EAST_KILBRIDE',
    'EC_EDINBURGH_EAST', 'EC_EDINBURGH_SOUTH',
  ]),
  '1997': new Set([
    'EC_YORKSHIRE_EAST', 'EC_SHEFFIELD_BRIGHTSIDE',
    'EC_BIRMINGHAM_HODGE_HILL', 'EC_BIRMINGHAM_SELLY_OAK',
    'EC_LOUTH_AND_HORNCASTLE', 'EC_SLEAFORD_AND_NORTH_HYKEHAM',
    'EC_FIFE_CENTRAL', 'EC_CARMARTHEN_EAST_AND_DINEFWR',
  ]),
  '2005': new Set([
    'EC_YORKSHIRE_EAST', 'EC_SHEFFIELD_BRIGHTSIDE',
    'EC_BIRMINGHAM_HODGE_HILL', 'EC_BIRMINGHAM_SELLY_OAK',
    'EC_LOUTH_AND_HORNCASTLE', 'EC_SLEAFORD_AND_NORTH_HYKEHAM',
    'EC_CARMARTHEN_EAST_AND_DINEFWR',
  ]),
  '2010': new Set([]),
  '2024': new Set(['EC_NORWICH_NORTH']),
};

/** Features that legitimately span > 3 degrees (island/Highland constituencies). */
const KNOWN_OVERSIZED: Record<string, Set<string>> = {
  '1955': new Set([
    'EC_WESTERN_ISLES', 'EC_INVERNESS', 'EC_ORKNEY_AND_SHETLAND',
  ]),
  '1974': new Set([
    'EC_WESTERN_ISLES', 'EC_INVERNESS', 'EC_ORKNEY_AND_SHETLAND',
  ]),
  '1983': new Set([
    'EC_INVERNESS', 'EC_ROSS', 'EC_WESTERN_ISLES', 'EC_ORKNEY_AND_SHETLAND',
  ]),
  '1997': new Set([
    'EC_INVERNESS_EAST_NAIRN_AND_LOCHABER', 'EC_ORKNEY_AND_SHETLAND',
    'EC_WESTERN_ISLES',
  ]),
  '2005': new Set([
    'EC_NA_H_EILEANAN_AN_IAR__WESTERN_ISLES_', 'EC_ORKNEY_AND_SHETLAND',
  ]),
  '2010': new Set([
    'EC_NA_H_EILEANAN_AN_IAR__WESTERN_ISLES_', 'EC_ORKNEY_AND_SHETLAND',
  ]),
  '2024': new Set([
    'EC_ORKNEY_AND_SHETLAND', 'EC_NA_H_EILEANAN_AN_IAR__WESTERN_ISLES_',
    'EC_INVERNESS__SKYE_AND_WEST_ROSS_SHIRE',
    'EC_CAITHNESS__SUTHERLAND_AND_EASTER_ROSS',
  ]),
};

describe('Boundary Geometry', () => {
  for (const version of BOUNDARY_VERSIONS) {
    describe(`${version}`, () => {
      it('all coordinates within WGS84 GB range', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (const f of data.features) {
          const geo = f.geometry as Polygon | MultiPolygon;
          if (!geo) continue;
          const coords = extractAllCoords(geo);
          for (const [lon, lat] of coords) {
            if (lon < GB_BBOX.minLon || lon > GB_BBOX.maxLon ||
                lat < GB_BBOX.minLat || lat > GB_BBOX.maxLat) {
              errors.push(
                `${f.properties?.id}: coord [${lon}, ${lat}] outside GB bbox`
              );
              break; // One error per feature is enough
            }
          }
        }

        expect(errors, `Out-of-range coordinates:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('no NaN or Infinity coordinate values', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (const f of data.features) {
          const geo = f.geometry as Polygon | MultiPolygon;
          if (!geo) continue;
          const coords = extractAllCoords(geo);
          for (const [lon, lat] of coords) {
            if (!isFinite(lon) || !isFinite(lat)) {
              errors.push(`${f.properties?.id}: non-finite coord [${lon}, ${lat}]`);
              break;
            }
          }
        }

        expect(errors, `Non-finite coordinates:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('all polygon rings are closed', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (const f of data.features) {
          const geo = f.geometry as Polygon | MultiPolygon;
          if (!geo) continue;
          const rings = extractAllRings(geo);
          for (let i = 0; i < rings.length; i++) {
            if (!isRingClosed(rings[i])) {
              errors.push(`${f.properties?.id}: ring ${i} is not closed`);
            }
          }
        }

        expect(errors, `Unclosed rings:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('all rings have at least 4 points', () => {
        const data = loadBoundary(version);
        const known = KNOWN_DEGENERATE_RINGS[version] ?? new Set();
        const errors: string[] = [];

        for (const f of data.features) {
          const geo = f.geometry as Polygon | MultiPolygon;
          if (!geo) continue;
          if (known.has(f.properties?.id)) continue;
          const rings = extractAllRings(geo);
          for (let i = 0; i < rings.length; i++) {
            if (rings[i].length < 4) {
              errors.push(`${f.properties?.id}: ring ${i} has only ${rings[i].length} points`);
            }
          }
        }

        expect(errors, `Rings with < 4 points:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('no zero-area features', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (const f of data.features) {
          const geo = f.geometry as Polygon | MultiPolygon;
          if (!geo) continue;
          const area = geometryArea(geo);
          if (area === 0) {
            errors.push(`${f.properties?.id}: zero area`);
          }
        }

        expect(errors, `Zero-area features:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('no feature spans more than 3 degrees in either dimension', () => {
        const data = loadBoundary(version);
        const known = KNOWN_OVERSIZED[version] ?? new Set();
        const errors: string[] = [];

        for (const f of data.features) {
          const geo = f.geometry as Polygon | MultiPolygon;
          if (!geo) continue;
          if (known.has(f.properties?.id)) continue;
          const coords = extractAllCoords(geo);
          if (coords.length === 0) continue;
          const [minLon, minLat, maxLon, maxLat] = bbox(coords);
          const lonSpan = maxLon - minLon;
          const latSpan = maxLat - minLat;
          if (lonSpan > 3 || latSpan > 3) {
            errors.push(
              `${f.properties?.id}: spans ${lonSpan.toFixed(2)}° lon x ${latSpan.toFixed(2)}° lat`
            );
          }
        }

        expect(errors, `Oversized features:\n${errors.join('\n')}`).toHaveLength(0);
      });

      it('feature centroids fall within GB bounding box', () => {
        const data = loadBoundary(version);
        const errors: string[] = [];

        for (const f of data.features) {
          const geo = f.geometry as Polygon | MultiPolygon;
          if (!geo) continue;
          const coords = extractAllCoords(geo);
          if (coords.length === 0) continue;
          const [cLon, cLat] = centroid(coords);
          if (cLon < GB_BBOX.minLon || cLon > GB_BBOX.maxLon ||
              cLat < GB_BBOX.minLat || cLat > GB_BBOX.maxLat) {
            errors.push(
              `${f.properties?.id}: centroid [${cLon.toFixed(3)}, ${cLat.toFixed(3)}] outside GB bbox`
            );
          }
        }

        expect(errors, `Centroids outside GB:\n${errors.join('\n')}`).toHaveLength(0);
      });
    });
  }
});
