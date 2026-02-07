/**
 * Constituency Matching Utilities
 *
 * Handles matching between boundary file constituency names (from parlconst.org)
 * and election data constituency names (from Electoral Calculus).
 *
 * The parlconst files use abbreviated formats:
 *   - "Hereford & S Herefordshire"
 *   - "Newcastle-upon-Tyne N"
 *
 * Electoral Calculus uses full names:
 *   - "Hereford and South Herefordshire"
 *   - "Newcastle upon Tyne North"
 */

/**
 * Normalize a constituency name to a standard format for matching.
 * This should produce the same output whether the input is from
 * parlconst (abbreviated) or Electoral Calculus (full).
 *
 * Transformations:
 * - "&" → "and"
 * - " N " or " N$" → " North " or " North"
 * - " S " or " S$" → " South " or " South"
 * - " E " or " E$" → " East " or " East"
 * - " W " or " W$" → " West " or " West"
 * - Convert to lowercase
 * - Normalize whitespace
 */
export function normalizeConstituencyName(name: string): string {
  if (!name) return '';

  let normalized = name;

  // Replace & with "and"
  normalized = normalized.replace(/\s*&\s*/g, ' and ');

  // Replace hyphens with spaces first (e.g., "Newcastle-upon-Tyne" → "Newcastle upon Tyne")
  normalized = normalized.replace(/-/g, ' ');

  // Replace directional abbreviations at word boundaries
  // Handle compound directions first (NE, NW, SE, SW)
  normalized = normalized.replace(/\bNE\b/g, 'North East');
  normalized = normalized.replace(/\bNW\b/g, 'North West');
  normalized = normalized.replace(/\bSE\b/g, 'South East');
  normalized = normalized.replace(/\bSW\b/g, 'South West');

  // Then handle single directions at word boundaries
  normalized = normalized.replace(/\bN\b(?=\s|$)/g, 'North');
  normalized = normalized.replace(/\bS\b(?=\s|$)/g, 'South');
  normalized = normalized.replace(/\bE\b(?=\s|$)/g, 'East');
  normalized = normalized.replace(/\bW\b(?=\s|$)/g, 'West');

  // Clean up whitespace and convert to lowercase
  normalized = normalized.replace(/\s+/g, ' ').trim().toLowerCase();

  return normalized;
}

/**
 * Properties found in boundary GeoJSON features.
 * Supports both old (PCON) format and new (parlconst) format.
 */
export interface BoundaryProperties {
  // New parlconst format
  id?: string;
  Name?: string;
  normalizedName?: string;
  nation?: string;
  // Old ONS format
  PCON24NM?: string;
  PCON24CD?: string;
  PCON13NM?: string;
  PCON13CD?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Get the display name from boundary feature properties.
 * Prefers the original Name field for display.
 */
export function getBoundaryDisplayName(props: BoundaryProperties | undefined): string {
  if (!props) return '';
  return props.Name || props.PCON24NM || props.PCON13NM || props.name || '';
}

/**
 * Get a normalized name for matching from boundary feature properties.
 * Uses pre-computed normalizedName if available, otherwise normalizes on the fly.
 */
export function getBoundaryMatchName(props: BoundaryProperties | undefined): string {
  if (!props) return '';

  // If we have a pre-computed normalized name, use it (lowercase for matching)
  if (props.normalizedName) {
    return props.normalizedName.toLowerCase();
  }

  // Otherwise normalize from available name fields
  const name = props.Name || props.PCON24NM || props.PCON13NM || props.name || '';
  return normalizeConstituencyName(name);
}

/**
 * Get the constituency ID from boundary feature properties.
 * New format has id field, old format uses PCON codes.
 */
export function getBoundaryId(props: BoundaryProperties | undefined): string {
  if (!props) return '';
  return props.id || props.PCON24CD || props.PCON13CD || '';
}

/**
 * Create a lookup map from election data for efficient matching.
 * Returns maps keyed by normalized constituency name.
 */
export function createElectionLookup<T extends {
  constituencyId: string;
  constituencyName: string;
  winner: string;
}>(electionData: T[]) {
  const winnerByName = new Map<string, string>();
  const idByName = new Map<string, string>();
  const dataByName = new Map<string, T>();

  for (const result of electionData) {
    const normalizedName = normalizeConstituencyName(result.constituencyName);
    winnerByName.set(normalizedName, result.winner);
    idByName.set(normalizedName, result.constituencyId);
    dataByName.set(normalizedName, result);
  }

  return { winnerByName, idByName, dataByName };
}
