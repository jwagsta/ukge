import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

export interface ConstituencyProperties {
  PCON24CD?: string;
  PCON24NM?: string;
  id?: string;
  name?: string;
  region?: string;
  country?: string;
}

export type ConstituencyFeature = Feature<Polygon | MultiPolygon, ConstituencyProperties>;
export type ConstituencyCollection = FeatureCollection<Polygon | MultiPolygon, ConstituencyProperties>;

export interface TopoJSONObjects {
  constituencies: {
    type: 'GeometryCollection';
    geometries: Array<{
      type: string;
      arcs: number[][];
      properties: ConstituencyProperties;
    }>;
  };
}

export interface TopoJSONTopology {
  type: 'Topology';
  arcs: number[][][];
  objects: TopoJSONObjects;
}
