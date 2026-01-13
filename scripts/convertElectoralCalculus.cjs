const fs = require('fs');
const path = require('path');

// Load boundary data to get ID mappings
const boundaryPath = path.join(__dirname, '..', 'public', 'data', 'boundaries', 'constituencies.json');
const boundaries = JSON.parse(fs.readFileSync(boundaryPath, 'utf-8'));

// Explicit name mappings for different naming conventions
const explicitMappings = {
  'basildon south and east thurrock': 'south basildon and east thurrock',
  'bedfordshire mid': 'mid bedfordshire',
  'bedfordshire north east': 'north east bedfordshire',
  'bedfordshire south west': 'south west bedfordshire',
  'cambridgeshire north east': 'north east cambridgeshire',
  'cambridgeshire north west': 'north west cambridgeshire',
  'cambridgeshire south': 'south cambridgeshire',
  'cambridgeshire south east': 'south east cambridgeshire',
  'chester, city of': 'city of chester',
  'chester city of': 'city of chester',
  'cornwall north': 'north cornwall',
  'cornwall south east': 'south east cornwall',
  'cotswolds, the': 'the cotswolds',
  'cotswolds the': 'the cotswolds',
  'derbyshire mid': 'mid derbyshire',
  'derbyshire north east': 'north east derbyshire',
  'derbyshire south': 'south derbyshire',
  'devon central': 'central devon',
  'devon east': 'east devon',
  'devon north': 'north devon',
  'devon south west': 'south west devon',
  'devon west and torridge': 'torridge and west devon',
  'dorset mid and poole north': 'mid dorset and north poole',
  'dorset north': 'north dorset',
  'dorset south': 'south dorset',
  'dorset west': 'west dorset',
  'durham north': 'north durham',
  'durham north west': 'north west durham',
  'durham, city of': 'city of durham',
  'durham city of': 'city of durham',
  'faversham and kent mid': 'faversham and mid kent',
  'hampshire east': 'east hampshire',
  'hampshire north east': 'north east hampshire',
  'hampshire north west': 'north west hampshire',
  'herefordshire north': 'north herefordshire',
  'hertfordshire north east': 'north east hertfordshire',
  'hertfordshire south west': 'south west hertfordshire',
  'hull east': 'kingston upon hull east',
  'hull north': 'kingston upon hull north',
  'hull west and hessle': 'kingston upon hull west and hessle',
  'lancashire west': 'west lancashire',
  'leicestershire north west': 'north west leicestershire',
  'leicestershire south': 'south leicestershire',
  'middlesbrough south and cleveland east': 'middlesbrough south and east cleveland',
  'norfolk mid': 'mid norfolk',
  'norfolk north': 'north norfolk',
  'norfolk north west': 'north west norfolk',
  'norfolk south': 'south norfolk',
  'norfolk south west': 'south west norfolk',
  'northamptonshire south': 'south northamptonshire',
  'ribble south': 'south ribble',
  'richmond': 'richmond (yorks)',
  'shropshire north': 'north shropshire',
  'somerset north': 'north somerset',
  'somerset north east': 'north east somerset',
  'staffordshire south': 'south staffordshire',
  'suffolk central and ipswich north': 'central suffolk and north ipswich',
  'suffolk south': 'south suffolk',
  'suffolk west': 'west suffolk',
  'surrey east': 'east surrey',
  'surrey south west': 'south west surrey',
  'sussex mid': 'mid sussex',
  'swindon north': 'north swindon',
  'swindon south': 'south swindon',
  'thanet north': 'north thanet',
  'thanet south': 'south thanet',
  'tyneside north': 'north tyneside',
  'warwickshire north': 'north warwickshire',
  'wiltshire north': 'north wiltshire',
  'wiltshire south west': 'south west wiltshire',
  'worcestershire mid': 'mid worcestershire',
  'worcestershire west': 'west worcestershire',
  'worthing east and shoreham': 'east worthing and shoreham',
  'wrekin, the': 'the wrekin',
  'wrekin the': 'the wrekin',
  'yorkshire east': 'east yorkshire',
  'carmarthen west and pembrokeshire south': 'carmarthen west and south pembrokeshire',
  'aberdeenshire west and kincardine': 'west aberdeenshire and kincardine',
  'ayr carrick and cumnock': 'ayr, carrick and cumnock',
  'ayrshire central': 'central ayrshire',
  'ayrshire north and arran': 'north ayrshire and arran',
  'caithness sutherland and easter ross': 'caithness, sutherland and easter ross',
  'dunbartonshire east': 'east dunbartonshire',
  'dunbartonshire west': 'west dunbartonshire',
  'fife north east': 'north east fife',
  'inverness nairn badenoch and strathspey': 'inverness, nairn, badenoch and strathspey',
  'na h-eileanan an iar (western isles)': 'na h eileanan an iar',
  'renfrewshire east': 'east renfrewshire',
  'ross skye and lochaber': 'ross, skye and lochaber',
};

// Normalize name for matching
function normalizeName(name) {
  // First check explicit mappings with original (lowercased) name
  const lowered = name.toLowerCase().trim();
  if (explicitMappings[lowered]) {
    return explicitMappings[lowered];
  }

  let normalized = name
    .toLowerCase()
    .replace(/-/g, ' ')          // Replace hyphens with spaces
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .replace(/, the$/i, '')      // Remove ", The" suffix
    .replace(/^the /i, '')       // Remove "The " prefix
    .replace(/, city of$/i, '')  // Remove ", City of" suffix
    .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical content
    .replace(/,/g, '')           // Remove remaining commas
    .trim();

  // Check explicit mappings after normalization
  if (explicitMappings[normalized]) {
    normalized = explicitMappings[normalized];
  }

  return normalized;
}

