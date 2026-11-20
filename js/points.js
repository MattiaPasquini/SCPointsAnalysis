"use strict";

// Points systems shared by the standings page and the curve explainer.
// r = place (1 = best), n = number of ranked competitors (n >= 2).

// Curves that scale with the number of ranked competitors.
const FORMULAS = {
  steep: (r, n) => 100 * (1 - Math.log(r) / Math.log(n)),
  gentle: (r, n) => (100 * Math.log(n + 1 - r)) / Math.log(n),
  linearPodium: (r, n) => (100 * (n - r)) / (n - 1),
};

// Extra points added on top of a curve, by place.
const PODIUM_BONUS = { 1: 20, 2: 10, 3: 5 };
const FORMULAS_WITH_BONUS = new Set(["linearPodium"]);

// Fixed tables: points by place, whatever the number of competitors.
// Entry i is the points for place i + 1; places past the end of a table get 0.
const FIXED_TABLES = {
  thomas1: [
    250, 220, 200, 180, 175, 170, 165, 160, 155, 150,
    130, 126, 122, 118, 114, 110, 106, 102, 98, 94,
    74, 71, 68, 65, 62, 59, 56, 53, 50, 47,
    37, 35, 33, 31, 29, 27, 25, 23, 21, 19,
    10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
  ],
  thomas2: [
    250, 220, 200, 180, 175, 170, 165, 160, 155, 150,
    144, 138, 132, 126, 120, 114, 108, 102, 96, 90,
    85, 80, 75, 70, 65, 60, 55, 50, 45, 40,
    38, 36, 34, 32, 30, 28, 26, 24, 22, 20,
    18, 9, 8, 7, 6, 5, 4, 3, 2, 1,
  ],
  daniel: [
    200, 170, 150, 135, 129, 123, 117, 111, 105, 99,
    93, 87, 83, 79, 75, 71, 67, 63, 59, 54,
    51, 48, 45, 42, 39, 37, 35, 33, 31, 29,
    27, 25, 23, 21, 19, 17, 15, 13, 12, 11,
    10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
  ],
};

// Every points system, in display order. `short` is used in table headers and tooltips.
const CURVES = [
  { key: "steep", label: "Steep at the top", short: "Steep" },
  { key: "gentle", label: "Gentle at the top", short: "Gentle" },
  { key: "linearPodium", label: "Linear + podium bonus", short: "Linear + podium" },
  { key: "thomas1", label: "Thomas option 1 (gaps every 10 places)", short: "Thomas 1" },
  { key: "thomas2", label: "Thomas option 2 (no gaps)", short: "Thomas 2" },
  { key: "daniel", label: "Daniel", short: "Daniel" },
];

function pointsFor(place, n, formula) {
  const table = FIXED_TABLES[formula];
  if (table) return table[place - 1] ?? 0;
  const base = n <= 1 ? 100 : FORMULAS[formula](place, n);
  const bonus = FORMULAS_WITH_BONUS.has(formula) ? PODIUM_BONUS[place] || 0 : 0;
  return base + bonus;
}
