/* Import of lab reports (PDF or photo): text extraction, OCR fallback, parsing into calculator values.
   Everything runs in the viewer's browser; the file is never sent anywhere. */
(function () {
'use strict';

const LIB = {
  pdf: 'lib/pdf.min.js',
  pdfWorker: 'lib/pdf.worker.min.js',
  tess: 'lib/tesseract/tesseract.min.js',
  tessWorker: 'lib/tesseract/worker.min.js',
  tessCore: 'lib/tesseract/core',
  lang: { rus: 'lib/tesseract/lang/rus.js', eng: 'lib/tesseract/lang/eng.js' }
};
const abs = p => new URL(p, location.href).href;
const loaded = {};
function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error('Не удалось загрузить ' + src)); };
    document.head.appendChild(s);
  });
  return loaded[src];
}

/* ---------- PDF text ---------- */
async function ensurePdf() {
  await loadScript(LIB.pdf);
  // Main-thread worker handler: works inside sandboxed frames without spawning a Worker.
  await loadScript(LIB.pdfWorker);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = abs(LIB.pdfWorker);
  return window.pdfjsLib;
}
function itemsToLines(items) {
  const rows = [];
  items.forEach(it => {
    if (!it.str || !it.str.trim()) return;
    const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || 8;
    let row = rows.find(r => Math.abs(r.y - y) <= Math.max(2.5, h * 0.35));
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str, w: it.width || 0 });
  });
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => {
    r.parts.sort((a, b) => a.x - b.x);
    let out = '', lastEnd = null;
    r.parts.forEach(p => {
      if (lastEnd != null) out += (p.x - lastEnd > 1.5 ? '  ' : '');
      out += p.s; lastEnd = p.x + p.w;
    });
    return out.replace(/\s{3,}/g, '  ').trim();
  });
}
async function pdfToText(buf, onStatus) {
  const pdfjs = await ensurePdf();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onStatus('Читаю страницу ' + i + ' из ' + doc.numPages + '…');
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(itemsToLines(tc.items));
  }
  return { doc, lines: pages.flat(), pages: doc.numPages };
}
async function pdfPagesToCanvases(doc, maxPages) {
  const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2.2 });
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    out.push(c);
  }
  return out;
}

/* ---------- OCR ---------- */
function b64ToBytes(b64) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
let tessWorker = null;
function wasmAllowed() {
  try { new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); return true; } catch (e) { return false; }
}
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what)), ms))]);
async function ensureOcr(onStatus) {
  if (tessWorker) return tessWorker;
  if (typeof WebAssembly === 'undefined' || !wasmAllowed()) throw new Error('браузер или окно просмотра запрещает WebAssembly');
  onStatus('Загружаю модуль распознавания (около 8 МБ, один раз)…');
  await loadScript(LIB.tess);
  await Promise.all([loadScript(LIB.lang.rus), loadScript(LIB.lang.eng)]);
  const langs = ['rus', 'eng'].map(code => ({ code, data: b64ToBytes(window.__TESS_LANG[code]) }));
  const opts = blob => ({
    workerPath: abs(LIB.tessWorker), corePath: abs(LIB.tessCore), cacheMethod: 'none', workerBlobURL: blob,
    logger: m => { if (m && m.status === 'recognizing text') onStatus('Распознаю текст… ' + Math.round((m.progress || 0) * 100) + ' %'); }
  });
  const make = blob => withTimeout(window.Tesseract.createWorker(langs, 1, opts(blob)), 45000, 'модуль распознавания не запустился за 45 с');
  try { tessWorker = await make(false); }
  catch (e) { tessWorker = await make(true); }
  return tessWorker;
}
function binarize(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data, hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = y; hist[y]++; }
  // Otsu threshold
  const total = d.length / 4; let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 160;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = t; } }
  for (let i = 0; i < d.length; i += 4) { const v = d[i] > thr ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(img, 0, 0); return c;
}
async function ocrImages(sources, onStatus, psm, prep) {
  const w = await ensureOcr(onStatus);
  await w.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: '1' });
  const lines = [];
  for (let i = 0; i < sources.length; i++) {
    onStatus('Распознаю ' + (sources.length > 1 ? 'страницу ' + (i + 1) + ' из ' + sources.length : 'изображение') + (prep ? ' (второй проход)' : '') + '…');
    const { data } = await withTimeout(w.recognize(prep ? binarize(sources[i]) : sources[i]), 180000, 'распознавание заняло больше 3 минут');
    lines.push(...data.text.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
  }
  return lines;
}
const countFound = p => Object.keys(p.found).filter(k => k !== 'CREA' && k !== 'VOL').length;
async function ocrAndParse(sources, status, onStatus) {
  // Two independent passes (layout-aware on the original, block mode on a binarized copy); disagreements are flagged.
  const la = await ocrImages(sources, onStatus, 4, false), lb = await ocrImages(sources, onStatus, 6, true);
  const a = parseReport(la, status), b = parseReport(lb, status);
  const ga = parseGenetics(la), gb = parseGenetics(lb);
  const genes = Object.assign({}, gb, ga);
  Object.keys(genes).forEach(k => { if (ga[k] && gb[k] && ga[k].status !== gb[k].status) genes[k].conf = 'check'; });
  const keys = new Set([...Object.keys(a.found), ...Object.keys(b.found)]);
  const found = {};
  keys.forEach(k => {
    const x = a.found[k], y = b.found[k];
    if (x && y) {
      const same = Math.abs(x.value - y.value) <= 1e-9 + 0.005 * Math.max(Math.abs(x.value), Math.abs(y.value));
      const ref = x.ref || y.ref;
      const pick = same ? (x.ref ? x : (y.ref ? Object.assign({}, x, { ref: y.ref }) : x))
        : (ref ? (rangeDistance(y.value, ref) < rangeDistance(x.value, ref) ? Object.assign({}, y, { ref }) : Object.assign({}, x, { ref })) : x);
      found[k] = Object.assign({}, pick, same ? { conf: 'ok' } : { conf: 'check', alt: (pick.value === x.value ? y : x).value });
    } else found[k] = Object.assign({}, x || y, { conf: 'single' });
  });
  const salivaPasses = window.Saliva && window.Saliva.looksLikeSaliva([la, lb]) && window.Saliva.count(window.Saliva.mergePasses([la, lb], status, null)) >= 2 && Object.keys(found).filter(k => k !== 'CREA' && k !== 'VOL').length < 2 ? [la, lb] : null;
  return { found, genes, format: countFound(a) >= countFound(b) ? a.format : b.format, patient: Object.assign({}, b.patient, a.patient), text: a.text + '\n\n— второй проход —\n' + b.text, ocr: true, salivaPasses };
}
function fileToImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 3000 / Math.max(img.width, img.height)) * (Math.max(img.width, img.height) < 1400 ? 2 : 1);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не удалось открыть изображение')); };
    img.src = url;
  });
}
function rangeDistance(v, r) {
  if (!r || v <= 0) return 0;
  const lo = r[0] > 0 ? r[0] : null, hi = r[1] > 0 ? r[1] : null;
  if (lo && v < lo) return Math.log10(lo / v);
  if (hi && v > hi) return Math.log10(v / hi);
  return 0;
}

