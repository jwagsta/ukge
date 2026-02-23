export interface YearSeats {
  year: number;
  con: number;
  lab: number;
  ld: number;
  snp: number;
  other: number;
  total: number;
}

// Pre-computed national seat totals (from Electoral Calculus data)
export const NATIONAL_SEATS: YearSeats[] = [
  { year: 1955, con: 344, lab: 277, ld: 6, snp: 0, other: 3, total: 630 },
  { year: 1959, con: 365, lab: 258, ld: 6, snp: 0, other: 1, total: 630 },
  { year: 1964, con: 304, lab: 317, ld: 9, snp: 0, other: 0, total: 630 },
  { year: 1966, con: 253, lab: 363, ld: 12, snp: 0, other: 2, total: 630 },
  { year: 1970, con: 330, lab: 287, ld: 6, snp: 1, other: 6, total: 630 },
  { year: 197402, con: 297, lab: 301, ld: 14, snp: 7, other: 4, total: 623 },
  { year: 197410, con: 277, lab: 319, ld: 13, snp: 11, other: 3, total: 623 },
  { year: 1979, con: 339, lab: 269, ld: 11, snp: 2, other: 14, total: 635 },
  { year: 1983, con: 397, lab: 209, ld: 23, snp: 2, other: 19, total: 650 },
  { year: 1987, con: 376, lab: 229, ld: 22, snp: 3, other: 20, total: 650 },
  { year: 1992, con: 336, lab: 271, ld: 20, snp: 3, other: 21, total: 651 },
  { year: 1997, con: 165, lab: 418, ld: 46, snp: 6, other: 24, total: 659 },
  { year: 2001, con: 166, lab: 412, ld: 52, snp: 5, other: 24, total: 659 },
  { year: 2005, con: 198, lab: 355, ld: 62, snp: 6, other: 29, total: 650 },
  { year: 2010, con: 306, lab: 258, ld: 57, snp: 6, other: 23, total: 650 },
  { year: 2015, con: 330, lab: 232, ld: 8, snp: 56, other: 24, total: 650 },
  { year: 2017, con: 317, lab: 262, ld: 12, snp: 35, other: 24, total: 650 },
  { year: 2019, con: 365, lab: 202, ld: 11, snp: 48, other: 24, total: 650 },
  { year: 2024, con: 121, lab: 412, ld: 72, snp: 9, other: 36, total: 650 },
];

export interface YearVotes {
  year: number;
  con: number;
  lab: number;
  ld: number;
  snp: number;
  other: number;
  total: number;
}

// Pre-computed national vote totals (from Electoral Calculus data)
export const NATIONAL_VOTES: YearVotes[] = [
  { year: 1955, con: 12869291, lab: 12369432, ld: 726859, snp: 12112, other: 140710, total: 26118404 },
  { year: 1959, con: 13305952, lab: 12171796, ld: 1637508, snp: 21738, other: 149631, total: 27286625 },
  { year: 1964, con: 11596958, lab: 12104853, ld: 3077532, snp: 65754, other: 173502, total: 27018599 },
  { year: 1966, con: 11040440, lab: 13022884, ld: 2298154, snp: 128474, other: 177312, total: 26667264 },
  { year: 1970, con: 12723480, lab: 12110394, ld: 2105833, snp: 306798, other: 320201, total: 27566706 },
  { year: 197402, con: 11872798, lab: 11641143, ld: 6059550, snp: 632572, other: 411989, total: 30618052 },
  { year: 197410, con: 10464671, lab: 11456597, ld: 5346817, snp: 839628, other: 378812, total: 28486525 },
  { year: 1979, con: 13698543, lab: 11533840, ld: 4310996, snp: 504259, other: 484334, total: 30531972 },
  { year: 1983, con: 13012602, lab: 8457124, ld: 4203003, snp: 331975, other: 3901270, total: 29905974 },
  { year: 1987, con: 13763087, lab: 10033633, ld: 4194218, snp: 419968, other: 3393517, total: 31804423 },
  { year: 1992, con: 14058368, lab: 11557133, ld: 5989585, snp: 629552, other: 590646, total: 32825284 },
  { year: 1997, con: 9591082, lab: 13541380, ld: 5243440, snp: 622260, other: 1498613, total: 30496775 },
  { year: 2001, con: 8353928, lab: 10741617, ld: 4813342, snp: 464305, other: 1175373, total: 25548565 },
  { year: 2005, con: 8782197, lab: 9567589, ld: 5985424, snp: 412267, other: 1683401, total: 26430878 },
  { year: 2010, con: 10726604, lab: 8606517, ld: 6836248, snp: 491386, other: 2353111, total: 29013866 },
  { year: 2015, con: 11325531, lab: 9347304, ld: 2415862, snp: 1454436, other: 1573843, total: 26116976 },
  { year: 2017, con: 13666006, lab: 12877819, ld: 2371900, snp: 977568, other: 903327, total: 30796620 },
  { year: 2019, con: 13961021, lab: 10295882, ld: 3696419, snp: 1242380, other: 1375116, total: 30570818 },
  { year: 2024, con: 6828372, lab: 9734054, ld: 3519953, snp: 724758, other: 7223107, total: 28030244 },
];
