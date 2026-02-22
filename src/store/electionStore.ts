import { create } from 'zustand';
import type { ElectionResult, TernaryDataPoint, Region } from '@/types/election';
import type { TransitionMapping } from '@/utils/notionalResults';

// Module-level cache for election data - limited to control memory
const electionDataCache = new Map<number, { electionData: ElectionResult[]; ternaryData: TernaryDataPoint[] }>();
const MAX_ELECTION_CACHE_SIZE = 5; // Keep current year + previous + adjacent years + pinned year

// Boundary version mapping - determines which boundary file to load for each year
// Note: App scope is 1955-2024 (pre-1955 elections not included)
// Boundary files: GB from parlconst.org, NI from ONS (2024 era onwards)
export const BOUNDARY_VERSIONS: Record<number, string> = {
  1955: '1955', 1959: '1955', 1964: '1955', 1966: '1955', 1970: '1955',
  197402: '1974', 197410: '1974', 1979: '1974',
  1983: '1983', 1987: '1983', 1992: '1983',
  1997: '1997', 2001: '1997',
  2005: '2005',  // Hybrid: 1997 England/Wales + 2005 Scotland (reduced 72→59 seats)
  2010: '2010', 2015: '2010', 2017: '2010', 2019: '2010',
  2024: '2024',
};

// Display labels for year selector (handles 1974 Feb/Oct)
export const YEAR_LABELS: Record<number, string> = {
  197402: 'Feb 1974',
  197410: 'Oct 1974',
};

// Get display label for a year
export function getYearLabel(year: number): string {
  return YEAR_LABELS[year] || year.toString();
}

// Get boundary version for a year
export function getBoundaryVersion(year: number): string {
  return BOUNDARY_VERSIONS[year] || '2010'; // Default to 2010 boundaries
}

// Get the previous election year (always returns predecessor, regardless of boundary version)
export function getPreviousElectionYear(year: number): number | null {
  const years = [
    1955, 1959, 1964, 1966, 1970,
    197402, 197410, 1979,
    1983, 1987, 1992,
    1997, 2001, 2005,
    2010, 2015, 2017, 2019, 2024
  ];
  const idx = years.indexOf(year);
  if (idx <= 0) return null;
  return years[idx - 1];
}

// Check whether swing from year to its predecessor crosses a boundary change
export function isCrossBoundarySwing(year: number): boolean {
  const prev = getPreviousElectionYear(year);
  if (prev === null) return false;
  return BOUNDARY_VERSIONS[prev] !== BOUNDARY_VERSIONS[year];
}

// Get the transition file key for a cross-boundary swing (e.g. "2010_to_2024")
export function getTransitionKey(year: number): string | null {
  const prev = getPreviousElectionYear(year);
  if (prev === null) return null;
  const prevBV = BOUNDARY_VERSIONS[prev];
  const curBV = BOUNDARY_VERSIONS[year];
  if (prevBV === curBV) return null;
  return `${prevBV}_to_${curBV}`;
}

interface ElectionState {
  currentYear: number;
  electionData: ElectionResult[];
  ternaryData: TernaryDataPoint[];
  availableYears: number[];
  currentBoundaryVersion: string;
  isLoading: boolean;
  error: string | null;
  selectedRegions: Region[];
  selectedConstituencyId: string | null;
  hoveredConstituencyId: string | null;
  zoomToConstituencyTrigger: number; // increment to re-trigger zoom-to-constituency

  // Previous election data (for swing mode)
  previousElectionData: ElectionResult[];
  // Transition mapping for cross-boundary swing (null if same boundary era)
  transitionMapping: TransitionMapping | null;

  // Comparison mode: pin a year as reference
  pinnedYear: number | null;
  pinnedElectionData: ElectionResult[];
  pinnedTernaryData: TernaryDataPoint[];
  pinnedBoundaryVersion: string | null;
  // Pinned year's previous election data (for swing in comparison mode)
  pinnedPreviousElectionData: ElectionResult[];
  pinnedTransitionMapping: TransitionMapping | null;

