#!/usr/bin/env python3
"""
Fix data issues in election and boundary JSON files.

Fixes applied:
1. Election files: wrong boundaryVersion fields (1955-1970, 2005)
2. Election files: year encoding for 197402/197410
3. Election files: rename EC_WOODFORD → EC_WANSTEAD_AND_WOODFORD in 1955/1959
4. Boundary files: rename feature IDs per mapping tables
5. Boundary files: fix Richmond duplicates (lat-based split) in 1955/1974
6. Boundary files: fix empty features (1997/2005 EC_ → EC_SOUTHEND_WEST)
7. Boundary files: deduplicate features in 2010
"""

import json
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')

# ── Election fixes ──

BOUNDARY_VERSION_FIXES = {
    '1955': '1955',
    '1959': '1955',
    '1964': '1955',
    '1966': '1955',
    '1970': '1955',
    '2005': '2005',
}

YEAR_ENCODING_FIXES = {
    '197402': 197402,
    '197410': 197410,
}

# Elections where EC_WOODFORD should become EC_WANSTEAD_AND_WOODFORD
WOODFORD_RENAME_YEARS = ['1955', '1959']


# ── Boundary ID mappings (old → new) ──

BOUNDARY_RENAMES = {
    '1955': {
        'EC_BARON_S_COURT': 'EC_BARONS_COURT',
        'EC_BUTE_AND_AYRSHIRE_NORTH': 'EC_AYRSHIRE_NORTH_AND_BUTE',
        'EC_CITIES_OF_LONDON_AND_WESTMISTER': 'EC_CITIES_OF_LONDON_AND_WESTMINSTER',
        'EC_CITY_OF_CHESTER': 'EC_CHESTER__CITY_OF',
        'EC_CLACKMANNAN_AND_EAST_STIRLINGSHIRE': 'EC_STIRLINGSHIRE_EAST_AND_CLACKMANNAN',
        'EC_DUNFERMLINE_BURGHS': 'EC_DUNFERMLINE',
        'EC_DURHAM': 'EC_DURHAM__CITY_OF',
        'EC_KINGSTON_UPON_HULL_EAST': 'EC_HULL_EAST',
        'EC_KINGSTON_UPON_HULL_NORTH': 'EC_HULL_NORTH',
        'EC_KINGSTON_UPON_HULL_WEST': 'EC_HULL_WEST',
        'EC_KIRKCALDY_BURGHS': 'EC_KIRKCALDY',
        'EC_LLANELLY': 'EC_LLANELLI',
        'EC_MANSFIIELD': 'EC_MANSFIELD',
        'EC_STRATFORD': 'EC_STRATFORD_ON_AVON',
        'EC_THE_HARTLEPOOLS': 'EC_HARTLEPOOLS__THE',
        'EC_THE_WREKIN': 'EC_WREKIN__THE',
        'EC_WOLVERHAMTON_NORTH_EAST': 'EC_WOLVERHAMPTON_NORTH_EAST',
        'EC_WOLVERHAMTON_SOUTH_WEST': 'EC_WOLVERHAMPTON_SOUTH_WEST',
        'EC__WANSTEAD_AND___WOODFORD': 'EC_WANSTEAD_AND_WOODFORD',
        'EC_YORK': 'EC_YORK__CITY_OF',
    },
    '1974': {
        'EC_ASHTON_UNDER_LINE': 'EC_ASHTON_UNDER_LYNE',
        'EC_BIRMINGHA_SELLY_OAK': 'EC_BIRMINGHAM_SELLY_OAK',
        'EC_BUTE_AND_AYRSHIRE_NORTH': 'EC_AYRSHIRE_NORTH_AND_BUTE',
        'EC_CITY_OF_CHESTER': 'EC_CHESTER__CITY_OF',
        'EC_CITY_OF_LONDON_AND_WESTMISTER_SOUTH': 'EC_CITY_OF_LONDON_AND_WESTMINSTER_SOUTH',
        'EC_CLACKMANNAN_AND_EAST_STIRLINGSHIRE': 'EC_STIRLINGSHIRE_EAST_AND_CLACKMANNAN',
        'EC_DURHAM': 'EC_DURHAM__CITY_OF',
        'EC_GASGOW_SHETTLESTON': 'EC_GLASGOW_SHETTLESTON',
        'EC_KINGSTON_UPON_HULL_CENTRAL': 'EC_HULL_CENTRAL',
        'EC_KINGSTON_UPON_HULL_EAST': 'EC_HULL_EAST',
        'EC_KINGSTON_UPON_HULL_WEST': 'EC_HULL_WEST',
        'EC_NOTTINGHSM_WEST': 'EC_NOTTINGHAM_WEST',
        'EC_OXON_MID': 'EC_OXFORDSHIRE_MID',
        'EC_ROYAL_TUNBRIDGE_WELLS': 'EC_TUNBRIDGE_WELLS',
        'EC_THE_WREKIN': 'EC_WREKIN__THE',
        'EC_WOLVERHAMTON_NORTH_EAST': 'EC_WOLVERHAMPTON_NORTH_EAST',
        'EC_YORK': 'EC_YORK__CITY_OF',
    },
    '1983': {
        'EC_BIRKENDHEAD': 'EC_BIRKENHEAD',
        'EC_CARRICK__CUMNOCK_AND_DOON_VALLEY': 'EC_CARRICK',
        'EC_CITY_OF_CHESTER': 'EC_CHESTER__CITY_OF',
        'EC_CITY_OF_DURHAM': 'EC_DURHAM__CITY_OF',
        'EC_DEVON_WEST_AND_TORRIDGE': 'EC_TORRIDGE_AND_WEST_DEVON',
        'EC_GLLINGHAM': 'EC_GILLINGHAM',
        'EC_INVERNESS__NAIRN_AND_LOCHABER': 'EC_INVERNESS',
        'EC_KILMARNOCK_AND_LOUDON': 'EC_KILMARNOCK_AND_LOUDOUN',
        'EC_LEEDS_SOUTH_AND_MORLEY': 'EC_MORLEY_AND_LEEDS_SOUTH',
        'EC_LINDSEY_EAST': 'EC_EAST_LINDSEY',
        'EC_ROSS__CROMARTY_AND_SKYE': 'EC_ROSS',
        'EC_SHEFFIELD_HILLBOROUGH': 'EC_SHEFFIELD_HILLSBOROUGH',
        'EC_THE_WREKIN': 'EC_WREKIN__THE',
        'EC_TWEEDDALE__ETTRICK_AND_LAUDERDALE': 'EC_TWEEDDALE',
        'EC_WOLVERHMAPTON_NORTH_EAST': 'EC_WOLVERHAMPTON_NORTH_EAST',
        'EC_YNYS_MON': 'EC_YNYS_MON___ANGLESEY',
        'EC_YORK': 'EC_YORK__CITY_OF',
    },
    '1997': {
        'EC_CAITHNESS__SUTHERLAND_AND_EASTER_ROSS': 'EC_CAITHNESS_SUTHERLAND_AND_EASTER_ROSS',
        'EC_CARRICK__CUMNOCK_AND_DOON_VALLEY': 'EC_CARRICK_CUMNOCK_AND_DOON_VALLEY',
        'EC_CITY_OF_CHESTER': 'EC_CHESTER__CITY_OF',
        'EC_CITY_OF_DURHAM': 'EC_DURHAM__CITY_OF',
        'EC_CITY_OF_YORK': 'EC_YORK__CITY_OF',
        'EC_GREAT_GRIMSBBY': 'EC_GREAT_GRIMSBY',
        'EC_INVERNESS_E__NAIRN_AND_LOCHABER': 'EC_INVERNESS_EAST_NAIRN_AND_LOCHABER',
        'EC_KILMARNOCK_AND_LOUDON': 'EC_KILMARNOCK_AND_LOUDOUN',
        'EC_ROSS__SKYE_AND_INVERNESS_WEST': 'EC_ROSS_SKYE_AND_INVERNESS_WEST',
        'EC_SHEFFILED_BRIGHTSIDE': 'EC_SHEFFIELD_BRIGHTSIDE',
        'EC_SHEFFILED_CENTRAL': 'EC_SHEFFIELD_CENTRAL',
        'EC_SHEFFILED_HEELEY': 'EC_SHEFFIELD_HEELEY',
        'EC_SOUTHHAMPTON_ITCHIN': 'EC_SOUTHAMPTON_ITCHEN',
        'EC_THE_WREKIN': 'EC_WREKIN__THE',
        'EC_TWEEDDALE__ETTRICK_AND_LAUDERDALE': 'EC_TWEEDDALE_ETTRICK_AND_LAUDERDALE',
    },
    '2005': {
        'EC_AIDRIE_AND_SHOTTS': 'EC_AIRDRIE_AND_SHOTTS',
        'EC_AYR__CARRICK_AND_CUMNOCK': 'EC_AYR_CARRICK_AND_CUMNOCK',
        'EC_CAITHNESS__SUTHERLAND_AND_EASTER_ROSS': 'EC_CAITHNESS_SUTHERLAND_AND_EASTER_ROSS',
        'EC_CITY_OF_CHESTER': 'EC_CHESTER__CITY_OF',
        'EC_CITY_OF_DURHAM': 'EC_DURHAM__CITY_OF',
        'EC_CITY_OF_YORK': 'EC_YORK__CITY_OF',
        'EC_GREAT_GRIMSBBY': 'EC_GREAT_GRIMSBY',
        'EC_INVERNESS__NAIRN__BADENOCH_AND_STRATHSPEY': 'EC_INVERNESS_NAIRN_BADENOCH_AND_STRATHSPEY',
        'EC_KILMARNOCK_AND_LOUDON': 'EC_KILMARNOCK_AND_LOUDOUN',
        'EC_LINLITHGOW_AND_FALKIRK_EAST': 'EC_LINLITHGOW_AND_EAST_FALKIRK',
        'EC_NA_H_EILEANAN_AN_IAR': 'EC_NA_H_EILEANAN_AN_IAR__WESTERN_ISLES_',
        'EC_ROSS__SKYE_AND_LOCHABER': 'EC_ROSS_SKYE_AND_LOCHABER',
        'EC_SHEFFILED_BRIGHTSIDE': 'EC_SHEFFIELD_BRIGHTSIDE',
        'EC_SHEFFILED_CENTRAL': 'EC_SHEFFIELD_CENTRAL',
        'EC_SHEFFILED_HEELEY': 'EC_SHEFFIELD_HEELEY',
        'EC_SOUTHHAMPTON_ITCHIN': 'EC_SOUTHAMPTON_ITCHEN',
        'EC_THE_WREKIN': 'EC_WREKIN__THE',
    },
    '2010': {
        'EC_AIDRIE_AND_SHOTTS': 'EC_AIRDRIE_AND_SHOTTS',
        'EC_AYR__CARRICK_AND_CUMNOCK': 'EC_AYR_CARRICK_AND_CUMNOCK',
        'EC_BRIDGWATER_AND_SOMERSET_WEST': 'EC_BRIDGWATER_AND_WEST_SOMERSET',
        'EC_CAITHNESS__SUTHERLAND_AND_EASTER_ROSS': 'EC_CAITHNESS_SUTHERLAND_AND_EASTER_ROSS',
        'EC_CANBRIDGESHIRE_SOUTH_EAST': 'EC_CAMBRIDGESHIRE_SOUTH_EAST',
        'EC_CITY_OF_CHESTER': 'EC_CHESTER__CITY_OF',
        'EC_CITY_OF_DURHAM': 'EC_DURHAM__CITY_OF',
        'EC_GREAT_GRIMSBBY': 'EC_GREAT_GRIMSBY',
        'EC_HEREFORD_AND_HEREFORDSHIRE_SOUTH': 'EC_HEREFORD_AND_SOUTH_HEREFORDSHIRE',
        'EC_INVERNESS__NAIRN__BADENOCH_AND_STRATHSPEY': 'EC_INVERNESS_NAIRN_BADENOCH_AND_STRATHSPEY',
        'EC_KILMARNOCK_AND_LOUDON': 'EC_KILMARNOCK_AND_LOUDOUN',
        'EC_LINLITHGOW_AND_FALKIRK_EAST': 'EC_LINLITHGOW_AND_EAST_FALKIRK',
        'EC_MORCAMBE_AND_LUNESDALE': 'EC_MORECAMBE_AND_LUNESDALE',
        'EC_NA_H_EILEANAN_AN_IAR': 'EC_NA_H_EILEANAN_AN_IAR__WESTERN_ISLES_',
        'EC_NORTHAMAPTON_SOUTH': 'EC_NORTHAMPTON_SOUTH',
        'EC_ROSS__SKYE_AND_LOCHABER': 'EC_ROSS_SKYE_AND_LOCHABER',
        'EC_SOUTH_RIBBLE': 'EC_RIBBLE_SOUTH',
        'EC_SUUFOLK_WEST': 'EC_SUFFOLK_WEST',
        'EC_THE_COTSWOLDS': 'EC_COTSWOLDS__THE',
        'EC_THE_WREKIN': 'EC_WREKIN__THE',
    },
    '2024': {
        'EC_AYR_CARRICK_AND_CUMNOCK': 'EC_AYR__CARRICK_AND_CUMNOCK',
        'EC_CAERFYRDDIN': 'EC_CAERFYRDDIN__CARMARTHEN_',
        'EC_CITY_OF_DURHAM': 'EC_DURHAM__CITY_OF',
        'EC_DORSET_MID_AND_POOLE_NORTH': 'EC_DORSET_MID_AND_NORTH_POOLE',
        'EC_FAVERSHAM_AND_KENT_MID': 'EC_FAVERSHAM_AND_MID_KENT',
        'EC_KILMARNOCK_AND_LOUDON': 'EC_KILMARNOCK_AND_LOUDOUN',
        'EC_MIDDLESBROUGH_SOUTH_AND_CLEVELAND_EAST': 'EC_MIDDLESBROUGH_SOUTH_AND_EAST_CLEVELAND',
        'EC_MORAY_W__NAIRN_AND_STRATHSPEY': 'EC_MORAY_WEST__NAIRN_AND_STRATHSPEY',
        'EC_NA_H_EILEANAN_AN_IAR': 'EC_NA_H_EILEANAN_AN_IAR__WESTERN_ISLES_',
        'EC_OLDHAM_W__CHADDERTON_AND_ROYTON': 'EC_OLDHAM_WEST__CHADDERTON_AND_ROYTON',
        'EC_SUFFOLK_CENTRAL_AND_IPSWICH_NORTH': 'EC_SUFFOLK_CENTRAL_AND_NORTH_IPSWICH',
        'EC_THE_WREKIN': 'EC_WREKIN__THE',
        'EC_YNYS_M_N': 'EC_YNYS_MON__ANGLESEY_',
    },
}