/* ---------- Parsing ---------- */
const LAT = { 'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'α': 'a' };
function norm(s) {
  return s.toLowerCase().replace(/1б(?=\s*[-аaα])/g, '16').replace(/ё/g, 'е').replace(/[‐‑‒–—−]/g, '-').replace(/ /g, ' ').replace(/[“”«»]/g, '"');
}
const toLat = s => s.replace(/[авекмнорстухα]/g, c => LAT[c]).replace(/([oh]\s*-?\s*e)\s*[l|i](?![a-z])/g, '$11').replace(/\(([^)]{0,12}?e)\s*[l|i]\)/g, '($11)');

const D = '(?:^|[^0-9.,a-zа-я])';         // left boundary before a leading digit
const S = '\\s*-?\\s*';
// Order matters: specific metabolites first, parent estrogens later.
const PATTERNS = [
  { k: 'OH16E1', ru: /16\s*-?\s*(?:а|a|α|о|o|альфа)?\s*-?\s*гидрокси\s*-?\s*эстрон/, lat: new RegExp(D + '16' + S + '(?:a|alpha)?' + S + '(?:oh|hydroxy)' + S + 'e' + S + '1(?!\\d)') },
  { k: 'OH2E1', ru: /(?:^|[^\d])2\s*-?\s*гидрокси\s*-?\s*эстрон/, lat: new RegExp(D + '2' + S + '(?:oh|hydroxy)' + S + 'e' + S + '1(?!\\d)') },
  { k: 'OH2E2', ru: /(?:^|[^\d])2\s*-?\s*гидрокси\s*-?\s*эстрадиол/, lat: new RegExp(D + '2' + S + '(?:oh|hydroxy)' + S + 'e' + S + '2(?!\\d)') },
  { k: 'OH4E1', ru: /(?:^|[^\d])4\s*-?\s*гидрокси\s*-?\s*эстрон/, lat: new RegExp(D + '4' + S + '(?:oh|hydroxy)' + S + 'e' + S + '1(?!\\d)') },
  { k: 'OH4E2', ru: /(?:^|[^\d])4\s*-?\s*гидрокси\s*-?\s*эстрадиол/, lat: new RegExp(D + '4' + S + '(?:oh|hydroxy)' + S + 'e' + S + '2(?!\\d)') },
  { k: 'MeO2E1', ru: /(?:^|[^\d])2\s*-?\s*метокси\s*-?\s*эстрон/, lat: new RegExp(D + '2' + S + '(?:o' + S + 'me|meo|methoxy|me|m)' + S + '(?:o' + S + ')?e' + S + '1(?!\\d)') },
  { k: 'MeO2E2', ru: /(?:^|[^\d])2\s*-?\s*метокси\s*-?\s*эстрадиол/, lat: new RegExp(D + '2' + S + '(?:o' + S + 'me|meo|methoxy|me|m)' + S + '(?:o' + S + ')?e' + S + '2(?!\\d)') },
  { k: 'MeO4E1', ru: /(?:^|[^\d])4\s*-?\s*метокси\s*-?\s*эстрон/, lat: new RegExp(D + '4' + S + '(?:o' + S + 'me|meo|methoxy|me|m)' + S + '(?:o' + S + ')?e' + S + '1(?!\\d)') },
  { k: 'E1', ru: /(?:^|[^а-я0-9-])эстрон(?![а-я])/, lat: /(?:^|[^a-z0-9-])estrone(?![a-z])|(?:^|[^a-z0-9-])oestrone(?![a-z])/ },
  { k: 'E2', ru: /(?:^|[^а-я0-9-])эстрадиол(?![а-я])/, lat: /(?:^|[^a-z0-9-])o?estradiol(?![a-z])/ },
  { k: 'E3', ru: /(?:^|[^а-я0-9-])эстриол(?![а-я])/, lat: /(?:^|[^a-z0-9-])o?estriol(?![a-z])/ },
  { k: 'PD', ru: /(?:^|[^а-я-])прегнандиол(?![а-я])/, lat: /(?:^|[^a-z])(?:b|beta|β)?-?\s*pregnanediol/ },
  { k: 'CREA', ru: /(?:^|[^а-я\/])креатинин(?![а-я])/, lat: null },
  { k: 'VOL', ru: /диурез|объ[её]м\s*(?:суточной\s*)?мочи|суточный\s*объ[её]м|объ[её]м\s*суточн/, lat: null }
];
const RATIO_LINE = /соотношен|коэффициент|ratio|balance|индекс/;
const NUM = '(\\d+(?:[.,]\\d+)?)';

