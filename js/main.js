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

/**
 * Points for one event of one competition.
 * Returns Map(wcaId -> points) for every competitor in the event.
 */
function eventPoints(rows, { formula, scope }) {
  const finalOrder = Math.max(...rows.map((r) => ROUND_ORDER[r.round_type_id] ?? 0));

  // Each competitor's last (furthest) round in this event.
  const last = new Map();
  for (const r of rows) {
    const order = ROUND_ORDER[r.round_type_id] ?? 0;
    const prev = last.get(r.wca_id);
    if (!prev || order > prev.order) last.set(r.wca_id, { order, pos: r.pos, valid: r.best > 0 });
  }

  const points = new Map();
  const ranked = [];
  for (const [wcaId, entry] of last) {
    points.set(wcaId, 0);
    const eligible = scope === "everyone" || entry.order === finalOrder;
    if (eligible && entry.valid) ranked.push({ wcaId, ...entry });
  }

  // Later round beats earlier round; within a round, lower pos is better.
  const better = (a, b) => a.order > b.order || (a.order === b.order && a.pos < b.pos);
  const n = ranked.length;
  for (const c of ranked) {
    const place = 1 + ranked.filter((o) => better(o, c)).length;
    points.set(c.wcaId, pointsFor(place, n, formula));
  }
  return points;
}

/**
 * Points table for one competition.
 * Returns { events: [eventId], people: [{ wcaId, name, country, byEvent: {eventId: pts}, total }] }
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
  for (const eventId of events) {
    for (const [wcaId, pts] of eventPoints(byEvent.get(eventId), options)) {
      const p = people.get(wcaId);
      p.byEvent[eventId] = pts;
      p.total += pts;
    }
  }
  return { events, people: [...people.values()] };
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
  const { events, people } = competitionPoints(results, options);
  const columns = events.map((e) => ({ key: e, label: EVENTS[e] || e, title: e }));
  return [
    el("h2", {}, el("a", { href: `${WCA}/competitions/${comp.id}`, textContent: comp.name, target: "_blank", rel: "noopener" })),
    el("p", {
      className: "meta",
      textContent: `${people.length} competitors · ${events.length} events` +
        (comp.events ? ` (only ${comp.events.map((e) => EVENTS[e] || e).join(", ")} count for points)` : ""),
    }),
    pointsTable(columns, rankRows(people), (p, key) => p.byEvent[key]),
  ];
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
  return { formula: data.get("formula"), scope: data.get("scope") };
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

  form.addEventListener("change", render);
  window.addEventListener("hashchange", () => {
    activeTab = fromHash();
    render();
  });
  render();
}

document.addEventListener("DOMContentLoaded", main);
