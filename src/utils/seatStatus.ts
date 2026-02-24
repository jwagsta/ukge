/**
 * Seat Status (Hold/Gain) Computation
 *
 * Computes whether each constituency is a hold, gain, or new seat relative to
 * the previous election. Used for visual encoding on winner-mode maps.
 */

import type { ElectionResult } from '@/types/election';
import type { TransitionMapping } from '@/utils/notionalResults';

export type SeatStatus = 'hold' | 'gain' | 'new_boundaries' | null;

export interface SeatStatusInfo {
  status: SeatStatus;
  /** Party ID of previous winner (for "gain from X" display) */
  previousWinner?: string;
}

/**
 * Compute hold/gain/new-boundaries status for each constituency.
 *
 * - Same boundary era: look up same ID in previousData
 * - Cross-boundary era: find highest-weight source in transitionMapping;
 *   if weight >= 0.90, use that predecessor; otherwise 'new_boundaries'
 * - No previous data (1955): returns empty map
 */
export function computeSeatStatus(
  currentData: ElectionResult[],
  previousData: ElectionResult[],
  transitionMapping: TransitionMapping | null,
  isCrossBoundary: boolean,
): Map<string, SeatStatusInfo> {
  const result = new Map<string, SeatStatusInfo>();

  if (previousData.length === 0) return result;

  // Build lookup of previous election data by constituency ID
  const prevById = new Map<string, ElectionResult>();
  for (const d of previousData) {
    prevById.set(d.constituencyId, d);
  }

  for (const current of currentData) {
    const { constituencyId, winner } = current;

    if (!isCrossBoundary) {
      // Same boundary era: direct ID match
      const prev = prevById.get(constituencyId);
      if (prev) {
        if (prev.winner.toLowerCase() === winner.toLowerCase()) {
          result.set(constituencyId, { status: 'hold', previousWinner: prev.winner });
        } else {
          result.set(constituencyId, { status: 'gain', previousWinner: prev.winner });
        }
      }
      // If no prev data (shouldn't happen within same era), leave as undefined
    } else {
      // Cross-boundary era
      // First check direct ID match (some IDs survive boundary changes)
      const directMatch = prevById.get(constituencyId);
      if (directMatch) {
        if (directMatch.winner.toLowerCase() === winner.toLowerCase()) {
          result.set(constituencyId, { status: 'hold', previousWinner: directMatch.winner });
        } else {
          result.set(constituencyId, { status: 'gain', previousWinner: directMatch.winner });
        }
        continue;
      }

      if (!transitionMapping) continue;

      const weights = transitionMapping.mappings[constituencyId];
      if (!weights || weights.length === 0) continue;

      // Find highest-weight source
      let maxWeight = 0;
      let maxOldId = '';
      for (const { oldId, weight } of weights) {
        if (weight > maxWeight) {
          maxWeight = weight;
          maxOldId = oldId;
        }
      }

      if (maxWeight >= 0.90 && maxOldId) {
        const prevData = prevById.get(maxOldId);
        if (prevData) {
          if (prevData.winner.toLowerCase() === winner.toLowerCase()) {
            result.set(constituencyId, { status: 'hold', previousWinner: prevData.winner });
          } else {
            result.set(constituencyId, { status: 'gain', previousWinner: prevData.winner });
          }
        } else {
          result.set(constituencyId, { status: 'new_boundaries' });
        }
      } else {
        result.set(constituencyId, { status: 'new_boundaries' });
      }
    }
  }

  return result;
}

/**
 * Get fill opacity for a constituency based on its hold/gain status.
 * Only applies in winner mode; other modes return their default opacity.
 */
export function getSeatFillOpacity(
  status: SeatStatus | undefined,
  mapColorMode: string,
  hasWinner: boolean,
  variant: 'choropleth' | 'hex',
  showSeatStatus: boolean = true,
): number {
  // Non-winner modes: use existing defaults
  if (mapColorMode !== 'winner') {
    if (variant === 'choropleth') return hasWinner ? 1 : 0.5;
    return 0.85;
  }

  if (!hasWinner) return 0.5;

  // When seat status display is off, use uniform opacity
  if (!showSeatStatus) {
    return variant === 'choropleth' ? 1.0 : 0.85;
  }

  switch (status) {
    case 'gain':
      return variant === 'choropleth' ? 1.0 : 0.95;
    case 'hold':
      return 0.35;
    case 'new_boundaries':
      return 0.55;
    default:
      // null/undefined: no status data (e.g. 1955 or NI)
      return variant === 'choropleth' ? 1.0 : 0.85;
  }
}

/**
 * Get stroke color for a constituency based on its hold/gain status.
 * Gains get a black border in winner mode when showSeatStatus is on.
 */
export function getSeatStrokeColor(
  status: SeatStatus | undefined,
  mapColorMode: string,
  showSeatStatus: boolean = true,
): string {
  if (showSeatStatus && mapColorMode === 'winner' && status === 'gain') {
    return '#000';
  }
  return '#fff';
}