# Boundary versions that have Richmond duplicates needing lat-based split
RICHMOND_SPLIT_VERSIONS = ['1955', '1974']

# Boundary versions that have EC_ empty feature → EC_SOUTHEND_WEST
EMPTY_FEATURE_VERSIONS = ['1997', '2005']

# Boundary versions that need deduplication
DEDUP_VERSIONS = ['2010']


def count_coords(feature):
    """Count total coordinate points in a feature's geometry."""
    coords = feature['geometry']['coordinates']
    geo_type = feature['geometry']['type']
    total = 0
    if geo_type == 'Polygon':
        for ring in coords:
            total += len(ring)
    elif geo_type == 'MultiPolygon':
        for polygon in coords:
            for ring in polygon:
                total += len(ring)
    return total


def get_centroid_lat(feature):
    """Compute approximate centroid latitude from geometry coordinates."""
    coords = feature['geometry']['coordinates']
    geo_type = feature['geometry']['type']

    all_points = []
    if geo_type == 'Polygon':
        for ring in coords:
            all_points.extend(ring)
    elif geo_type == 'MultiPolygon':
        for polygon in coords:
            for ring in polygon:
                all_points.extend(ring)

    if not all_points:
        return 0

    return sum(p[1] for p in all_points) / len(all_points)


