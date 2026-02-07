# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # TypeScript check + production build
npm run lint     # ESLint validation
npm run preview  # Preview production build
```

## Data Setup

Boundary files are sourced from parlconst.org and stored in `parlconst_boundaries/`.

Data processing scripts (run with `npx ts-node`):
- `scripts/processElectoralCalculus.ts` - Convert Electoral Calculus .txt files to JSON
- `scripts/processParlconstBoundaries.ts` - Combine parlconst.org boundary files into era-specific files
- `scripts/removeNorthernIreland.ts` - Filter NI constituencies from election data
- `scripts/validateBoundaryMatching.ts` - Validate constituency name matching between boundaries and election data

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
- HexMap - Hexagonal cartogram
- SeatsChart - National seat distribution bar chart

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

## Deployment

GitHub Actions deploys to GitHub Pages on push to `main`. Build output goes to `dist/` with base path `/ukge/`.
