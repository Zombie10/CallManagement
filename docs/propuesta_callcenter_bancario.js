const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaPhoneAlt, FaUniversity, FaShieldAlt, FaHeadset, FaIdCard,
  FaLock, FaChartLine, FaClock, FaUsers, FaCheckCircle,
  FaArrowDown, FaBolt, FaBuilding, FaMicrophone,
} = require("react-icons/fa");

function renderIconSvg(Icon, color, size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(Icon, { color, size: String(size) })
  );
}
async function iconPng(Icon, color) {
  const buf = await sharp(Buffer.from(renderIconSvg(Icon, color))).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

const C = {
  navy: "0A1628",
  navy2: "122A45",
  teal: "0D9488",
  tealL: "5EEAD4",
  amber: "F59E0B",
  green: "10B981",
  red: "EF4444",
  white: "FFFFFF",
  bg: "F4F7FB",
  card: "FFFFFF",
  slate: "1E293B",
  mid: "475569",
  mute: "64748B",
  line: "E2E8F0",
  ink: "0F172A",
};

const HF = "Calibri";
const BF = "Calibri";
const SW = 13.333;
const SH = 7.5;
const L = 0.55;
const W = SW - 1.1;

function shadow() {
  return { type: "outer", blur: 10, offset: 3, angle: 135, color: "0A1628", opacity: 0.08 };
}

async function build() {
  const ic = {
    phone: await iconPng(FaPhoneAlt, "#0D9488"),
    bank: await iconPng(FaUniversity, "#0D9488"),
    shield: await iconPng(FaShieldAlt, "#0D9488"),
    head: await iconPng(FaHeadset, "#0D9488"),
    id: await iconPng(FaIdCard, "#0D9488"),
    lock: await iconPng(FaLock, "#0D9488"),
    chart: await iconPng(FaChartLine, "#0D9488"),
    clock: await iconPng(FaClock, "#0D9488"),
    users: await iconPng(FaUsers, "#0D9488"),
    check: await iconPng(FaCheckCircle, "#10B981"),
    down: await iconPng(FaArrowDown, "#0D9488"),
    bolt: await iconPng(FaBolt, "#F59E0B"),
    bldg: await iconPng(FaBuilding, "#0D9488"),
    mic: await iconPng(FaMicrophone, "#0D9488"),
    wbank: await iconPng(FaUniversity, "#5EEAD4"),
    wchart: await iconPng(FaChartLine, "#5EEAD4"),
  };

  const pres = new pptxgen();
  pres.defineLayout({ name: "WIDE", width: SW, height: SH });
  pres.layout = "WIDE";
  pres.author = "Call Management";
  pres.title = "Propuesta ejecutiva: callcenter bancario moderno";
  pres.subject = "Reducción de costos, mejoras y beneficios con Grok Voice, SIP y CRM";

  const chartBase = {
    chartArea: { fill: { color: C.white } },
    plotArea: { fill: { color: C.white } },
    catAxisLabelColor: C.mute,
    valAxisLabelColor: C.mute,
    catAxisLabelFontFace: BF,
    valAxisLabelFontFace: BF,
    catAxisLabelFontSize: 11,
    valAxisLabelFontSize: 11,
    valGridLine: { color: C.line, size: 0.5 },
    catGridLine: { style: "none" },
    chartColors: [C.teal, C.navy, C.amber, C.mute],
  };

  function light() {
    const s = pres.addSlide();
    s.background = { color: C.bg };
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: SW, h: 0.08, fill: { color: C.teal }, line: { type: "none" },
    });
    return s;
  }
  function footer(s, n, note) {
    s.addText(note || "Call Management  ·  propuesta ejecutiva  ·  rangos ilustrativos, no ROI auditado", {
      x: L, y: 7.12, w: W - 0.8, h: 0.22,
      fontSize: 10, fontFace: BF, italic: true, color: C.mute, margin: 0,
    });
    s.addText(String(n).padStart(2, "0"), {
      x: SW - 1.05, y: 7.1, w: 0.5, h: 0.24,
      fontSize: 11, fontFace: HF, bold: true, color: C.teal, align: "right", margin: 0,
    });
  }
  function heading(s, kicker, title) {
    s.addText(kicker, {
      x: L, y: 0.22, w: W, h: 0.28,
      fontSize: 11, fontFace: HF, bold: true, color: C.teal, charSpacing: 2.2, margin: 0,
    });
    s.addText(title, {
      x: L, y: 0.48, w: W, h: 0.55,
      fontSize: 26, fontFace: HF, bold: true, color: C.navy, margin: 0,
    });
  }

  // ── 1 TITLE ──
  {
    const s = pres.addSlide();
    s.background = { color: C.navy };
    s.addShape(pres.shapes.OVAL, {
      x: 9.6, y: -1.4, w: 5.4, h: 5.4,
      fill: { color: "0F2A3F" }, line: { type: "none" },
    });
    s.addShape(pres.shapes.OVAL, {
      x: 10.6, y: 3.6, w: 3.8, h: 3.8,
      fill: { color: "143850" }, line: { type: "none" },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.14, h: SH, fill: { color: C.teal }, line: { type: "none" },
    });
    s.addImage({ data: ic.wbank, x: 0.7, y: 0.45, w: 0.4, h: 0.4 });
    s.addText("PROPUESTA EJECUTIVA  ·  CALLCENTER BANCARIO", {
      x: 1.22, y: 0.5, w: 10, h: 0.32,
      fontSize: 12, fontFace: HF, bold: true, color: C.tealL, charSpacing: 1.6, margin: 0,
    });
    s.addText("Menos costo de primera línea.\nMás control. Misma voz de marca.", {
      x: 0.7, y: 1.35, w: 9.4, h: 1.9,
      fontSize: 34, fontFace: HF, bold: true, color: C.white, margin: 0,
    });
    s.addText("Call Management atiende llamadas inbound por telefonía SIP con Grok Voice Think Fast 2.0, opera banking_support (identidad, cuenta, tarjeta) y deja rastro en CRM, supervisor y grabación.", {
      x: 0.7, y: 3.45, w: 8.6, h: 0.85,
      fontSize: 16, fontFace: BF, color: "CBD5E1", margin: 0,
    });
    const kpis = [
      { v: "−35 a −55%", l: "Costo relativo de primer nivel\n(rango ilustrativo vs. 100% humano)" },
      { v: "24/7", l: "Cobertura de voz sin\nabrir un segundo turno" },
      { v: "CRM 1:1", l: "Aislamiento por empresa\nsin mezclar clientes" },
    ];
    kpis.forEach((k, i) => {
      const x = 0.7 + i * 4.05;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 4.55, w: 3.85, h: 1.85, fill: { color: C.navy2 }, line: { type: "none" },
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 4.55, w: 0.08, h: 1.85, fill: { color: C.teal }, line: { type: "none" },
      });
      s.addText(k.v, {
        x: x + 0.28, y: 4.68, w: 3.4, h: 0.7,
        fontSize: 26, fontFace: HF, bold: true, color: C.tealL, margin: 0,
      });
      s.addText(k.l, {
        x: x + 0.28, y: 5.4, w: 3.4, h: 0.8,
        fontSize: 13, fontFace: BF, color: "94A3B8", margin: 0,
      });
    });
    s.addText("01", {
      x: SW - 1.1, y: 7.1, w: 0.55, h: 0.24,
      fontSize: 12, fontFace: HF, bold: true, color: C.teal, align: "right", margin: 0,
    });
  }

  // ── 2 PROBLEMA + doughnut ──
  {
    const s = light();
    heading(s, "EL PROBLEMA", "El callcenter bancario paga de más por trabajo repetible");
    s.addText("Hoy el costo se va a espera, repetición de datos, turnos extra y retrabajo. No a la conversación que sí requiere un humano.", {
      x: L, y: 1.08, w: 6.3, h: 0.5, fontSize: 14, fontFace: BF, color: C.mid, margin: 0,
    });
    const pains = [
      { ic: ic.head, t: "Colas y scripts", d: "IVR rígido. El caller se pierde antes de llegar a banca." },
      { ic: ic.id, t: "Identidad cara", d: "Rehacer KYC en cada llamada. Riesgo si se asume quién llama." },
      { ic: ic.clock, t: "Fuera de horario", d: "Un segundo turno humano es el renglón más caro del P&L." },
      { ic: ic.lock, t: "Sin rastro único", d: "Bloqueo de tarjeta y consulta no quedan en CRM + audio." },
    ];
    pains.forEach((p, i) => {
      const y = 1.65 + i * 1.2;
      s.addShape(pres.shapes.RECTANGLE, {
        x: L, y, w: 6.35, h: 1.08, fill: { color: C.card },
        line: { color: C.line, width: 1 }, shadow: shadow(),
      });
      s.addImage({ data: p.ic, x: L + 0.2, y: y + 0.32, w: 0.38, h: 0.38 });
      s.addText(p.t, {
        x: L + 0.72, y: y + 0.12, w: 5.4, h: 0.34,
        fontSize: 16, fontFace: HF, bold: true, color: C.navy, margin: 0,
      });
      s.addText(p.d, {
        x: L + 0.72, y: y + 0.5, w: 5.4, h: 0.42,
        fontSize: 13, fontFace: BF, color: C.mid, margin: 0,
      });
    });
    s.addText("DÓNDE SE VA EL MINUTO  ·  ilustrativo", {
      x: 7.2, y: 1.12, w: 5.5, h: 0.28,
      fontSize: 11, fontFace: HF, bold: true, color: C.teal, charSpacing: 1.2, margin: 0,
    });
    s.addChart(pres.charts.DOUGHNUT, [{
      name: "Minutos",
      labels: ["Espera / IVR", "Datos repetidos", "Fuera de horario", "Caso complejo"],
      values: [28, 22, 18, 32],
    }], {
      ...chartBase,
      x: 7.05, y: 1.4, w: 5.7, h: 4.55,
      showPercent: true, showLegend: true, legendPos: "b",
      legendColor: C.mid, legendFontSize: 11, legendFontFace: BF,
      chartColors: [C.amber, C.mute, C.red, C.teal],
    });
    footer(s, 2);
  }

  // ── 3 PROPUESTA ──
  {
    const s = light();
    heading(s, "LA PROPUESTA", "Call Management: voz, banca, CRM y control en un sistema");
    const cols = [
      { n: "01", t: "Telefonía SIP", d: "El DID entra por LiveKit. Un número no enrutado no se atiende. Admisión real de cupo." },
      { n: "02", t: "Grok Voice", d: "Think Fast 2.0. Escucha primero, una pregunta a la vez. 26 voces xAI para la marca." },
      { n: "03", t: "banking_support", d: "Identidad, cuenta BAC, tarjeta débito, bloqueo temporal, resumen de productos, escalación." },
      { n: "04", t: "Gobierno", d: "CRM aislado, supervisor, grabación Egress, RBAC, tope diario y 3 capas de concurrencia." },
    ];
    cols.forEach((c, i) => {
      const x = L + i * 3.1;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 1.25, w: 2.95, h: 5.5, fill: { color: C.card },
        line: { color: C.line, width: 1 }, shadow: shadow(),
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 1.25, w: 2.95, h: 0.1, fill: { color: C.teal }, line: { type: "none" },
      });
      s.addText(c.n, {
        x: x + 0.2, y: 1.55, w: 2.55, h: 0.45,
        fontSize: 20, fontFace: HF, bold: true, color: C.teal, margin: 0,
      });
      s.addText(c.t, {
        x: x + 0.2, y: 2.1, w: 2.55, h: 0.9,
        fontSize: 20, fontFace: HF, bold: true, color: C.navy, margin: 0,
      });
      s.addText(c.d, {
        x: x + 0.2, y: 3.15, w: 2.55, h: 3.2,
        fontSize: 15, fontFace: BF, color: C.mid, margin: 0,
      });
    });
    footer(s, 3);
  }

  // ── 4 FLUJO ──
  {
    const s = light();
    heading(s, "CÓMO OPERA", "De la marca del DID al especialista — con admisión, no con cola ficticia");
    const steps = [
      { n: "1", t: "Marca", d: "PSTN → LiveKit Phone o trunk SIP." },
      { n: "2", t: "Dispatch", d: "Worker call-management toma el job." },
      { n: "3", t: "Admisión", d: "Día calendario del tenant + 3 capas SQLite." },
      { n: "4", t: "Voz", d: "Grok Voice con idle, keyterms, replace, speed." },
      { n: "5", t: "Banca", d: "Handoff con overlay de instancia (voz + instrucciones)." },
    ];
    steps.forEach((st, i) => {
      const x = L + i * 2.48;
      s.addShape(pres.shapes.OVAL, {
        x: x + 0.88, y: 1.28, w: 0.5, h: 0.5, fill: { color: C.teal }, line: { type: "none" },
      });
      s.addText(st.n, {
        x: x + 0.88, y: 1.28, w: 0.5, h: 0.5,
        fontSize: 16, fontFace: HF, bold: true, color: C.white, align: "center", valign: "middle", margin: 0,
      });
      if (i < 4) {
        s.addShape(pres.shapes.RECTANGLE, {
          x: x + 1.45, y: 1.5, w: 1.8, h: 0.06, fill: { color: C.line }, line: { type: "none" },
        });
      }
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 2.05, w: 2.35, h: 4.55, fill: { color: C.card },
        line: { color: C.line, width: 1 }, shadow: shadow(),
      });
      s.addText(st.t, {
        x: x + 0.16, y: 2.25, w: 2.05, h: 0.55,
        fontSize: 18, fontFace: HF, bold: true, color: C.navy, margin: 0,
      });
      s.addText(st.d, {
        x: x + 0.16, y: 2.9, w: 2.05, h: 3.3,
        fontSize: 14, fontFace: BF, color: C.mid, margin: 0,
      });
    });
    footer(s, 4);
  }

  // ── 5 BANCA ──
  {
    const s = light();
    heading(s, "CAPACIDAD BANCARIA", "banking_support: identidad, cuenta, tarjeta y escalación");
    s.addText("Apertura: «BAC Credomatic, buenos días, ¿en qué le puedo ayudar?»  El agente no asume identidad. lookup_customer usa el teléfono que el caller dicta.", {
      x: L, y: 1.1, w: W, h: 0.42, fontSize: 14, fontFace: BF, color: C.mid, margin: 0,
    });
    const tools = [
      { t: "lookup_customer", d: "CRM del tenant con el teléfono dicho en voz." },
      { t: "verify_bac_account", d: "Últimos 4 de la cuenta. Nunca se recita el PAN completo." },
      { t: "verify_debit_card", d: "Últimos 4 del débito y vencimiento opcional." },
      { t: "block_debit_card_temporarily", d: "Bloqueo temporal con rastro en la llamada." },
      { t: "get_account_summary", d: "Productos después de verificar (ahorro, débito, sucursal)." },
      { t: "to_escalation", d: "Pasa a humano cuando el caso deja de ser primer nivel." },
    ];
    tools.forEach((t, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = L + col * 4.15;
      const y = 1.65 + row * 2.45;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 3.98, h: 2.25, fill: { color: C.card },
        line: { color: C.line, width: 1 }, shadow: shadow(),
      });
      s.addImage({ data: ic.check, x: x + 0.22, y: y + 0.28, w: 0.32, h: 0.32 });
      s.addText(t.t, {
        x: x + 0.64, y: y + 0.24, w: 3.15, h: 0.4,
        fontSize: 14, fontFace: HF, bold: true, color: C.navy, margin: 0,
      });
      s.addText(t.d, {
        x: x + 0.22, y: y + 0.85, w: 3.54, h: 1.15,
        fontSize: 15, fontFace: BF, color: C.mid, margin: 0,
      });
    });
    footer(s, 5);
  }

  // ── 6 REDUCCIÓN DE COSTOS (bar chart) ──
  {
    const s = light();
    heading(s, "REDUCCIÓN DE COSTOS", "Índice de costo de un minuto de primer nivel");
    s.addText("Modelo ilustrativo (base 100 = agente humano en sitio). No es un ROI auditado ni un precio de contrato.", {
      x: L, y: 1.08, w: W, h: 0.32, fontSize: 14, fontFace: BF, color: C.mid, margin: 0,
    });
    s.addChart(pres.charts.BAR, [{
      name: "Índice de costo",
      labels: ["100% humano", "Humano + IVR", "Híbrido voz + humano", "Voz 24/7 + escalación"],
      values: [100, 82, 58, 45],
    }], {
      ...chartBase,
      x: L, y: 1.4, w: 8.0, h: 5.3,
      barDir: "bar",
      showValue: true,
      dataLabelPosition: "outEnd",
      dataLabelColor: C.navy,
      dataLabelFontSize: 12,
      dataLabelFontFace: BF,
      showLegend: false,
      chartColors: [C.teal],
      valAxisMaxValue: 120,
    });
    const notes = [
      { t: "Qué baja el costo", d: "Menos minutos humanos en saldo, bloqueo, verificación y captura fuera de horario." },
      { t: "Qué no prometemos", d: "Eliminar el equipo. Los casos complejos y quejas van a escalación humana." },
      { t: "Palanca real", d: "Cubrir la cola repetible con Grok Voice y medir en supervisor + CRM." },
    ];
    notes.forEach((n, i) => {
      const y = 1.45 + i * 1.7;
      s.addShape(pres.shapes.RECTANGLE, {
        x: 8.7, y, w: 4.05, h: 1.55, fill: { color: C.card },
        line: { color: C.line, width: 1 }, shadow: shadow(),
      });
      s.addText(n.t, {
        x: 8.9, y: y + 0.15, w: 3.7, h: 0.38,
        fontSize: 15, fontFace: HF, bold: true, color: C.navy, margin: 0,
      });
      s.addText(n.d, {
        x: 8.9, y: y + 0.55, w: 3.7, h: 0.85,
        fontSize: 13, fontFace: BF, color: C.mid, margin: 0,
      });
    });
    footer(s, 6);
  }

  // ── 7 MIX + COBERTURA ──
  {
    const s = light();
    heading(s, "MEJORAS DE MIX", "Dónde trabaja el minuto cuando hay agente de voz");
    s.addText("Rango ilustrativo de operación bancaria de primer nivel. Calibrar con un piloto de 2–4 semanas.", {
      x: L, y: 1.08, w: W, h: 0.3, fontSize: 14, fontFace: BF, color: C.mid, margin: 0,
    });
    s.addChart(pres.charts.DOUGHNUT, [{
      name: "Mix",
      labels: ["Voz primer nivel", "Especialista humano", "Fuera de horario / captura", "Abandono / retrabajo"],
      values: [58, 24, 12, 6],
    }], {
      ...chartBase,
      x: L - 0.15, y: 1.3, w: 6.6, h: 5.4,
      showPercent: true, showLegend: true, legendPos: "b",
      legendColor: C.mid, legendFontSize: 12, legendFontFace: BF,
      chartColors: [C.teal, C.navy, C.amber, C.mute],
    });
    const mix = [
      { v: "55–70%", l: "Llamadas de saldo, bloqueo y verificación que puede cerrar banking_support" },
      { v: "1 línea", l: "DID bancario con instancia, voz e instrucciones de la empresa — no un default genérico" },
      { v: "0 cola falsa", l: "Si no hay cupo, admit_inbound_job rechaza el job. No se finge una espera" },
    ];
    mix.forEach((m, i) => {
      const y = 1.45 + i * 1.7;
      s.addShape(pres.shapes.RECTANGLE, {
        x: 6.85, y, w: 5.9, h: 1.55, fill: { color: C.card },
        line: { color: C.line, width: 1 }, shadow: shadow(),
      });
      s.addText(m.v, {
        x: 7.1, y: y + 0.18, w: 5.45, h: 0.5,
        fontSize: 22, fontFace: HF, bold: true, color: C.teal, margin: 0,
      });
      s.addText(m.l, {
        x: 7.1, y: y + 0.72, w: 5.45, h: 0.65,
        fontSize: 14, fontFace: BF, color: C.mid, margin: 0,
      });
    });
    footer(s, 7);
  }

  // ── 8 MEJORAS before/after bar ──
  {
    const s = light();
    heading(s, "MEJORAS OPERATIVAS", "Antes vs. con Call Management  ·  índice 100 = operación actual");
    s.addChart(pres.charts.BAR, [
      {
        name: "Hoy",
        labels: ["Tiempo de espera", "Retrabajo de datos", "Hueco fuera de horario", "Inconsistencia de guion"],
        values: [100, 100, 100, 100],
      },
      {
        name: "Con voz + admisión",
        labels: ["Tiempo de espera", "Retrabajo de datos", "Hueco fuera de horario", "Inconsistencia de guion"],
        values: [55, 40, 20, 25],
      },
    ], {
      ...chartBase,
      x: L, y: 1.2, w: 8.3, h: 5.5,
      barDir: "col",
      chartColors: [C.mute, C.teal],
      showLegend: true, legendPos: "b",
      legendColor: C.mid, legendFontSize: 12, legendFontFace: BF,
      showValue: true, dataLabelPosition: "outEnd",
      dataLabelColor: C.navy, dataLabelFontSize: 10, dataLabelFontFace: BF,
      valAxisMaxValue: 120,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 8.85, y: 1.25, w: 3.9, h: 5.4, fill: { color: C.navy }, line: { type: "none" },
    });
    s.addText("QUÉ MEJORA", {
      x: 9.1, y: 1.5, w: 3.45, h: 0.3,
      fontSize: 12, fontFace: HF, bold: true, color: C.tealL, charSpacing: 1.5, margin: 0,
    });
    const bullets = [
      "Menos espera: la voz contesta al instante si hay cupo.",
      "Menos retrabajo: lookup una vez, con el teléfono dictado.",
      "Menos hueco nocturno: captura y bloqueo sin abrir turno.",
      "Más consistencia: misma plantilla, overlay de la empresa.",
    ];
    bullets.forEach((b, i) => {
      s.addText(b, {
        x: 9.1, y: 2.05 + i * 1.05, w: 3.45, h: 0.95,
        fontSize: 14, fontFace: BF, color: C.white, margin: 0,
      });
    });
    footer(s, 8);
  }

  // ── 9 BENEFICIOS ──
  {
    const s = light();
    heading(s, "BENEFICIOS", "Lo que gana dirección, operaciones y cumplimiento");
    const bens = [
      { ic: ic.down, t: "Reducción de costos", d: "Menos FTE de primer nivel en consultas repetibles. El humano se reserva para excepciones." },
      { ic: ic.bolt, t: "Velocidad", d: "Respuesta inmediata en SIP cuando hay slot. Sin IVR de siete opciones." },
      { ic: ic.clock, t: "Cobertura", d: "Voz 24/7 para bloqueo y captura. El turno humano cubre lo complejo." },
      { ic: ic.shield, t: "Cumplimiento", d: "Grabación, transcript, webhook y CRM por llamada. Identidad no inventada." },
      { ic: ic.users, t: "Experiencia", d: "Español natural, una pregunta, voz de marca (26 voces xAI)." },
      { ic: ic.bldg, t: "Multi-empresa", d: "Varios bancos o marcas en un stack, CRM aislado, cupos independientes." },
    ];
    bens.forEach((b, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = L + col * 4.15;
      const y = 1.2 + row * 2.75;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 3.98, h: 2.55, fill: { color: C.card },
        line: { color: C.line, width: 1 }, shadow: shadow(),
      });
      s.addShape(pres.shapes.OVAL, {
        x: x + 0.22, y: y + 0.22, w: 0.5, h: 0.5, fill: { color: "ECFDF8" }, line: { type: "none" },
      });
      s.addImage({ data: b.ic, x: x + 0.32, y: y + 0.32, w: 0.3, h: 0.3 });
      s.addText(b.t, {
        x: x + 0.85, y: y + 0.28, w: 2.9, h: 0.4,
        fontSize: 16, fontFace: HF, bold: true, color: C.navy, margin: 0,
      });
      s.addText(b.d, {
        x: x + 0.22, y: y + 0.95, w: 3.54, h: 1.35,
        fontSize: 14, fontFace: BF, color: C.mid, margin: 0,
      });
    });
    footer(s, 9);
  }

  // ── 10 CONTROL ──
  {
    const s = light();
    heading(s, "CONTROL", "Supervisor, grabación, CRM y permisos desde el día uno");
    const rows = [
      { ic: ic.head, t: "Supervisor", d: "Llamadas activas, cola, alertas del worker, uso por empresa / agente / DID." },
      { ic: ic.mic, t: "Grabación SIP", d: "LiveKit Egress a MinIO/S3. Audio en la ficha cuando termina el egress." },
      { ic: ic.chart, t: "CRM y transcript", d: "Registro por tenant: turnos, notas, outcome, resumen post-llamada." },
      { ic: ic.lock, t: "RBAC + playground", d: "Roles y módulos. Lease de 30 min: el session_id no es un bearer token." },
    ];
    rows.forEach((r, i) => {
      const y = 1.2 + i * 1.35;
      s.addShape(pres.shapes.RECTANGLE, {
        x: L, y, w: W, h: 1.22, fill: { color: C.card },
        line: { color: C.line, width: 1 }, shadow: shadow(),
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: L, y, w: 0.1, h: 1.22, fill: { color: C.teal }, line: { type: "none" },
      });
      s.addImage({ data: r.ic, x: L + 0.35, y: y + 0.38, w: 0.42, h: 0.42 });
      s.addText(r.t, {
        x: L + 0.95, y: y + 0.16, w: 11, h: 0.38,
        fontSize: 18, fontFace: HF, bold: true, color: C.navy, margin: 0,
      });
      s.addText(r.d, {
        x: L + 0.95, y: y + 0.58, w: 11, h: 0.45,
        fontSize: 15, fontFace: BF, color: C.mid, margin: 0,
      });
    });
    footer(s, 10);
  }

  // ── 11 LÍMITES ──
  {
    const s = light();
    heading(s, "LÍMITES Y AISLAMIENTO", "El ahorro no puede romper el cupo ni mezclar bancos");
    const layers = [
      { k: "Empresa", v: "MAX_CONCURRENT_CALLS_PER_TENANT", d: "Slots SQLite compartidos entre procesos del worker." },
      { k: "Agente", v: "Máx. simultáneas de la instancia", d: "Banca puede tener un cupo distinto a recepción." },
      { k: "DID", v: "Máx. por número", d: "La línea bancaria no se satura a costa de otra." },
      { k: "Diario", v: "max_calls_per_day + timezone", d: "Día calendario de la empresa, no UTC a ciegas." },
    ];
    layers.forEach((row, i) => {
      const y = 1.2 + i * 1.35;
      s.addShape(pres.shapes.RECTANGLE, {
        x: L, y, w: 2.5, h: 1.22, fill: { color: C.navy }, line: { type: "none" },
      });
      s.addText(row.k, {
        x: L + 0.18, y, w: 2.15, h: 1.22,
        fontSize: 18, fontFace: HF, bold: true, color: C.white, valign: "middle", margin: 0,
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: L + 2.5, y, w: W - 2.5, h: 1.22, fill: { color: C.card },
        line: { color: C.line, width: 1 },
      });
      s.addText(row.v, {
        x: L + 2.75, y: y + 0.18, w: 9.3, h: 0.4,
        fontSize: 16, fontFace: HF, bold: true, color: C.navy, margin: 0,
      });
      s.addText(row.d, {
        x: L + 2.75, y: y + 0.62, w: 9.3, h: 0.42,
        fontSize: 14, fontFace: BF, color: C.mid, margin: 0,
      });
    });
    footer(s, 11);
  }

  // ── 12 ASK ──
  {
    const s = pres.addSlide();
    s.background = { color: C.navy };
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.14, h: SH, fill: { color: C.teal }, line: { type: "none" },
    });
    s.addText("SIGUIENTE PASO", {
      x: 0.7, y: 0.4, w: 8, h: 0.3,
      fontSize: 12, fontFace: HF, bold: true, color: C.tealL, charSpacing: 2, margin: 0,
    });
    s.addText("Autorizar un piloto de 30 días\ny medir costo, mix y calidad.", {
      x: 0.7, y: 0.85, w: 8.2, h: 1.5,
      fontSize: 28, fontFace: HF, bold: true, color: C.white, margin: 0,
    });
    const asks = [
      "DID de prueba + instancia banking_support activa.",
      "Playground xAI y LiveKit con operaciones y cumplimiento.",
      "Tablero: % cerrado por voz, escalaciones, grabaciones, cupos.",
      "Decisión de producción con horarios, voz de marca y webhooks.",
    ];
    asks.forEach((a, i) => {
      const y = 2.55 + i * 0.72;
      s.addShape(pres.shapes.OVAL, {
        x: 0.7, y: y + 0.05, w: 0.4, h: 0.4, fill: { color: C.teal }, line: { type: "none" },
      });
      s.addText(String(i + 1), {
        x: 0.7, y: y + 0.05, w: 0.4, h: 0.4,
        fontSize: 14, fontFace: HF, bold: true, color: C.white, align: "center", valign: "middle", margin: 0,
      });
      s.addText(a, {
        x: 1.28, y, w: 7.4, h: 0.5,
        fontSize: 16, fontFace: BF, color: "E2E8F0", valign: "middle", margin: 0,
      });
    });
    const side = [
      { v: "Piloto", l: "Una línea bancaria,\nun equipo de revisión" },
      { v: "KPI", l: "Costo/minuto, mix voz,\nNPS interno, incidentes" },
      { v: "Go", l: "Dirección autoriza\ny nombra un sponsor" },
    ];
    side.forEach((k, i) => {
      const y = 0.55 + i * 2.15;
      s.addShape(pres.shapes.RECTANGLE, {
        x: 9.15, y, w: 3.7, h: 2.0, fill: { color: C.navy2 }, line: { type: "none" },
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: 9.15, y, w: 0.08, h: 2.0, fill: { color: C.teal }, line: { type: "none" },
      });
      s.addText(k.v, {
        x: 9.45, y: y + 0.22, w: 3.2, h: 0.55,
        fontSize: 22, fontFace: HF, bold: true, color: C.tealL, margin: 0,
      });
      s.addText(k.l, {
        x: 9.45, y: y + 0.85, w: 3.2, h: 0.85,
        fontSize: 14, fontFace: BF, color: "94A3B8", margin: 0,
      });
    });
    s.addText("Call Management  ·  propuesta ejecutiva para callcenter bancario", {
      x: 0.7, y: 7.12, w: 8, h: 0.22,
      fontSize: 11, fontFace: BF, italic: true, color: C.mute, margin: 0,
    });
    s.addText("12", {
      x: SW - 1.1, y: 7.1, w: 0.55, h: 0.24,
      fontSize: 12, fontFace: HF, bold: true, color: C.teal, align: "right", margin: 0,
    });
  }

  await pres.writeFile({ fileName: "docs/Propuesta_Callcenter_Bancario.pptx" });
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