def fix_election_files():
    """Fix election JSON files."""
    elections_dir = os.path.join(DATA_DIR, 'elections')
    fixes_applied = 0

    for filename in sorted(os.listdir(elections_dir)):
        if not filename.endswith('.json'):
            continue

        year_str = filename.replace('.json', '')
        filepath = os.path.join(elections_dir, filename)

        with open(filepath, 'r') as f:
            data = json.load(f)

        modified = False

        # Fix boundaryVersion
        if year_str in BOUNDARY_VERSION_FIXES:
            expected = BOUNDARY_VERSION_FIXES[year_str]
            if data.get('boundaryVersion') != expected:
                print(f'  {year_str}: boundaryVersion "{data.get("boundaryVersion")}" → "{expected}"')
                data['boundaryVersion'] = expected
                modified = True

        # Fix year encoding for 197402/197410
        if year_str in YEAR_ENCODING_FIXES:
            expected_year = YEAR_ENCODING_FIXES[year_str]
            if data.get('year') != expected_year:
                print(f'  {year_str}: top-level year {data.get("year")} → {expected_year}')
                data['year'] = expected_year
                modified = True

            for c in data.get('constituencies', []):
                if c.get('year') != expected_year:
                    c['year'] = expected_year
                    modified = True

        # Rename EC_WOODFORD → EC_WANSTEAD_AND_WOODFORD in 1955/1959
        if year_str in WOODFORD_RENAME_YEARS:
            for c in data.get('constituencies', []):
                if c.get('constituencyId') == 'EC_WOODFORD':
                    print(f'  {year_str}: rename EC_WOODFORD → EC_WANSTEAD_AND_WOODFORD')
                    c['constituencyId'] = 'EC_WANSTEAD_AND_WOODFORD'
                    c['constituencyName'] = 'Wanstead and Woodford'
                    modified = True

        if modified:
            with open(filepath, 'w') as f:
                json.dump(data, f, separators=(',', ':'))
            fixes_applied += 1

    return fixes_applied


