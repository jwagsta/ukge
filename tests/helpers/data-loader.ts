/**
 * Cached data loading for test files.
 * Reads JSON files from public/data/ and caches them for reuse across tests.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

// ── Election data interfaces ──

export interface PartyResult {
  partyId: string;
  partyName: string;
  candidate: string;
  votes: number;
  voteShare: number;
}

export interface Constituency {
  constituencyId: string;
  constituencyName: string;
  region: string;
  country: string;
  year: number;
  electorate: number;
  turnout: number;
  validVotes: number;
  winner: string;
  majority: number;
  results: PartyResult[];
}

export interface ElectionFile {
  year: number;
  date: string;
  totalSeats: number;
  boundaryVersion: string;
  constituencies: Constituency[];
}

// ── Boundary data interfaces ──

export interface BoundaryProperties {
  id: string;
  Name: string;
  normalizedName: string;
  nation: string;
  [key: string]: unknown;
}

export type BoundaryFeature = Feature<Geometry, BoundaryProperties>;
export type BoundaryCollection = FeatureCollection<Geometry, BoundaryProperties>;

// ── Caches ──

const electionCache = new Map<number, ElectionFile>();
const boundaryCache = new Map<string, BoundaryCollection>();

const DATA_DIR = resolve(__dirname, '../../public/data');

// ── Loaders ──

export function loadElection(year: number): ElectionFile {
  if (electionCache.has(year)) return electionCache.get(year)!;
  const filePath = resolve(DATA_DIR, `elections/${year}.json`);
  const raw = readFileSync(filePath, 'utf-8');
  const data: ElectionFile = JSON.parse(raw);
  electionCache.set(year, data);
  return data;
}

export function loadBoundary(version: string): BoundaryCollection {
  if (boundaryCache.has(version)) return boundaryCache.get(version)!;
  const filePath = resolve(DATA_DIR, `boundaries/${version}.json`);
  const raw = readFileSync(filePath, 'utf-8');
  const data: BoundaryCollection = JSON.parse(raw);
  boundaryCache.set(version, data);
  return data;
}
