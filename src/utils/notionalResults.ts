/**
 * Notional Results Computation
 *
 * Produces notional previous election data for cross-boundary swing calculations.
 * Uses area-weighted overlap to estimate "previous" results for constituencies
 * that were redrawn between boundary eras.
 *
 * For constituencies that exist in both eras (name-matched by ID), the actual
 * previous data is used. Only unmatched seats use area-weighted estimates.
 */

import type { ElectionResult, PartyResult } from '@/types/election';

export interface TransitionMapping {
  from: string;
  to: string;
  mappings: Record<string, { oldId: string; weight: number }[]>;
}

export interface NotionalSwingData {
  /** Notional previous-election results (real for name-matched, estimated for others) */
  notionalData: ElectionResult[];
  /** Set of constituency IDs whose data is estimated (area-weighted) rather than actual */
  estimatedIds: Set<string>;
}

/**
 * Compute notional previous-election results for cross-boundary swing.
 *
 * For each constituency in currentData:
 * - If its ID exists in previousData → use actual previous data (not estimated)
 * - If it has transition mappings → compute weighted-average results from old constituencies
 * - Otherwise → no data (constituency will render grey on map)
 */
export function computeNotionalResults(
  currentData: ElectionResult[],
  previousData: ElectionResult[],
  transition: TransitionMapping,
): NotionalSwingData {
  // Build lookup of previous election data by constituency ID
  const prevById = new Map<string, ElectionResult>();
  for (const d of previousData) {
    prevById.set(d.constituencyId, d);
  }

  const notionalData: ElectionResult[] = [];
  const estimatedIds = new Set<string>();

  for (const current of currentData) {
    const { constituencyId } = current;

    // 1. Direct ID match → use actual previous data
    const directMatch = prevById.get(constituencyId);
    if (directMatch) {
      notionalData.push(directMatch);
      continue;
    }

    // 2. Transition mapping → compute weighted average
    const weights = transition.mappings[constituencyId];
    if (!weights || weights.length === 0) {
      // No mapping (NI or missing) → skip, will render grey
      continue;
    }

    // Gather source data with weights
    const sources: { data: ElectionResult; weight: number }[] = [];
    for (const { oldId, weight } of weights) {
      const oldData = prevById.get(oldId);
      if (oldData) {
        sources.push({ data: oldData, weight });
      }
    }

    if (sources.length === 0) {
      continue;
    }

    // Re-normalize weights in case some sources are missing
    const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
    const normalizedSources = sources.map(s => ({
      ...s,
      weight: s.weight / totalWeight,
    }));

    // Compute weighted-average party results
    const synthetic = computeWeightedResult(current, normalizedSources);
    notionalData.push(synthetic);
    estimatedIds.add(constituencyId);
  }

  return { notionalData, estimatedIds };
}

/**
 * Create a synthetic ElectionResult by weighted-averaging party vote shares
 * from multiple source constituencies.
 */
function computeWeightedResult(
  current: ElectionResult,
  sources: { data: ElectionResult; weight: number }[],
): ElectionResult {
  // Collect all party IDs across all sources
  const partyIds = new Set<string>();
  for (const s of sources) {
    for (const r of s.data.results) {
      partyIds.add(r.partyId.toLowerCase());
    }
  }

  // Compute weighted vote share for each party
  const partyResults: PartyResult[] = [];
  for (const pid of partyIds) {
    let weightedShare = 0;
    let partyName = '';
    for (const s of sources) {
      const pr = s.data.results.find(r => r.partyId.toLowerCase() === pid);
      if (pr) {
        weightedShare += pr.voteShare * s.weight;
        if (!partyName) partyName = pr.partyName;
      }
    }
    if (weightedShare > 0.01) {
      partyResults.push({
        partyId: pid,
        partyName,
        candidate: '',
        votes: 0,  // Synthetic — no meaningful vote count
        voteShare: weightedShare,
      });
    }
  }

  // Sort by vote share descending
  partyResults.sort((a, b) => b.voteShare - a.voteShare);

  // Determine notional winner
  const winner = partyResults.length > 0 ? partyResults[0].partyId : '';

  return {
    constituencyId: current.constituencyId,
    constituencyName: current.constituencyName,
    region: current.region,
    country: current.country,
    year: sources[0]?.data.year ?? 0,
    results: partyResults,
    electorate: 0,
    turnout: 0,
    validVotes: 0,
    winner,
    majority: 0,
  };
}