def fix_boundary_files():
    """Fix boundary GeoJSON files."""
    boundaries_dir = os.path.join(DATA_DIR, 'boundaries')
    fixes_applied = 0

    for version in sorted(BOUNDARY_RENAMES.keys()):
        filepath = os.path.join(boundaries_dir, f'{version}.json')
        if not os.path.exists(filepath):
            print(f'  WARNING: {filepath} not found, skipping')
            continue

        with open(filepath, 'r') as f:
            data = json.load(f)

        modified = False
        renames = BOUNDARY_RENAMES[version]
        features = data['features']
        rename_count = 0

        # Handle Richmond lat-based split
        if version in RICHMOND_SPLIT_VERSIONS:
            for feature in features:
                if feature['properties']['id'] == 'EC_RICHMOND':
                    lat = get_centroid_lat(feature)
                    if lat > 53:
                        new_id = 'EC_RICHMOND__YORKS_'
                        new_name = 'Richmond (Yorks.)'
                    else:
                        new_id = 'EC_RICHMOND__SURREY_'
                        new_name = 'Richmond (Surrey)'
                    print(f'  {version}: Richmond lat={lat:.1f} → {new_id}')
                    feature['properties']['id'] = new_id
                    feature['properties']['Name'] = new_name
                    feature['properties']['normalizedName'] = new_name
                    modified = True
                    rename_count += 1

        # Handle empty feature → EC_SOUTHEND_WEST
        if version in EMPTY_FEATURE_VERSIONS:
            for feature in features:
                if feature['properties']['id'] == 'EC_':
                    print(f'  {version}: EC_ (empty) → EC_SOUTHEND_WEST')
                    feature['properties']['id'] = 'EC_SOUTHEND_WEST'
                    feature['properties']['Name'] = 'Southend West'
                    feature['properties']['normalizedName'] = 'Southend West'
                    modified = True
                    rename_count += 1

        # Apply ID mapping renames
        for feature in features:
            old_id = feature['properties']['id']
            if old_id in renames:
                new_id = renames[old_id]
                feature['properties']['id'] = new_id
                modified = True
                rename_count += 1

        if rename_count > 0:
            print(f'  {version}: {rename_count} IDs renamed')

        # Deduplicate features (keep the occurrence with the most coordinate points)
        if version in DEDUP_VERSIONS:
            from collections import defaultdict
            id_features = defaultdict(list)
            for feature in features:
                fid = feature['properties']['id']
                id_features[fid].append(feature)

            dupe_count = 0
            deduped = []
            seen_ids = set()
            for feature in features:
                fid = feature['properties']['id']
                if fid in seen_ids:
                    continue
                seen_ids.add(fid)
                candidates = id_features[fid]
                if len(candidates) > 1:
                    dupe_count += len(candidates) - 1
                    # Keep the one with the most coordinate points
                    best = max(candidates, key=lambda f: count_coords(f))
                    deduped.append(best)
                else:
                    deduped.append(candidates[0])

            if dupe_count > 0:
                print(f'  {version}: removed {dupe_count} duplicate features ({len(features)} → {len(deduped)})')
                data['features'] = deduped
                modified = True

        if modified:
            with open(filepath, 'w') as f:
                json.dump(data, f, separators=(',', ':'))
            fixes_applied += 1

    return fixes_applied


