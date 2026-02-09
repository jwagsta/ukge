#!/usr/bin/env python3
"""
Clip constituency boundary polygons to the GB coastline.

Uses ONS "Countries (December 2024) Boundaries GB BSC" (200m super-generalised,
clipped to Mean High Water) as a land mask. Intersects each constituency polygon
with the land mask so that sea-area envelopes (e.g. Orkney & Shetland, Western
Isles) are replaced with actual island outlines, and coastal constituencies are
trimmed to the coastline.

Input:  public/data/boundaries/{era}.json (7 files)
        reference_data/gb_coastline.geojson
Output: public/data/boundaries/{era}.json (modified in-place)

Run BEFORE fix_data.py (clipping may alter winding order, which fix_data.py corrects).

Dependencies: shapely (pip install shapely)
"""

import json
import os
import sys
from shapely.geometry import shape, mapping, MultiPolygon, GeometryCollection
from shapely.ops import unary_union
from shapely.validation import make_valid

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.join(SCRIPT_DIR, '..')
BOUNDARIES_DIR = os.path.join(PROJECT_DIR, 'public', 'data', 'boundaries')
COASTLINE_PATH = os.path.join(PROJECT_DIR, 'reference_data', 'gb_coastline.geojson')

BOUNDARY_VERSIONS = ['1955', '1974', '1983', '1997', '2005', '2010', '2024']

# Minimum area threshold (in square degrees) to filter out tiny sliver polygons
# ~0.000001 sq degrees ≈ 1 hectare at UK latitudes
MIN_AREA = 1e-6


def load_land_mask():
    """Load GB coastline and union into a single land mask geometry."""
    with open(COASTLINE_PATH, 'r') as f:
        coastline = json.load(f)

    country_geoms = []
    for feature in coastline['features']:
        geom = shape(feature['geometry'])
        if not geom.is_valid:
            geom = make_valid(geom)
        country_geoms.append(geom)

    land_mask = unary_union(country_geoms)
    if not land_mask.is_valid:
        land_mask = make_valid(land_mask)

    print(f'  Land mask: {land_mask.geom_type} with {len(country_geoms)} countries')
    return land_mask


def extract_polygons(geom):
    """Extract only Polygon/MultiPolygon parts from a geometry, filtering tiny slivers."""
    polygons = []

    if geom.is_empty:
        return polygons

    if geom.geom_type == 'Polygon':
        if geom.area >= MIN_AREA:
            polygons.append(geom)
    elif geom.geom_type == 'MultiPolygon':
        for poly in geom.geoms:
            if poly.area >= MIN_AREA:
                polygons.append(poly)
    elif geom.geom_type == 'GeometryCollection':
        for part in geom.geoms:
            polygons.extend(extract_polygons(part))

    return polygons


def round_coords(coords, precision=3):
    """Recursively round coordinates to given decimal places."""
    if isinstance(coords[0], (int, float)):
        return [round(c, precision) for c in coords]
    return [round_coords(c, precision) for c in coords]


def count_coords(geometry_dict):
    """Count total coordinate points in a GeoJSON geometry dict."""
    coords = geometry_dict['coordinates']
    geo_type = geometry_dict['type']
    total = 0
    if geo_type == 'Polygon':
        for ring in coords:
            total += len(ring)
    elif geo_type == 'MultiPolygon':
        for polygon in coords:
            for ring in polygon:
                total += len(ring)
    return total


def clip_boundary_file(filepath, land_mask):
    """Clip all features in a boundary file to the land mask."""
    with open(filepath, 'r') as f:
        data = json.load(f)

    features = data['features']
    modified_count = 0
    coords_before_total = 0
    coords_after_total = 0

    for feature in features:
        geom_dict = feature['geometry']
        fid = feature['properties'].get('id', '?')

        coords_before = count_coords(geom_dict)
        coords_before_total += coords_before

        try:
            constituency_geom = shape(geom_dict)
        except (ValueError, Exception) as e:
            # Degenerate rings (< 4 points) can't be parsed by Shapely
            coords_after_total += coords_before
            continue

        if not constituency_geom.is_valid:
            constituency_geom = make_valid(constituency_geom)

        try:
            clipped = constituency_geom.intersection(land_mask)
        except Exception as e:
            print(f'    WARNING: intersection failed for {fid}: {e}')
            coords_after_total += coords_before
            continue

        if clipped.is_empty:
            print(f'    WARNING: empty intersection for {fid}')
            coords_after_total += coords_before
            continue

        # Extract only polygon parts (discard lines, points from intersection)
        polygons = extract_polygons(clipped)

        if not polygons:
            print(f'    WARNING: no polygon parts after clipping {fid}')
            coords_after_total += coords_before
            continue

        if len(polygons) == 1:
            result_geom = polygons[0]
        else:
            result_geom = MultiPolygon(polygons)

        # Convert back to GeoJSON and round coordinates
        result_dict = mapping(result_geom)
        result_dict['coordinates'] = round_coords(result_dict['coordinates'])

        coords_after = count_coords(result_dict)
        coords_after_total += coords_after

        # Check if geometry actually changed
        if result_dict['type'] != geom_dict['type'] or coords_after != coords_before:
            feature['geometry'] = result_dict
            modified_count += 1

    # Write back
    with open(filepath, 'w') as f:
        json.dump(data, f, separators=(',', ':'))

    return modified_count, coords_before_total, coords_after_total


def main():
    if not os.path.exists(COASTLINE_PATH):
        print(f'ERROR: Coastline file not found: {COASTLINE_PATH}')
        print('Download from ONS Open Geography Portal:')
        print('  Countries (December 2024) Boundaries GB BSC')
        sys.exit(1)

    print('=== Loading GB land mask ===')
    land_mask = load_land_mask()

    print('\n=== Clipping boundary files ===')
    total_modified = 0

    for version in BOUNDARY_VERSIONS:
        filepath = os.path.join(BOUNDARIES_DIR, f'{version}.json')
        if not os.path.exists(filepath):
            print(f'  {version}: file not found, skipping')
            continue

        modified, before, after = clip_boundary_file(filepath, land_mask)
        total_modified += modified
        pct = ((before - after) / before * 100) if before > 0 else 0
        print(f'  {version}: {modified} features clipped, '
              f'coords {before} → {after} ({pct:+.1f}%)')

    print(f'\n  → {total_modified} total features modified')


if __name__ == '__main__':
    main()
