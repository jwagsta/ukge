import { useEffect, useState, useMemo } from 'react';
import { getBoundaryVersion } from '@/store/electionStore';
import type { ElectionResult } from '@/types/election';

export interface HistoricalResult {
  year: number;
  results: Array<{ partyId: string; candidate: string; votes: number; voteShare: number }>;
  winner: string;
  validVotes: number;
  electorate: number;
  turnout: number;
  boundaryEra: string;
  matchedId: string;
}

// Cache for historical data - limited to control memory
const historicalDataCache = new Map<string, HistoricalResult[]>();
const MAX_HISTORICAL_CACHE = 5;

// Continuity data (loaded once)
interface ContinuityData {
  threshold: number;
  transitions: Record<string, string[]>;
}

let continuityPromise: Promise<ContinuityData | null> | null = null;
let continuityData: ContinuityData | null = null;

function loadContinuityData(): Promise<ContinuityData | null> {
  if (continuityData) return Promise.resolve(continuityData);
  if (continuityPromise) return continuityPromise;
  continuityPromise = fetch(`${import.meta.env.BASE_URL}data/continuity/constituencyContinuity.json`)
    .then(res => {
      if (!res.ok) return null;
      return res.json();
    })
    .then(data => {
      continuityData = data;
      return data;
    })
    .catch(() => null);
  return continuityPromise;
}

// Ordered boundary eras for adjacency checks
const ERA_ORDER = ['1955', '1974', '1983', '1997', '2005', '2010', '2024'];

function areAdjacentEras(era1: string, era2: string): boolean {
  const i1 = ERA_ORDER.indexOf(era1);
  const i2 = ERA_ORDER.indexOf(era2);
  if (i1 === -1 || i2 === -1) return false;
  return Math.abs(i1 - i2) === 1;
}

function getTransitionKey(eraOld: string, eraNew: string): string {
  // Always return in chronological order
  const i1 = ERA_ORDER.indexOf(eraOld);
  const i2 = ERA_ORDER.indexOf(eraNew);
  if (i1 < i2) return `${eraOld}_to_${eraNew}`;
  return `${eraNew}_to_${eraOld}`;
}

/**
 * Compute break point indices where the constituency line chart should break.
 * A break occurs at index i when the transition from point i-1 to i crosses
 * a boundary change that lacks continuity.
 */
function computeBreakPoints(
  data: HistoricalResult[],
  selectedId: string,
  cont: ContinuityData | null,
): Set<number> {
  const breaks = new Set<number>();
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    if (prev.boundaryEra === curr.boundaryEra) continue;

    // Name-matched (different ID than selected) — always break
    if (prev.matchedId !== selectedId || curr.matchedId !== selectedId) {
      breaks.add(i);
      continue;
    }

    // Non-adjacent eras (hiatus) — always break
    if (!areAdjacentEras(prev.boundaryEra, curr.boundaryEra)) {
      breaks.add(i);
      continue;
    }

    // Adjacent eras — check continuity data
    if (!cont) {
      breaks.add(i);
      continue;
    }

    const key = getTransitionKey(prev.boundaryEra, curr.boundaryEra);
    const continuousIds = cont.transitions[key];
    if (!continuousIds || !continuousIds.includes(selectedId)) {
      breaks.add(i);
    }
  }
  return breaks;
}

const sortYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;

export function useHistoricalData(
  constituencyId: string | null,
  currentConstituency: ElectionResult | null,
  availableYears: number[],
): {
  historicalData: HistoricalResult[];
  breakPoints: Set<number>;
  isLoading: boolean;
  allParties: string[];
} {
  const [historicalData, setHistoricalData] = useState<HistoricalResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [contData, setContData] = useState<ContinuityData | null>(continuityData);

  // Load continuity data once
  useEffect(() => {
    if (continuityData) {
      setContData(continuityData);
      return;
    }
    loadContinuityData().then(d => {
      if (d) setContData(d);
    });
  }, []);

  // Load historical data for the selected constituency
  useEffect(() => {
    if (!constituencyId || !currentConstituency) {
      setHistoricalData([]);
      return;
    }

    // Check cache
    const cached = historicalDataCache.get(constituencyId);
    if (cached) {
      setHistoricalData(cached);
      return;
    }

    setIsLoading(true);

    const fetchHistoricalData = async () => {
      const results: HistoricalResult[] = [];

      for (const year of availableYears) {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}data/elections/${year}.json`);
          if (!response.ok) continue;

          const data = await response.json();
          const constituencies: ElectionResult[] = data.constituencies || [];

          // Try to find the constituency by ID first, then by name
          let match = constituencies.find(
            (c) => c.constituencyId === constituencyId
          );
          let matchedId = constituencyId;

          // If not found by ID, try matching by name (for boundary changes)
          if (!match && currentConstituency) {
            match = constituencies.find(
              (c) =>
                c.constituencyName.toLowerCase() ===
                currentConstituency.constituencyName.toLowerCase()
            );
            if (match) {
              matchedId = match.constituencyId;
            }
          }

          if (match) {
            results.push({
              year,
              results: match.results,
              winner: match.winner,
              validVotes: match.validVotes,
              electorate: match.electorate,
              turnout: match.turnout,
              boundaryEra: getBoundaryVersion(year),
              matchedId,
            });
          }
        } catch {
          // Skip failed fetches
        }
      }

      // Sort by year (normalize 197402/197410 to 1974.x for correct ordering)
      results.sort((a, b) => sortYear(a.year) - sortYear(b.year));

      // Cache the result with size limit
      if (historicalDataCache.size >= MAX_HISTORICAL_CACHE) {
        const firstKey = historicalDataCache.keys().next().value;
        if (firstKey) historicalDataCache.delete(firstKey);
      }
      historicalDataCache.set(constituencyId, results);

      setHistoricalData(results);
      setIsLoading(false);
    };

    fetchHistoricalData();
  }, [constituencyId, currentConstituency, availableYears]);

  // Compute break points
  const breakPoints = useMemo(() => {
    if (!constituencyId || historicalData.length < 2) return new Set<number>();
    return computeBreakPoints(historicalData, constituencyId, contData);
  }, [historicalData, constituencyId, contData]);

  // Get all unique parties across historical data
  const allParties = useMemo(() => {
    const partySet = new Set<string>();
    historicalData.forEach(d => {
      d.results.forEach(r => partySet.add(r.partyId.toLowerCase()));
    });
    if (currentConstituency) {
      currentConstituency.results.forEach(r => partySet.add(r.partyId.toLowerCase()));
    }
    return Array.from(partySet);
  }, [historicalData, currentConstituency]);

  return { historicalData, breakPoints, isLoading, allParties };
}
