export interface YearSeats {
  year: number;
  con: number;
  lab: number;
  ld: number;
  other: number;
  total: number;
}

// Pre-computed national seat totals (from Electoral Calculus data)
export const NATIONAL_SEATS: YearSeats[] = [
  { year: 1955, con: 344, lab: 277, ld: 6, other: 3, total: 630 },
  { year: 1959, con: 365, lab: 258, ld: 6, other: 1, total: 630 },
  { year: 1964, con: 304, lab: 317, ld: 9, other: 0, total: 630 },
  { year: 1966, con: 253, lab: 363, ld: 12, other: 2, total: 630 },
  { year: 1970, con: 330, lab: 287, ld: 6, other: 7, total: 630 },
  { year: 197402, con: 297, lab: 301, ld: 14, other: 11, total: 623 },
  { year: 197410, con: 277, lab: 319, ld: 13, other: 14, total: 623 },
  { year: 1979, con: 339, lab: 269, ld: 11, other: 16, total: 635 },
  { year: 1983, con: 397, lab: 209, ld: 23, other: 21, total: 650 },
  { year: 1987, con: 376, lab: 229, ld: 22, other: 23, total: 650 },
  { year: 1992, con: 336, lab: 271, ld: 20, other: 24, total: 651 },
  { year: 1997, con: 165, lab: 418, ld: 46, other: 30, total: 659 },
  { year: 2001, con: 166, lab: 412, ld: 52, other: 29, total: 659 },
  { year: 2005, con: 198, lab: 355, ld: 62, other: 35, total: 650 },
  { year: 2010, con: 306, lab: 258, ld: 57, other: 29, total: 650 },
  { year: 2015, con: 330, lab: 232, ld: 8, other: 80, total: 650 },
  { year: 2017, con: 317, lab: 262, ld: 12, other: 59, total: 650 },
  { year: 2019, con: 365, lab: 202, ld: 11, other: 72, total: 650 },
  { year: 2024, con: 121, lab: 412, ld: 72, other: 45, total: 650 },
];

export interface YearVotes {
  year: number;
  con: number;
  lab: number;
  ld: number;
  other: number;
  total: number;
}

// Pre-computed national vote totals (from Electoral Calculus data)
export const NATIONAL_VOTES: YearVotes[] = [
  { year: 1955, con: 12869291, lab: 12369432, ld: 726859, other: 152822, total: 26118404 },
  { year: 1959, con: 13305952, lab: 12171796, ld: 1637508, other: 171369, total: 27286625 },
  { year: 1964, con: 11596958, lab: 12104853, ld: 3077532, other: 239256, total: 27018599 },
  { year: 1966, con: 11040440, lab: 13022884, ld: 2298154, other: 305786, total: 26667264 },
  { year: 1970, con: 12723480, lab: 12110394, ld: 2105833, other: 626999, total: 27566706 },
  { year: 197402, con: 11872798, lab: 11641143, ld: 6059550, other: 1044561, total: 30618052 },
  { year: 197410, con: 10464671, lab: 11456597, ld: 5346817, other: 1218440, total: 28486525 },
  { year: 1979, con: 13698543, lab: 11533840, ld: 4310996, other: 988593, total: 30531972 },
  { year: 1983, con: 13012602, lab: 8457124, ld: 4203003, other: 4233245, total: 29905974 },
  { year: 1987, con: 13763087, lab: 10033633, ld: 4194218, other: 3813485, total: 31804423 },
  { year: 1992, con: 14058368, lab: 11557133, ld: 5989585, other: 1220198, total: 32825284 },
  { year: 1997, con: 9591082, lab: 13541380, ld: 5243440, other: 2120873, total: 30496775 },
  { year: 2001, con: 8353928, lab: 10741617, ld: 4813342, other: 1639678, total: 25548565 },
  { year: 2005, con: 8782197, lab: 9567589, ld: 5985424, other: 2095668, total: 26430878 },
  { year: 2010, con: 10726604, lab: 8606517, ld: 6836248, other: 2844497, total: 29013866 },
  { year: 2015, con: 11325531, lab: 9347304, ld: 2415862, other: 3028279, total: 26116976 },
  { year: 2017, con: 13666006, lab: 12877819, ld: 2371900, other: 1880895, total: 30796620 },
  { year: 2019, con: 13961021, lab: 10295882, ld: 3696419, other: 2617496, total: 30570818 },
  { year: 2024, con: 6828372, lab: 9734054, ld: 3519953, other: 7947865, total: 28030244 },
];