function findMatches(line) {
  const n = norm(line), l = toLat(n);
  const hits = [];
  PATTERNS.forEach(p => {
    [[p.ru, n], [p.lat, l]].forEach(([re, str]) => {
      if (!re) return;
      const g = new RegExp(re.source, 'g'); let m;
      while ((m = g.exec(str))) {
        let start = m.index, txt = m[0];
        const lead = txt.search(/[0-9a-zа-яβ]/); if (lead > 0) { start += lead; txt = txt.slice(lead); }
        hits.push({ k: p.k, start, end: m.index + m[0].length });
        if (g.lastIndex === m.index) g.lastIndex++;
      }
    });
  });
  // drop overlaps: keep earliest, then longest
  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept = [];
  hits.forEach(h => { if (!kept.some(x => h.start < x.end && h.end > x.start)) kept.push(h); });
  // Skip alpha-pregnanediol (DUTCH lists both a- and b-)
  return { n, l, hits: kept.filter(h => !(h.k === 'PD' && /(?:^|[^a-z])(a|α|alpha)-\s*$/.test(l.slice(Math.max(0, h.start - 7), h.start)))) };
}

function cleanSegment(seg) {
  return seg
    .replace(/\([^)]*[a-zа-я][^)]*\)/g, ' ')         // codes in brackets: (2-OHE1), (E1)
    .replace(/\/?\s*24\s*-?\s*(?:ч|час|h|hr)[а-яa-z]*/g, ' ') // "/24 ч"
    .replace(/(?:^|\s)(?:16\s*[aаα]?\s*-?\s*)?(?:[24]\s*-?\s*)?(?:[oо][hн]|[oо][mм][eе]|[mм][eе][oо])\s*-?\s*[eе]\s*[123](?![\d.,])/g, ' ') // stray codes without brackets
    .replace(/(?:^|\s)[eе]\s*[123](?![\d.,])/g, ' ');
}
function parseNumber(s) { return Number(s.replace(',', '.')); }

function extractRanges(rest) {
  const out = [];
  const reRange = new RegExp(NUM + '\\s*(?:-|\\.\\.\\.|…|до)\\s*' + NUM, 'g');
  let m;
  while ((m = reRange.exec(rest))) out.push({ at: m.index, r: [parseNumber(m[1]), parseNumber(m[2])] });
  const reUp = new RegExp('(?:<|≤|до|менее|меньше)\\s*' + NUM, 'g');
  while ((m = reUp.exec(rest))) if (!out.some(o => Math.abs(o.at - m.index) < 3)) out.push({ at: m.index, r: [null, parseNumber(m[1])] });
  const reLo = new RegExp('(?:>|≥|выше|более|больше)\\s*' + NUM, 'g');
  while ((m = reLo.exec(rest))) out.push({ at: m.index, r: [parseNumber(m[1]), null] });
  return out.sort((a, b) => a.at - b.at);
}
const PHASE_WORDS = { lut: /лютеин|luteal/, pm: /постменоп|менопауз|postmeno|menopaus/, fol: /фолликул|follicul/, ov: /овулятор|ovulat/, male: /мужч|male(?!\w)/ };