def ring_signed_area(ring):
    """Compute signed area of a ring using the shoelace formula.
    Negative = CW in geographic space (correct for D3 with projection).
    Positive = CCW in geographic space (wrong - D3 renders as globe minus polygon).
    """
    area = 0
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        area += ring[i][0] * ring[j][1]
        area -= ring[j][0] * ring[i][1]
    return area / 2


def fix_winding_order():
    """Fix polygon winding order so D3 renders correctly.

    D3 with a projection expects outer rings to be CW (negative signed area)
    and inner rings (holes) to be CCW (positive signed area) in geographic
    coordinates. The 2010 boundary file has this correct; others are mixed.
    """
    boundaries_dir = os.path.join(DATA_DIR, 'boundaries')
    fixes_applied = 0

    for version in ['1955', '1974', '1983', '1997', '2005', '2010', '2024']:
        filepath = os.path.join(boundaries_dir, f'{version}.json')
        if not os.path.exists(filepath):
            continue

        with open(filepath, 'r') as f:
            data = json.load(f)

        modified = False
        rewound = 0

        for feature in data['features']:
            geom = feature['geometry']
            geo_type = geom['type']

            if geo_type == 'Polygon':
                rings = geom['coordinates']
                for i, ring in enumerate(rings):
                    area = ring_signed_area(ring)
                    if i == 0:
                        # Outer ring should be CW (negative area)
                        if area > 0:
                            rings[i] = list(reversed(ring))
                            modified = True
                            rewound += 1
                    else:
                        # Inner rings (holes) should be CCW (positive area)
                        if area < 0:
                            rings[i] = list(reversed(ring))
                            modified = True
                            rewound += 1

            elif geo_type == 'MultiPolygon':
                for polygon in geom['coordinates']:
                    for i, ring in enumerate(polygon):
                        area = ring_signed_area(ring)
                        if i == 0:
                            if area > 0:
                                polygon[i] = list(reversed(ring))
                                modified = True
                                rewound += 1
                        else:
                            if area < 0:
                                polygon[i] = list(reversed(ring))
                                modified = True
                                rewound += 1

        if rewound > 0:
            print(f'  {version}: rewound {rewound} rings')

        if modified:
            with open(filepath, 'w') as f:
                json.dump(data, f, separators=(',', ':'))
            fixes_applied += 1

    return fixes_applied


