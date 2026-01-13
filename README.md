# UK General Election Results Visualization

An interactive web app for visualizing UK General Election results from 1945 to present.

## Features

- **Ternary Plot**: Visualize constituencies as points in a triangle showing Labour/Conservative/Other vote shares
- **Dot Density Map**: Geographic visualization where each dot represents votes (e.g., 1 dot = 10,000 votes)
- **Interactive**: Hover and click to explore individual constituencies
- **Year Selection**: Browse election results from 1945 to 2024
- **Linked Views**: Hover over a constituency in one view to highlight it in the other

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install

# Download boundary data
chmod +x scripts/downloadBoundaries.sh
./scripts/downloadBoundaries.sh

# Start development server
npm run dev
```

### Data Setup

The app requires two types of data:

#### 1. Election Results

Election data should be placed in `public/data/elections/` as JSON files named by year (e.g., `2024.json`).

**Sources:**
- [House of Commons Library - Historical Results (1918-2019)](https://commonslibrary.parliament.uk/research-briefings/cbp-8647/)
- [House of Commons Library - 2024 Results](https://commonslibrary.parliament.uk/research-briefings/cbp-10009/)

A sample `2024.json` is included. To convert CSV data to JSON:

```bash
npx ts-node scripts/prepareElectionData.ts input.csv 2019
```

#### 2. Constituency Boundaries

Boundary data (GeoJSON or TopoJSON) should be placed in `public/data/boundaries/constituencies.json`.

**Sources:**
- [UK-GeoJSON (GitHub)](https://github.com/martinjc/UK-GeoJSON)
- [ONS Open Geography Portal](https://geoportal.statistics.gov.uk/)

Run the download script:
```bash
./scripts/downloadBoundaries.sh
```

## Project Structure

```
ukge/
├── public/data/
│   ├── elections/       # Election JSON files by year
│   └── boundaries/      # GeoJSON/TopoJSON boundary files
├── src/
│   ├── components/
│   │   ├── charts/      # TernaryPlot and DotDensityMap
│   │   ├── controls/    # Year selector, filters
│   │   └── layout/      # Header, Sidebar
│   ├── store/           # Zustand state management
│   ├── types/           # TypeScript interfaces
│   └── utils/           # D3 helpers
└── scripts/             # Data preparation scripts
```

## Technology Stack

- **React 18** with TypeScript
- **Vite** for fast development
- **D3.js** for visualizations
- **Zustand** for state management
- **Tailwind CSS** for styling

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Data Format

### Election Data Schema

```json
{
  "year": 2024,
  "constituencies": [
    {
      "constituencyId": "E14000530",
      "constituencyName": "Holborn and St Pancras",
      "region": "london",
      "country": "england",
      "year": 2024,
      "electorate": 87543,
      "turnout": 62.3,
      "validVotes": 54540,
      "winner": "lab",
      "majority": 14839,
      "results": [
        {
          "partyId": "lab",
          "partyName": "Labour",
          "candidate": "Keir Starmer",
          "votes": 25678,
          "voteShare": 47.1
        }
      ]
    }
  ]
}
```

## License

MIT