// Create name -> ID mapping with multiple normalized forms
const nameToId = {};
const nameToRegion = {};
const originalNames = {};

for (const feature of boundaries.features) {
  const name = feature.properties.PCON13NM;
  const id = feature.properties.PCON13CD;
  if (name && id) {
    const normalized = normalizeName(name);
    nameToId[normalized] = id;
    originalNames[normalized] = name;

    // Also store with original lowercase
    nameToId[name.toLowerCase()] = id;
    originalNames[name.toLowerCase()] = name;

    // Determine country from ID prefix
    let country = 'england';
    if (id.startsWith('S')) country = 'scotland';
    else if (id.startsWith('W')) country = 'wales';
    else if (id.startsWith('N')) country = 'northern_ireland';
    nameToRegion[normalized] = country;
    nameToRegion[name.toLowerCase()] = country;
  }
}

// Area codes to region mapping (from Electoral Calculus)
const areaToRegion = {
  1: 'scotland',
  2: 'wales',
  3: 'london',
  4: 'north_west',
  5: 'north_west',
  6: 'west_midlands',
  7: 'west_midlands',
  8: 'east_midlands',
  9: 'yorkshire',
  10: 'yorkshire',
  11: 'east',
  12: 'south_east',
  13: 'south_east',
  14: 'south_west',
  15: 'south_west',
  16: 'north_east',
  17: 'northern_ireland',
};

function convertFile(inputPath, year) {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(';').map(h => h.toLowerCase().trim());

  // Create column index map
  const colIndex = {};
  header.forEach((col, i) => {
    colIndex[col] = i;
  });

  const constituencies = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';');
    if (values.length < header.length) continue;

    const getVal = (col) => parseInt(values[colIndex[col]]) || 0;
    const getStr = (col) => values[colIndex[col]] || '';

    const name = getStr('name');
    const mp = getStr('mp');
    const area = getVal('area');
    const electorate = getVal('electorate');
    const con = getVal('con');
    const lab = getVal('lab');
    const lib = getVal('lib');
    // Handle different names for Brexit/Reform/UKIP column
    const brexit = getVal('reform') || getVal('brexit') || getVal('ukip') || 0;
    const green = getVal('green') || 0;
    const nat = getVal('nat');
    const min = getVal('min');
    const oth = getVal('oth');

    // Try multiple name formats
    const normalizedInput = normalizeName(name);
    let id = nameToId[name.toLowerCase()] || nameToId[normalizedInput];
    let lookupKey = nameToId[name.toLowerCase()] ? name.toLowerCase() : normalizedInput;

    // If no match, generate synthetic ID for ternary plot (won't show on map)
    if (!id) {
      id = 'UNMAPPED_' + name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      lookupKey = normalizedInput;
    }

    const validVotes = con + lab + lib + brexit + green + nat + min + oth;
    const turnout = electorate > 0 ? (validVotes / electorate) * 100 : 0;

    // Build results array
    const results = [];
    if (con > 0) results.push({ partyId: 'con', partyName: 'Conservative', candidate: '', votes: con, voteShare: (con/validVotes)*100 });
    if (lab > 0) results.push({ partyId: 'lab', partyName: 'Labour', candidate: '', votes: lab, voteShare: (lab/validVotes)*100 });
    if (lib > 0) results.push({ partyId: 'ld', partyName: 'Liberal Democrat', candidate: '', votes: lib, voteShare: (lib/validVotes)*100 });
    if (brexit > 0) results.push({ partyId: 'reform', partyName: 'Brexit Party', candidate: '', votes: brexit, voteShare: (brexit/validVotes)*100 });
    if (green > 0) results.push({ partyId: 'grn', partyName: 'Green', candidate: '', votes: green, voteShare: (green/validVotes)*100 });
    if (nat > 0) {
      // Determine if SNP or Plaid based on country
      const country = nameToRegion[lookupKey];
      if (country === 'scotland') {
        results.push({ partyId: 'snp', partyName: 'SNP', candidate: '', votes: nat, voteShare: (nat/validVotes)*100 });
      } else if (country === 'wales') {
        results.push({ partyId: 'pc', partyName: 'Plaid Cymru', candidate: '', votes: nat, voteShare: (nat/validVotes)*100 });
      }
    }
    if (min > 0) results.push({ partyId: 'other', partyName: 'Minor Party', candidate: '', votes: min, voteShare: (min/validVotes)*100 });
    if (oth > 0) results.push({ partyId: 'other', partyName: 'Other', candidate: '', votes: oth, voteShare: (oth/validVotes)*100 });

    // Sort by votes
    results.sort((a, b) => b.votes - a.votes);

    const winner = results[0]?.partyId || 'other';
    const majority = results.length >= 2 ? results[0].votes - results[1].votes : results[0]?.votes || 0;

    const region = areaToRegion[area] || 'england';
    const country = nameToRegion[lookupKey] || 'england';

    constituencies.push({
      constituencyId: id,
      constituencyName: name,
      region: region,
      country: country,
      year: year,
      electorate: electorate,
      turnout: Math.round(turnout * 10) / 10,
      validVotes: validVotes,
      winner: winner,
      majority: majority,
      results: results,
    });
  }

  return {
    year: year,
    date: `${year}-12-12`,
    totalSeats: constituencies.length,
    boundaryVersion: '2010',
    constituencies: constituencies,
  };
}

// Process the file
const inputFile = process.argv[2] || '/tmp/electdata_2019.txt';
const year = parseInt(process.argv[3]) || 2019;

console.log(`Converting ${inputFile} for year ${year}...`);
const data = convertFile(inputFile, year);

const outputPath = path.join(__dirname, '..', 'public', 'data', 'elections', `${year}.json`);
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
console.log(`Created ${outputPath} with ${data.constituencies.length} constituencies`);