def normalize_constituency_name(name):
    """Python port of normalizeConstituencyName() from src/utils/constituencyMatching.ts."""
    import re
    if not name:
        return ''
    n = name
    n = re.sub(r'\s*&\s*', ' and ', n)
    n = n.replace('-', ' ')
    n = re.sub(r'\bNE\b', 'North East', n)
    n = re.sub(r'\bNW\b', 'North West', n)
    n = re.sub(r'\bSE\b', 'South East', n)
    n = re.sub(r'\bSW\b', 'South West', n)
    n = re.sub(r'\bN\b(?=\s|$)', 'North', n)
    n = re.sub(r'\bS\b(?=\s|$)', 'South', n)
    n = re.sub(r'\bE\b(?=\s|$)', 'East', n)
    n = re.sub(r'\bW\b(?=\s|$)', 'West', n)
    n = re.sub(r'\s+', ' ', n).strip().lower()
    return n


def sync_boundary_names():
    """Update boundary Name/normalizedName fields from election data.

    After ID fixes, all boundary feature IDs should match election constituency IDs.
    Propagate the canonical election name to boundary features so name-based matching
    also works (parlconst uses abbreviations like 'N' for 'North', '&' for 'and').
    """
    boundaries_dir = os.path.join(DATA_DIR, 'boundaries')
    elections_dir = os.path.join(DATA_DIR, 'elections')

    year_to_boundary = {
        '1955': '1955', '1959': '1955', '1964': '1955', '1966': '1955', '1970': '1955',
        '197402': '1974', '197410': '1974', '1979': '1974',
        '1983': '1983', '1987': '1983', '1992': '1983',
        '1997': '1997', '2001': '1997',
        '2005': '2005',
        '2010': '2010', '2015': '2010', '2017': '2010', '2019': '2010',
        '2024': '2024',
    }

    # Build name lookup per boundary version from election data
    # Use the first election year for each boundary version
    boundary_name_lookup = {}
    for year_str, bv in year_to_boundary.items():
        if bv not in boundary_name_lookup:
            boundary_name_lookup[bv] = {}
        epath = os.path.join(elections_dir, f'{year_str}.json')
        with open(epath, 'r') as f:
            election = json.load(f)
        for c in election['constituencies']:
            # Don't overwrite if already set (first year takes precedence)
            if c['constituencyId'] not in boundary_name_lookup[bv]:
                boundary_name_lookup[bv][c['constituencyId']] = c['constituencyName']

    fixes_applied = 0
    for bv, name_lookup in sorted(boundary_name_lookup.items()):
        filepath = os.path.join(boundaries_dir, f'{bv}.json')
        with open(filepath, 'r') as f:
            data = json.load(f)

        modified = False
        name_update_count = 0

        for feature in data['features']:
            fid = feature['properties']['id']
            if fid in name_lookup:
                election_name = name_lookup[fid]
                normalized = normalize_constituency_name(election_name)
                current_name = feature['properties'].get('Name', '')
                current_normalized = feature['properties'].get('normalizedName', '')
                # Check if Name or normalizedName needs updating
                if current_name != election_name or current_normalized != normalized:
                    feature['properties']['Name'] = election_name
                    # normalizedName stores the result of normalizeConstituencyName(Name)
                    feature['properties']['normalizedName'] = normalized
                    modified = True
                    name_update_count += 1

        if name_update_count > 0:
            print(f'  {bv}: {name_update_count} names updated from election data')

        if modified:
            with open(filepath, 'w') as f:
                json.dump(data, f, separators=(',', ':'))
            fixes_applied += 1

    return fixes_applied


