"use strict";

const WCA = "https://www.worldcubeassociation.org";

const COMPETITIONS = [
  { id: "SwisscubingCupI2026", tab: "SCI", name: "Swisscubing Cup I 2026" },
  { id: "SwisscubingCupII2026", tab: "SCII", name: "Swisscubing Cup II 2026" },
  { id: "SwisscubingCupIII2026", tab: "SCIII", name: "Swisscubing Cup III 2026" },
  { id: "SwisscubingCupIV2026", tab: "SCIV", name: "Swisscubing Cup IV 2026" },
  { id: "SwisscubingCupV2026", tab: "SCV", name: "Swisscubing Cup V 2026" },
  { id: "SwisscubingCupMBI2026", tab: "SCIMB", name: "Swisscubing Cup Mental Breakdown I 2026", events: ["333bf", "333fm", "444bf", "555bf", "333mbf"] },
  { id: "SwisscubingCupMBII2026", tab: "SCIIMB", name: "Swisscubing Cup Mental Breakdown II 2026", events: ["333bf", "333fm", "444bf", "555bf", "333mbf"] },
];
// `events` (optional): only these events count for points. Competitors who
// took part only in other events are treated as not having participated.
const OVERALL_TAB = "Overall";

// WCA event order and short labels.
const EVENTS = {
  "333": "3x3", "222": "2x2", "444": "4x4", "555": "5x5", "666": "6x6", "777": "7x7",
  "333bf": "3BLD", "333fm": "FMC", "333oh": "OH", "clock": "Clock", "minx": "Mega",
  "pyram": "Pyra", "skewb": "Skewb", "sq1": "SQ1", "444bf": "4BLD", "555bf": "5BLD",
  "333mbf": "MBLD",
};
const EVENT_ORDER = Object.keys(EVENTS);

// Round types in competition order (qualification, 1st, 2nd, 3rd, final).
// Letters are the "combined" variants of the same round.
const ROUND_ORDER = { "0": 0, h: 0, "1": 1, d: 1, "2": 2, e: 2, "3": 3, g: 3, c: 4, f: 4 };

/* ---------- Points (formulas live in points.js) ---------- */

const FINALIST_SPOTS = 20;
const FINALIST_MIN_COMPS = 3;

// What-if finals may hold at most this share of the round before the final.
const WHAT_IF_MAX_SHARE = 0.75;

const roundOrder = (r) => ROUND_ORDER[r.round_type_id] ?? 0;

/**
 * What-if final size for a round of `prevCount` competitors:
 * the chosen percentage or number, capped at 75% of that round (at least 1).
 */
function whatIfFinalSize(prevCount, whatIf) {
  const cap = Math.floor(prevCount * WHAT_IF_MAX_SHARE);
  const wanted = whatIf.mode === "percent"
    ? Math.floor((prevCount * whatIf.value) / 100)
    : whatIf.value;
  return Math.max(1, Math.min(wanted, cap));
}

/**
 * Who reaches the what-if final: the top `size` of the round before the final
 * (valid results only). If people tied on the last spot would push the final
 * over 75%, the whole tied group is left out.
 * Returns Map(wcaId -> pos in that round).
 */
function whatIfQualifiers(prevRows, size) {
  const cap = Math.floor(prevRows.length * WHAT_IF_MAX_SHARE);
  const valid = prevRows.filter((r) => r.best > 0).sort((a, b) => a.pos - b.pos);
  if (!valid.length) return new Map();
  const cutoffPos = valid[Math.min(size, valid.length) - 1].pos;
  let chosen = valid.filter((r) => r.pos <= cutoffPos);
  if (chosen.length > cap) chosen = chosen.filter((r) => r.pos < cutoffPos);
  return new Map(chosen.map((r) => [r.wca_id, r.pos]));
}

/** Round label for badges: rf = final, rq = qualification, r1/r2/r3 otherwise. */
function roundLabel(order, finalOrder) {
  if (order === finalOrder) return "rf";
  return order === 0 ? "rq" : `r${order}`;
}

