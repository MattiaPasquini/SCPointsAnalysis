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

/**
 * Points for one event of one competition.
 * Returns { points: Map(wcaId -> points), final: { real, custom } | null }.
 * `final` is set only when a what-if final was applied to this event.
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
    for (const [wcaId, prevPos] of qualifiers) {
      const f = realFinal.get(wcaId);
      const entry = f ? { order: 1, pos: f.pos, valid: f.best > 0 } : { order: 0, pos: prevPos, valid: true };
      if (entry.valid) ranked.push({ wcaId, ...entry });
    }
    final = { real: realFinal.size, custom: qualifiers.size };
  } else {
    // Real rounds. With the what-if on, this branch only handles one-round
    // events, whose single round is the final; "Who gets points" is ignored.
    for (const [wcaId, entry] of last) {
      const eligible = (!whatIf && scope === "everyone") || entry.order === finalOrder;
      if (eligible && entry.valid) ranked.push({ wcaId, ...entry });
    }
  }

  // Later round beats earlier round; within a round, lower pos is better.
  const better = (a, b) => a.order > b.order || (a.order === b.order && a.pos < b.pos);
  const n = ranked.length;
  for (const c of ranked) {
    const place = 1 + ranked.filter((o) => better(o, c)).length;
    points.set(c.wcaId, pointsFor(place, n, formula));
  }
  return { points, final };
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
      people.set(r.wca_id, { wcaId: r.wca_id, name: r.name, country: r.country_iso2, byEvent: {}, total: 0 });
    }
    if (!byEvent.has(r.event_id)) byEvent.set(r.event_id, []);
    byEvent.get(r.event_id).push(r);
  }

  const events = [...byEvent.keys()].sort((a, b) => EVENT_ORDER.indexOf(a) - EVENT_ORDER.indexOf(b));
  const finals = {};
  for (const eventId of events) {
    const { points, final } = eventPoints(byEvent.get(eventId), options);
    if (final) finals[eventId] = final;
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

/** Sort by total (desc) then name, and attach shared ranks for ties. */
function rankRows(rows) {
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && Math.abs(prev.total - row.total) < 1e-9 ? prev.rank : i + 1;
  });
  return rows;
}

function personCell(p) {
  const link = el("a", {
    href: `${WCA}/persons/${p.wcaId}`, textContent: p.name, target: "_blank", rel: "noopener",
  });
  const badge = p.finalist ? [" ", el("span", { className: "badge-finalist", textContent: "Finalist" })] : [];
  return el("td", { className: "name" }, [link, ...badge]);
}

/** extraColumns: [{ label, className, value(p) }] shown between Country and the points columns. */
function pointsTable(columns, rows, valueOf, extraColumns = []) {
  const head = el("tr", {}, [
    el("th", { className: "num", textContent: "#" }),
    el("th", { className: "name", textContent: "Name" }),
    el("th", { textContent: "Country" }),
    ...extraColumns.map((x) => el("th", { className: x.className || "", textContent: x.label, title: x.title || "" })),
    ...columns.map((c) => el("th", { className: "pts", textContent: c.label, title: c.title || "" })),
    el("th", { className: "pts total", textContent: "Total" }),
  ]);
  const body = rows.map((p) => el("tr", {}, [
    el("td", { className: "num", textContent: String(p.rank) }),
    personCell(p),
    el("td", { textContent: countryName(p.country) }),
    ...extraColumns.map((x) => el("td", { className: x.className || "", textContent: x.value(p) })),
    ...columns.map((c) => el("td", { className: "pts", textContent: fmt(valueOf(p, c.key)) })),
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
    let text = `What-if final (${whatIfSummary(options.whatIf)}), finalists real → what-if: ${parts.join(" · ") || "none"}`;
    if (oneRound.length) text += `. One-round events unchanged: ${oneRound.map((e) => EVENTS[e] || e).join(", ")}`;
    content.push(el("p", { className: "what-if-note", textContent: text + "." }));
  }
  content.push(pointsTable(columns, rankRows(people), (p, key) => p.byEvent[key]));
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
      ? [el("p", { className: "what-if-note", textContent: `What-if final is on: ${whatIfSummary(options.whatIf)} in every event with 2+ rounds. Open a competition tab to see each event's final size.` })]
      : []),
    pointsTable(columns, rankRows(people), (p, key) => p.byComp[key], [compsColumn]),
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

/** Enable/disable the what-if inputs and the "Who gets points" choice to match the switch. */
function syncWhatIfControls(form) {
  const on = form.elements.whatIf.checked;
  document.getElementById("what-if-body").disabled = !on;
  document.getElementById("scope-options").disabled = on;
}

function whatIfSummary(whatIf) {
  return whatIf.mode === "percent"
    ? `top ${whatIf.value}% of the round before the final`
    : `top ${whatIf.value} of the round before the final`;
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
