#!/usr/bin/env python3
"""
Normalize constituency names between Electoral Calculus data and ONS boundaries.
Updates election JSON files with proper ONS constituency codes.
"""

import json
import re
from pathlib import Path

def normalize_name(name):
    """Normalize constituency name for matching."""
    # Convert to lowercase
    n = name.lower()
    # Remove text in parentheses
    n = re.sub(r'\s*\([^)]*\)', '', n)
    # Handle "X, City of" -> "city of x"
    if ', city of' in n:
        n = 'city of ' + n.replace(', city of', '')
    # Handle "X, The" -> "the x"
    if ', the' in n:
        n = 'the ' + n.replace(', the', '')
    # Handle "Kingston upon Hull X" -> "Hull X"
    n = n.replace('kingston upon hull', 'hull')
    # Handle Welsh characters
    n = n.replace('ô', 'o').replace('ŷ', 'y').replace('â', 'a')
    # Remove commas (handles "Birmingham, Edgbaston" vs "Birmingham Edgbaston")
    n = n.replace(',', '')
    # Standardize word order for directional prefixes
    words = n.split()
    # Sort words to handle "East Antrim" vs "Antrim East"
    words_sorted = sorted(words)
    n = ' '.join(words_sorted)
    # Remove common variations
    n = n.replace(' and ', ' ')
    n = n.replace(' & ', ' ')
    n = n.replace('the ', '')
    n = n.replace('-', ' ')
    n = re.sub(r'\s+', ' ', n).strip()
    return n

def build_boundary_lookup(boundaries_file):
    """Build lookup from normalized name to ONS code and official name."""
    with open(boundaries_file, 'r') as f:
        data = json.load(f)

    lookup = {}
    for feature in data['features']:
        props = feature['properties']
        # Handle both 2024 and 2010/2013 boundary files
        code = props.get('PCON24CD') or props.get('PCON13CD') or ''
        name = props.get('PCON24NM') or props.get('PCON13NM') or ''

        if code and name:
            normalized = normalize_name(name)
            lookup[normalized] = {'code': code, 'name': name}
            # Also add original name as key
            lookup[name.lower()] = {'code': code, 'name': name}

    return lookup

def update_election_file(election_file, lookup):
    """Update election file with proper ONS codes."""
    with open(election_file, 'r') as f:
        data = json.load(f)

    updated = 0
    unmatched = []

    for constituency in data['constituencies']:
        name = constituency['constituencyName']
        normalized = normalize_name(name)

        # Try exact match first
        match = lookup.get(name.lower())
        if not match:
            # Try normalized match
            match = lookup.get(normalized)

        if match:
            constituency['constituencyId'] = match['code']
            updated += 1
        else:
            unmatched.append(name)

    # Save updated file
    with open(election_file, 'w') as f:
        json.dump(data, f, indent=2)

    return updated, unmatched

def main():
    script_dir = Path(__file__).parent
    boundaries_dir = script_dir.parent / 'public' / 'data' / 'boundaries'
    elections_dir = script_dir.parent / 'public' / 'data' / 'elections'

    # Build lookups for each boundary version
    boundary_files = {
        '2024': boundaries_dir / '2024.json',
        '2010': boundaries_dir / '2010.json',
    }

    lookups = {}
    for version, filepath in boundary_files.items():
        if filepath.exists():
            lookups[version] = build_boundary_lookup(filepath)
            print(f'Loaded {version} boundaries: {len(lookups[version])} entries')

    # Map election years to boundary versions
    year_to_boundary = {
        2024: '2024',
        2019: '2010', 2017: '2010', 2015: '2010', 2010: '2010',
        2005: '2010', 2001: '2010', 1997: '2010',  # Will have more mismatches
        1992: '2010', 1987: '2010', 1983: '2010',
        1979: '2010', 197410: '2010', 197402: '2010',
        1970: '2010', 1966: '2010', 1964: '2010', 1959: '2010', 1955: '2010',
    }

    print('\nUpdating election files...')

    for election_file in sorted(elections_dir.glob('*.json')):
        year = int(election_file.stem)
        boundary_version = year_to_boundary.get(year, '2010')

        if boundary_version not in lookups:
            print(f'  {election_file.name}: No boundary file for version {boundary_version}')
            continue

        lookup = lookups[boundary_version]
        updated, unmatched = update_election_file(election_file, lookup)

        print(f'  {election_file.name}: Updated {updated} constituencies, {len(unmatched)} unmatched')

        if unmatched and len(unmatched) <= 10:
            for name in unmatched:
                print(f'    - {name}')

if __name__ == '__main__':
    main()
