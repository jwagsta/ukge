# UK General Election Results Visualization

An interactive web app for exploring UK General Election results across Great Britain from 1955 to 2024. Six synchronized visualizations let you compare constituency-level voting patterns, geographic distributions, and national trends across 19 elections.

## Features

- **Ternary Plot** — Constituencies plotted in a triangle showing Labour / Conservative / Other vote shares, with animated transitions between elections
- **Choropleth Map** — Constituencies colored by winning party on a geographic map of Great Britain
- **Dot Density Map** — Each dot represents a configurable number of votes, distributed geographically by constituency
- **Hexagonal Cartogram** — Each constituency shown as an equal-sized hexagon, removing geographic distortion
- **Small Multiples** — Four side-by-side maps showing vote share for Labour, Conservative, Lib Dem, and Other
- **Seats Chart** — Line chart of national seat counts across all elections (top bar)
- **Linked Views** — Hover or select a constituency in any visualization to highlight it in all others
- **Timeline Playback** — Animate through elections with play/pause/step controls
- **Constituency Search** — Find and select constituencies by name

## Getting Started

### Prerequisites

- Node.js 18+

### Installation

```bash
npm install
npm run dev
```

Election and boundary data files are included in `public/data/` — no additional data setup is required.

## Data

**Scope**: Great Britain only (England, Scotland, Wales). Northern Ireland is excluded.

**Elections**: 19 elections from 1955 to 2024, including both February and October 1974. Results are sourced from [Electoral Calculus](https://www.electoralcalculus.co.uk/) and stored as JSON in `public/data/elections/`.

**Boundaries**: Era-specific GeoJSON files sourced from [parlconst.org](https://www.parlconst.org/) in `public/data/boundaries/`. Seven boundary sets cover redistricting changes across the period:

| Boundary file | Elections covered |
|---|---|
| `1955.json` | 1955–1970 |
| `1974.json` | Feb 1974–1979 |
| `1983.json` | 1983–1992 |
| `1997.json` | 1997–2001 |
| `2005.json` | 2005 (hybrid: 1997 England/Wales + 2005 Scotland) |
| `2010.json` | 2010–2019 |
| `2024.json` | 2024 |

### Election Data Schema

```json
{
  "year": 2024,
  "date": "2024-07-04",
  "totalSeats": 632,
  "boundaryVersion": "2024",
  "constituencies": [
    {
      "constituencyId": "EC_ALDERSHOT",
      "constituencyName": "Aldershot",
      "region": "south_east",
      "country": "england",
      "electorate": 78569,
      "turnout": 61.8,
      "validVotes": 48544,
      "winner": "lab",
      "majority": 5683,
      "results": [
        { "partyId": "lab", "partyName": "Labour", "votes": 19764, "voteShare": 40.71 }
      ]
    }
  ]
}
```

## Project Structure

```
ukge/
├── public/data/
│   ├── elections/          # 19 election JSON files (1955–2024)
│   └── boundaries/         # 7 era-specific boundary GeoJSON files
├── src/
│   ├── components/
│   │   ├── charts/         # TernaryPlot, ChoroplethMap, DotDensityMap,
│   │   │                   # HexMap, SmallMultiplesMap, SeatsChart
│   │   ├── controls/       # PlayButton (timeline playback)
│   │   ├── layout/         # Header
│   │   └── panels/         # ConstituencyPanel (search + details)
│   ├── store/              # Zustand stores (election data, UI state)
│   ├── types/              # TypeScript interfaces (election, party, geography)
│   ├── utils/              # D3 helpers, constituency name matching
│   └── hooks/              # useWindowSize
├── scripts/                # Data processing and validation scripts
├── tests/data/             # 720 data validation tests
└── .github/                # CI/CD (GitHub Actions → GitHub Pages)
```

## Technology Stack

- **React 18** with TypeScript
- **Vite** for bundling and HMR
- **D3.js 7** for all visualizations
- **Zustand** for state management
- **Tailwind CSS** for styling
- **Vitest** for testing

## Development

```bash
npm run dev          # Start dev server with hot reload
npm run build        # TypeScript check + production build
npm run lint         # ESLint
npm run preview      # Preview production build
npm run test:data    # Run 720 data validation tests
```

## Data Processing

Scripts for preparing data from upstream sources (not needed for normal development):

- `scripts/processElectoralCalculus.ts` — Convert Electoral Calculus flat files to JSON
- `scripts/processParlconstBoundaries.ts` — Combine parlconst.org boundary files into era-specific GeoJSON
- `scripts/removeNorthernIreland.ts` — Filter Northern Ireland constituencies from election data
- `scripts/validateBoundaryMatching.ts` — Validate constituency name matching between boundaries and elections
- `scripts/fix_data.py` — Fix boundary IDs, polygon winding order, and election metadata (idempotent)

## Deployment

GitHub Actions deploys to GitHub Pages on push to `main`. The app is served at `/ukge/`.

## License

MIT
