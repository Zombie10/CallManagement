const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaPhoneAlt,
  FaUniversity,
  FaShieldAlt,
  FaHeadset,
  FaIdCard,
  FaLock,
  FaUserCheck,
  FaMicrophone,
  FaBuilding,
  FaClipboardCheck,
} = require("react-icons/fa");

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}
async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

const D_BG = "080808";
const D_PANEL = "141414";
const D_CARD = "1A1A1A";
const D_TEXT = "F8F8F8";
const D_LIGHT = "C8C8C8";
const D_MUTED = "808080";
const D_DIM = "5A5A5A";
const D_RULE = "2A2A2A";

const L_BG = "F8F8F8";
const L_CARD = "FFFFFF";
const L_TEXT = "080808";
const L_SUBTEXT = "333333";
const L_MUTED = "6C6C6C";
const L_RULE = "D8D8D8";
const L_BORDER = "E5E5E5";

const ACCENT = "EE322F";

const HFONT = "Arial Black";
const SFONT = "Arial";
const BFONT = "Arial";

const SW = 13.3;
const SH = 7.5;
const ML = 0.6;
const CW = SW - ML - 0.6;

let PRES;

const THEME_DARK = {
  bg: D_BG, panel: D_PANEL, card: D_CARD,
  text: D_TEXT, subtext: D_LIGHT, muted: D_MUTED, dim: D_DIM,
  rule: D_RULE, border: D_RULE,
};
const THEME_LIGHT = {
  bg: L_BG, panel: L_CARD, card: L_CARD,
  text: L_TEXT, subtext: L_SUBTEXT, muted: L_MUTED, dim: "A0A0A0",
  rule: L_RULE, border: L_BORDER,
};

function addRule(slide, x, y, w, color) {
  slide.addShape(PRES.shapes.RECTANGLE, {
    x, y, w, h: 0.015, fill: { color }, line: { type: "none" },
  });
}

function addSlideHeader(slide, T, sectionLabel, subtitle) {
  slide.addText(sectionLabel, {
    x: ML, y: 0.3, w: CW, h: 0.25,
    fontSize: 10, fontFace: SFONT, bold: true, color: ACCENT,
    charSpacing: 3, align: "left", margin: 0,
  });
  if (typeof subtitle === "string") {
    slide.addText(subtitle, {
      x: ML, y: 0.55, w: CW, h: 0.7,
      fontSize: 22, fontFace: HFONT, color: T.text, align: "left", margin: 0,
      lineSpacingMultiple: 1.1,
    });
  } else {
    slide.addText(subtitle, {
      x: ML, y: 0.55, w: CW, h: 0.7,
      align: "left", margin: 0, lineSpacingMultiple: 1.1,
    });
  }
  addRule(slide, ML, 1.3, CW, T.rule);
}

function addKeyTakeaway(slide, T, text) {
  const ty = 6.55;
  slide.addShape(PRES.shapes.RECTANGLE, {
    x: ML, y: ty, w: CW, h: 0.5, fill: { color: T.card }, line: { type: "none" },
  });
  slide.addShape(PRES.shapes.RECTANGLE, {
    x: ML, y: ty, w: 0.05, h: 0.5, fill: { color: ACCENT }, line: { type: "none" },
  });
  slide.addText([
    { text: "CLAVE  ", options: { bold: true, fontSize: 9, fontFace: SFONT, color: ACCENT, charSpacing: 2 } },
    { text, options: { fontSize: 9.5, fontFace: BFONT, color: T.subtext } },
  ], {
    x: ML + 0.2, y: ty, w: CW - 0.3, h: 0.5,
    align: "left", valign: "middle", margin: 0,
  });
}

function addSource(slide, T, text, pageNum) {
  slide.addText(text, {
    x: ML, y: 7.15, w: CW - 0.5, h: 0.25,
    fontSize: 7.5, fontFace: BFONT, italic: true, color: T.muted, align: "left", margin: 0,
  });
  slide.addText(String(pageNum).padStart(2, "0"), {
    x: SW - ML - 0.4, y: 7.15, w: 0.4, h: 0.25,
    fontSize: 8, fontFace: SFONT, bold: true, color: ACCENT, align: "right", margin: 0,
  });
}

