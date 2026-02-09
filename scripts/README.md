# UK Election Data Processing Scripts

Scripts for preparing election and boundary data from upstream sources. These are **not needed for normal development** — all processed data is already in `public/data/`.

## Data Sources

| Source | What | Coverage |
|--------|------|----------|
| [Electoral Calculus](https://www.electoralcalculus.co.uk/) | Election results | 1955–2024 |
| [parlconst.org](https://www.parlconst.org/) | Constituency boundaries | Historical GeoJSON |
| [ONS Open Geography Portal](https://geoportal.statistics.gov.uk/) | GB coastline | Countries Dec 2024 BSC (200m) |

## Scripts

### processElectoralCalculus.ts

Converts Electoral Calculus flat text files to JSON.

```bash
npx ts-node scripts/processElectoralCalculus.ts
```

**Input**: Electoral Calculus `.txt` files
**Output**: `public/data/elections/{year}.json`

### processParlconstBoundaries.ts

Combines individual parlconst.org boundary files into era-specific GeoJSON.

```bash
npx ts-node scripts/processParlconstBoundaries.ts
```

**Input**: `parlconst_boundaries/` (downloaded GeoJSON files)
**Output**: `public/data/boundaries/{era}.json`

### removeNorthernIreland.ts

Filters Northern Ireland constituencies from election data (the app covers Great Britain only).

```bash
npx ts-node scripts/removeNorthernIreland.ts
```

### validateBoundaryMatching.ts

Validates that constituency names in election data match those in boundary files.

```bash
npx ts-node scripts/validateBoundaryMatching.ts
```

### clip_to_coastline.py

Clips constituency boundary polygons to the GB coastline using ONS land data. Replaces sea-area envelopes (e.g. Orkney & Shetland, Western Isles) with actual island outlines and trims coastal constituencies to the coastline. Requires `shapely`.

```bash
python3 scripts/clip_to_coastline.py
```

**Input**: `public/data/boundaries/{era}.json`, `reference_data/gb_coastline.geojson`
**Output**: `public/data/boundaries/{era}.json` (modified in-place)

### fix_data.py

Fixes boundary IDs, polygon winding order, and election metadata. Idempotent — safe to re-run.

```bash
python3 scripts/fix_data.py
```

## Processing Pipeline

When regenerating boundary data from scratch, run scripts in this order:

```bash
npx ts-node scripts/processParlconstBoundaries.ts   # combine + simplify
python3 scripts/clip_to_coastline.py                  # clip to coastline
python3 scripts/fix_data.py                           # fix IDs, winding, names
```

Clipping runs before `fix_data.py` because clipping may alter ring winding order, and `fix_data.py` corrects winding as one of its steps.

## Boundary Eras

Different boundary files cover different election periods:

| Boundary file | Elections covered | Notes |
|---|---|---|
| `1955.json` | 1955–1970 | |
| `1974.json` | Feb 1974–1979 | |
| `1983.json` | 1983–1992 | |
| `1997.json` | 1997–2001 | |
| `2005.json` | 2005 | Hybrid: 1997 England/Wales + 2005 Scotland (72→59 seats) |
| `2010.json` | 2010–2019 | |
| `2024.json` | 2024 | |

## 1974 Elections

The UK had two general elections in 1974:
- **February 1974** → encoded as `197402`
- **October 1974** → encoded as `197410`

The app displays these as "Feb 1974" and "Oct 1974" in the UI.