/**
 * Points for one event of one competition.
 * Returns { points: Map(wcaId -> points), standing: Map(wcaId -> { round, place }), final: { real, custom } | null }.
 * `standing` is the round each person reached (following the what-if when on) and
 * their place in it (null for DNF). `final` is set only when a what-if final was applied.
 */
function eventPoints(rows, { formula, scope, whatIf }) {
  const orders = [...new Set(rows.map(roundOrder))].sort((a, b) => a - b);
  const finalOrder = orders[orders.length - 1];

  // Each competitor's last (furthest) round in this event.
  const last = new Map();
  for (const r of rows) {
    const order = roundOrder(r);
    const prev = last.get(r.wca_id);
    if (!prev || order > prev.order) last.set(r.wca_id, { order, pos: r.pos, valid: r.best > 0 });
  }

  const points = new Map();
  for (const wcaId of last.keys()) points.set(wcaId, 0);

  const standing = new Map();
  const setStanding = (wcaId, order, pos, valid) =>
    standing.set(wcaId, { round: roundLabel(order, finalOrder), place: valid ? pos : null });
  for (const [wcaId, entry] of last) setStanding(wcaId, entry.order, entry.pos, entry.valid);

  // Later round beats earlier round; within a round, lower pos is better.
  const better = (a, b) => a.order > b.order || (a.order === b.order && a.pos < b.pos);

  let ranked = [];
  let final = null;
  if (whatIf && orders.length >= 2) {
    // What-if: our own final, filled from the round before the real final.
    // People who were in the real final keep their final result (ranked first);
    // the extra qualifiers are ranked after them by their previous-round place.
    const prevOrder = orders[orders.length - 2];
    const prevRows = rows.filter((r) => roundOrder(r) === prevOrder);
    const realFinal = new Map(rows.filter((r) => roundOrder(r) === finalOrder).map((r) => [r.wca_id, r]));
    const size = whatIfFinalSize(prevRows.length, whatIf);
    const qualifiers = whatIfQualifiers(prevRows, size);
    // `order` here is a ranking tier: custom finalists sit above every real round.
    const FINAL_TIER = 100;
    const finalists = [];
    for (const [wcaId, prevPos] of qualifiers) {
      const f = realFinal.get(wcaId);
      const entry = f
        ? { order: FINAL_TIER + 1, pos: f.pos, valid: f.best > 0 }
        : { order: FINAL_TIER, pos: prevPos, valid: true };
      if (entry.valid) finalists.push({ wcaId, ...entry });
      else setStanding(wcaId, finalOrder, 0, false);
    }
    for (const c of finalists) {
      setStanding(c.wcaId, finalOrder, 1 + finalists.filter((o) => better(o, c)).length, true);
    }
    ranked = finalists;

    // Everyone else: nobody outside the custom final got further than the round before it.
    const prevByPerson = new Map(prevRows.map((r) => [r.wca_id, r]));
    for (const [wcaId, entry] of last) {
      if (qualifiers.has(wcaId)) continue;
      let capped = entry;
      if (entry.order > prevOrder) {
        const p = prevByPerson.get(wcaId);
        if (!p) continue;
        capped = { order: prevOrder, pos: p.pos, valid: p.best > 0 };
        setStanding(wcaId, capped.order, capped.pos, capped.valid);
      }
      if (scope === "everyone" && capped.valid) ranked.push({ wcaId, ...capped });
    }
    final = { real: realFinal.size, custom: qualifiers.size };
  } else {
    // Real rounds (also one-round events when the what-if is on).
    for (const [wcaId, entry] of last) {
      const eligible = scope === "everyone" || entry.order === finalOrder;
      if (eligible && entry.valid) ranked.push({ wcaId, ...entry });
    }
  }

  const n = ranked.length;
  for (const c of ranked) {
    const place = 1 + ranked.filter((o) => better(o, c)).length;
    points.set(c.wcaId, pointsFor(place, n, formula));
  }
  return { points, standing, final };
}

/**
 * Points table for one competition.
 * Returns { events: [eventId], finals: {eventId: { real, custom }}, people: [{ wcaId, name, country, byEvent: {eventId: pts}, total }] }
 */
