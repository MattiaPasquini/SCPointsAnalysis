"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const MIN_N = 2;
const MAX_N = 200;

// Chart geometry (SVG user units; the SVG scales to its container).
const W = 820;
const H = 420;
const M = { top: 16, right: 20, bottom: 46, left: 52 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

const Y_MAX = 120; // room for the podium bonus
const SERIES = ["steep", "gentle", "linearPodium"];

/** A "nice" tick step so the x axis shows roughly 10 labels. */
function tickStep(n) {
  const raw = (n - 1) / 10;
  for (const s of [1, 2, 5, 10, 20, 25, 50]) if (s >= raw) return s;
  return 50;
}

function drawChart(n) {
  const root = document.getElementById("chart-svg");
  root.setAttribute("viewBox", `0 0 ${W} ${H}`);
  root.replaceChildren();

  const x = (r) => M.left + ((r - 1) / (n - 1)) * PW;
  const y = (p) => M.top + (1 - p / Y_MAX) * PH;

  // Y grid and labels.
  for (let p = 0; p <= Y_MAX; p += 20) {
    root.append(svg("line", { class: "grid", x1: M.left, x2: M.left + PW, y1: y(p), y2: y(p) }));
    root.append(svg("text", { class: "axis-label", x: M.left - 8, y: y(p) + 4, "text-anchor": "end" }, String(p)));
  }
  root.append(svg("text", {
    class: "axis-title", x: 14, y: M.top + PH / 2, "text-anchor": "middle",
    transform: `rotate(-90 14 ${M.top + PH / 2})`,
  }, "Points"));

  // X labels.
  const step = tickStep(n);
  const ticks = [1];
  for (let r = step; r < n; r += step) if (r > 1) ticks.push(r);
  if (ticks[ticks.length - 1] !== n) {
    // Avoid the last label colliding with the previous one.
    if (n - ticks[ticks.length - 1] < step / 2) ticks.pop();
    ticks.push(n);
  }
  for (const r of ticks) {
    root.append(svg("text", { class: "axis-label", x: x(r), y: M.top + PH + 18, "text-anchor": "middle" }, String(r)));
  }
  root.append(svg("text", { class: "axis-title", x: M.left + PW / 2, y: H - 6, "text-anchor": "middle" }, "Place (r)"));

  // Lines.
  const places = Array.from({ length: n }, (_, i) => i + 1);
  const path = (key) => places.map((r, i) => `${i ? "L" : "M"}${x(r).toFixed(1)},${y(pointsFor(r, n, key)).toFixed(1)}`).join("");
  for (const key of SERIES) root.append(svg("path", { class: `line ${key}`, d: path(key) }));

  // Dots when there is room for them.
  if (n <= 50) {
    const radius = n <= 20 ? 4 : 3;
    for (const key of SERIES) {
      for (const r of places) {
        root.append(svg("circle", { class: `dot ${key}`, cx: x(r), cy: y(pointsFor(r, n, key)), r: radius }));
      }
    }
  }

  // Hover: vertical guide + tooltip with both values for the nearest place.
  const guide = svg("line", { class: "hover-line", y1: M.top, y2: M.top + PH, visibility: "hidden" });
  root.append(guide);
  const tooltip = document.getElementById("chart-tooltip");
  const chart = document.getElementById("chart");

  root.onpointermove = (ev) => {
    const box = root.getBoundingClientRect();
    const scale = W / box.width;
    const px = (ev.clientX - box.left) * scale;
    const r = Math.min(n, Math.max(1, Math.round(1 + ((px - M.left) / PW) * (n - 1))));
    guide.setAttribute("x1", x(r));
    guide.setAttribute("x2", x(r));
    guide.setAttribute("visibility", "visible");

    tooltip.replaceChildren(
      Object.assign(document.createElement("strong"), { textContent: `Place ${r} of ${n}` }),
      document.createElement("br"),
      `Steep: ${pointsFor(r, n, "steep").toFixed(1)}`,
      document.createElement("br"),
      `Gentle: ${pointsFor(r, n, "gentle").toFixed(1)}`,
      document.createElement("br"),
      `Linear + podium: ${pointsFor(r, n, "linearPodium").toFixed(1)}`,
    );
    tooltip.hidden = false;
    const left = x(r) / scale;
    const flip = left > box.width - tooltip.offsetWidth - 16;
    tooltip.style.left = `${flip ? left - tooltip.offsetWidth - 10 : left + 10}px`;
    tooltip.style.top = `${M.top / scale}px`;
  };
  root.onpointerleave = () => {
    guide.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  };
  chart.style.touchAction = "pan-y";
}

function drawTable(n) {
  const rows = [];
  for (let r = 1; r <= n; r++) {
    const tr = document.createElement("tr");
    for (const [cls, text] of [
      ["num", String(r)],
      ["pts", pointsFor(r, n, "steep").toFixed(1)],
      ["pts", pointsFor(r, n, "gentle").toFixed(1)],
      ["pts", pointsFor(r, n, "linearPodium").toFixed(1)],
    ]) {
      const td = document.createElement("td");
      td.className = cls;
      td.textContent = text;
      tr.append(td);
    }
    rows.push(tr);
  }
  document.getElementById("points-body").replaceChildren(...rows);
}

function drawSummary(n) {
  // Steep: 50 points at r = √N. Gentle: 50 points at r = N + 1 − √N.
  const root = Math.sqrt(n);
  const steepHalf = Math.floor(root);
  const gentleAbove = Math.floor(n + 1 - root);
  document.getElementById("summary").textContent =
    `With ${n} ranked competitors: on the steep curve 2nd place gets ${pointsFor(2, n, "steep").toFixed(1)} ` +
    `and only the top ${steepHalf} get 50 points or more. ` +
    `On the gentle curve 2nd place gets ${pointsFor(2, n, "gentle").toFixed(1)} ` +
    `and everyone down to place ${gentleAbove} gets 50 points or more. ` +
    `On linear + podium bonus the top ${Math.min(3, n)} get ` +
    `${[1, 2, 3].filter((r) => r <= n).map((r) => pointsFor(r, n, "linearPodium").toFixed(1)).join(", ")} ` +
    `and each further place is worth ${(100 / (n - 1)).toFixed(1)} points less than the one above.`;
}

function update(n) {
  drawSummary(n);
  drawChart(n);
  drawTable(n);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();

  const number = document.getElementById("n-number");
  const range = document.getElementById("n-range");

  const clamp = (v) => Math.min(MAX_N, Math.max(MIN_N, Math.round(v)));

  number.addEventListener("input", () => {
    const v = Number(number.value);
    if (!Number.isFinite(v) || v < MIN_N) return; // wait until the value is complete
    const n = clamp(v);
    range.value = n;
    update(n);
  });
  number.addEventListener("change", () => {
    const n = clamp(Number(number.value) || MIN_N);
    number.value = n;
    range.value = n;
    update(n);
  });
  range.addEventListener("input", () => {
    number.value = range.value;
    update(Number(range.value));
  });

  update(clamp(Number(number.value)));
});
