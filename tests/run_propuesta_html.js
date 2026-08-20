#!/usr/bin/env node
"use strict";

const path = require("path");
const charts = require("../docs/propuesta_charts.js");

const minute = charts.donutSlices(
  [28, 22, 18, 32],
  ["Espera / IVR", "Datos repetidos", "Fuera de horario", "Caso complejo"],
  ["#fbbf24", "#7dd3fc", "#fb7185", "#2dd4bf"]
);
const mix = charts.donutSlices(
  [58, 24, 12, 6],
  ["Voz primer nivel", "Especialista humano", "Fuera de horario / captura", "Abandono / retrabajo"],
  ["#2dd4bf", "#38bdf8", "#fbbf24", "#94a3b8"]
);
const bars = charts.costBarLayout([100, 82, 58, 45]);
const deck = charts.createDeck(12);
const i0 = deck.go(0);
const i1 = deck.go(1);
deck.go(12);
const wrap = deck.getIndex();

function classList() {
  const set = new Set();
  return {
    add: function (c) { set.add(c); },
    remove: function (c) { set.delete(c); },
    contains: function (c) { return set.has(c); },
  };
}

const slides = [];
for (let i = 0; i < 12; i++) {
  slides.push({ classList: classList() });
}
const dots = { childNodes: [], querySelectorAll: function () { return []; }, appendChild: function () {} };
const doc = {
  getElementById: function (id) {
    if (id === "dots") return dots;
    return { innerHTML: "", style: {}, textContent: "", addEventListener: function () {}, setAttribute: function () {}, querySelectorAll: function () { return []; }, childNodes: [] };
  },
  querySelectorAll: function (sel) {
    if (sel === ".slide") return slides;
    return [];
  },
  createElement: function () {
    return { type: "", setAttribute: function () {}, addEventListener: function () {}, classList: classList() };
  },
};

const mounted = charts.mount(doc);
const onAfterMount = slides.filter(function (s) { return s.classList.contains("on"); }).length;
mounted.deck.go(1);
mounted.paint();
const onAfterNext = slides.map(function (s, i) { return s.classList.contains("on") ? i : -1; }).filter(function (i) { return i >= 0; });

const out = {
  minuteN: minute.length,
  mixN: mix.length,
  minuteVals: minute.map(function (s) { return s.value; }),
  mixVals: mix.map(function (s) { return s.value; }),
  uniqueMinuteD: new Set(minute.map(function (s) { return s.d; })).size,
  uniqueMixD: new Set(mix.map(function (s) { return s.d; })).size,
  minuteHasArc: minute.every(function (s) { return s.d.indexOf(" A ") !== -1 && s.d.indexOf(" Z") !== -1; }),
  mixHasArc: mix.every(function (s) { return s.d.indexOf(" A ") !== -1 && s.d.indexOf(" Z") !== -1; }),
  minuteLabels: minute.map(function (s) { return s.label; }),
  mixLabels: mix.map(function (s) { return s.label; }),
  barValues: bars.map(function (b) { return b.value; }),
  barWidths: bars.map(function (b) { return b.widthPct; }),
  deck0: i0,
  deck1: i1,
  deckWrap: wrap,
  onAfterMount: onAfterMount,
  onAfterNext: onAfterNext,
  threw: false,
};
process.stdout.write(JSON.stringify(out));
