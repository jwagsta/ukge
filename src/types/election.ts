export type Country = 'england' | 'scotland' | 'wales' | 'northern_ireland';

export type Region =
  | 'north_east'
  | 'north_west'
  | 'yorkshire'
  | 'east_midlands'
  | 'west_midlands'
  | 'east'
  | 'london'
  | 'south_east'
  | 'south_west'
  | 'scotland'
  | 'wales'
  | 'northern_ireland';

export interface Constituency {
  id: string;
  name: string;
  region: Region;
  country: Country;
}

export interface PartyResult {
  partyId: string;
  partyName: string;
  candidate: string;
  votes: number;
  voteShare: number;
}

export interface ElectionResult {
  constituencyId: string;
  constituencyName: string;
  region: Region;
  country: Country;
  year: number;
  results: PartyResult[];
  electorate: number;
  turnout: number;
  validVotes: number;
  winner: string;
  majority: number;
}

export interface TernaryDataPoint {
  constituencyId: string;
  constituencyName: string;
  labour: number;
  conservative: number;
  other: number;
  winner: string;
  year: number;
  region: Region;
}

export interface DotDensityPoint {
  x: number;
  y: number;
  partyId: string;
  constituencyId: string;
}

export interface ElectionYear {
  year: number;
  date: string;
  totalSeats: number;
  boundaryVersion: string;
}
