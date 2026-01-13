#!/bin/bash

# Download UK Constituency Boundary Data
# This script downloads constituency boundaries from UK-GeoJSON

BOUNDARIES_DIR="./public/data/boundaries"

echo "Downloading UK constituency boundaries..."

# Create directory if it doesn't exist
mkdir -p "$BOUNDARIES_DIR"

# Download 2024 boundaries (Westminster Parliamentary Constituencies)
# From: https://github.com/martinjc/UK-GeoJSON

echo "Downloading 2024 constituency boundaries..."
curl -L -o "$BOUNDARIES_DIR/constituencies-2024.json" \
  "https://raw.githubusercontent.com/martinjc/UK-GeoJSON/master/json/electoral/gb/wpc.json"

# Alternative: Download from ONS Geoportal (more detailed)
# Uncomment if you prefer official ONS data:
# curl -L -o "$BOUNDARIES_DIR/constituencies-2024.geojson" \
#   "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BFC/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson"

# Convert to TopoJSON for smaller file size (requires topojson CLI)
# npm install -g topojson-server
if command -v geo2topo &> /dev/null; then
    echo "Converting to TopoJSON..."
    geo2topo constituencies="$BOUNDARIES_DIR/constituencies-2024.json" \
      -o "$BOUNDARIES_DIR/constituencies.json"
    echo "TopoJSON created at $BOUNDARIES_DIR/constituencies.json"
else
    echo "Note: Install topojson-server for smaller file sizes:"
    echo "  npm install -g topojson-server"
    echo "  Then re-run this script"

    # Copy the GeoJSON as-is for now
    cp "$BOUNDARIES_DIR/constituencies-2024.json" "$BOUNDARIES_DIR/constituencies.json"
fi

echo ""
echo "Boundary data downloaded to $BOUNDARIES_DIR"
echo ""
echo "To use TopoJSON (recommended for performance):"
echo "  npm install -g topojson-server"
echo "  geo2topo constituencies=constituencies-2024.json -o constituencies.json"
