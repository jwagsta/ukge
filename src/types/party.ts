export interface Party {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  color: string;
  altNames: string[];
}

export const PARTIES: Record<string, Party> = {
  lab: {
    id: 'lab',
    name: 'Labour Party',
    shortName: 'Labour',
    abbreviation: 'Lab',
    color: '#DC241f',
    altNames: ['labour', 'lab', 'labor'],
  },
  con: {
    id: 'con',
    name: 'Conservative Party',
    shortName: 'Conservative',
    abbreviation: 'Con',
    color: '#0087DC',
    altNames: ['conservative', 'con', 'tory', 'tories'],
  },
  ld: {
    id: 'ld',
    name: 'Liberal Democrats',
    shortName: 'Lib Dem',
    abbreviation: 'LD',
    color: '#FDBB30',
    altNames: ['liberal democrat', 'libdem', 'lib dem', 'liberal', 'lib'],
  },
  snp: {
    id: 'snp',
    name: 'Scottish National Party',
    shortName: 'SNP',
    abbreviation: 'SNP',
    color: '#FFF95D',
    altNames: ['snp', 'scottish national'],
  },
  pc: {
    id: 'pc',
    name: 'Plaid Cymru',
    shortName: 'Plaid',
    abbreviation: 'PC',
    color: '#005B54',
    altNames: ['plaid cymru', 'plaid', 'pc'],
  },
  grn: {
    id: 'grn',
    name: 'Green Party',
    shortName: 'Green',
    abbreviation: 'Grn',
    color: '#6AB023',
    altNames: ['green', 'greens', 'green party'],
  },
  reform: {
    id: 'reform',
    name: 'Reform UK',
    shortName: 'Reform',
    abbreviation: 'Ref',
    color: '#12B6CF',
    altNames: ['reform', 'reform uk', 'brexit', 'ukip'],
  },
  dup: {
    id: 'dup',
    name: 'Democratic Unionist Party',
    shortName: 'DUP',
    abbreviation: 'DUP',
    color: '#D46A4C',
    altNames: ['dup', 'democratic unionist'],
  },
  sf: {
    id: 'sf',
    name: 'Sinn Féin',
    shortName: 'Sinn Féin',
    abbreviation: 'SF',
    color: '#326760',
    altNames: ['sinn fein', 'sf', 'sinn féin'],
  },
  // Additional Northern Ireland parties
  sdlp: {
    id: 'sdlp',
    name: 'Social Democratic and Labour Party',
    shortName: 'SDLP',
    abbreviation: 'SDLP',
    color: '#2AA82C',
    altNames: ['sdlp', 'social democratic and labour'],
  },
  uup: {
    id: 'uup',
    name: 'Ulster Unionist Party',
    shortName: 'UUP',
    abbreviation: 'UUP',
    color: '#48A5EE',
    altNames: ['uup', 'ulster unionist', 'uu'],
  },
  alliance: {
    id: 'alliance',
    name: 'Alliance Party of Northern Ireland',
    shortName: 'Alliance',
    abbreviation: 'APNI',
    color: '#F6CB2F',
    altNames: ['alliance', 'apni', 'alliance party'],
  },
  tuv: {
    id: 'tuv',
    name: 'Traditional Unionist Voice',
    shortName: 'TUV',
    abbreviation: 'TUV',
    color: '#0C3A6A',
    altNames: ['tuv', 'traditional unionist'],
  },
  pup: {
    id: 'pup',
    name: 'Progressive Unionist Party',
    shortName: 'PUP',
    abbreviation: 'PUP',
    color: '#5B92CF',
    altNames: ['pup', 'progressive unionist'],
  },
  // Historical parties
  liberal: {
    id: 'liberal',
    name: 'Liberal Party',
    shortName: 'Liberal',
    abbreviation: 'Lib',
    color: '#FAA61A',
    altNames: ['liberal party', 'liberals'],
  },
  sdp: {
    id: 'sdp',
    name: 'Social Democratic Party',
    shortName: 'SDP',
    abbreviation: 'SDP',
    color: '#704D9E',
    altNames: ['sdp', 'social democratic party'],
  },
  sdplib: {
    id: 'sdplib',
    name: 'SDP-Liberal Alliance',
    shortName: 'Alliance',
    abbreviation: 'All',
    color: '#FEBD50',
    altNames: ['sdp-liberal alliance', 'alliance', 'sdp/liberal', 'liberal/sdp'],
  },
  natlib: {
    id: 'natlib',
    name: 'National Liberal',
    shortName: 'Nat Lib',
    abbreviation: 'NL',
    color: '#FFCC66',
    altNames: ['national liberal', 'nat lib', 'national liberals'],
  },
  // Historical Ulster Unionist variants
  ulu: {
    id: 'ulu',
    name: 'Ulster Unionist',
    shortName: 'UU',
    abbreviation: 'UU',
    color: '#9999FF',
    altNames: ['ulster unionist', 'uu', 'unionist'],
  },
  // Irish parties (pre-partition and historical)
  ipnat: {
    id: 'ipnat',
    name: 'Irish Parliamentary Party',
    shortName: 'IPP',
    abbreviation: 'IPP',
    color: '#009A49',
    altNames: ['irish parliamentary party', 'ipp', 'nationalist', 'irish nationalist'],
  },
  // Communist Party
  comm: {
    id: 'comm',
    name: 'Communist Party',
    shortName: 'Communist',
    abbreviation: 'Com',
    color: '#DD0000',
    altNames: ['communist', 'cpgb', 'communist party'],
  },
  // Co-operative Party (often runs with Labour)
  coop: {
    id: 'coop',
    name: 'Co-operative Party',
    shortName: 'Co-op',
    abbreviation: 'Co-op',
    color: '#8B0000',
    altNames: ['co-operative', 'coop', 'labour co-operative', 'lab/co-op'],
  },
  // Independent Labour
  indlab: {
    id: 'indlab',
    name: 'Independent Labour',
    shortName: 'Ind Lab',
    abbreviation: 'ILP',
    color: '#E75454',
    altNames: ['independent labour', 'ilp', 'ind lab'],
  },
  // National parties (1930s)
  national: {
    id: 'national',
    name: 'National',
    shortName: 'National',
    abbreviation: 'Nat',
    color: '#005B96',
    altNames: ['national', 'national government', 'national labour'],
  },
  // Speaker
  speaker: {
    id: 'speaker',
    name: 'Speaker',
    shortName: 'Speaker',
    abbreviation: 'Spk',
    color: '#CCCCCC',
    altNames: ['speaker', 'spk'],
  },
  // Independent
  ind: {
    id: 'ind',
    name: 'Independent',
    shortName: 'Independent',
    abbreviation: 'Ind',
    color: '#888888',
    altNames: ['independent', 'ind'],
  },
  other: {
    id: 'other',
    name: 'Other',
    shortName: 'Other',
    abbreviation: 'Oth',
    color: '#808080',
    altNames: ['other'],
  },
};

export function getPartyColor(partyId: string): string {
  const normalizedId = partyId.toLowerCase();
  for (const party of Object.values(PARTIES)) {
    if (party.id === normalizedId || party.altNames.includes(normalizedId)) {
      return party.color;
    }
  }
  return PARTIES.other.color;
}

export function getPartyById(partyId: string): Party {
  const normalizedId = partyId.toLowerCase();
  for (const party of Object.values(PARTIES)) {
    if (party.id === normalizedId || party.altNames.includes(normalizedId)) {
      return party;
    }
  }
  return PARTIES.other;
}
