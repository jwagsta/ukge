/**
 * Northern Ireland inset map utility.
 *
 * NI is rendered as an inset box on geographic maps (choropleth, dot density, hex)
 * since it would overlap or appear detached from GB in the main UK Albers projection.
 *
 * The inset is positioned in projection coordinate space so it zooms and pans
 * together with the GB landmass.
 */

import * as d3 from 'd3';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { BoundaryProperties } from '@/utils/constituencyMatching';

type ConstituencyFeature = Feature<Polygon | MultiPolygon, BoundaryProperties>;

/** Check whether a boundary feature is a Northern Ireland constituency. */
export function isNIFeature(feature: ConstituencyFeature): boolean {
  return feature.properties?.nation === 'northern_ireland';
}

/** Split features into GB and NI groups. */
export function splitGBAndNI(features: ConstituencyFeature[]): {
  gbFeatures: ConstituencyFeature[];
  niFeatures: ConstituencyFeature[];
} {
  const gbFeatures: ConstituencyFeature[] = [];
  const niFeatures: ConstituencyFeature[] = [];
  for (const f of features) {
    if (isNIFeature(f)) {
      niFeatures.push(f);
    } else {
      gbFeatures.push(f);
    }
  }
  return { gbFeatures, niFeatures };
}

export interface NIInsetConfig {
  /** Inset box x (in projection coordinate space). */
  x: number;
  /** Inset box y (in projection coordinate space). */
  y: number;
  /** Inset box width (in projection coordinate space). */
  width: number;
  /** Inset box height (in projection coordinate space). */
  height: number;
}

/**
 * Compute the NI inset bounds in projection coordinate space, positioned
 * relative to the GB landmass bounding box. This ensures the inset pans
 * and zooms with the rest of the map.
 *
 * Placed south-east of the Scottish border, tucked into the concavity
 * on the west side of GB to minimize overall map footprint.
 */
export function getNIInsetBounds(
  gbCollection: FeatureCollection<Polygon | MultiPolygon, BoundaryProperties>,
  pathGenerator: d3.GeoPath
): NIInsetConfig {
  const [[minX, minY], [maxX, maxY]] = pathGenerator.bounds(gbCollection);
  const gbWidth = maxX - minX;
  const gbHeight = maxY - minY;

  const insetWidth = gbWidth * 0.16;
  const insetHeight = insetWidth * 0.9;

  return {
    x: minX + insetWidth * 1.0,
    y: minY + gbHeight * 0.5,
    width: insetWidth,
    height: insetHeight,
  };
}

/**
 * Create an Albers projection that fits NI features into the inset rectangle.
 * The inset coords should be in projection coordinate space.
 * Returns null if there are no NI features.
 */
export function createNIProjection(
  niFeatures: ConstituencyFeature[],
  inset: NIInsetConfig
): d3.GeoProjection | null {
  if (niFeatures.length === 0) return null;

  const featureCollection = {
    type: 'FeatureCollection' as const,
    features: niFeatures,
  };

  const padding = 4;
  const projection = d3.geoAlbers()
    .center([0, 54.6])
    .rotate([7.0, 0])
    .parallels([54, 55.5]);

  projection.fitExtent(
    [
      [inset.x + padding, inset.y + padding],
      [inset.x + inset.width - padding, inset.y + inset.height - padding],
    ],
    featureCollection
  );

  return projection;
}