def validate():
    """Run a quick validation pass after fixes."""
    boundaries_dir = os.path.join(DATA_DIR, 'boundaries')
    elections_dir = os.path.join(DATA_DIR, 'elections')

    year_to_boundary = {
        '1955': '1955', '1959': '1955', '1964': '1955', '1966': '1955', '1970': '1955',
        '197402': '1974', '197410': '1974', '1979': '1974',
        '1983': '1983', '1987': '1983', '1992': '1983',
        '1997': '1997', '2001': '1997',
        '2005': '2005',
        '2010': '2010', '2015': '2010', '2017': '2010', '2019': '2010',
        '2024': '2024',
    }

    # Known exceptions
    known_exceptions = {
        # 1992 Milton Keynes split: 2 election constituencies map to 1 boundary
        ('1992', 'EC_MILTON_KEYNES_NORTH_EAST'),
        ('1992', 'EC_MILTON_KEYNES_SOUTH_WEST'),
    }

    boundary_cache = {}
    total_mismatches = 0

    print('\nValidation:')
    for year_str, bv in sorted(year_to_boundary.items()):
        # Load election
        epath = os.path.join(elections_dir, f'{year_str}.json')
        with open(epath, 'r') as f:
            election = json.load(f)

        # Load boundary (cached)
        if bv not in boundary_cache:
            bpath = os.path.join(boundaries_dir, f'{bv}.json')
            with open(bpath, 'r') as f:
                boundary_cache[bv] = json.load(f)
        boundary = boundary_cache[bv]

        election_ids = set(c['constituencyId'] for c in election['constituencies'])
        boundary_ids = set(f['properties']['id'] for f in boundary['features'] if f['properties'].get('id'))

        missing_from_boundary = election_ids - boundary_ids
        missing_from_election = boundary_ids - election_ids

        # Filter known exceptions
        missing_from_boundary = {
            m for m in missing_from_boundary
            if (year_str, m) not in known_exceptions
        }

        if missing_from_boundary or missing_from_election:
            total_mismatches += len(missing_from_boundary) + len(missing_from_election)
            print(f'  {year_str} (boundary {bv}):')
            if missing_from_boundary:
                print(f'    Election IDs missing from boundary: {sorted(missing_from_boundary)[:10]}')
            if missing_from_election:
                print(f'    Boundary IDs missing from election: {sorted(missing_from_election)[:10]}')
        else:
            print(f'  {year_str} (boundary {bv}): OK ({len(election_ids)} constituencies)')

    if total_mismatches == 0:
        print('\nAll clear! No unexpected mismatches.')
    else:
        print(f'\n{total_mismatches} total mismatches remaining.')


def main():
    print('=== Fixing election files ===')
    e_fixes = fix_election_files()
    print(f'  → {e_fixes} election files modified\n')

    print('=== Fixing boundary files ===')
    b_fixes = fix_boundary_files()
    print(f'  → {b_fixes} boundary files modified\n')

    print('=== Fixing winding order ===')
    w_fixes = fix_winding_order()
    print(f'  → {w_fixes} boundary files rewound\n')

    print('=== Syncing boundary names from election data ===')
    n_fixes = sync_boundary_names()
    print(f'  → {n_fixes} boundary files updated\n')

    print('=== Validation ===')
    validate()


if __name__ == '__main__':
    main()