function competitionPoints(results, options) {
  const people = new Map();
  const byEvent = new Map();
  for (const r of results) {
    if (!people.has(r.wca_id)) {
      people.set(r.wca_id, { wcaId: r.wca_id, name: r.name, country: r.country_iso2, byEvent: {}, standings: {}, total: 0 });
    }
    if (!byEvent.has(r.event_id)) byEvent.set(r.event_id, []);
    byEvent.get(r.event_id).push(r);
  }

  const events = [...byEvent.keys()].sort((a, b) => EVENT_ORDER.indexOf(a) - EVENT_ORDER.indexOf(b));
  const finals = {};
  for (const eventId of events) {
    const { points, standing, final } = eventPoints(byEvent.get(eventId), options);
    if (final) finals[eventId] = final;
    for (const [wcaId, st] of standing) people.get(wcaId).standings[eventId] = st;
    for (const [wcaId, pts] of points) {
      const p = people.get(wcaId);
      p.byEvent[eventId] = pts;
      p.total += pts;
    }
  }
  return { events, finals, people: [...people.values()] };
}

function overallPoints(dataById, options) {
  const people = new Map();
  for (const comp of COMPETITIONS) {
    const results = dataById.get(comp.id);
    if (!results) continue;
    for (const p of competitionPoints(results, options).people) {
      if (!people.has(p.wcaId)) {
        people.set(p.wcaId, { wcaId: p.wcaId, name: p.name, country: p.country, byComp: {}, total: 0 });
      }
      const o = people.get(p.wcaId);
      o.byComp[comp.id] = p.total;
      o.total += p.total;
    }
  }
  const list = [...people.values()];
  for (const p of list) p.comps = Object.keys(p.byComp).length;
  markFinalists(list);
  return list;
}

/**
 * Finalists: the top 20 by total among people with at least 3 competitions.
 * Anyone tied with the 20th eligible person is also a finalist.
 */
function markFinalists(people) {
  const eligible = people
    .filter((p) => p.comps >= FINALIST_MIN_COMPS)
    .sort((a, b) => b.total - a.total);
  const cutoff = eligible.length ? eligible[Math.min(FINALIST_SPOTS, eligible.length) - 1].total : Infinity;
  for (const p of people) {
    p.finalist = p.comps >= FINALIST_MIN_COMPS && p.total >= cutoff - 1e-9;
  }
}

/* ---------- Rendering ---------- */

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

function countryName(iso2) {
  if (!iso2) return "";
  try {
    return countryNames ? countryNames.of(iso2) : iso2;
  } catch {
    return iso2;
  }
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of [].concat(children)) node.append(child);
  return node;
}

const fmt = (n) => (n === undefined ? "–" : n.toFixed(1));

/* Column sorting: one { key, dir } per tab; key is "total" or a column key. */
const DEFAULT_SORT = { key: "total", dir: "desc" };
const sortByTab = {};
let rerender = () => {};

/**
 * Sort rows best-first with `order` = { has(p), cmp(a, b), same(a, b) } and attach
 * `rank` (1 = best, shared by rows where same() is true). Rows without a value go
 * last with rank null. dir "asc" reverses the ranked rows.
 */
function sortRows(rows, order, dir) {
  const ranked = rows.filter(order.has).sort(order.cmp);
  ranked.forEach((row, i) => {
    const prev = ranked[i - 1];
    row.rank = prev && order.same(prev, row) ? prev.rank : i + 1;
  });
  const missing = rows.filter((p) => !order.has(p)).sort((a, b) => a.name.localeCompare(b.name));
  for (const row of missing) row.rank = null;
  return [...(dir === "asc" ? ranked.reverse() : ranked), ...missing];
}

/** Order by points, highest first; ties by total, then name. */
function byPoints(scoreOf) {
  return {
    has: (p) => scoreOf(p) !== undefined,
    cmp: (a, b) => scoreOf(b) - scoreOf(a) || b.total - a.total || a.name.localeCompare(b.name),
    same: (a, b) => Math.abs(scoreOf(a) - scoreOf(b)) < 1e-9,
  };
}