function parseSegment(k, seg, status, dutchLike) {
  const c = cleanSegment(seg);
  // Result: first number, optionally with < or >
  const m = new RegExp('([<>≤≥]?)\\s*' + NUM).exec(c);
  if (!m) return null;
  let value = parseNumber(m[2]);
  const qual = m[1] || '';
  // A number immediately followed by "-" + number is a reference range, not a result
  const after = c.slice(m.index + m[0].length);
  if (/^\s*(?:-|\.\.\.|…)\s*\d/.test(after) && !qual) {
    // range printed before result is unusual; treat as missing result
    return null;
  }
  // Units adjustments
  let unitNote = '';
  if (k === 'PD' && /(?:^|[^к])мг\s*\/\s*(?:сут|24)/.test(c) && !/мкг/.test(c)) { value *= 1000; unitNote = 'мг/сут → мкг/сут'; }
  // Reference
  const ranges = extractRanges(after);
  let ref = null;
  if (ranges.length) {
    const phaseHits = Object.entries(PHASE_WORDS).map(([ph, re]) => { const pm = re.exec(after); return pm ? { ph, at: pm.index } : null; }).filter(Boolean);
    if (phaseHits.length) {
      const want = phaseHits.find(p => p.ph === status) || null;
      if (want) { const r = ranges.find(x => x.at > want.at); if (r) ref = r.r; }
      if (!ref && !want) ref = null; // ranges belong to other phases
    } else if (dutchLike && ranges.length >= 2 && status === 'pm') ref = ranges[1].r;
    else ref = ranges[0].r;
  }
  return { value, qual, ref, unitNote };
}

function detectFormat(text, found) {
  const t = norm(text);
  if (/ng\s*\/\s*mg|dutch|precision analytical/.test(t)) return 'dutch';
  if (/нмоль\s*\/\s*ммоль|nmol\s*\/\s*mmol/.test(t)) return 'helix';
  if (/мкг\s*\/\s*(?:сут|24)|µg\s*\/\s*24|mcg\s*\/\s*24|ug\s*\/\s*24/.test(t)) return (found.OH2E2 || found.MeO4E1) ? 'gemo24' : 'invitro24';
  if (found.OH2E2 && found.MeO4E1 && !found.E1) return 'helix';
  return 'custom';
}
function detectPatient(text) {
  const t = norm(text); const p = {};
  let m = /пол\s*[:\-]?\s*(ж|м)(?:ен|уж)?/.exec(t); if (m) p.sex = m[1] === 'м' ? 'male' : 'female';
  m = /gender\s*[:\-]?\s*(female|male)/.exec(t); if (m) p.sex = m[1];
  m = /возраст\s*[:\-]?\s*(\d{1,3})/.exec(t) || /\bage\s*[:\-]?\s*(\d{1,3})\b/.exec(t); if (m) p.age = Number(m[1]);
  if (!p.age) {
    m = /(?:дата\s*рождения|д\.?\s*р\.?|date of birth|dob)\s*[:\-]?\s*(\d{2})[.\/](\d{2})[.\/](\d{4})/.exec(t);
    if (m) { const b = new Date(+m[3], +m[2] - 1, +m[1]); const now = new Date(); let a = now.getFullYear() - b.getFullYear(); if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--; if (a > 0 && a < 110) p.age = a; }
  }
  m = /дата\s*(?:взятия|забора|сбора)[^:\n]{0,20}[:\-]?\s*(\d{2})[.\/](\d{2})[.\/](\d{4})/.exec(t);
  if (m) p.date = m[3] + '-' + m[2] + '-' + m[1];
  return p;
}

