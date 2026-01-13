import { create } from 'zustand';
import type { ElectionResult, TernaryDataPoint, Region } from '@/types/election';

// Module-level cache for election data
const electionDataCache = new Map<number, { electionData: ElectionResult[]; ternaryData: TernaryDataPoint[] }>();

// Boundary version mapping - determines which boundary file to load for each year
export const BOUNDARY_VERSIONS: Record<number, string> = {
  1918: '1918', 1922: '1918', 1923: '1918', 1924: '1918',
  1929: '1918', 1931: '1918', 1935: '1918', 1945: '1918',
  1950: '1950', 1951: '1950', 1955: '1950', 1959: '1950',
  1964: '1950', 1966: '1950', 1970: '1950',
  197402: '1974', 197410: '1974', 1979: '1974',
  1983: '1983', 1987: '1983', 1992: '1983',
  1997: '1997', 2001: '1997', 2005: '1997',
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

  setYear: (year: number) => void;
  loadElectionData: (year: number) => Promise<void>;
  prefetchAdjacentYears: (year: number) => void;
  setSelectedConstituency: (id: string | null) => void;
  setHoveredConstituency: (id: string | null) => void;
  setRegionFilter: (regions: Region[]) => void;
}

function transformToTernaryData(results: ElectionResult[]): TernaryDataPoint[] {
  return results.map((result) => {
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
  availableYears: [
    1918, 1922, 1923, 1924, 1929, 1931, 1935, 1945,
    1950, 1951, 1955, 1959, 1964, 1966, 1970,
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

  setYear: (year) => {
    const boundaryVersion = getBoundaryVersion(year);
    set({ currentYear: year, currentBoundaryVersion: boundaryVersion });
    get().loadElectionData(year);
    // Prefetch adjacent years in the background
    get().prefetchAdjacentYears(year);
  },

  loadElectionData: async (year) => {
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
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`/data/elections/${year}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load election data for ${year}`);
      }

      const data = await response.json();
      const electionData: ElectionResult[] = data.constituencies || [];
      const ternaryData = transformToTernaryData(electionData);

      // Cache the result
      electionDataCache.set(year, { electionData, ternaryData });

      set({
        electionData,
        ternaryData,
        currentBoundaryVersion: getBoundaryVersion(year),
        isLoading: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
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
        fetch(`/data/elections/${y}.json`)
          .then((res) => res.json())
          .then((data) => {
            const electionData: ElectionResult[] = data.constituencies || [];
            const ternaryData = transformToTernaryData(electionData);
            electionDataCache.set(y, { electionData, ternaryData });
          })
          .catch(() => {
            // Silent fail for prefetch
          });
      }
    });
  },

  setSelectedConstituency: (id) => set({ selectedConstituencyId: id }),
  setHoveredConstituency: (id) => set({ hoveredConstituencyId: id }),
  setRegionFilter: (regions) => set({ selectedRegions: regions }),
}));