/**
 * Order by result in an event: furthest round first (rf, then r3, r2, r1, rq),
 * then place in that round; a DNF comes after the valid results of its round.
 */
function byPlace(standingOf) {
  const roundRank = (round) => (round === "rf" ? 100 : round === "rq" ? 0 : Number(round.slice(1)));
  const placeKey = (st) => (st.place === null ? Infinity : st.place);
  return {
    has: (p) => standingOf(p) !== undefined,
    cmp: (a, b) => {
      const sa = standingOf(a);
      const sb = standingOf(b);
      return roundRank(sb.round) - roundRank(sa.round) || placeKey(sa) - placeKey(sb) || a.name.localeCompare(b.name);
    },
    same: (a, b) => {
      const sa = standingOf(a);
      const sb = standingOf(b);
      return sa.round === sb.round && placeKey(sa) === placeKey(sb);
    },
  };
}

/** A clickable header that sorts the table by its column. */
function sortHeader(label, key, className, title, sort, tab) {
  const active = sort.key === key;
  const btn = el("button", { type: "button", className: "sort-btn", title: title || `Sort by ${label}` }, [
    label,
    // Every sortable header shows an arrow: ⇅ when not sorted, ▼/▲ for the current order.
    el("span", {
      className: active ? "sort-arrow active" : "sort-arrow",
      textContent: active ? (sort.dir === "desc" ? "▼" : "▲") : "⇅",
      ariaHidden: "true",
    }),
  ]);
  btn.addEventListener("click", () => {
    sortByTab[tab] = active
      ? { key, dir: sort.dir === "desc" ? "asc" : "desc" }
      : { key, dir: "desc" };
    rerender();
  });
  const th = el("th", { className }, btn);
  if (active) th.setAttribute("aria-sort", sort.dir === "desc" ? "descending" : "ascending");
  return th;
}

function personCell(p) {
  const link = el("a", {
    href: `${WCA}/persons/${p.wcaId}`, textContent: p.name, target: "_blank", rel: "noopener",
  });
  const badge = p.finalist ? [" ", el("span", { className: "badge-finalist", textContent: "Finalist" })] : [];
  return el("td", { className: "name" }, [link, ...badge]);
}

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}

/** Small "4th - rf" badge: place in the round reached, and that round. */
function standingBadge(st) {
  if (!st) return [];
  const place = st.place === null ? "DNF" : ordinal(st.place);
  return [el("span", { className: "rank-badge", textContent: `${place} - ${st.round}` })];
}

/**
 * tab: which tab this table belongs to (its sort order is remembered per tab).
 * extraColumns: [{ label, className, value(p) }] shown between Country and the points columns.
 * badgeOf(p, key): optional { round, place } shown as a small badge after the points.
 * Clicking a column or Total sorts by it (event columns by place, the rest by
 * points); clicking again flips the order. "#" is the rank by the sorted column.
 */
function pointsTable({ tab, columns, rows, valueOf, extraColumns = [], badgeOf = null }) {
  const sort = sortByTab[tab] || DEFAULT_SORT;
  // Event columns (with a place badge) sort by place; Total and Overall columns by points.
  let order;
  if (sort.key === "total") order = byPoints((p) => p.total);
  else if (badgeOf) order = byPlace((p) => badgeOf(p, sort.key));
  else order = byPoints((p) => valueOf(p, sort.key));
  const sorted = sortRows(rows, order, sort.dir);
  const head = el("tr", {}, [
    el("th", { className: "num", textContent: "#" }),
    el("th", { className: "name", textContent: "Name" }),
    el("th", { textContent: "Country" }),
    ...extraColumns.map((x) => el("th", { className: x.className || "", textContent: x.label, title: x.title || "" })),
    ...columns.map((c) => sortHeader(c.label, c.key, "pts", c.title, sort, tab)),
    sortHeader("Total", "total", "pts total", "Sort by total", sort, tab),
  ]);
  const body = sorted.map((p) => el("tr", {}, [
    el("td", { className: "num", textContent: p.rank === null ? "–" : String(p.rank) }),
    personCell(p),
    el("td", { textContent: countryName(p.country) }),
    ...extraColumns.map((x) => el("td", { className: x.className || "", textContent: x.value(p) })),
    ...columns.map((c) => el("td", { className: "pts" }, [
      fmt(valueOf(p, c.key)),
      ...(badgeOf ? standingBadge(badgeOf(p, c.key)) : []),
    ])),
    el("td", { className: "pts total", textContent: fmt(p.total) }),
  ]));
  return el("div", { className: "table-wrap" }, el("table", {}, [el("thead", {}, head), el("tbody", {}, body)]));
}