  setYear: (year: number) => void;
  loadElectionData: (year: number) => Promise<void>;
  prefetchAdjacentYears: (year: number) => void;
  setSelectedConstituency: (id: string | null) => void;
  zoomToConstituency: () => void;
  setHoveredConstituency: (id: string | null) => void;
  setRegionFilter: (regions: Region[]) => void;
  pinYear: (year: number) => void;
  unpinYear: () => void;
}

function transformToTernaryData(results: ElectionResult[]): TernaryDataPoint[] {
  // Exclude NI constituencies — the Lab/Con/Other ternary model doesn't fit
  // NI's multi-party system (SF, DUP, SDLP, UUP, Alliance, TUV)
  return results.filter(r => r.country !== 'northern_ireland').map((result) => {
    const labourResult = result.results.find(
      (r) => r.partyId.toLowerCase() === 'lab' || r.partyId.toLowerCase() === 'labour'
    );
    const conservativeResult = result.results.find(
      (r) => r.partyId.toLowerCase() === 'con' || r.partyId.toLowerCase() === 'conservative'
    );

    const labourVotes = labourResult?.votes ?? 0;
    const conservativeVotes = conservativeResult?.votes ?? 0;
    const otherVotes = result.validVotes - labourVotes - conservativeVotes;

    const total = result.validVotes || 1;

    return {
      constituencyId: result.constituencyId,
      constituencyName: result.constituencyName,
      labour: labourVotes / total,
      conservative: conservativeVotes / total,
      other: Math.max(0, otherVotes / total),
      winner: result.winner,
      year: result.year,
      region: result.region,
    };
  });
}

