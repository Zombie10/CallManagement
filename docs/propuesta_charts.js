/**
 * Geometry + deck controller for the HTML banking proposal.
 * Browser: attaches to globalThis.PropuestaCharts (no import/require on the page).
 * Node tests: module.exports the same API.
 */
(function (root) {
  function polar(cx, cy, r, deg) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function annulusPath(cx, cy, rOuter, rInner, a0, a1) {
    const [ox0, oy0] = polar(cx, cy, rOuter, a0);
    const [ox1, oy1] = polar(cx, cy, rOuter, a1);
    const [ix0, iy0] = polar(cx, cy, rInner, a0);
    const [ix1, iy1] = polar(cx, cy, rInner, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return (
      "M " +
      ox0.toFixed(3) +
      " " +
      oy0.toFixed(3) +
      " A " +
      rOuter +
      " " +
      rOuter +
      " 0 " +
      large +
      " 1 " +
      ox1.toFixed(3) +
      " " +
      oy1.toFixed(3) +
      " L " +
      ix1.toFixed(3) +
      " " +
      iy1.toFixed(3) +
      " A " +
      rInner +
      " " +
      rInner +
      " 0 " +
      large +
      " 0 " +
      ix0.toFixed(3) +
      " " +
      iy0.toFixed(3) +
      " Z"
    );
  }

  function donutSlices(values, labels, colors, opts) {
    opts = opts || {};
    const gap = opts.gapDeg == null ? 3.2 : opts.gapDeg;
    const rOut = opts.rOut == null ? 40 : opts.rOut;
    const rIn = opts.rIn == null ? 24 : opts.rIn;
    const cx = opts.cx == null ? 50 : opts.cx;
    const cy = opts.cy == null ? 50 : opts.cy;
    const sum = values.reduce(function (a, b) {
      return a + b;
    }, 0);
    const usable = 360 - gap * values.length;
    let angle = 0;
    return values.map(function (value, i) {
      const sweep = (value / sum) * usable;
      const start = angle + gap / 2;
      const end = start + sweep;
      angle += sweep + gap;
      return {
        index: i,
        value: value,
        label: labels[i],
        color: colors[i],
        pct: Math.round((value / sum) * 100),
        d: annulusPath(cx, cy, rOut, rIn, start, end),
      };
    });
  }

  function costBarLayout(values) {
    const max = Math.max.apply(null, values.concat([1]));
    return values.map(function (value) {
      return { value: value, widthPct: Math.round((value / max) * 1000) / 10 };
    });
  }

  function groupedBarLayout(before, after) {
    const max = Math.max.apply(null, before.concat(after).concat([1]));
    return before.map(function (b, i) {
      return {
        before: b,
        after: after[i],
        beforePct: Math.round((b / max) * 1000) / 10,
        afterPct: Math.round((after[i] / max) * 1000) / 10,
      };
    });
  }

  function donutSvg(slices, centerText) {
    const paths = slices
      .map(function (s) {
        return (
          '<path class="slice" data-value="' +
          s.value +
          '" data-label="' +
          String(s.label).replace(/"/g, "") +
          '" fill="' +
          s.color +
          '" d="' +
          s.d +
          '"></path>'
        );
      })
      .join("");
    const legend = slices
      .map(function (s) {
        return (
          '<li><i style="background:' +
          s.color +
          '"></i><span>' +
          s.label +
          '</span><b>' +
          s.value +
          "%</b></li>"
        );
      })
      .join("");
    return (
      '<div class="donut">' +
      '<svg viewBox="0 0 100 100" role="img">' +
      paths +
      (centerText
        ? '<text x="50" y="52" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="700">' +
          centerText +
          "</text>"
        : "") +
      "</svg>" +
      '<ul class="legend">' +
      legend +
      "</ul></div>"
    );
  }

  function costBarsSvg(labels, layout) {
    const rows = layout
      .map(function (b, i) {
        return (
          '<div class="hbar" data-value="' +
          b.value +
          '"><span class="hbar-label">' +
          labels[i] +
          '</span><svg viewBox="0 0 100 8" preserveAspectRatio="none">' +
          '<rect class="track" x="0" y="1.5" width="100" height="5" rx="2.5" fill="rgba(255,255,255,.08)"></rect>' +
          '<rect class="bar" data-value="' +
          b.value +
          '" x="0" y="1.5" width="' +
          b.widthPct +
          '" height="5" rx="2.5" fill="#2dd4bf"></rect>' +
          "</svg><b>" +
          b.value +
          "</b></div>"
        );
      })
      .join("");
    return '<div class="hbars">' + rows + "</div>";
  }

  function groupedBarsSvg(labels, layout) {
    const cols = layout
      .map(function (g, i) {
        return (
          '<div class="gcol"><div class="pair">' +
          '<i class="before" data-value="' +
          g.before +
          '" style="height:' +
          g.beforePct +
          '%"></i>' +
          '<i class="after" data-value="' +
          g.after +
          '" style="height:' +
          g.afterPct +
          '%"></i></div><label>' +
          labels[i] +
          "<br>" +
          g.before +
          " → " +
          g.after +
          "</label></div>"
        );
      })
      .join("");
    return (
      '<div class="gbars" aria-label="Comparativa de índices">' +
      cols +
      "</div>"
    );
  }

  function createDeck(n) {
    var i = 0;
    function go(x) {
      i = ((x % n) + n) % n;
      return i;
    }
    return {
      go: go,
      getIndex: function () {
        return i;
      },
      count: n,
    };
  }

  function mount(doc) {
    if (!doc) return null;
    var minute = donutSlices(
      [28, 22, 18, 32],
      ["Espera / IVR", "Datos repetidos", "Fuera de horario", "Caso complejo"],
      ["#fbbf24", "#7dd3fc", "#fb7185", "#2dd4bf"]
    );
    var mix = donutSlices(
      [58, 24, 12, 6],
      [
        "Voz primer nivel",
        "Especialista humano",
        "Fuera de horario / captura",
        "Abandono / retrabajo",
      ],
      ["#2dd4bf", "#38bdf8", "#fbbf24", "#94a3b8"]
    );
    var cost = costBarLayout([100, 82, 58, 45]);
    var grouped = groupedBarLayout([100, 100, 100, 100], [55, 40, 20, 25]);
    var costLabels = [
      "100% humano",
      "Humano + IVR",
      "Híbrido voz + humano",
      "Voz 24/7 + escalación",
    ];
    var groupLabels = ["Espera", "Retrabajo", "Fuera de horario", "Inconsistencia"];

    var elMin = doc.getElementById("chart-minute");
    var elMix = doc.getElementById("chart-mix");
    var elCost = doc.getElementById("chart-cost");
    var elGroup = doc.getElementById("chart-improve");
    if (elMin) elMin.innerHTML = donutSvg(minute, "100");
    if (elMix) elMix.innerHTML = donutSvg(mix, "mix");
    if (elCost) elCost.innerHTML = costBarsSvg(costLabels, cost);
    if (elGroup) elGroup.innerHTML = groupedBarsSvg(groupLabels, grouped);

    var slides = doc.querySelectorAll(".slide");
    var deck = createDeck(slides.length);
    var dots = doc.getElementById("dots");
    var count = doc.getElementById("count");
    var progress = doc.getElementById("progress");

    function paint() {
      var idx = deck.getIndex();
      for (var s = 0; s < slides.length; s++) {
        if (idx === s) slides[s].classList.add("on");
        else slides[s].classList.remove("on");
      }
      if (dots) {
        var btns = dots.querySelectorAll("button");
        for (var d = 0; d < btns.length; d++) {
          if (d === idx) btns[d].classList.add("on");
          else btns[d].classList.remove("on");
        }
      }
      if (count) {
        count.textContent =
          String(idx + 1).padStart(2, "0") +
          " / " +
          String(slides.length).padStart(2, "0");
      }
      if (progress) {
        progress.style.width = ((idx + 1) / slides.length) * 100 + "%";
      }
      return idx;
    }

    if (dots && !dots.childNodes.length) {
      for (var k = 0; k < slides.length; k++) {
        (function (n) {
          var b = doc.createElement("button");
          b.type = "button";
          b.setAttribute("aria-label", "Diapositiva " + (n + 1));
          b.addEventListener("click", function () {
            deck.go(n);
            paint();
          });
          dots.appendChild(b);
        })(k);
      }
    }
    var prev = doc.getElementById("prev");
    var next = doc.getElementById("next");
    if (prev)
      prev.addEventListener("click", function () {
        deck.go(deck.getIndex() - 1);
        paint();
      });
    if (next)
      next.addEventListener("click", function () {
        deck.go(deck.getIndex() + 1);
        paint();
      });
    paint();
    return { deck: deck, paint: paint, minute: minute, mix: mix, cost: cost };
  }

  var api = {
    donutSlices: donutSlices,
    costBarLayout: costBarLayout,
    groupedBarLayout: groupedBarLayout,
    donutSvg: donutSvg,
    costBarsSvg: costBarsSvg,
    groupedBarsSvg: groupedBarsSvg,
    createDeck: createDeck,
    mount: mount,
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PropuestaCharts = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