function renderCompetition(comp, results, options) {
  const { events, finals, people } = competitionPoints(results, options);
  const columns = events.map((e) => {
    const f = finals[e];
    const title = f ? `${e}: real final ${f.real}, what-if final ${f.custom}` : e;
    return { key: e, label: EVENTS[e] || e, title };
  });
  const content = [
    el("h2", {}, el("a", { href: `${WCA}/competitions/${comp.id}`, textContent: comp.name, target: "_blank", rel: "noopener" })),
    el("p", {
      className: "meta",
      textContent: `${people.length} competitors · ${events.length} events` +
        (comp.events ? ` (only ${comp.events.map((e) => EVENTS[e] || e).join(", ")} count for points)` : ""),
    }),
  ];
  if (options.whatIf) {
    const changed = events.filter((e) => finals[e]);
    const oneRound = events.filter((e) => !finals[e]);
    const parts = changed.map((e) => `${EVENTS[e] || e} ${finals[e].real} → ${finals[e].custom}`);
    let text = `What-if final (${whatIfSummary(options)}), finalists real → what-if: ${parts.join(" · ") || "none"}`;
    if (oneRound.length) text += `. One-round events unchanged: ${oneRound.map((e) => EVENTS[e] || e).join(", ")}`;
    content.push(el("p", { className: "what-if-note", textContent: text + "." }));
  }
  content.push(pointsTable({
    tab: comp.tab,
    columns,
    rows: people,
    valueOf: (p, key) => p.byEvent[key],
    badgeOf: (p, key) => p.standings[key],
  }));
  return content;
}

function renderOverall(dataById, options) {
  const people = overallPoints(dataById, options);
  const columns = COMPETITIONS.filter((c) => dataById.has(c.id)).map((c) => ({ key: c.id, label: c.tab, title: c.name }));
  const finalists = people.filter((p) => p.finalist).length;
  const compsColumn = { label: "Comps", title: "Number of competitions participated in", className: "pts", value: (p) => String(p.comps) };
  return [
    el("h2", { textContent: "Overall" }),
    el("p", { className: "meta", textContent: `${people.length} competitors · points summed across ${columns.length} competitions` }),
    el("p", { className: "meta" }, [
      el("span", { className: "badge-finalist", textContent: "Finalist" }),
      ` = top ${FINALIST_SPOTS} by total among competitors with at least ${FINALIST_MIN_COMPS} competitions (${finalists} with the current options, ties included).`,
    ]),
    ...(options.whatIf
      ? [el("p", { className: "what-if-note", textContent: `What-if final is on (${whatIfSummary(options)}). It applies to every event with 2+ rounds; open a competition tab to see each event's final size.` })]
      : []),
    pointsTable({
      tab: OVERALL_TAB,
      columns,
      rows: people,
      valueOf: (p, key) => p.byComp[key],
      extraColumns: [compsColumn],
    }),
  ];
}

function renderError(comp, err) {
  return [
    el("h2", { textContent: comp.name }),
    el("p", { className: "error", textContent: `Could not load results (${err.message}).` }),
  ];
}

/* ---------- App ---------- */

