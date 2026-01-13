# UK Election Data Processing Scripts

These scripts help download and process UK General Election data for the visualization app.

## Overview

The app needs two types of data:
1. **Election Results** - Constituency-level voting data from 1918-2024
2. **Boundary Files** - GeoJSON files for parliamentary constituency boundaries

## Data Sources

### Election Results

| Source | Coverage | URL |
|--------|----------|-----|
| House of Commons Library CBP-8647 | 1918-2019 | [commonslibrary.parliament.uk](https://commonslibrary.parliament.uk/research-briefings/cbp-8647/) |
| House of Commons Library CBP-10009 | 2024 | [commonslibrary.parliament.uk](https://commonslibrary.parliament.uk/research-briefings/cbp-10009/) |

### Boundary Files

| Source | Coverage | URL |
|--------|----------|-----|
| parlconst.org | Historical boundaries | [parlconst.org](https://www.parlconst.org/constituency-maps) |
| ONS Open Geography Portal | Current boundaries | [geoportal.statistics.gov.uk](https://geoportal.statistics.gov.uk) |
| UK-GeoJSON | Various | [github.com/martinjc/UK-GeoJSON](https://github.com/martinjc/UK-GeoJSON) |

## Scripts

### 1. downloadData.ts

Downloads election data CSV files from the House of Commons Library.

```bash
npx ts-node scripts/downloadData.ts
```

**Note**: Some files may require manual download due to access restrictions.

### 2. processHoCData.ts

Converts House of Commons Library CSV files to JSON format.

```bash
npx ts-node scripts/processHoCData.ts
```

**Input**: `public/data/raw/hoc-results-*.csv`
**Output**: `public/data/elections/{year}.json`

### 3. processBoundaries.ts

Combines nation-specific boundary GeoJSON files into single files per era.

```bash
npx ts-node scripts/processBoundaries.ts
```

**Input**: `public/data/boundaries/raw/{era}/{nation}.geojson`
**Output**: `public/data/boundaries/{era}.json`

### 4. prepareElectionData.ts

Alternative script for processing individual CSV files.

```bash
npx ts-node scripts/prepareElectionData.ts <input.csv> <year>
```

## Boundary Eras

Different boundary files are needed for different election periods:

| Era | Elections | Seats |
|-----|-----------|-------|
| 1918 | 1918, 1922, 1923, 1924, 1929, 1931, 1935, 1945 | ~600-615 |
| 1950 | 1950, 1951, 1955, 1959, 1964, 1966, 1970 | ~625-630 |
| 1974 | Feb 1974, Oct 1974, 1979 | ~635 |
| 1983 | 1983, 1987, 1992 | 650 |
| 1997 | 1997, 2001, 2005 | 659 |
| 2010 | 2010, 2015, 2017, 2019 | 650 |
| 2024 | 2024+ | 650 |

## Directory Structure

```
public/data/
├── elections/          # JSON files for each election year
│   ├── 1918.json
│   ├── 1922.json
│   ├── ...
│   ├── 197402.json    # February 1974
│   ├── 197410.json    # October 1974
│   └── 2024.json
├── boundaries/         # GeoJSON boundary files
│   ├── constituencies.json  # Default (fallback)
│   ├── 1918.json
│   ├── 1950.json
│   ├── 1974.json
│   ├── 1983.json
│   ├── 1997.json
│   ├── 2010.json
│   └── 2024.json
├── metadata/
│   └── constituencyMappings.json
└── raw/               # Raw downloaded files
```

## Manual Download Instructions

### parlconst.org Boundaries

1. Go to https://www.parlconst.org/constituency-maps
2. Select the year/era you need
3. For each nation (England, Wales, Scotland, Northern Ireland):
   - Click the share/download icon
   - Select GeoJSON format
   - Save to `public/data/boundaries/raw/{era}/{nation}.geojson`
4. Run `npx ts-node scripts/processBoundaries.ts` to combine

### House of Commons Data

1. Go to https://commonslibrary.parliament.uk/research-briefings/cbp-8647/
2. Download the Excel/CSV file containing 1918-2019 results
3. Save to `public/data/raw/hoc-results-1918-2019.csv`
4. For 2024 data, download from CBP-10009
5. Run `npx ts-node scripts/processHoCData.ts` to convert

## Handling 1974 Elections

The UK had two general elections in 1974:
- **February 1974**: Hung parliament, Labour formed minority government
- **October 1974**: Labour won small majority

These are handled with special year codes:
- `197402` for February 1974
- `197410` for October 1974

The app displays these as "Feb 1974" and "Oct 1974" in the UI.
