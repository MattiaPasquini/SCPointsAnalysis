"use strict";

// Points curves shared by the standings page and the curve explainer.
// r = place (1 = best), n = number of ranked competitors (n >= 2).
const FORMULAS = {
  steep: (r, n) => 100 * (1 - Math.log(r) / Math.log(n)),
  gentle: (r, n) => (100 * Math.log(n + 1 - r)) / Math.log(n),
  linearPodium: (r, n) => (100 * (n - r)) / (n - 1),
};

const FORMULA_LABELS = {
  steep: "Steep at the top",
  gentle: "Gentle at the top",
  linearPodium: "Linear + podium bonus",
};

// Extra points added on top of the curve, by place.
const PODIUM_BONUS = { 1: 20, 2: 10, 3: 5 };
const FORMULAS_WITH_BONUS = new Set(["linearPodium"]);

function pointsFor(place, n, formula) {
  const base = n <= 1 ? 100 : FORMULAS[formula](place, n);
  const bonus = FORMULAS_WITH_BONUS.has(formula) ? PODIUM_BONUS[place] || 0 : 0;
  return base + bonus;
}
