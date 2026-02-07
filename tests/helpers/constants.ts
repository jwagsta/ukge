/**
 * Test constants: expected counts, mappings, and bounding boxes.
 */

/** All election years in the dataset. */
export const ELECTION_YEARS = [
  1955, 1959, 1964, 1966, 1970,
  197402, 197410, 1979,
  1983, 1987, 1992,
  1997, 2001,
  2005,
  2010, 2015, 2017, 2019,
  2024,
] as const;

/** Boundary version files that exist. */
export const BOUNDARY_VERSIONS = [
  '1955', '1974', '1983', '1997', '2005', '2010', '2024',
] as const;

/**
 * Mapping from election year to the boundary version it should use.
 * Mirrors BOUNDARY_VERSIONS in src/store/electionStore.ts.
 */
export const YEAR_TO_BOUNDARY: Record<number, string> = {
  1955: '1955', 1959: '1955', 1964: '1955', 1966: '1955', 1970: '1955',
  197402: '1974', 197410: '1974', 1979: '1974',
  1983: '1983', 1987: '1983', 1992: '1983',
  1997: '1997', 2001: '1997',
  2005: '2005',
  2010: '2010', 2015: '2010', 2017: '2010', 2019: '2010',
  2024: '2024',
};

/**
 * Expected constituency counts per boundary version.
 * These are approximate -- tests will report actual counts.
 */
export const EXPECTED_BOUNDARY_COUNTS: Record<string, number> = {
  '1955': 630,
  '1974': 635,
  '1983': 633,
  '1997': 641,
  '2005': 628,
  '2010': 632,
  '2024': 632,
};

/** Regions that belong to Scotland. */
export const SCOTLAND_REGIONS = ['scotland'] as const;

/** Regions that belong to Wales. */
export const WALES_REGIONS = ['wales'] as const;

/** Regions that belong to England. */
export const ENGLAND_REGIONS = [
  'north_east', 'north_west', 'yorkshire',
  'east_midlands', 'west_midlands', 'east',
  'london', 'south_east', 'south_west',
] as const;

/** Map from region to country. */
export const REGION_TO_COUNTRY: Record<string, string> = {
  scotland: 'scotland',
  wales: 'wales',
  north_east: 'england',
  north_west: 'england',
  yorkshire: 'england',
  east_midlands: 'england',
  west_midlands: 'england',
  east: 'england',
  london: 'england',
  south_east: 'england',
  south_west: 'england',
};

/** Valid country values (GB only, no NI). */
export const VALID_COUNTRIES = ['england', 'scotland', 'wales'] as const;

/** Valid region values (GB only, no NI). */
export const VALID_REGIONS = [
  ...ENGLAND_REGIONS, ...SCOTLAND_REGIONS, ...WALES_REGIONS,
] as const;

/** GB bounding box for WGS84 coordinates. */
export const GB_BBOX = {
  minLon: -9,
  maxLon: 2,
  minLat: 49.5,
  maxLat: 61.5,
} as const;

/** SNP party IDs (Scotland-only parties). */
export const SNP_PARTY_IDS = ['snp'] as const;

/** Plaid Cymru party IDs (Wales-only parties). */
export const PLAID_PARTY_IDS = ['pc', 'plaid'] as const;

/** Northern Ireland party IDs (should not appear). */
export const NI_PARTY_IDS = [
  'sf', 'sinn_fein', 'dup', 'sdlp', 'uup', 'alliance_ni', 'tuv',
] as const;