export const useElectionStore = create<ElectionState>((set, get) => ({
  currentYear: 2024,
  electionData: [],
  ternaryData: [],
  // Full list of available years including both 1974 elections
  // Years are sorted chronologically, with 197402 (Feb) and 197410 (Oct) for 1974
  // Note: App scope is 1955-2024 (pre-1955 elections not included due to data quality)
  availableYears: [
    1955, 1959, 1964, 1966, 1970,
    197402, 197410, 1979,
    1983, 1987, 1992,
    1997, 2001, 2005,
    2010, 2015, 2017, 2019, 2024
  ],
  currentBoundaryVersion: '2024',
  isLoading: false,
  error: null,
  selectedRegions: [],
  selectedConstituencyId: null,
  hoveredConstituencyId: null,
  zoomToConstituencyTrigger: 0,

  // Previous election data (for swing mode)
  previousElectionData: [],
  transitionMapping: null,

  // Comparison mode
  pinnedYear: null,
  pinnedElectionData: [],
  pinnedTernaryData: [],
  pinnedBoundaryVersion: null,
  pinnedPreviousElectionData: [],
  pinnedTransitionMapping: null,

  setYear: (year) => {
    const boundaryVersion = getBoundaryVersion(year);
    set({ currentYear: year, currentBoundaryVersion: boundaryVersion });
    get().loadElectionData(year);
    // Prefetch adjacent years in the background
    get().prefetchAdjacentYears(year);
  },

  loadElectionData: async (year) => {
    // Helper to fetch and cache election data for a year
    const fetchAndCache = async (y: number) => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/elections/${y}.json`);
      if (!response.ok) throw new Error(`Failed to load election data for ${y}`);
      const data = await response.json();
      const ed: ElectionResult[] = data.constituencies || [];
      const td = transformToTernaryData(ed);
      if (electionDataCache.size >= MAX_ELECTION_CACHE_SIZE) {
        const { pinnedYear } = get();
        for (const key of electionDataCache.keys()) {
          if (key !== pinnedYear) { electionDataCache.delete(key); break; }
        }
      }
      electionDataCache.set(y, { electionData: ed, ternaryData: td });
      return { electionData: ed, ternaryData: td };
    };

    // Load previous election data (for swing mode)
    const loadPreviousElection = async (y: number) => {
      const prevYear = getPreviousElectionYear(y);
      if (prevYear === null) {
        set({ previousElectionData: [], transitionMapping: null });
        return;
      }

      // Load transition mapping if boundaries differ
      const transitionKey = getTransitionKey(y);
      let transMapping: TransitionMapping | null = null;
      if (transitionKey) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}data/transitions/${transitionKey}.json`);
          if (res.ok) {
            transMapping = await res.json();
          }
        } catch {
          // Fall through — swing will work without transition (estimated = empty)
        }
      }

      const prevCached = electionDataCache.get(prevYear);
      if (prevCached) {
        if (get().currentYear === y) {
          set({ previousElectionData: prevCached.electionData, transitionMapping: transMapping });
        }
        return;
      }
      try {
        const result = await fetchAndCache(prevYear);
        // Only update if we're still on the same year
        if (get().currentYear === y) {
          set({ previousElectionData: result.electionData, transitionMapping: transMapping });
        }
      } catch {
        set({ previousElectionData: [], transitionMapping: null });
      }
    };

    // Check cache first
    const cached = electionDataCache.get(year);
    if (cached) {
      set({
        electionData: cached.electionData,
        ternaryData: cached.ternaryData,
        currentBoundaryVersion: getBoundaryVersion(year),
        isLoading: false,
        error: null,
      });
      loadPreviousElection(year);
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const result = await fetchAndCache(year);

      set({
        electionData: result.electionData,
        ternaryData: result.ternaryData,
        currentBoundaryVersion: getBoundaryVersion(year),
        isLoading: false
      });

      loadPreviousElection(year);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
        previousElectionData: [],
        transitionMapping: null,
      });
    }
  },

  prefetchAdjacentYears: (year) => {
    const { availableYears } = get();
    const currentIndex = availableYears.indexOf(year);

    // Prefetch previous and next years if not already cached
    const yearsToFetch: number[] = [];
    if (currentIndex > 0) {
      yearsToFetch.push(availableYears[currentIndex - 1]);
    }
    if (currentIndex < availableYears.length - 1) {
      yearsToFetch.push(availableYears[currentIndex + 1]);
    }

    // Fetch in the background (don't await)
    yearsToFetch.forEach((y) => {
      if (!electionDataCache.has(y)) {
        fetch(`${import.meta.env.BASE_URL}data/elections/${y}.json`)
          .then((res) => res.json())
          .then((data) => {
            const electionData: ElectionResult[] = data.constituencies || [];
            const ternaryData = transformToTernaryData(electionData);
            // Respect cache size limit (protect pinned year from eviction)
            if (electionDataCache.size >= MAX_ELECTION_CACHE_SIZE) {
              const { pinnedYear } = get();
              for (const key of electionDataCache.keys()) {
                if (key !== pinnedYear) { electionDataCache.delete(key); break; }
              }
            }
            electionDataCache.set(y, { electionData, ternaryData });
          })
          .catch(() => {
            // Silent fail for prefetch
          });
      }
    });
  },

  setSelectedConstituency: (id) => set({ selectedConstituencyId: id }),
  zoomToConstituency: () => set((state) => ({ zoomToConstituencyTrigger: state.zoomToConstituencyTrigger + 1 })),
  setHoveredConstituency: (id) => set({ hoveredConstituencyId: id }),
  setRegionFilter: (regions) => set({ selectedRegions: regions }),

  pinYear: (year) => {
    const { electionData, ternaryData, previousElectionData, transitionMapping } = get();
    set({
      pinnedYear: year,
      pinnedElectionData: electionData,
      pinnedTernaryData: ternaryData,
      pinnedBoundaryVersion: getBoundaryVersion(year),
      pinnedPreviousElectionData: previousElectionData,
      pinnedTransitionMapping: transitionMapping,
    });
  },

  unpinYear: () => {
    set({
      pinnedYear: null,
      pinnedElectionData: [],
      pinnedTernaryData: [],
      pinnedBoundaryVersion: null,
      pinnedPreviousElectionData: [],
      pinnedTransitionMapping: null,
    });
  },
}));
