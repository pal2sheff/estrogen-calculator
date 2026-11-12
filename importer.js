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
  const a = parseReport(await ocrImages(sources, onStatus, 4, false), status);
  const b = parseReport(await ocrImages(sources, onStatus, 6, true), status);
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
  return { found, format: countFound(a) >= countFound(b) ? a.format : b.format, patient: Object.assign({}, b.patient, a.patient), text: a.text + '\n\n— второй проход —\n' + b.text, ocr: true };
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
    const nFound = Object.keys(parsed.found).filter(k => k !== 'CREA' && k !== 'VOL').length;
    if (nFound >= 2) return Object.assign(parsed, { method, pages: res.pages });
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

window.LabImport = { readFile, parseReport, _findMatches: findMatches };
})();