function parseReport(lines, status) {
  const text = lines.join('\n');
  const dutchLike = /ng\s*\/\s*mg|dutch/.test(norm(text));
  const found = {};
  lines.forEach((line, idx) => {
    const { n, hits } = findMatches(line);
    if (!hits.length) return;
    if (hits.length > 1) {
      const between = n.slice(hits[0].start, hits[hits.length - 1].end).replace(/(?:мкг|нг|ng|мг|нмоль|nmol|µg|mcg)\s*\/\s*\S+|\/\s*(?:сут|24|ммоль|mmol|мг|mg|г|g)\S*/g, ' ');
      if (/[\/+]/.test(between)) return; // formula row such as (2-OHE1+2-OHE2)/16a-OHE1
    }
    hits.forEach((h, i) => {
      const segEnd = i + 1 < hits.length ? hits[i + 1].start : n.length;
      const pre = n.slice(Math.max(0, h.start - 40), h.start);
      let seg = n.slice(h.end, segEnd);
      // ratio rows such as "2-OHE1/16a-OHE1" or "Соотношение ..."
      if (/^\s*\/\s*\S/.test(seg) || /\/\s*$/.test(pre) || RATIO_LINE.test(n.slice(0, h.start)) || (RATIO_LINE.test(n) && hits.length > 1 && /\//.test(n))) return;
      if (h.k === 'CREA' && /(?:ммоль|мкмоль|мг|г)\s*$/.test(pre)) return;
      if (found[h.k]) return; // first occurrence wins
      // If the name is the last thing on the line, the value may sit on the next line (wrapped cell)
      let src = line;
      if (!/\d/.test(cleanSegment(seg)) && lines[idx + 1] && !findMatches(lines[idx + 1]).hits.length) { seg += ' ' + norm(lines[idx + 1]); src += ' ⏎ ' + lines[idx + 1]; }
      // reference ranges by phase continue on the following lines (and may cross a page break)
      if (i === hits.length - 1 && h.k !== 'CREA' && h.k !== 'VOL') {
        for (let j = idx + 1; j < lines.length && j - idx <= 25; j++) {
          if (findMatches(lines[j]).hits.length) break;
          const nl = norm(lines[j]);
          if (Object.values(PHASE_WORDS).some(re => re.test(nl)) && /\d/.test(nl)) { seg += ' ; ' + nl; src += ' ⏎ ' + lines[j]; }
        }
      }
      const r = parseSegment(h.k, seg, status, dutchLike);
      if (!r) return;
      if (h.k === 'CREA') {
        if (/мкмоль/.test(seg)) r.value *= 0.00011312;
        else if (/ммоль/.test(seg) && !/\/\s*л/.test(seg)) r.value *= 0.11312;
        else if (/(?:^|[^м])г\s*\/\s*л|ммоль\s*\/\s*л|мг\s*\/\s*дл/.test(seg)) return; // concentration, not daily excretion
        r.ref = null;
      }
      if (h.k === 'VOL') { if (r.value < 10) r.value *= 1000; r.ref = null; }
      found[h.k] = Object.assign(r, { src: src.trim().slice(0, 160) });
    });
  });
  return { found, format: detectFormat(text, found), patient: detectPatient(text), text };
}


/* ---------- Genetics parsing ---------- */
const GENE_RE = /(?:^|[^a-z0-9])(cyp1a1|cyp1a2|cyp1b1|cyp19a1|cyp19a|cyp19|cyp17a1|cyp17a|cyp17|cyp3a4|comt|mthfr|mtrr|mtr|gstm1|gstm|gstt1|gstt|gstp1|nqo1|sult1a1|ugt1a1|esr1|esrα|esr-?alpha|pgr)(?![a-z0-9])/g;
const GENE_ALIAS = { cyp19: 'CYP19A1', cyp19a: 'CYP19A1', cyp17: 'CYP17A1', cyp17a: 'CYP17A1', gstm: 'GSTM1', gstt: 'GSTT1', 'esrα': 'ESR1', 'esr-alpha': 'ESR1', esralpha: 'ESR1' };
const COMP = { A: 'T', T: 'A', C: 'G', G: 'C' };
const AA = 'Ile|Val|Leu|Met|Ala|Glu|Asp|Gly|Pro|Ser|Arg|His|A1|A2';
function catalog() { return window.GENE_CATALOG || []; }
function labInterp(seg) {
  const t = seg.toLowerCase();
  let m = /(norm|polym|mut)\s*\/\s*(norm|polym|mut)/.exec(t);
  if (m) return (m[1] !== 'norm' ? 1 : 0) + (m[2] !== 'norm' ? 1 : 0);
  if (/гетерозигот/.test(t)) return 1;
  if (/гомозигот/.test(t)) return /норм|дик/.test(t) ? 0 : 2;
  if (/отсутстви[ея] активности|отсутствует|null|нулев/.test(t)) return 2;
  const up = (seg.match(/↑/g) || []).length, dn = (seg.match(/↓/g) || []).length;
  if (up || dn) return Math.min(2, Math.max(up, dn));
  if (/нормальн[а-я]* (?:активност|экспресси|чувствительност)|не связан с/.test(t)) return 0;
  return null;
}
function countEff(g1, g2, ref, eff, notation) {
  const S = [ref, eff];
  const cnt = (a, b, e) => (a === e ? 1 : 0) + (b === e ? 1 : 0);
  if (S.includes(g1) && S.includes(g2)) return cnt(g1, g2, eff);
  const c1 = COMP[g1], c2 = COMP[g2];
  if (S.includes(c1) && S.includes(c2)) return cnt(c1, c2, eff);
  if (notation) { const [r2, e2] = notation; if ([r2, e2].includes(g1) && [r2, e2].includes(g2)) return cnt(g1, g2, e2); }
  return null;
}
function genotypeFrom(seg, v) {
  // returns { gt, status, how } or null
  if (v.type === 'null') {
    let m = /(del|ins|null|0|\+|-)\s*\/\s*(del|ins|null|0|\+|-)/i.exec(seg);
    if (m) { const bad = x => /del|null|0|-/i.test(x); const n = (bad(m[1]) ? 1 : 0) + (bad(m[2]) ? 1 : 0); return { gt: m[0].replace(/\s+/g, ''), status: n, how: 'генотип' }; }
    if (/делеци|null|нулев|отсутств/i.test(seg)) return { gt: 'Del/Del', status: 2, how: 'описание' };
    if (/норм|присутств|ins\/ins|\+\/\+/i.test(seg)) return { gt: 'Ins/Ins', status: 0, how: 'описание' };
    return null;
  }
  if (v.type === 'ta') {
    const m = /(?:\(?ta\)?\s*)?(\*?1|\*?28|6|7)\s*(?:\(?ta\)?)?\s*\/\s*(?:\(?ta\)?\s*)?(\*?1|\*?28|6|7)(?:\s*\(?ta\)?)?(?![0-9])/i.exec(seg);
    if (m) { const e = x => /28|7/.test(x); return { gt: m[1] + '/' + m[2], status: (e(m[1]) ? 1 : 0) + (e(m[2]) ? 1 : 0), how: 'генотип' }; }
    const li = labInterp(seg); return li == null ? null : { gt: '?', status: li, how: 'интерпретация лаборатории' };
  }
  const notM = /(?:c\.|g\.)?-?\d+(?:[+-]\d+)?([ACGT])\s*>\s*([ACGT])/i.exec(seg);
  const notation = notM ? [notM[1].toUpperCase(), notM[2].toUpperCase()] : null;
  let ref = v.ref, eff = v.eff;
  // aromatase: the risk allele differs between CYP19A1 variants, so the lab's own grading wins when present
  if (v.alleleBy) { const li0 = labInterp(seg); if (li0 != null) { const mm = /([ACGT])\s*[\/\\]\s*([ACGT])/.exec(seg); return { gt: mm ? mm[1] + '/' + mm[2] : '?', status: li0, how: 'интерпретация лаборатории' }; } }
  if (v.alleleBy) { const rs = (seg.match(/rs\s?\d+/i) || [''])[0].replace(/\s/g, '').toLowerCase(); if (v.alleleBy[rs]) [ref, eff] = v.alleleBy[rs]; else if (!rs || !v.alleleBy[rs]) { ref = null; eff = null; } }
  // amino-acid / allele-name genotype
  if (v.aa) {
    const m = new RegExp('(?:^|[^A-Za-z])(' + AA + ')\\s*\\/\\s*(' + AA + ')(?![A-Za-z0-9])', 'i').exec(seg);
    if (m) {
      const norm = x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
      const a = norm(m[1]), b = norm(m[2]), [ra, ea] = v.aa.map(norm);
      if ([ra, ea].includes(a) && [ra, ea].includes(b)) return { gt: a + '/' + b, status: (a === ea ? 1 : 0) + (b === ea ? 1 : 0), how: 'генотип' };
    }
  }
  // nucleotide genotype: C/T, C\T, CT
  let m = /(?:^|[^A-Za-z0-9>])([ACGT])\s*[\/\\|]\s*([ACGT])(?![A-Za-z0-9])/.exec(seg) || /(?:^|[\s|:;])([ACGT])([ACGT])(?=[\s|;,.]|$)/.exec(seg);
  if (m && ref) {
    const st = countEff(m[1], m[2], ref, eff, notation);
    if (st != null) return { gt: m[1] + '/' + m[2], status: st, how: 'генотип' };
  }
  const li = labInterp(seg);
  if (li != null) return { gt: m ? m[1] + '/' + m[2] : '?', status: li, how: 'интерпретация лаборатории' };
  if (m) return { gt: m[1] + '/' + m[2], status: null, how: 'нужна проверка' };
  return null;
}
function pickVariant(gene, seg) {
  const vs = catalog().filter(v => v.gene === gene);
  if (!vs.length) return null;
  const rs = (seg.match(/rs\s?\d+/gi) || []).map(x => x.replace(/\s/g, '').toLowerCase());
  let v = vs.find(x => (x.rs || []).some(r => rs.includes(r)));
  if (v) return v;
  if (rs.length && vs.length > 1) return null; // an rs we do not track
  v = vs.find(x => x.hints && x.hints.test(seg));
  if (v) return v;
  if (vs.length === 1) return vs[0];
  // several variants of one gene and no hints: decide by alleles present
  const m = /([ACGT])\s*[\/\\]\s*([ACGT])/.exec(seg);
  if (m) { v = vs.find(x => countEff(m[1], m[2], x.ref, x.eff, null) != null); if (v) return v; }
  return null;
}
const GT_ALLELE = '(?:\\(TA\\))?\\d{1,2}(?:TA)?|\\*\\d{1,2}|[ACGT]|del|ins|null|[+-]';
const GT_TOKEN = new RegExp('(?<![A-Za-z0-9/])(' + GT_ALLELE + ')\\s*\\/\\s*(' + GT_ALLELE + ')(?![A-Za-z0-9/])', 'gi');
const INT_TOKEN = /(norm|polym|mut)\s*\/\s*(norm|polym|mut)/gi;
function parseGenetics(lines) {
  const found = {};
  const take = (v, r, src) => { if (!v || !r) return; const old = found[v.id]; if (old && !(old.gt === '?' && r.gt !== '?') && !(old.status == null && r.status != null)) return; found[v.id] = Object.assign(r, { src: src.trim().slice(0, 160) }); };
  const cyr = { 'А': 'A', 'С': 'C', 'Т': 'T', 'а': 'a', 'с': 'c', 'т': 't' };
  lines = lines.map(l => l.replace(/([АСТACGT])(\s*[\/>\\]\s*)([АСТACGT])/g, (x, a, sp, b) => (cyr[a] || a) + sp + (cyr[b] || b)));
  // Rows that list several rs numbers (genes side by side in one cell): pair rs, genotype and grading by position
  const multi = new Set();
  lines.forEach((line, idx) => {
    const rsList = (line.match(/rs\s?\d{3,}/gi) || []).map(x => x.replace(/\s/g, '').toLowerCase());
    if (rsList.length < 2) return;
    const lastRs = line.toLowerCase().lastIndexOf(rsList[rsList.length - 1]);
    let tail = line.slice(lastRs + rsList[rsList.length - 1].length), j = idx + 1;
    const gts = () => (tail.replace(INT_TOKEN, ' ').match(GT_TOKEN) || []);
    while (gts().length < rsList.length && j <= idx + 2 && lines[j] && !/rs\s?\d{3,}/i.test(lines[j])) tail += '  ' + lines[j++];
    const G = gts(), I = tail.match(INT_TOKEN) || [];
    if (G.length !== rsList.length) return;
    multi.add(idx);
    rsList.forEach((rs, k) => {
      const v = catalog().find(x => (x.rs || []).includes(rs)); if (!v) return;
      const seg = rs + ' ' + G[k] + (I.length === rsList.length ? ' ' + I[k] : '');
      const r = genotypeFrom(seg, v); if (r) take(v, r, line + ' → ' + seg);
    });
  });
  // Several gene symbols side by side without rs numbers: "GSTM1 GSTT1 del/del ins/ins"
  lines.forEach((line, idx) => {
    if (multi.has(idx) || /rs\s?\d{3,}/i.test(line)) return;
    const block = /(?:^|\s)((?:[A-Z][A-Za-z0-9-]{1,9}(?:\s*[,\/]?\s+|\s*,\s*)){1,5}[A-Z][A-Za-z0-9-]{1,9})(?=\s|$)/.exec(line);
    if (!block) return;
    const genes = block[1].split(/[\s,\/]+/).filter(Boolean);
    const tracked = genes.map(g => { GENE_RE.lastIndex = 0; const m = GENE_RE.exec(' ' + g.toLowerCase()); return m && m[1] === g.toLowerCase() ? (GENE_ALIAS[m[1]] || m[1].toUpperCase()) : null; });
    if (genes.length < 2 || tracked.filter(Boolean).length < 1) return;
    let tail = line.slice(block.index + block[0].length), j = idx + 1;
    const gts = () => (tail.replace(INT_TOKEN, ' ').match(GT_TOKEN) || []);
    while (gts().length < genes.length && j <= idx + 2 && lines[j] && !GENE_RE.test(lines[j].toLowerCase())) { GENE_RE.lastIndex = 0; tail += '  ' + lines[j++]; }
    GENE_RE.lastIndex = 0;
    const G = gts(), I = tail.match(INT_TOKEN) || [];
    if (G.length !== genes.length) return;
    multi.add(idx);
    tracked.forEach((gene, k) => {
      if (!gene) return;
      const vs = catalog().filter(x => x.gene === gene); const v = vs.length === 1 ? vs[0] : pickVariant(gene, G[k]); if (!v) return;
      const seg = G[k] + (I.length === genes.length ? ' ' + I[k] : '');
      const r = genotypeFrom(seg, v); if (r) take(v, r, line + ' → ' + gene + ' ' + seg);
    });
  });
  lines.forEach((line, idx) => {
    if (multi.has(idx)) return; // handled above
    const low = line.toLowerCase();
    // "Выявленный генотип A/A варианта c.1384A>G гена CYP1A1"
    const sm = /генотип\s+(\S+)\s+(?:варианта|полиморфизма|маркера)\s+(.{0,60}?)\s*гена\s+([a-z0-9]+)/i.exec(line);
    if (sm) {
      const gname = sm[3].toUpperCase(); const gene = GENE_ALIAS[sm[3].toLowerCase()] || gname;
      const v = pickVariant(gene, sm[2]);
      if (v) take(v, genotypeFrom(sm[1] + ' ' + sm[2], v), line);
    }
    const hits = []; let m; GENE_RE.lastIndex = 0;
    while ((m = GENE_RE.exec(low))) hits.push({ g: m[1], start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].length });
    // rows without a gene symbol but with a tracked rs number
    if (!hits.length) {
      const rsm = /rs\s?\d+/i.exec(line);
      if (rsm) { const rs = rsm[0].replace(/\s/g, '').toLowerCase(); const v = catalog().find(x => (x.rs || []).includes(rs)); if (v) take(v, genotypeFrom(line.slice(rsm.index), v), line); }
      return;
    }
    if (hits.length > 3) return; // a list of genes in running text
    hits.forEach((h, i) => {
      const gene = GENE_ALIAS[h.g] || h.g.toUpperCase();
      let seg = line.slice(h.start, i + 1 < hits.length ? hits[i + 1].start : line.length);
      const tryParse = () => { const v = pickVariant(gene, seg); return v ? { v, r: genotypeFrom(seg.slice(gene.length), v) } : null; };
      let res = tryParse();
      // table cells wrapped over several lines: look ahead until the next gene row
      for (let j = 1; (!res || !res.r || res.r.gt === '?') && i === hits.length - 1 && j <= 3 && lines[idx + j]; j++) {
        const nx = lines[idx + j]; GENE_RE.lastIndex = 0;
        if (GENE_RE.test(nx.toLowerCase())) break;
        seg += ' ' + nx; res = tryParse();
      }
      GENE_RE.lastIndex = 0;
      if (res) take(res.v, res.r, seg);
    });
  });
  return found;
}

/* ---------- Main entry ---------- */
async function readFile(file, status, onStatus) {
  const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
  if (!isPdf && !isImg) throw new Error('Поддерживаются PDF и изображения (JPG, PNG). Файл «' + file.name + '» не подходит.');
  let lines = [], method = '';
  if (isPdf) {
    onStatus('Открываю PDF…');
    const buf = new Uint8Array(await file.arrayBuffer());
    const res = await pdfToText(buf, onStatus);
    lines = res.lines; method = 'текстовый слой PDF';
    const parsed = parseReport(lines, status);
    parsed.genes = parseGenetics(lines);
    let nFound = Object.keys(parsed.found).filter(k => k !== 'CREA' && k !== 'VOL').length;
    if (Object.keys(parsed.genes).length >= 3 && nFound <= 3) { parsed.found = {}; nFound = 0; } // a genetic report: numbers in its text are not lab results
    const salN = window.Saliva ? window.Saliva.count(window.Saliva.mergePasses([lines], status, null)) : 0;
    if (salN >= 2 && nFound < 2 && window.Saliva.looksLikeSaliva([lines])) return Object.assign(parsed, { method, pages: res.pages, salivaPasses: [lines] });
    if (nFound >= 2 || Object.keys(parsed.genes).length >= 2) return Object.assign(parsed, { method, pages: res.pages });
    // Scanned PDF: no usable text layer
    onStatus('Текстового слоя нет или он неполный: распознаю как скан…');
    const canvases = await pdfPagesToCanvases(res.doc, 4);
    try { return Object.assign(await ocrAndParse(canvases, status, onStatus), { method: 'распознавание скана (OCR)', pages: res.pages }); }
    catch (e) { throw new Error('в PDF нет текстового слоя (скан), а распознавание изображений в этом окне не запустилось (' + (e.message || e) + '). Загрузите PDF, выгруженный из личного кабинета лаборатории, или введите значения вручную'); }
  }
  const c = await fileToImage(file);
  try { return Object.assign(await ocrAndParse([c], status, onStatus), { method: 'распознавание фото (OCR)', pages: 1 }); }
  catch (e) { throw new Error('распознавание изображений в этом окне не запустилось (' + (e.message || e) + '). Загрузите PDF из личного кабинета лаборатории или введите значения вручную'); }
}

/* Generic: text lines of a PDF / image (one pass for a text layer, two OCR passes for scans and photos). */
async function readLines(file, onStatus, enough) {
  const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
  if (!isPdf && !isImg) throw new Error('Поддерживаются PDF и изображения (JPG, PNG). Файл «' + file.name + '» не подходит');
  let sources;
  if (isPdf) {
    onStatus('Открываю PDF…');
    const res = await pdfToText(new Uint8Array(await file.arrayBuffer()), onStatus);
    if (!enough || enough([res.lines])) return { passes: [res.lines], method: 'текстовый слой PDF', pages: res.pages };
    onStatus('Текстового слоя нет или он неполный: распознаю как скан…');
    sources = await pdfPagesToCanvases(res.doc, 4);
  } else sources = [await fileToImage(file)];
  try {
    const la = await ocrImages(sources, onStatus, 4, false), lb = await ocrImages(sources, onStatus, 6, true);
    return { passes: [la, lb], method: isPdf ? 'распознавание скана (OCR)' : 'распознавание фото (OCR)', pages: sources.length };
  } catch (e) { throw new Error('распознавание изображений в этом окне не запустилось (' + (e.message || e) + '). Загрузите PDF из личного кабинета лаборатории или введите значения вручную'); }
}

window.LabImport = { readFile, readLines, parseReport, parseGenetics, _findMatches: findMatches };
})();