function addStatCallout(slide, T, x, y, w, h, value, label) {
  slide.addShape(PRES.shapes.RECTANGLE, {
    x, y, w: 0.05, h, fill: { color: ACCENT }, line: { type: "none" },
  });
  slide.addText(value, {
    x: x + 0.2, y: y + 0.02, w: w - 0.3, h: h * 0.55,
    fontSize: 28, fontFace: HFONT, color: T.text, align: "left", valign: "bottom", margin: 0,
  });
  slide.addText(label, {
    x: x + 0.2, y: y + h * 0.58, w: w - 0.3, h: h * 0.4,
    fontSize: 11, fontFace: BFONT, color: T.muted, align: "left", valign: "top", margin: 0,
    lineSpacingMultiple: 1.2,
  });
}

async function buildDeck() {
  const icoNavy = await iconToBase64Png(FaUniversity, "#080808", 256);
  const icoPhone = await iconToBase64Png(FaPhoneAlt, "#EE322F", 256);
  const icoMic = await iconToBase64Png(FaMicrophone, "#EE322F", 256);
  const icoId = await iconToBase64Png(FaIdCard, "#EE322F", 256);
  const icoShield = await iconToBase64Png(FaShieldAlt, "#EE322F", 256);
  const icoHeadset = await iconToBase64Png(FaHeadset, "#EE322F", 256);
  const icoLock = await iconToBase64Png(FaLock, "#EE322F", 256);
  const icoCheck = await iconToBase64Png(FaUserCheck, "#EE322F", 256);
  const icoBldg = await iconToBase64Png(FaBuilding, "#EE322F", 256);
  const icoClip = await iconToBase64Png(FaClipboardCheck, "#EE322F", 256);
  const icoWhite = await iconToBase64Png(FaUniversity, "#F8F8F8", 256);

  const pres = new pptxgen();
  PRES = pres;
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Call Management";
  pres.title = "Propuesta ejecutiva: callcenter bancario";
  pres.subject = "Call Management — agentes de voz Grok Voice, telefonía SIP y CRM aislado";

  const T1 = THEME_DARK;
  const s1 = pres.addSlide();
  s1.background = { color: T1.bg };

  s1.addShape(PRES.shapes.RECTANGLE, {
    x: 8.0, y: 0, w: 5.3, h: SH, fill: { color: T1.panel }, line: { type: "none" },
  });

  s1.addText("PROPUESTA EJECUTIVA  ·  CALLCENTER BANCARIO", {
    x: ML, y: 1.0, w: 7.1, h: 0.3,
    fontSize: 10, fontFace: SFONT, bold: true, color: ACCENT, charSpacing: 2, align: "left", margin: 0,
  });
  addRule(s1, ML, 1.35, 2.5, ACCENT);

  s1.addText("Agentes de voz\npara la primera\nlínea bancaria", {
    x: ML, y: 1.55, w: 7.1, h: 3.2,
    fontSize: 40, fontFace: HFONT, color: T1.text, align: "left", valign: "top",
    margin: 0, lineSpacingMultiple: 1.05,
  });

  s1.addText("Call Management atiende llamadas inbound por telefonía SIP con Grok Voice Think Fast 2.0, enruta al especialista bancario y deja rastro en CRM, supervisor y grabación.", {
    x: ML, y: 4.9, w: 6.8, h: 1.05,
    fontSize: 14, fontFace: BFONT, color: T1.subtext, align: "left", margin: 0, lineSpacingMultiple: 1.3,
  });

  addRule(s1, ML, 6.1, 2.0, T1.rule);
  s1.addText("Call Management  ·  confidencial para dirección", {
    x: ML, y: 6.3, w: 6.5, h: 0.35,
    fontSize: 11, fontFace: SFONT, bold: true, color: T1.muted, align: "left", margin: 0,
  });

  addStatCallout(s1, T1, 8.4, 0.85, 4.5, 1.15, "2.0", "Grok Voice Think Fast\nen la sesión de voz");
  addStatCallout(s1, T1, 8.4, 2.2, 4.5, 1.15, "26", "Voces xAI para marcar\nla línea de la empresa");
  addStatCallout(s1, T1, 8.4, 3.55, 4.5, 1.15, "6", "Plantillas de agente\nincluye banking_support");
  addStatCallout(s1, T1, 8.4, 4.9, 4.5, 1.15, "1:1", "CRM aislado por empresa\nsin mezclar clientes");

  s1.addText("Capacidades del sistema en producción. Sin cifras de mercado inventadas.", {
    x: 8.4, y: 6.9, w: 4.4, h: 0.25,
    fontSize: 8, fontFace: BFONT, italic: true, color: T1.muted, align: "left", margin: 0,
  });
  s1.addText("01", {
    x: SW - 0.85, y: 6.9, w: 0.35, h: 0.25,
    fontSize: 8, fontFace: SFONT, bold: true, color: ACCENT, align: "right", margin: 0,
  });

  const T = THEME_LIGHT;

  const s2 = pres.addSlide();
  s2.background = { color: T.bg };
  addSlideHeader(s2, T, "EL PROBLEMA", [
    { text: "El callcenter bancario se rompe en la ", options: { fontSize: 22, fontFace: HFONT, color: T.text } },
    { text: "primera línea", options: { fontSize: 22, fontFace: HFONT, color: ACCENT } },
  ]);

  const pains = [
    { ico: icoHeadset, t: "Colas y scripts rígidos", d: "El cliente espera o recorre un IVR. El agente lee un cuestionario. Se pierde el motivo de la llamada." },
    { ico: icoId, t: "Identidad mal resuelta", d: "Asumir quién llama es un riesgo. Pedir datos de más, también. Hay que verificar cuenta y tarjeta sin exponer PAN completo." },
    { ico: icoLock, t: "Cumplimiento y rastro", d: "Bloqueo de tarjeta, consulta de productos y escalación deben quedar en CRM, grabación y supervisor — no en un cuaderno." },
    { ico: icoBldg, t: "Varias empresas, un mismo stack", d: "Un orquestador no puede mezclar clientes entre bancos o sucursales. El CRM y los cupos tienen que estar aislados." },
  ];
  pains.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = ML + col * 6.15;
    const y = 1.55 + row * 2.25;
    s2.addShape(PRES.shapes.RECTANGLE, {
      x, y, w: 5.95, h: 2.05, fill: { color: T.card }, line: { color: T.border, width: 0.5 },
    });
    s2.addShape(PRES.shapes.RECTANGLE, {
      x, y, w: 0.08, h: 2.05, fill: { color: ACCENT }, line: { type: "none" },
    });
    s2.addImage({ data: p.ico, x: x + 0.3, y: y + 0.28, w: 0.38, h: 0.38 });
    s2.addText(p.t, {
      x: x + 0.8, y: y + 0.28, w: 4.85, h: 0.4,
      fontSize: 16, fontFace: SFONT, bold: true, color: T.text, valign: "middle", margin: 0,
    });
    s2.addText(p.d, {
      x: x + 0.3, y: y + 0.85, w: 5.35, h: 0.95,
      fontSize: 13, fontFace: BFONT, color: T.subtext, margin: 0, lineSpacingMultiple: 1.3,
    });
  });
  addKeyTakeaway(s2, T, "La dirección no necesita otro chatbot: necesita una primera línea de voz que identifique, opere y deje evidencia.");
  addSource(s2, T, "Fuente: operación típica de centro de contacto bancario frente a las capacidades de Call Management.", 2);

  const s3 = pres.addSlide();
  s3.background = { color: T.bg };
  addSlideHeader(s3, T, "LA PROPUESTA", [
    { text: "Call Management: ", options: { fontSize: 22, fontFace: HFONT, color: T.text } },
    { text: "sistema de callcenter bancario", options: { fontSize: 22, fontFace: HFONT, color: ACCENT } },
    { text: " con voz, CRM y control", options: { fontSize: 22, fontFace: HFONT, color: T.text } },
  ]);

  const pillars = [
    { n: "01", t: "Telefonía inbound", d: "El cliente marca el DID. LiveKit SIP entrega la llamada al worker call-management. Un DID no enrutado no se atiende." },
    { n: "02", t: "Agente de voz Grok", d: "Grok Voice Think Fast 2.0 habla con estilo telefónico: escucha primero, una pregunta a la vez, frases cortas." },
    { n: "03", t: "Línea bancaria", d: "La plantilla banking_support (BAC Credomatic) verifica cuenta y tarjeta, bloquea débito de forma temporal y resume productos." },
    { n: "04", t: "Gobierno operativo", d: "CRM por empresa, supervisor en tiempo real, grabación Egress, roles y módulos, tope diario y cupos concurrentes." },
  ];
  pillars.forEach((p, i) => {
    const x = ML + i * 3.05;
    s3.addShape(PRES.shapes.RECTANGLE, {
      x, y: 1.55, w: 2.9, h: 4.55, fill: { color: T.card }, line: { color: T.border, width: 0.5 },
    });
    s3.addShape(PRES.shapes.RECTANGLE, {
      x, y: 1.55, w: 2.9, h: 0.06, fill: { color: ACCENT }, line: { type: "none" },
    });
    s3.addText(p.n, {
      x: x + 0.18, y: 1.8, w: 2.5, h: 0.4,
      fontSize: 18, fontFace: HFONT, color: ACCENT, margin: 0,
    });
    s3.addText(p.t, {
      x: x + 0.18, y: 2.3, w: 2.55, h: 0.85,
      fontSize: 16, fontFace: SFONT, bold: true, color: T.text, margin: 0,
    });
    s3.addText(p.d, {
      x: x + 0.18, y: 3.25, w: 2.55, h: 2.5,
      fontSize: 13, fontFace: BFONT, color: T.subtext, margin: 0, lineSpacingMultiple: 1.3,
    });
  });
  addKeyTakeaway(s3, T, "No es un piloto de IA genérica: es el mismo sistema que ya opera telefonía, voz, CRM y supervisión.");
  addSource(s3, T, "Fuente: Call Management — README, AGENTS.md, TELEPHONY.md.", 3);

  const s4 = pres.addSlide();
  s4.background = { color: T.bg };
  addSlideHeader(s4, T, "OPERACIÓN DE LA LLAMADA", "Del celular al especialista bancario, con admisión real");

  const steps = [
    { n: "1", t: "Marca DID", d: "PSTN entra por LiveKit Phone o trunk SIP." },
    { n: "2", t: "Dispatch", d: "La regla apunta al worker call-management." },
    { n: "3", t: "Admisión", d: "Cupo diario (zona de la empresa) y 3 capas de concurrencia." },
    { n: "4", t: "Voz Grok", d: "RealtimeModel con idle, keyterms, replace, speed y resumption." },
    { n: "5", t: "Handoff", d: "Recepción o banca con overlay de instancia: voz e instrucciones de la empresa." },
  ];
  steps.forEach((st, i) => {
    const x = ML + i * 2.44;
    s4.addShape(PRES.shapes.OVAL, {
      x: x + 0.85, y: 1.55, w: 0.48, h: 0.48, fill: { color: ACCENT }, line: { type: "none" },
    });
    s4.addText(st.n, {
      x: x + 0.85, y: 1.55, w: 0.48, h: 0.48,
      fontSize: 16, fontFace: HFONT, color: "FFFFFF", align: "center", valign: "middle", margin: 0,
    });
    if (i < steps.length - 1) {
      s4.addShape(PRES.shapes.RECTANGLE, {
        x: x + 1.4, y: 1.76, w: 1.75, h: 0.04, fill: { color: T.rule }, line: { type: "none" },
      });
    }
    s4.addShape(PRES.shapes.RECTANGLE, {
      x, y: 2.25, w: 2.3, h: 3.85, fill: { color: T.card }, line: { color: T.border, width: 0.5 },
    });
    s4.addText(st.t, {
      x: x + 0.14, y: 2.45, w: 2.02, h: 0.7,
      fontSize: 15, fontFace: SFONT, bold: true, color: T.text, margin: 0,
    });
    s4.addText(st.d, {
      x: x + 0.14, y: 3.2, w: 2.02, h: 2.6,
      fontSize: 13, fontFace: BFONT, color: T.subtext, margin: 0, lineSpacingMultiple: 1.3,
    });
  });
  addKeyTakeaway(s4, T, "Si el diario o una capa está llena, admit_inbound_job rechaza el job: no se abre una sesión fingida de “está en cola”.");
  addSource(s4, T, "Fuente: server.py, tenancy/queue.py, FLUJOS_OPERATIVOS.md.", 4);

  const s5 = pres.addSlide();
  s5.background = { color: T.bg };
  addSlideHeader(s5, T, "CAPACIDAD BANCARIA", [
    { text: "banking_support: ", options: { fontSize: 22, fontFace: HFONT, color: T.text } },
    { text: "identidad, cuenta, tarjeta y escalación", options: { fontSize: 22, fontFace: HFONT, color: ACCENT } },
  ]);

  s5.addText("Apertura en español: «BAC Credomatic, buenos días, ¿en qué le puedo ayudar?»  El agente no asume la identidad al conectar. El CRM se consulta cuando el caller dicta el teléfono.", {
    x: ML, y: 1.5, w: CW, h: 0.55,
    fontSize: 13, fontFace: BFONT, color: T.subtext, margin: 0, lineSpacingMultiple: 1.25,
  });

  const tools = [
    { t: "lookup_customer", d: "Busca al cliente en el CRM del tenant con el teléfono que el caller dice." },
    { t: "verify_bac_account", d: "Verifica los últimos 4 dígitos de la cuenta BAC. No se recita el número completo." },
    { t: "verify_debit_card", d: "Últimos 4 de la tarjeta débito y vencimiento opcional." },
    { t: "block_debit_card_temporarily", d: "Bloqueo temporal ante compra sospechosa o extravío, con rastro en la llamada." },
    { t: "get_account_summary", d: "Resumen de productos después de la verificación (ahorro, débito, sucursal)." },
    { t: "to_escalation", d: "Pasa a supervisor humano o cola de escalación cuando el caso lo exige." },
  ];
  tools.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = ML + col * 4.1;
    const y = 2.2 + row * 1.95;
    s5.addShape(PRES.shapes.RECTANGLE, {
      x, y, w: 3.95, h: 1.8, fill: { color: T.card }, line: { color: T.border, width: 0.5 },
    });
    s5.addImage({ data: icoCheck, x: x + 0.18, y: y + 0.2, w: 0.28, h: 0.28 });
    s5.addText(item.t, {
      x: x + 0.55, y: y + 0.16, w: 3.2, h: 0.36,
      fontSize: 13, fontFace: SFONT, bold: true, color: T.text, valign: "middle", margin: 0,
    });
    s5.addText(item.d, {
      x: x + 0.18, y: y + 0.6, w: 3.6, h: 1.0,
      fontSize: 12, fontFace: BFONT, color: T.subtext, margin: 0, lineSpacingMultiple: 1.25,
    });
  });
  addKeyTakeaway(s5, T, "La voz nunca expone PAN completo. Identidad, cuenta y tarjeta se tratan como herramientas de operación, no como charla.");
  addSource(s5, T, "Fuente: AGENTS.md y crm/banking_data.py (escenario BAC Credomatic).", 5);

  const s6 = pres.addSlide();
  s6.background = { color: T.bg };
  addSlideHeader(s6, T, "CONTROL Y EVIDENCIA", "Lo que dirección y cumplimiento pueden ver el mismo día");

  const controls = [
    { ico: icoHeadset, t: "Supervisor", d: "Llamadas activas, cola, alertas del worker y uso por empresa, agente y DID." },
    { ico: icoMic, t: "Grabación SIP", d: "LiveKit Egress a MinIO/S3. Audio en la ficha de la llamada cuando termina el egress." },
    { ico: icoClip, t: "CRM y transcript", d: "Registro por tenant: turnos, notas, outcome y resumen post-llamada opcional." },
    { ico: icoShield, t: "RBAC", d: "Roles super_admin, admin, viewer, playground. Módulos: llamadas, análisis, auditoría, claves API." },
  ];
  controls.forEach((c, i) => {
    const y = 1.5 + i * 1.15;
    s6.addShape(PRES.shapes.RECTANGLE, {
      x: ML, y, w: CW, h: 1.05, fill: { color: T.card }, line: { color: T.border, width: 0.5 },
    });
    s6.addShape(PRES.shapes.RECTANGLE, {
      x: ML, y, w: 0.08, h: 1.05, fill: { color: ACCENT }, line: { type: "none" },
    });
    s6.addImage({ data: c.ico, x: ML + 0.3, y: y + 0.32, w: 0.38, h: 0.38 });
    s6.addText(c.t, {
      x: ML + 0.85, y: y + 0.12, w: 10.5, h: 0.35,
      fontSize: 16, fontFace: SFONT, bold: true, color: T.text, margin: 0,
    });
    s6.addText(c.d, {
      x: ML + 0.85, y: y + 0.5, w: 10.5, h: 0.42,
      fontSize: 13, fontFace: BFONT, color: T.subtext, margin: 0,
    });
  });
  addKeyTakeaway(s6, T, "Cada interacción queda en CRM aislado, con audio y permisos. El playground no es un token suelto: lease de 30 minutos por usuario y empresa.");
  addSource(s6, T, "Fuente: ADMIN.md, TELEPHONY.md (grabación), playground_sessions.py.", 6);

  const s7 = pres.addSlide();
  s7.background = { color: T.bg };
  addSlideHeader(s7, T, "AISLAMIENTO Y LÍMITES", [
    { text: "Una plataforma, ", options: { fontSize: 22, fontFace: HFONT, color: T.text } },
    { text: "muchas empresas sin mezclar datos", options: { fontSize: 22, fontFace: HFONT, color: ACCENT } },
  ]);

  const layers = [
    { k: "Empresa", v: "MAX_CONCURRENT_CALLS_PER_TENANT", d: "Tope global de simultáneas. Slots en SQLite (platform.db), compartidos entre procesos del worker." },
    { k: "Agente", v: "Máx. simultáneas de la instancia", d: "Banca puede tener un cupo distinto a recepción. Se configura en Mis agentes." },
    { k: "DID", v: "Máx. por número", d: "La línea bancaria no se satura a costa de otra. Vacío = solo aplica el tope de empresa." },
    { k: "Diario", v: "max_calls_per_day + timezone", d: "El día es el calendario de la empresa (p. ej. America/Guatemala), no UTC a ciegas." },
  ];
  layers.forEach((L, i) => {
    const y = 1.5 + i * 1.15;
    s7.addShape(PRES.shapes.RECTANGLE, {
      x: ML, y, w: 2.4, h: 1.05, fill: { color: "080808" }, line: { type: "none" },
    });
    s7.addText(L.k, {
      x: ML + 0.15, y, w: 2.1, h: 1.05,
      fontSize: 16, fontFace: HFONT, color: "F8F8F8", align: "left", valign: "middle", margin: 0,
    });
    s7.addShape(PRES.shapes.RECTANGLE, {
      x: ML + 2.4, y, w: 9.7, h: 1.05, fill: { color: T.card }, line: { color: T.border, width: 0.5 },
    });
    s7.addText(L.v, {
      x: ML + 2.6, y: y + 0.12, w: 9.3, h: 0.35,
      fontSize: 14, fontFace: SFONT, bold: true, color: T.text, margin: 0,
    });
    s7.addText(L.d, {
      x: ML + 2.6, y: y + 0.5, w: 9.3, h: 0.42,
      fontSize: 12, fontFace: BFONT, color: T.subtext, margin: 0,
    });
  });
  addKeyTakeaway(s7, T, "CRM en data/tenants/{id}/crm.db. DID desconocido falla cerrado. Sin cupo: el job se descarta, no se sirve.");
  addSource(s7, T, "Fuente: tenancy/queue.py, calendar_day.py, context.resolve_dispatch.", 7);

  const s8 = pres.addSlide();
  s8.background = { color: T.bg };
  addSlideHeader(s8, T, "ARQUITECTURA DE NEGOCIO", "Piezas que ve dirección — no un diagrama de clases");

  const arch = [
    { ico: icoPhone, t: "Cliente", d: "Marca el DID de la empresa o prueba en playground." },
    { ico: icoMic, t: "LiveKit + Grok Voice", d: "Sala SIP o WebSocket. El worker habla con Think Fast 2.0." },
    { ico: icoCheck, t: "Agentes", d: "Recepción, banca, soporte, ventas, técnico, escalación." },
    { ico: icoBldg, t: "Empresa", d: "Instancia, voz, DID, horario, CRM propio, webhooks y API keys." },
    { ico: icoHeadset, t: "Admin", d: "Supervisor, registros, análisis, Flujos / Operación, usuarios." },
  ];
  arch.forEach((a, i) => {
    const x = ML + i * 2.44;
    s8.addShape(PRES.shapes.RECTANGLE, {
      x, y: 1.55, w: 2.3, h: 4.5, fill: { color: T.card }, line: { color: T.border, width: 0.5 },
    });
    s8.addShape(PRES.shapes.OVAL, {
      x: x + 0.75, y: 1.85, w: 0.8, h: 0.8, fill: { color: "080808" }, line: { type: "none" },
    });
    s8.addImage({ data: a.ico, x: x + 0.95, y: 2.05, w: 0.4, h: 0.4 });
    s8.addText(a.t, {
      x: x + 0.12, y: 2.85, w: 2.06, h: 0.7,
      fontSize: 15, fontFace: SFONT, bold: true, color: T.text, align: "center", margin: 0,
    });
    s8.addText(a.d, {
      x: x + 0.14, y: 3.6, w: 2.02, h: 2.1,
      fontSize: 13, fontFace: BFONT, color: T.subtext, align: "center", margin: 0, lineSpacingMultiple: 1.3,
    });
  });
  addKeyTakeaway(s8, T, "El staff opera en /callmgmt. El cliente nunca entra al admin: entra por el teléfono o por una prueba controlada.");
  addSource(s8, T, "Fuente: README.md y FLUJOS_OPERATIVOS.md.", 8);

  const s9 = pres.addSlide();
  s9.background = { color: T.bg };
  addSlideHeader(s9, T, "RESULTADO OPERATIVO", [
    { text: "Lo que gana el callcenter ", options: { fontSize: 22, fontFace: HFONT, color: T.text } },
    { text: "sin inventar un ROI", options: { fontSize: 22, fontFace: HFONT, color: ACCENT } },
  ]);

  const outcomes = [
    { t: "Primera línea siempre lista", d: "La recepción o la banca contestan con la voz e instrucciones de la instancia de la empresa, no con un default genérico." },
    { t: "Misma calidad en cada llamada", d: "Estilo telefónico compartido: escuchar, una pregunta, no inventar identidad, confirmar solo lo irreversible." },
    { t: "Evidencia para auditoría", d: "Transcript, grabación, webhook call.started / call.ended / agent.handoff y ficha de cliente unificada." },
    { t: "Tope de riesgo operativo", d: "Cupos por empresa, agente y DID. Día calendario local. Job rechazado cuando no hay capacidad real." },
    { t: "Pruebas sin quemar el DID", d: "Playground xAI (browser) o LiveKit producción. Sesiones atadas al usuario; otro operador no usa el id ajeno." },
    { t: "Varias marcas, un stack", d: "Orquestador multi-empresa con branding, DID y CRM propios. Plantillas globales; instancias locales." },
  ];
  outcomes.forEach((o, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = ML + col * 4.1;
    const y = 1.5 + row * 2.3;
    s9.addShape(PRES.shapes.RECTANGLE, {
      x, y, w: 3.95, h: 2.15, fill: { color: T.card }, line: { color: T.border, width: 0.5 },
    });
    s9.addText(String(i + 1).padStart(2, "0"), {
      x: x + 0.2, y: y + 0.18, w: 3.5, h: 0.3,
      fontSize: 12, fontFace: HFONT, color: ACCENT, margin: 0,
    });
    s9.addText(o.t, {
      x: x + 0.2, y: y + 0.5, w: 3.55, h: 0.5,
      fontSize: 15, fontFace: SFONT, bold: true, color: T.text, margin: 0,
    });
    s9.addText(o.d, {
      x: x + 0.2, y: y + 1.05, w: 3.55, h: 0.9,
      fontSize: 12, fontFace: BFONT, color: T.subtext, margin: 0, lineSpacingMultiple: 1.25,
    });
  });
  addKeyTakeaway(s9, T, "El valor es operativo y de control: atender, verificar, registrar y limitar. Cualquier ahorro de headcount es consecuencia, no la tesis.");
  addSource(s9, T, "Fuente: capacidades ya desplegadas del producto; no hay tabla de precio ni retorno proyectado.", 9);

  const T10 = THEME_DARK;
  const s10 = pres.addSlide();
  s10.background = { color: T10.bg };
  s10.addShape(PRES.shapes.RECTANGLE, {
    x: 8.5, y: 0, w: 4.8, h: SH, fill: { color: T10.panel }, line: { type: "none" },
  });
  s10.addImage({ data: icoWhite, x: ML, y: 0.45, w: 0.42, h: 0.42 });
  s10.addText("SIGUIENTE PASO", {
    x: ML + 0.55, y: 0.5, w: 7.0, h: 0.35,
    fontSize: 10, fontFace: SFONT, bold: true, color: ACCENT, charSpacing: 3, margin: 0,
  });
  addRule(s10, ML, 1.0, 2.5, ACCENT);

  s10.addText("Autorizar un piloto\nde callcenter bancario\nsobre Call Management", {
    x: ML, y: 1.2, w: 7.5, h: 2.3,
    fontSize: 28, fontFace: HFONT, color: T10.text, margin: 0, lineSpacingMultiple: 1.08,
  });

  const asks = [
    { n: "1", t: "DID de prueba + instancia banking_support activa en Mis agentes." },
    { n: "2", t: "Playground xAI y LiveKit con el equipo de operaciones y cumplimiento." },
    { n: "3", t: "Supervisor, registros y grabación revisados en un set de llamadas reales." },
    { n: "4", t: "Decisión de producción: horarios, cupos, voz de marca y webhooks al core." },
  ];
  asks.forEach((a, i) => {
    const y = 3.6 + i * 0.7;
    s10.addShape(PRES.shapes.OVAL, {
      x: ML, y: y + 0.05, w: 0.36, h: 0.36, fill: { color: ACCENT }, line: { type: "none" },
    });
    s10.addText(a.n, {
      x: ML, y: y + 0.05, w: 0.36, h: 0.36,
      fontSize: 12, fontFace: HFONT, color: "FFFFFF", align: "center", valign: "middle", margin: 0,
    });
    s10.addText(a.t, {
      x: ML + 0.5, y, w: 7.3, h: 0.5,
      fontSize: 14, fontFace: BFONT, color: T10.subtext, valign: "middle", margin: 0,
    });
  });

  addStatCallout(s10, T10, 8.85, 0.7, 4.1, 1.25, "Piloto", "Una línea, un agente bancario,\nun equipo de revisión");
  addStatCallout(s10, T10, 8.85, 2.2, 4.1, 1.25, "Control", "CRM, supervisor, audio\ny RBAC desde el día uno");
  addStatCallout(s10, T10, 8.85, 3.7, 4.1, 1.25, "Escala", "Más DID e instancias\nsin mezclar empresas");
  addStatCallout(s10, T10, 8.85, 5.2, 4.1, 1.25, "Ahora", "Dirección autoriza el piloto\ny nombra un sponsor");

  s10.addText("Call Management  ·  propuesta ejecutiva para callcenter bancario", {
    x: ML, y: 7.15, w: 7.5, h: 0.22,
    fontSize: 9, fontFace: BFONT, italic: true, color: T10.muted, margin: 0,
  });
  s10.addText("10", {
    x: SW - 0.85, y: 7.15, w: 0.35, h: 0.22,
    fontSize: 8, fontFace: SFONT, bold: true, color: ACCENT, align: "right", margin: 0,
  });

  await pres.writeFile({ fileName: "docs/Propuesta_Callcenter_Bancario.pptx" });
}

buildDeck().catch((err) => {
  console.error(err);
  process.exit(1);
});
