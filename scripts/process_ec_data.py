#!/usr/bin/env python3
"""
Process Electoral Calculus Election Data

Converts Electoral Calculus .txt files to JSON format for the app.
"""

import json
import os
from pathlib import Path

# File mappings: filename -> { year, boundaryVersion, date }
FILE_MAPPINGS = {
    'electdata_1955.txt': {'year': 1955, 'boundaryVersion': '1950', 'date': '1955-05-26'},
    'electdata_1959.txt': {'year': 1959, 'boundaryVersion': '1950', 'date': '1959-10-08'},
    'electdata_1964.txt': {'year': 1964, 'boundaryVersion': '1950', 'date': '1964-10-15'},
    'electdata_1966.txt': {'year': 1966, 'boundaryVersion': '1950', 'date': '1966-03-31'},
    'electdata_1970.txt': {'year': 1970, 'boundaryVersion': '1950', 'date': '1970-06-18'},
    'electdata_1974feb.txt': {'year': 197402, 'boundaryVersion': '1974', 'date': '1974-02-28'},
    'electdata_1974oct.txt': {'year': 197410, 'boundaryVersion': '1974', 'date': '1974-10-10'},
    'electdata_1979.txt': {'year': 1979, 'boundaryVersion': '1974', 'date': '1979-05-03'},
    'electdata_1983.txt': {'year': 1983, 'boundaryVersion': '1983', 'date': '1983-06-09'},
    'electdata_1987.txt': {'year': 1987, 'boundaryVersion': '1983', 'date': '1987-06-11'},
    'electdata_1992ob.txt': {'year': 1992, 'boundaryVersion': '1983', 'date': '1992-04-09'},
    'electdata_1997.txt': {'year': 1997, 'boundaryVersion': '1997', 'date': '1997-05-01'},
    'electdata_2001ob.txt': {'year': 2001, 'boundaryVersion': '1997', 'date': '2001-06-07'},
    'electdata_2005ob.txt': {'year': 2005, 'boundaryVersion': '1997', 'date': '2005-05-05'},
    'electdata_2010.txt': {'year': 2010, 'boundaryVersion': '2010', 'date': '2010-05-06'},
    'electdata_2015.txt': {'year': 2015, 'boundaryVersion': '2010', 'date': '2015-05-07'},
    'electdata_2017.txt': {'year': 2017, 'boundaryVersion': '2010', 'date': '2017-06-08'},
    'electdata_2019.txt': {'year': 2019, 'boundaryVersion': '2010', 'date': '2019-12-12'},
    'electdata_2024.txt': {'year': 2024, 'boundaryVersion': '2024', 'date': '2024-07-04'},
}

# Area code to region mapping
# Electoral Calculus: 1=NI, 2=Scotland, 3=NE, 4=NW, 5=Yorks, 6=Wales, 7=WMids, 8=EMids, 9=East, 10=SW, 11=London, 12=SE
AREA_TO_REGION = {
    '1': 'northern_ireland',
    '2': 'scotland',
    '3': 'north_east',
    '4': 'north_west',
    '5': 'yorkshire',
    '6': 'wales',
    '7': 'west_midlands',
    '8': 'east_midlands',
    '9': 'east',
    '10': 'south_west',
    '11': 'london',
    '12': 'south_east',
}

# Area code to country mapping (for non-England areas)
AREA_TO_COUNTRY = {
    '1': 'northern_ireland',
    '2': 'scotland',
    '6': 'wales',
}

# Party column mappings
PARTY_COLUMNS = {
    'CON': {'id': 'con', 'name': 'Conservative'},
    'LAB': {'id': 'lab', 'name': 'Labour'},
    'LIB': {'id': 'ld', 'name': 'Liberal Democrat'},
    'Reform': {'id': 'reform', 'name': 'Reform UK'},
    'Green': {'id': 'grn', 'name': 'Green'},
    'NAT': {'id': 'nat', 'name': 'Nationalist'},
    'MIN': {'id': 'min', 'name': 'Minor'},
    'OTH': {'id': 'other', 'name': 'Other'},
}


