# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev        # Start Vite dev server with HMR
npm run build      # TypeScript check + production build
npm run lint       # ESLint validation
npm run preview    # Preview production build
npm run test:data  # Run data validation tests (720 tests)
```

## Data Setup

Boundary files are sourced from parlconst.org and stored in `parlconst_boundaries/`. **Do not delete `parlconst_boundaries/`** — it contains manually downloaded GeoJSON source files that are difficult to re-obtain. It is not used at runtime but is the input for `scripts/processParlconstBoundaries.ts`.

GB coastline data is stored in `reference_data/gb_coastline.geojson` (ONS Countries Dec 2024 BSC, 200m). **Do not delete `reference_data/`** — it is the input for coastline clipping.

Data processing scripts (run with `npx ts-node` or `python3`):
- `scripts/processElectoralCalculus.ts` - Convert Electoral Calculus .txt files to JSON
- `scripts/processParlconstBoundaries.ts` - Combine parlconst.org boundary files into era-specific files
- `scripts/clip_to_coastline.py` - Clip boundary polygons to GB coastline (requires `shapely`)
- `scripts/removeNorthernIreland.ts` - Filter NI constituencies from election data
- `scripts/validateBoundaryMatching.ts` - Validate constituency name matching between boundaries and election data
- `scripts/fix_data.py` - Fix boundary IDs, winding order, election metadata; idempotent, safe to re-run

Boundary processing pipeline order: `processParlconstBoundaries.ts` → `clip_to_coastline.py` → `fix_data.py`

## Architecture

**Tech Stack**: React 18 + TypeScript, Vite, D3.js 7.9, Zustand, Tailwind CSS

**State Management**: Two Zustand stores in `src/store/`:
- `electionStore.ts` - Election data loading/caching, year selection, constituency selection/hover
- `uiStore.ts` - Map type, zoom transforms, dot density settings

**Data Flow**: Election data cached in `electionDataCache` Map, boundaries cached in `boundaryCache` Map. Adjacent years are prefetched in background.

**Visualizations** (in `src/components/charts/`):
- TernaryPlot - Vote share distribution in triangular coordinates
- DotDensityMap - Geographic map where each dot = N votes
- ChoroplethMap - Constituencies colored by winning party
- HexMap - Hexagonal cartogram (LAPJV optimal assignment, see below)
- SmallMultiplesMap - Side-by-side maps for Lab/Con/LD/Other vote share
- SeatsChart - National seat distribution line chart (top bar)

**Linked Views**: Hover/select in one visualization highlights in others via store state.

## Data Files

**Scope**: Great Britain only (England, Scotland, Wales). Northern Ireland is excluded.

**Elections**: `public/data/elections/{year}.json` - Years 1955-2024 (use `197402`/`197410` for Feb/Oct 1974)

**Boundaries**: `public/data/boundaries/{version}.json` - Era-specific files:
- `1955.json` - Used for 1955-1970 elections
- `1974.json` - Used for Feb 1974-1979 elections
- `1983.json` - Used for 1983-1992 elections
- `1997.json` - Used for 1997-2001 elections
- `2005.json` - Hybrid: 1997 England/Wales + 2005 Scotland (Scotland reduced 72→59 seats)
- `2010.json` - Used for 2010-2019 elections
- `2024.json` - Used for 2024 election

**Data Sources**:
- Election results: Electoral Calculus flat files (1955-2024)
- Boundary GeoJSON: parlconst.org (downloaded to `parlconst_boundaries/`)

**Electoral Calculus Area Codes** (for data processing):
- 2=Scotland, 3=North East, 4=North West, 5=Yorkshire
- 6=Wales, 7=West Midlands, 8=East Midlands, 9=East, 10=South West, 11=London, 12=South East

**Constituency Name Matching**: Boundaries use parlconst names (e.g., "Hereford & S Herefordshire"), election data uses Electoral Calculus names (e.g., "Hereford and South Herefordshire"). The `normalizeConstituencyName()` utility in `src/utils/constituencyMatching.ts` handles normalization.

**Party definitions**: `src/types/party.ts` - 30+ parties with IDs, names, colors

## Key Patterns

**Base URL for fetch**: Always use `import.meta.env.BASE_URL` for data fetches since the app is deployed at `/ukge/`:
```typescript
fetch(`${import.meta.env.BASE_URL}data/elections/${year}.json`)
```

Path alias `@/*` maps to `./src/*`

Store access:
```typescript
const { currentYear, electionData } = useElectionStore();
useElectionStore.getState().setYear(2019);
```

D3 visualization components receive `width`, `height`, `data`, and selection/hover callbacks as props.

**1974 year encoding**: Feb/Oct 1974 elections use `197402`/`197410` as numeric year identifiers. These sort *after* 2024 numerically, so any code that sorts or scales by year must normalize them first (e.g., `197402 → 1974.2`). Use `getYearLabel()` from `electionStore` for display strings.

**Hex map layout** (`src/utils/hexLayout.ts`): Uses LAPJV (Jonker-Volgenant) linear assignment (`src/utils/lapjv.ts`) to optimally place constituencies on a pointy-top hex grid. Pipeline: project centroids with UK Albers → expand dense regions (London 2.2x, others 1.0x — expansion-only to avoid disconnecting Scotland) → push peripheral regions outward (Scotland north, Wales west, SW southwest) → generate GB-shaped grid mask → LAPJV assignment. Layout is cached per boundary era keyed by boundary feature names (not just counts — the 2010 and 2024 eras both have 632 seats).

**Boundary winding order**: D3 with a projection expects exterior polygon rings to be **clockwise** in geographic coordinates (lon/lat). Counterclockwise outer rings render as globe-minus-polygon, flooding the map. The `scripts/fix_data.py` script corrects winding. If adding new boundary files, verify winding with the test suite.

## Testing

Data validation tests in `tests/data/` (720 tests):
- `election-schema.test.ts` - Required fields, types, valid regions/countries
- `election-arithmetic.test.ts` - Vote totals, share sums, turnout consistency
- `election-constraints.test.ts` - No NI parties, Scotland/Wales party constraints
- `cross-matching.test.ts` - Election IDs match boundary IDs (known exception: 1992 Milton Keynes)
- `boundary-schema.test.ts` - GeoJSON structure, required properties
- `boundary-geometry.test.ts` - Coordinate ranges, ring closure, winding (known exceptions for island constituencies)

## Deployment

GitHub Actions deploys to GitHub Pages on push to `main`. Build output goes to `dist/` with base path `/ukge/`.
