"use strict";

// Points curves shared by the standings page and the curve explainer.
// r = place (1 = best), n = number of ranked competitors.
const FORMULAS = {
  steep: (r, n) => 100 * (1 - Math.log(r) / Math.log(n)),
  gentle: (r, n) => (100 * Math.log(n + 1 - r)) / Math.log(n),
};

const FORMULA_LABELS = {
  steep: "Steep at the top",
  gentle: "Gentle at the top",
};

function pointsFor(place, n, formula) {
  if (n <= 1) return 100;
  return FORMULAS[formula](place, n);
}