async function fetchResults(id) {
  const res = await fetch(`${WCA}/api/v0/competitions/${id}/results`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function currentOptions(form) {
  const data = new FormData(form);
  let whatIf = null;
  if (data.get("whatIf") === "on") {
    const mode = data.get("whatIfMode");
    const raw = Math.round(Number(data.get(mode === "percent" ? "whatIfPercent" : "whatIfCount")));
    const value = Number.isFinite(raw) && raw >= 1 ? raw : 1;
    whatIf = { mode, value: mode === "percent" ? Math.min(value, 75) : value };
  }
  return { formula: data.get("formula"), scope: data.get("scope"), whatIf };
}

/** Enable/disable the what-if inputs to match the switch. */
function syncWhatIfControls(form) {
  document.getElementById("what-if-body").disabled = !form.elements.whatIf.checked;
}

function whatIfSummary({ whatIf, scope }) {
  const size = whatIf.mode === "percent"
    ? `top ${whatIf.value}% of the round before the final`
    : `top ${whatIf.value} of the round before the final`;
  return `${size}; ${scope === "everyone" ? "everyone in the event scores" : "only the custom finalists score"}`;
}

async function main() {
  document.getElementById("year").textContent = new Date().getFullYear();

  const form = document.getElementById("options");
  const tabsEl = document.getElementById("tabs");
  const panel = document.getElementById("panel");
  const status = document.getElementById("status");

  const tabNames = [...COMPETITIONS.map((c) => c.tab), OVERALL_TAB];
  const fromHash = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    return tabNames.includes(h) ? h : tabNames[0];
  };
  let activeTab = fromHash();

  const tabButtons = tabNames.map((name) => {
    const btn = el("button", { type: "button", className: "tab", textContent: name });
    btn.setAttribute("role", "tab");
    btn.addEventListener("click", () => {
      history.replaceState(null, "", `#${name}`);
      activeTab = name;
      render();
    });
    tabsEl.append(btn);
    return btn;
  });

  const dataById = new Map();
  const errors = new Map();
  const settled = await Promise.allSettled(COMPETITIONS.map((c) => fetchResults(c.id)));
  settled.forEach((r, i) => {
    const comp = COMPETITIONS[i];
    if (r.status === "fulfilled") {
      const results = comp.events ? r.value.filter((row) => comp.events.includes(row.event_id)) : r.value;
      dataById.set(comp.id, results);
    } else {
      errors.set(comp.id, r.reason);
    }
  });
  status.remove();

  function render() {
    tabButtons.forEach((b) => b.setAttribute("aria-selected", String(b.textContent === activeTab)));
    const options = currentOptions(form);
    let content;
    if (activeTab === OVERALL_TAB) {
      content = renderOverall(dataById, options);
      if (errors.size) {
        const missing = COMPETITIONS.filter((c) => errors.has(c.id)).map((c) => c.tab).join(", ");
        content.splice(1, 0, el("p", { className: "error", textContent: `Not included (failed to load): ${missing}` }));
      }
    } else {
      const comp = COMPETITIONS.find((c) => c.tab === activeTab);
      content = dataById.has(comp.id)
        ? renderCompetition(comp, dataById.get(comp.id), options)
        : renderError(comp, errors.get(comp.id));
    }
    panel.replaceChildren(...content);
  }
  rerender = () => {
    // Keep the table where it is when re-sorting.
    const wrap = panel.querySelector(".table-wrap");
    const scrollLeft = wrap ? wrap.scrollLeft : 0;
    render();
    const next = panel.querySelector(".table-wrap");
    if (next) next.scrollLeft = scrollLeft;
  };

  form.addEventListener("change", (ev) => {
    if (ev.target.name === "whatIf") syncWhatIfControls(form);
    // Typing in a what-if box selects its option.
    if (ev.target.name === "whatIfPercent") form.elements.whatIfMode.value = "percent";
    if (ev.target.name === "whatIfCount") form.elements.whatIfMode.value = "count";
    render();
  });
  form.addEventListener("input", (ev) => {
    if (ev.target.type !== "number") return;
    form.elements.whatIfMode.value = ev.target.name === "whatIfPercent" ? "percent" : "count";
    render();
  });
  syncWhatIfControls(form);
  window.addEventListener("hashchange", () => {
    activeTab = fromHash();
    render();
  });
  render();
}

document.addEventListener("DOMContentLoaded", main);