def parse_file(filepath, metadata):
    """Parse Electoral Calculus data file."""
    # Try different encodings
    content = None
    for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
        try:
            with open(filepath, 'r', encoding=encoding) as f:
                content = f.read()
            break
        except UnicodeDecodeError:
            continue

    if content is None:
        raise ValueError(f"Could not decode file with any known encoding")

    lines = content.strip().split('\n')

    if not lines:
        return None

    # Parse header
    headers = lines[0].split(';')
    constituencies = []

    for line in lines[1:]:
        values = line.split(';')
        row = dict(zip(headers, values))

        constituency_name = row.get('Name', '')
        area = row.get('Area', '')
        electorate = int(row.get('Electorate', '0') or '0')

        # Build party results
        results = []
        total_votes = 0

        for col, party in PARTY_COLUMNS.items():
            votes = int(row.get(col, '0') or '0')
            if votes > 0:
                total_votes += votes

                # Handle nationalist parties (SNP vs Plaid)
                party_id = party['id']
                party_name = party['name']

                if col == 'NAT':
                    if area == '2':  # Scotland
                        party_id = 'snp'
                        party_name = 'SNP'
                    elif area == '6':  # Wales
                        party_id = 'pc'
                        party_name = 'Plaid Cymru'
                    # Note: Area 1 (Northern Ireland) doesn't use NAT column - NI parties are in MIN/OTH

                results.append({
                    'partyId': party_id,
                    'partyName': party_name,
                    'candidate': '',  # Electoral Calculus doesn't provide candidate names
                    'votes': votes,
                    'voteShare': 0,
                })

        # Calculate vote shares
        if total_votes > 0:
            for r in results:
                r['voteShare'] = round((r['votes'] / total_votes) * 100, 2)

        # Sort by votes descending
        results.sort(key=lambda x: x['votes'], reverse=True)

        winner = results[0]['partyId'] if results else 'unknown'
        majority = (results[0]['votes'] - results[1]['votes']) if len(results) >= 2 else (results[0]['votes'] if results else 0)

        # Calculate turnout
        turnout = round((total_votes / electorate) * 100, 1) if electorate > 0 else 0

        # Determine region and country
        region = AREA_TO_REGION.get(area, 'england')
        country = AREA_TO_COUNTRY.get(area, 'england')

        # Generate constituency ID
        import re
        clean_name = re.sub(r'[^A-Z0-9]', '_', constituency_name.upper())
        constituency_id = f'EC_{clean_name}'

        year = metadata['year']
        display_year = year // 100 if year > 100000 else year

        constituencies.append({
            'constituencyId': constituency_id,
            'constituencyName': constituency_name,
            'region': region,
            'country': country,
            'year': display_year,
            'electorate': electorate,
            'turnout': turnout,
            'validVotes': total_votes,
            'winner': winner,
            'majority': majority,
            'results': results,
        })

    year = metadata['year']
    display_year = year // 100 if year > 100000 else year

    return {
        'year': display_year,
        'date': metadata['date'],
        'totalSeats': len(constituencies),
        'boundaryVersion': metadata['boundaryVersion'],
        'constituencies': constituencies,
    }


def main():
    print('Processing Electoral Calculus Election Data')
    print('=' * 43)
    print()

    script_dir = Path(__file__).parent
    raw_dir = script_dir.parent / 'public' / 'data' / 'raw'
    output_dir = script_dir.parent / 'public' / 'data' / 'elections'

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    processed = 0
    failed = 0

    for filename, metadata in FILE_MAPPINGS.items():
        input_path = raw_dir / filename

        if not input_path.exists():
            print(f'Skipping {filename} (not found)')
            failed += 1
            continue

        try:
            data = parse_file(input_path, metadata)

            if data and data['constituencies']:
                output_filename = f"{metadata['year']}.json"
                output_path = output_dir / output_filename

                with open(output_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)

                print(f"Created: {output_filename} ({data['totalSeats']} constituencies)")
                processed += 1
            else:
                print(f'Warning: No data extracted from {filename}')
                failed += 1

        except Exception as e:
            print(f'Error processing {filename}: {e}')
            failed += 1

    print()
    print('=== Processing Complete ===')
    print(f'Processed: {processed} files')
    print(f'Failed: {failed} files')


if __name__ == '__main__':
    main()
