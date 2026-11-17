/* Patient-specific steroidogenesis / estrogen metabolism diagram (SVG), PNG and PDF export. */
(function () {
'use strict';
const W = 1600, H = 1130;
const C = {
  bg: '#ffffff', ink: '#1d2433', muted: '#5d6577', line: '#c9ced8', accent: '#7d2a64', accentSoft: '#f4e8f0',
  ok: '#2f7d4f', okSoft: '#e4f2e9', edge: '#a86a00', edgeSoft: '#fbf0d9', bad: '#b3362b', badSoft: '#f9e3e0',
  grey: '#9aa1ae', greySoft: '#f1f2f5', neutral: '#7d2a64', neutralSoft: '#ffffff'
};
const FONT = "'IBM Plex Sans', 'Segoe UI', Arial, sans-serif";
const FONTC = "'IBM Plex Sans Condensed', 'Arial Narrow', Arial, sans-serif";
const ST = {
  ok: [C.okSoft, C.ok], edge: [C.edgeSoft, C.edge], bad: [C.badSoft, C.bad], grey: [C.greySoft, C.grey], neutral: [C.neutralSoft, C.neutral]
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- primitives ---------- */
function node(x, y, w, h, title, sub, st, opts) {
  opts = opts || {};
  const [fill, stroke] = ST[st] || ST.grey;
  let s = '<g>';
  if (opts.confirmed) s += '<rect x="' + (x - w / 2 - 6) + '" y="' + (y - h / 2 - 6) + '" width="' + (w + 12) + '" height="' + (h + 12) + '" rx="12" fill="none" stroke="' + C.bad + '" stroke-width="2" stroke-dasharray="6 4"/>';
  s += '<rect x="' + (x - w / 2) + '" y="' + (y - h / 2) + '" width="' + w + '" height="' + h + '" rx="9" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (st === 'grey' ? 1.2 : 2) + '"/>';
  const tc = st === 'grey' ? C.muted : C.ink;
  const fs = title.length > 17 ? 13.5 : title.length > 14 ? 14.5 : 15.5;
  if (opts.sub2) {
    const c2 = opts.sub2st ? (ST[opts.sub2st] || ST.grey)[1] : stroke;
    s += '<text x="' + x + '" y="' + (y - 11) + '" text-anchor="middle" font-family="' + FONTC + '" font-size="' + fs + '" font-weight="600" fill="' + tc + '">' + esc(title) + '</text>';
    s += '<text x="' + x + '" y="' + (y + 6) + '" text-anchor="middle" font-family="' + FONT + '" font-size="11.5" fill="' + (opts.subst ? (ST[opts.subst] || ST.grey)[1] : stroke) + '">' + esc(sub) + '</text>';
    s += '<text x="' + x + '" y="' + (y + 21) + '" text-anchor="middle" font-family="' + FONT + '" font-size="11.5" fill="' + c2 + '">' + esc(opts.sub2) + '</text>';
  } else if (sub) {
    s += '<text x="' + x + '" y="' + (y - 5) + '" text-anchor="middle" font-family="' + FONTC + '" font-size="' + fs + '" font-weight="600" fill="' + tc + '">' + esc(title) + '</text>';
    s += '<text x="' + x + '" y="' + (y + 14) + '" text-anchor="middle" font-family="' + FONT + '" font-size="12.5" fill="' + (st === 'grey' ? C.grey : stroke) + '">' + esc(sub) + '</text>';
  } else {
    s += '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" font-family="' + FONTC + '" font-size="' + fs + '" font-weight="600" fill="' + tc + '">' + esc(title) + '</text>';
  }
  return s + '</g>';
}
function arrow(x1, y1, x2, y2, color, dashed) {
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (color || C.line) + '" stroke-width="2"' + (dashed ? ' stroke-dasharray="5 4"' : '') + ' marker-end="url(#ah' + (color === C.bad ? 'r' : '') + ')"/>';
}
function pathArrow(d, color, dashed) {
  return '<path d="' + d + '" fill="none" stroke="' + (color || C.line) + '" stroke-width="2"' + (dashed ? ' stroke-dasharray="5 4"' : '') + ' marker-end="url(#ah' + (color === C.bad ? 'r' : '') + ')"/>';
}
function pill(x, y, text, st) {
  const [fill, stroke] = ST[st] || ST.grey;
  const w = Math.max(44, text.length * 6.9 + 16);
  return '<g><rect x="' + (x - w / 2) + '" y="' + (y - 11) + '" width="' + w + '" height="22" rx="11" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.3"/>' +
    '<text x="' + x + '" y="' + (y + 4.5) + '" text-anchor="middle" font-family="' + FONT + '" font-size="12" font-weight="600" fill="' + (st === 'grey' ? C.muted : stroke) + '">' + esc(text) + '</text></g>';
}
function pills(x, y, items) { // stacked vertically, centred on y
  const n = items.length; let s = '';
  items.forEach((it, i) => { s += pill(x, y + (i - (n - 1) / 2) * 25, it[0], it[1]); });
  return s;
}
function label(x, y, text, size, color, anchor, weight, font) {
  return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'start') + '" font-family="' + (font || FONT) + '" font-size="' + (size || 13) + '" font-weight="' + (weight || 400) + '" fill="' + (color || C.ink) + '">' + esc(text) + '</text>';
}

/* ---------- data helpers ---------- */
function ctxData() {
  const K = window.__calc; if (!K || !K.state.last) return null;
  const L = K.state.last, G = K.state.genes || {};
  const gst = id => G[id];
  const geneSt = id => { const n = G[id]; return n == null ? 'grey' : n === 0 ? 'ok' : n === 1 ? 'edge' : 'bad'; };
  const gtShort = id => {
    const n = G[id]; if (n == null) return 'н/и';
    const v = K.GCI[id];
    if (v.alleleBy) return ['норма', 'гетероз.', 'гомоз.'][n];
    return K.gtOptions(v)[n].split(' ')[0];
  };
  const maxOf = ids => { const vals = ids.map(id => G[id]).filter(x => x != null); return vals.length ? Math.max(...vals) : null; };
  return { K, L, G, gst, geneSt, gtShort, maxOf };
}
function stFromRange(s, rules) {
  // s: ok | edge | low | high | none | noref ; rules: { low: 'bad'|'edge'|'ok', high: ... }
  if (s === 'ok') return 'ok';
  if (s === 'edge') return 'edge';
  if (s === 'low') return rules.low || 'bad';
  if (s === 'high') return rules.high || 'bad';
  if (s === 'noref') return 'neutral';
  return 'grey';
}
const worst = (...a) => { const r = { bad: 4, edge: 3, ok: 2, neutral: 1, grey: 0 }; return a.reduce((m, x) => (r[x] > r[m] ? x : m), 'grey'); };

/* ---------- build ---------- */
function buildSvg(meta) {
  const D = ctxData(); if (!D) return '';
  const { K, L, G, geneSt, gtShort, maxOf } = D;
  const { F, R, S, vals, stVal, pk, bmi } = L;
  const fmt = K.fmt, unit = K.PROFILES[pk].unit;
  const v = k => (vals[k] == null ? null : vals[k]);
  const vt = (k, extra) => v(k) == null ? 'не измерено' : fmt(v(k)) + ' ' + unit + (extra || '');
  const word = s => ({ low: ' · ниже', high: ' · выше', edge: ' · у границы', ok: ' · норма' }[s] || '');
  const female = stVal !== 'male';
  const geneP = (ids, name) => { const n = maxOf(ids); const st = n == null ? 'grey' : ['ok', 'edge', 'bad'][n]; const id = ids.find(i => G[i] === n) || ids[0]; return [name + ' ' + (n == null ? 'н/и' : gtShort(id)), st]; };
  const fixed = name => [name, 'grey'];
  const SLs = window.Saliva && window.Saliva.state.last;
  const SL = SLs && SLs.F.any ? SLs : null;
  const salHas = key => SL && SL.R[key] && SL.R[key].v != null;
  const salSt = key => !salHas(key) ? 'grey' : stFromRange(SL.S[key], { low: 'bad', high: 'bad' });
  const sw = st => ({ low: ' ↓', high: ' ↑', edge: ' · граница', ok: ' · норма' }[st] || '');
  const salTxt = key => { const r = SL.R[key]; return (r.q || '') + fmt(r.v) + ' ' + r.unit + sw(SL.S[key]); };
  const salNode = (x, y, w, h, title, key, conf) => salHas(key) ? node(x, y, w, h, title, salTxt(key), salSt(key), { confirmed: conf }) : node(x, y, w, h, title, 'не измеряется', 'grey');

  let s = '<svg xmlns="http://www.w3.org/2000/svg" id="schemaSvg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Схема стероидогенеза и метаболизма эстрогенов пациента">';
  s += '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="' + C.line + '"/></marker>' +
    '<marker id="ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="' + C.bad + '"/></marker></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>';

  /* header */
  s += '<rect x="0" y="0" width="' + W + '" height="74" fill="' + C.accent + '"/>';
  s += label(30, 33, 'Стероидогенез и метаболизм эстрогенов', 24, '#ffffff', 'start', 700, FONTC);
  const pat = [meta.fio ? meta.fio : 'ФИО не указано', meta.age ? meta.age + ' лет' : '', K.STATUS_TXT[stVal]].filter(Boolean).join(' · ');
  s += label(30, 59, pat, 15, '#ffffff', 'start', 600);
  s += label(W - 30, 33, 'Анализ: ' + (meta.date || 'дата не указана') + (meta.doctor ? ' · Врач: ' + meta.doctor : ''), 14, '#ffffff', 'end', 500);
  s += label(W - 30, 59, K.PROFILES[pk].label.split(' (')[0] + (SL ? ' · стероиды в слюне' : ''), 12.5, '#f1dce9', 'end', 400);

  /* section titles */
  s += label(30, 108, 'СИНТЕЗ СТЕРОИДНЫХ ГОРМОНОВ', 13, C.muted, 'start', 700);
  s += label(940, 108, 'МЕТАБОЛИЗМ ЭСТРОГЕНОВ', 13, C.muted, 'start', 700);
  if (SL) s += label(318, 108, '· гормоны синтеза: слюна, свободные фракции', 11.5, C.grey, 'start', 600);
  s += '<line x1="912" y1="96" x2="912" y2="880" stroke="' + C.line + '" stroke-width="1" stroke-dasharray="3 5"/>';
  s += label(245, 135, 'минералокортикоиды', 11.5, C.grey, 'middle');
  s += label(435, 135, 'глюкокортикоиды', 11.5, C.grey, 'middle');
  s += label(720, 135, 'половые стероиды', 11.5, C.grey, 'middle');

  /* left grid */
  const xPD = 80, x1 = 245, x2 = 435, x3 = 625, x4 = 815;
  const y0 = 170, y1 = 265, y2 = 385, y3 = 505, y4 = 620, y5 = 735;
  const NW = 150, NH = 54;
  const g = 'grey';
  const hs = (xa_, xb_, y) => arrow(xa_ + NW / 2, y, xb_ - NW / 2 - 2, y);
  const vs = (x, ya_, yb_) => arrow(x, ya_ + NH / 2, x, yb_ - NH / 2 - 2);
  s += vs(x1, y0, y1);
  s += hs(x1, x2, y1) + hs(x2, x3, y1);
  s += vs(x1, y1, y2) + vs(x2, y1, y2) + vs(x3, y1, y2);
  s += hs(x1, x2, y2) + hs(x3, x4, y2);
  s += arrow(x1 - NW / 2, y2, xPD + 62, y2);
  s += vs(x1, y2, y3) + vs(x2, y2, y3) + vs(x3, y2, y3) + vs(x4, y2, y3);
  s += arrow(x3 + NW / 2, y3 - 8, x4 - NW / 2 - 2, y3 - 8);
  s += arrow(x4 - NW / 2, y3 + 8, x3 + NW / 2 + 2, y3 + 8);
  s += vs(x1, y3, y4) + vs(x2, y3, y4) + vs(x1, y4, y5);

  // enzyme names: vertical arrows to the left of the arrow, horizontal arrows above the gap
  const enzV = (x, ya_, yb_, t, col) => label(x - 8, (ya_ + yb_) / 2 + 4, t, 11, col || C.grey, 'end', 600);
  const enzH = (xa_, xb_, y, t, col) => label((xa_ + xb_) / 2, y - 34, t, 10.5, col || C.grey, 'middle', 700);
  const p17 = geneP(['CYP17A1'], 'CYP17A1');
  const c17 = ST[p17[1]][1];
  s += enzV(x1, y0, y1, 'CYP11A1');
  s += enzV(x1, y1, y2, 'HSD3B2') + enzV(x2, y1, y2, 'HSD3B2') + enzV(x3, y1, y2, 'HSD3B2');
  s += enzV(x1, y2, y3, 'CYP21A2') + enzV(x2, y2, y3, 'CYP21A2');
  s += enzV(x1, y3, y4, 'CYP11B1') + enzV(x2, y3, y4, 'CYP11B1') + enzV(x1, y4, y5, 'CYP11B2');
  s += enzH(x1, x2, y1, 'CYP17A1', c17) + enzH(x2, x3, y1, 'CYP17A1', c17) + enzH(x1, x2, y2, 'CYP17A1', c17);
  s += enzH(x3, x4, y2, 'HSD17B3') + label((x3 + x4) / 2, y3 - 34, 'HSD17B1 →', 10, C.grey, 'middle', 700) + label((x3 + x4) / 2, y3 + 40, '← HSD17B2', 10, C.grey, 'middle', 700);
  s += label(xPD, y2 - 34, '5β-редукция', 10.5, C.grey, 'middle', 700);
  const p19 = geneP(['CYP19A1'], 'CYP19A1');
  const c19 = ST[p19[1]][1];
  s += enzV(x3, y2, y3, 'CYP19A1', c19);
  s += label(x4 + 8, (y2 + y3) / 2 + 4, 'CYP19A1', 11, c19, 'start', 600);
  // genotype pills in free space
  s += pill((x2 + x3) / 2, y0 - 2, p17[0], p17[1]);
  s += label((x2 + x3) / 2, y0 - 22, 'генотип', 10.5, C.grey, 'middle');
  s += pill((x3 + x4) / 2, (y2 + y3) / 2 + 2, p19[0], p19[1]);

  // nodes
  s += node(x1, y0, NW, NH, 'Холестерин', 'не измеряется', g);
  s += salNode(x1, y1, NW, NH, 'Прегненолон', 'PREG');
  s += node(x2, y1, NW, NH, '17-OH-прегненолон', 'не измеряется', g);
  s += salNode(x3, y1, NW, NH, 'ДГЭА', 'DHEA');
  const pgSt = v('PD') == null ? 'grey' : stFromRange(S.PD, { low: stVal === 'lut' ? 'bad' : 'edge', high: 'edge' });
  s += salNode(x1, y2, NW, NH, 'Прогестерон', 'P4', G.PGR >= 1 && salHas('P4') && SL.S.P4 === 'low');
  s += node(xPD, y2, 124, NH, 'Прегнандиол', v('PD') == null ? 'не измерен' : fmt(v('PD')) + word(S.PD), pgSt, { confirmed: G.PGR >= 1 && F.loPD });
  s += salNode(x2, y2, NW, NH, '17-OH-прогестерон', 'OHP');
  s += salNode(x3, y2, NW, NH, 'Андростендион', 'A4');
  s += salNode(x4, y2, NW, NH, 'Тестостерон', 'T');
  s += node(x1, y3, NW, NH, 'ДОК', 'дезоксикортикостерон', g);
  s += node(x2, y3, NW, NH, '11-дезоксикортизол', 'не измеряется', g);
  const loadConf = (G.CYP19A1 >= 1 || G.CYP17A1 >= 1) && F.hiLoad;
  const e1St = v('E1') == null ? 'grey' : stFromRange(S.E1, { low: stVal === 'pm' ? 'ok' : 'edge', high: 'bad' });
  const e2St = v('E2') == null ? 'grey' : stFromRange(S.E2, { low: stVal === 'pm' ? 'ok' : 'edge', high: 'bad' });
  s += node(x3, y3, NW, NH, 'Эстрон (E1)', v('E1') == null ? 'не измерен' : fmt(v('E1')) + word(S.E1), e1St, { confirmed: loadConf && S.E1 === 'high' });
  if (salHas('E2') && v('E2') != null) s += node(x4, y3, NW, NH + 16, 'Эстрадиол (E2)', 'моча ' + fmt(v('E2')) + sw(S.E2), worst(e2St, salSt('E2')), { confirmed: loadConf && S.E2 === 'high', subst: e2St, sub2: 'слюна ' + salTxt('E2'), sub2st: salSt('E2') });
  else if (salHas('E2')) s += node(x4, y3, NW, NH, 'Эстрадиол (E2)', salTxt('E2'), salSt('E2'));
  else s += node(x4, y3, NW, NH, 'Эстрадиол (E2)', v('E2') == null ? 'не измерен' : fmt(v('E2')) + word(S.E2), e2St, { confirmed: loadConf && S.E2 === 'high' });
  s += node(x1, y4, NW, NH, 'Кортикостерон', 'не измеряется', g);
  const cK = SL ? SL.cm : null;
  s += cK ? node(x2, y4, NW, NH, 'Кортизол', (cK === 'C1' ? 'утро ' : '') + salTxt(cK), salSt(cK)) : node(x2, y4, NW, NH, 'Кортизол', 'не измеряется', g);
  s += vs(x2, y4, y5) + enzV(x2, y4, y5, 'HSD11B2');
  s += salNode(x2, y5, NW, NH, 'Кортизон', 'CORTISONE');
  if (SL && SL.RV.ff) s += label(x2, y5 + NH / 2 + 15, 'кортизол/кортизон ' + fmt(SL.RV.ff.val), 11, SL.RV.ff.st === 'high' ? C.bad : C.muted, 'middle', 600);
  if (SL && SL.RV.pge2) s += label(x1 + 12, y2 + 42, 'Pg/E2 ' + fmt(SL.RV.pge2.val), 11, SL.RV.pge2.st === 'low' ? C.bad : C.muted, 'start', 600);
  // diurnal cortisol curve (saliva)
  if (SL && SL.curve.length >= 2) {
    const px0 = 60, px1 = 470, py0 = 816, py1 = 878;
    const pts = ['C1', 'C2', 'C3', 'C4'].map((key, i) => ({ key, i, r: SL.R[key] })).filter(p => p.r.v != null);
    const toNg = (val, r) => r.unit === 'нг/мл' ? val : r.unit === 'пг/мл' ? val / 1000 : r.unit === 'нмоль/л' ? val * 0.36246 : r.unit === 'пмоль/л' ? val * 0.00036246 : val;
    let mx = 0; pts.forEach(p => { mx = Math.max(mx, toNg(p.r.v, p.r), p.r.hi != null ? toNg(p.r.hi, p.r) : 0); }); mx = mx * 1.15 || 1;
    const X = i => px0 + 30 + i * (px1 - px0 - 60) / 3, Y = val => py1 - (py1 - py0) * Math.min(1, val / mx);
    s += label(px0 - 20, 786, 'Суточный ритм кортизола, слюна (нг/мл)', 12, C.ink, 'start', 700);
    s += '<line x1="' + px0 + '" y1="' + py1 + '" x2="' + px1 + '" y2="' + py1 + '" stroke="' + C.line + '"/>';
    pts.forEach(p => { if (p.r.hi != null) { const lo = p.r.lo != null ? toNg(p.r.lo, p.r) : 0, hi2 = toNg(p.r.hi, p.r); s += '<rect x="' + (X(p.i) - 13) + '" y="' + Y(hi2) + '" width="26" height="' + Math.max(2, Y(lo) - Y(hi2)) + '" rx="3" fill="' + C.okSoft + '" stroke="' + C.ok + '" stroke-width="0.8"/>'; } });
    s += '<polyline points="' + pts.map(p => X(p.i) + ',' + Y(toNg(p.r.v, p.r)).toFixed(1)).join(' ') + '" fill="none" stroke="' + C.accent + '" stroke-width="2"/>';
    pts.forEach(p => {
      const stp = salSt(p.key), col = stp === 'grey' || stp === 'neutral' ? C.accent : ST[stp][1], yy = Y(toNg(p.r.v, p.r));
      s += '<circle cx="' + X(p.i) + '" cy="' + yy.toFixed(1) + '" r="5" fill="' + col + '" stroke="#fff" stroke-width="1.5"/>';
      s += label(X(p.i), yy - 9, fmt(p.r.v), 11, col, 'middle', 700);
    });
    ['утро', 'полдень', 'вечер', 'ночь'].forEach((t, i) => { s += label(X(i), py1 + 14, t, 10.5, C.muted, 'middle'); });
  }
  s += node(x1, y5, NW, NH, 'Альдостерон', 'не измеряется', g);
  // receptors
  const pEsr = geneP(['ESR1_PvuII', 'ESR1_XbaI'], 'ESR1');
  s += label(x4, y3 + 50, 'рецептор', 10.5, C.grey, 'middle');
  s += pill(x4, y3 + 66, pEsr[0], pEsr[1]);
  const pPgr = geneP(['PGR'], 'PGR');
  s += label(xPD, y2 + 50, 'рецептор', 10.5, C.grey, 'middle');
  s += pill(xPD, y2 + 66, pPgr[0], pPgr[1]);

  /* ---------- right: estrogen metabolism ---------- */
  const xa = 1030, xb = 1260, xc = 1480;
  const ya = 300, yb = 475, yc = 650, yq = 765, yp = 850;
  const MW = 170, MH = 58;
  // incoming arrows from E1/E2 bracket
  s += '<line x1="' + (x4 + NW / 2 + 4) + '" y1="' + y3 + '" x2="935" y2="' + y3 + '" stroke="' + C.line + '" stroke-width="2"/>';
  s += '<line x1="935" y1="' + ya + '" x2="935" y2="' + yc + '" stroke="' + C.line + '" stroke-width="2"/>';
  const c2 = F.lo2 ? C.bad : C.line, c4 = F.hi4 ? C.bad : C.line, c16 = (F.low216 || F.hi16) ? C.bad : C.line;
  s += arrow(935, ya, xa - MW / 2 - 2, ya, c2);
  s += arrow(935, yb, xa - MW / 2 - 2, yb, c16);
  s += arrow(935, yc, xa - MW / 2 - 2, yc, c4);
  s += label(944, ya - 10, 'фаза I', 11, C.muted, 'start', 600);
  // phase I pills
  const pA1 = geneP(['CYP1A1_462', 'CYP1A1_MspI'], 'CYP1A1');
  const pA2 = (() => { const n = G.CYP1A2; return ['CYP1A2 ' + (n == null ? 'н/и' : gtShort('CYP1A2')), n == null ? 'grey' : n === 2 ? 'bad' : n === 1 ? 'ok' : 'ok']; })();
  s += pill(xa - 48, ya - 46, pA1[0], pA1[1]) + pill(xa + 52, ya - 46, pA2[0], pA2[1]);
  const p3A4 = geneP(['CYP3A4'], 'CYP3A4');
  s += pill(xa - 40, yb - 46, p3A4[0], p3A4[1]) + label(xa + 32, yb - 42, 'и др. CYP3A', 10.5, C.grey, 'start', 600);
  const p1B1 = geneP(['CYP1B1'], 'CYP1B1');
  s += pill(xa, yc - 46, p1B1[0], p1B1[1]);
  // phase I nodes
  const sh = k => R[k] != null ? ' · ' + Math.round(R[k]) + ' %' : '';
  const n2val = v('OH2E1') == null ? 'не измерен' : fmt(v('OH2E1')) + sh('s2') + word(S.OH2E1);
  const n2st = v('OH2E1') == null ? 'grey' : worst(stFromRange(S.OH2E1, { low: 'bad', high: 'ok' }), F.lo2 ? 'bad' : 'grey');
  s += node(xa, ya, MW, MH, '2-OH-эстрогены', n2val, n2st, { confirmed: G.CYP1A2 === 2 && (F.lo2 || F.low216) });
  const n16val = v('OH16E1') == null ? 'не измерен' : fmt(v('OH16E1')) + sh('s16') + word(S.OH16E1);
  const n16st = v('OH16E1') == null ? 'grey' : worst(stFromRange(S.OH16E1, { low: 'edge', high: 'bad' }), (F.low216 || F.hi16) ? 'bad' : 'grey');
  s += node(xa, yb, MW, MH, '16α-OH-эстрон', n16val, n16st);
  const n4val = v('OH4E1') == null ? 'не измерен' : fmt(v('OH4E1')) + sh('s4') + word(S.OH4E1);
  const n4st = v('OH4E1') == null ? 'grey' : worst(stFromRange(S.OH4E1, { low: 'ok', high: 'bad' }), F.hi4 ? 'bad' : 'grey');
  s += node(xa, yc, MW, MH, '4-OH-эстрогены', n4val, n4st, { confirmed: G.CYP1B1 >= 1 && F.hi4 });
  // ratios under phase I
  if (R.r216 != null) s += label(xa, yb + 46, '2/16 = ' + fmt(R.r216) + (R.r24 != null ? ' · 2/4 = ' + fmt(R.r24) : ''), 12, (F.low216 || F.hi4) ? C.bad : C.muted, 'middle', 600);

  // phase II
  const methBad = F.lowMeth;
  s += arrow(xa + MW / 2, ya, xb - MW / 2 - 2, ya, methBad ? C.bad : C.line);
  s += arrow(xa + MW / 2, yb, xb - MW / 2 - 2, yb);
  s += arrow(xa + MW / 2, yc, xb - MW / 2 - 2, yc, methBad ? C.bad : C.line);
  s += label(xb - MW / 2 - 4, y3 - 230, '', 11);
  const pComt = geneP(['COMT'], 'COMT');
  s += label((xa + xb) / 2, ya - 8, 'COMT', 10.5, ST[pComt[1]][1], 'middle', 700) + label((xa + xb) / 2, yc - 8, 'COMT', 10.5, ST[pComt[1]][1], 'middle', 700);
  s += pill(xb - 175, ya - 100, pComt[0], pComt[1]);
  const m2val = v('MeO2E1') == null ? 'не измерен' : fmt(v('MeO2E1')) + (R.m2 != null ? ' · 2-OMe/2-OH ' + fmt(R.m2) : '');
  const m2st = v('MeO2E1') == null ? 'grey' : worst(stFromRange(S.MeO2E1, { low: 'bad', high: 'ok' }), methBad ? 'bad' : 'grey');
  s += node(xb, ya, MW, MH, '2-метоксиэстрогены', m2val, m2st, { confirmed: G.COMT >= 1 && methBad });
  const e3val = v('E3') == null ? 'не измерен' : fmt(v('E3')) + (R.eq != null ? ' · E3/(E1+E2) ' + fmt(R.eq) : '');
  const e3st = v('E3') == null ? 'grey' : worst(stFromRange(S.E3, { low: 'edge', high: 'ok' }), F.lowEQ ? 'edge' : 'grey');
  s += node(xb, yb, MW, MH, 'Эстриол (E3)', e3val, e3st);
  const m4val = v('MeO4E1') == null ? 'не измерен' : fmt(v('MeO4E1')) + (R.m4inv != null ? ' · 4-OH/4-OMe ' + fmt(R.m4inv) : '');
  const m4st = v('MeO4E1') == null ? 'grey' : worst(stFromRange(S.MeO4E1, { low: 'edge', high: 'ok' }), methBad ? 'bad' : 'grey');
  s += node(xb, yc, MW, MH, '4-метоксиэстрогены', m4val, m4st, { confirmed: G.COMT >= 1 && methBad && v('MeO4E1') != null });
  s += label(xb + MW / 2 + 8, ya - 34, 'фаза II', 11, C.muted, 'start', 600);

  // methyl cycle
  const folN = maxOf(['MTHFR677', 'MTHFR1298', 'MTR', 'MTRR']);
  const mcSt = folN == null ? (methBad ? 'edge' : 'grey') : worst(['ok', 'edge', 'bad'][folN], methBad ? 'edge' : 'grey', methBad && folN >= 1 ? 'bad' : 'grey');
  const ym = 165;
  s += node(xb, ym, MW + 20, MH, 'Метильный цикл', folN == null ? 'генотипы не указаны' : 'фолаты, B12 → SAMe', mcSt);
  s += arrow(xb, ym + MH / 2, xb, ya - MH / 2 - 26, C.line, true);
  const mp = [geneP(['MTHFR677', 'MTHFR1298'], 'MTHFR'), geneP(['MTR'], 'MTR'), geneP(['MTRR'], 'MTRR')];
  s += pills(xb + MW / 2 + 72, ym, mp);

  // quinones and protection
  const gstRisk = G.GSTM1 === 2 || G.GSTT1 === 2 || G.GSTP1 >= 1;
  const nqoRisk = G.NQO1 >= 1;
  const geneQ = G.CYP1B1 >= 1 || G.COMT >= 1 || gstRisk || nqoRisk;
  const anyQtested = ['CYP1B1', 'COMT', 'GSTM1', 'GSTT1', 'GSTP1', 'NQO1'].some(id => G[id] != null);
  const combos = K.geneCombos(G, bmi);
  const quinCombo = combos.some(t => t.indexOf('хинон') >= 0);
  const qSt = F.hi4 ? 'bad' : quinCombo ? 'bad' : geneQ ? 'edge' : (v('OH4E1') != null || anyQtested) ? 'ok' : 'grey';
  s += arrow(xa, yc + MH / 2, xa, yq - MH / 2 - 2, F.hi4 ? C.bad : C.line);
  s += node(xa, yq, MW, MH, '3,4-хиноны', qSt === 'bad' ? 'риск повышен' : qSt === 'edge' ? 'генетическая предрасположенность' : qSt === 'ok' ? 'без признаков избытка' : 'нет данных', qSt);
  const dnaSt = (F.hi4 && (gstRisk || nqoRisk || G.COMT >= 1)) || quinCombo ? 'bad' : (F.hi4 || geneQ) ? 'edge' : qSt === 'ok' ? 'ok' : 'grey';
  s += arrow(xa + MW / 2, yq, xb - MW / 2 - 2, yq, dnaSt === 'bad' ? C.bad : C.line);
  s += node(xb, yq, MW, MH, 'Аддукты ДНК', dnaSt === 'bad' ? 'риск высокий' : dnaSt === 'edge' ? 'риск умеренный' : dnaSt === 'ok' ? 'риск низкий' : 'нет данных', dnaSt);
  const protN = Math.max(G.GSTM1 === 2 || G.GSTT1 === 2 ? 2 : (G.GSTM1 === 1 || G.GSTT1 === 1 ? 1 : -1), G.GSTP1 == null ? -1 : G.GSTP1, G.NQO1 == null ? -1 : G.NQO1);
  const protSt = protN < 0 ? 'grey' : ['ok', 'edge', 'bad'][protN];
  s += arrow(xa, yq + MH / 2, xa, yp - 22, C.line, true);
  s += node(xa, yp + 4, MW + 60, 46, 'Обезвреживание хинонов', '', protSt);
  s += pills(xb - 20, yp + 4, [geneP(['GSTM1'], 'GSTM1'), geneP(['GSTT1'], 'GSTT1')]);
  s += pills(xb + 105, yp + 4, [geneP(['GSTP1'], 'GSTP1'), geneP(['NQO1'], 'NQO1')]);

  // conjugation & excretion
  const cjN = maxOf(['SULT1A1', 'UGT1A1']);
  const exSt = cjN == null ? (F.hiLoad ? 'edge' : 'grey') : worst(['ok', 'edge', 'bad'][cjN], F.hiLoad && cjN >= 1 ? 'bad' : 'grey');
  s += '<rect x="' + (xc - 80) + '" y="' + (ya - 30) + '" width="160" height="' + (yc - ya + 60) + '" rx="10" fill="' + ST[exSt][0] + '" stroke="' + ST[exSt][1] + '" stroke-width="2"/>';
  s += label(xc, ya - 2, 'Конъюгация', 15.5, exSt === 'grey' ? C.muted : C.ink, 'middle', 600, FONTC);
  s += label(xc, ya + 17, 'и выведение', 15.5, exSt === 'grey' ? C.muted : C.ink, 'middle', 600, FONTC);
  s += label(xc, ya + 40, 'сульфатирование,', 12, C.muted, 'middle');
  s += label(xc, ya + 56, 'глюкуронидация', 12, C.muted, 'middle');
  s += pills(xc, yb - 10, [geneP(['SULT1A1'], 'SULT1A1'), geneP(['UGT1A1'], 'UGT1A1')]);
  s += label(xc, yc - 6, 'с мочой и желчью', 12, C.muted, 'middle');
  s += label(xc, yc + 12, 'кишечная β-глюкуронидаза', 11, C.grey, 'middle');
  s += arrow(xb + MW / 2, ya, xc - 82, ya);
  s += arrow(xb + MW / 2, yb, xc - 82, yb);
  s += arrow(xb + MW / 2, yc, xc - 82, yc);


  /* ---------- modifiers (what speeds up / slows down each step) ---------- */
  const mod = (x, y, lines, anchor) => lines.map((t, i) => label(x, y + i * 13, t, 10.5, t.charAt(0) === '↑' ? C.edge : t.charAt(0) === '↓' ? C.ok : C.muted, anchor || 'start', 500)).join('');
  s += label(525, 552, 'Ароматаза', 10.5, C.ink, 'start', 700);
  s += mod(525, 566, ['↑ ожирение, инсулин, алкоголь', '↓ снижение массы, лигнаны']);
  s += mod(xa - MW / 2, ya + 44, ['↑ крестоцветные, DIM/I3C, лён,', '   омега-3, нагрузка', '↓ ожирение, гипотиреоз']);
  s += mod(xa - MW / 2, yb + 64, ['↑ ожирение, гипотиреоз,', '   алкоголь, пестициды']);
  s += mod(xa + 10, yc + 46, ['↑ курение, ПАУ, алкоголь', '↓ сульфорафан, ресвератрол']);
  s += mod(xb - 8, ya - 72, ['COMT ↑ Mg, SAMe, B6/B9/B12', '↓ кверцетин, EGCG, стресс'], 'end');

  /* ---------- at a glance: ratio scales and metabolite donut ---------- */
  const gx = 525, gy = 640;
  s += '<rect x="' + (gx - 10) + '" y="' + gy + '" width="' + (895 - gx + 10) + '" height="232" rx="10" fill="#faf7f9" stroke="' + C.line + '"/>';
  s += label(gx + 4, gy + 24, 'Коротко', 15, C.accent, 'start', 700, FONTC);
  const scale = (y, title, val, ref, loTxt, hiTxt, goodHigh) => {
    let o = label(gx + 4, y, title, 12, C.ink, 'start', 600);
    const x0 = gx + 4, w = 180, ty = y + 12;
    const lo = ref && ref[0] != null ? ref[0] : null, hi = ref && ref[1] != null ? ref[1] : null;
    // three zones: below / within / above
    const zb = goodHigh ? C.badSoft : C.badSoft, za = goodHigh ? C.okSoft : C.edgeSoft;
    o += '<rect x="' + x0 + '" y="' + ty + '" width="' + w / 3 + '" height="10" rx="5" fill="' + zb + '"/>';
    o += '<rect x="' + (x0 + w / 3) + '" y="' + ty + '" width="' + w / 3 + '" height="10" fill="' + C.okSoft + '" stroke="' + C.ok + '" stroke-width="0.8"/>';
    o += '<rect x="' + (x0 + 2 * w / 3) + '" y="' + ty + '" width="' + w / 3 + '" height="10" rx="5" fill="' + za + '"/>';
    if (val != null && lo != null) {
      let p; const L = lo, Hh = hi != null ? hi : lo * 3;
      if (val < L) p = (val / L) / 3; else if (val <= Hh) p = 1 / 3 + (val - L) / (Hh - L) / 3; else p = 2 / 3 + Math.min(1, (val - Hh) / (Hh * 1.5)) / 3;
      p = Math.max(0.01, Math.min(0.99, p));
      o += '<path d="M' + (x0 + p * w - 6) + ',' + (ty - 7) + ' L' + (x0 + p * w + 6) + ',' + (ty - 7) + ' L' + (x0 + p * w) + ',' + (ty + 1) + ' z" fill="' + C.ink + '"/>';
      o += '<rect x="' + (x0 + p * w - 1.5) + '" y="' + (ty - 2) + '" width="3" height="14" fill="' + C.ink + '"/>';
    }
    o += label(x0, ty + 24, loTxt, 10, C.muted) + label(x0 + w, ty + 24, hiTxt, 10, C.muted, 'end');
    o += label(x0 + w + 8, ty + 10, val == null ? 'н/д' : fmt(val), 13, C.ink, 'start', 700);
    o += label(x0 + w / 2, ty + 38, ref ? 'норма ' + (hi != null ? (lo != null ? fmt(lo) : '') + '–' + fmt(hi) : '≥ ' + fmt(lo)) : '', 9.5, C.ok, 'middle', 600);
    return o;
  };
  const r216ref = (L.RR && L.RR.r216) || [2, null];
  const m2ref = (L.RR && (L.RR.m2 || null)) || [0.39, 0.67];
  s += scale(gy + 50, '2/16: 2-OH / 16α-OH', R.r216, r216ref, 'перевес 16α', 'перевес 2-OH', true);
  s += scale(gy + 120, 'Метилирование: 2-OMe / 2-OH', R.m2, m2ref, 'меньше', 'больше', true);
  s += label(gx + 4, gy + 192, 'Шкалы: зелёная зона — референс панели', 9.5, C.grey);
  s += label(gx + 4, gy + 205, '(для 2/16 без референса — ориентир 2,0)', 9.5, C.grey);
  // donut of metabolites
  const segs = [
    ['2-OH', (v('OH2E1') || 0) + (v('OH2E2') || 0), C.ok],
    ['2-OMe', (v('MeO2E1') || 0) + (v('MeO2E2') || 0), '#1f5e3a'],
    ['16α-OH', v('OH16E1') || 0, '#d29a1f'],
    ['4-OH', (v('OH4E1') || 0) + (v('OH4E2') || 0), C.bad],
    ['4-OMe', v('MeO4E1') || 0, '#7fb894']
  ].filter(x => x[1] > 0);
  const tot = segs.reduce((a, x) => a + x[1], 0);
  const cx = 830, cy = gy + 92, ro = 46, ri = 27;
  if (tot > 0) {
    let a0 = -Math.PI / 2;
    segs.forEach(([n, val, col]) => {
      const a1 = a0 + 2 * Math.PI * val / tot, big = a1 - a0 > Math.PI ? 1 : 0;
      const P = (r, a) => (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1);
      if (segs.length === 1) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((ro + ri) / 2) + '" fill="none" stroke="' + col + '" stroke-width="' + (ro - ri) + '"/>';
      else s += '<path d="M' + P(ro, a0) + ' A' + ro + ',' + ro + ' 0 ' + big + ' 1 ' + P(ro, a1) + ' L' + P(ri, a1) + ' A' + ri + ',' + ri + ' 0 ' + big + ' 0 ' + P(ri, a0) + ' z" fill="' + col + '" stroke="#fff" stroke-width="1.5"/>';
      a0 = a1;
    });
    s += label(cx, cy + 4, 'метаболиты', 9, C.muted, 'middle');
    segs.forEach(([n, val, col], i) => {
      const lx = 790, ly = gy + 152 + i * 14;
      s += '<rect x="' + lx + '" y="' + (ly - 8) + '" width="9" height="9" rx="2" fill="' + col + '"/>' + label(lx + 13, ly, n + ' ' + Math.round(100 * val / tot) + '%', 9.5, C.ink);
    });
  } else {
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((ro + ri) / 2) + '" fill="none" stroke="' + C.greySoft + '" stroke-width="' + (ro - ri) + '"/>' + label(cx, cy + 4, 'нет данных', 10, C.grey, 'middle');
  }
  s += label(cx, gy + 24, 'Распределение', 11, C.muted, 'middle', 600);

  /* ---------- footer: legend + findings ---------- */
  const fy = 925;
  s += '<line x1="30" y1="' + (fy - 22) + '" x2="' + (W - 30) + '" y2="' + (fy - 22) + '" stroke="' + C.line + '" stroke-width="1"/>';
  const leg = [['ok', 'норма'], ['edge', 'у границы · гетерозигота'], ['bad', 'отклонение · гомозигота'], ['grey', 'не исследовано']];
  let lx = 30;
  leg.forEach(([st, t]) => {
    s += '<rect x="' + lx + '" y="' + (fy - 9) + '" width="22" height="16" rx="4" fill="' + ST[st][0] + '" stroke="' + ST[st][1] + '" stroke-width="1.6"/>';
    s += label(lx + 30, fy + 4, t, 13, C.ink); lx += 30 + t.length * 7.2 + 26;
  });
  s += '<rect x="' + lx + '" y="' + (fy - 11) + '" width="26" height="20" rx="5" fill="none" stroke="' + C.bad + '" stroke-width="2" stroke-dasharray="5 3"/>';
  s += label(lx + 34, fy + 4, 'генотип подтверждён метаболитами', 13, C.ink);
  s += label(W - 30, fy + 4, 'н/и — не исследовано', 12, C.muted, 'end');

  const estF = L.findings || [], salF = SL ? SL.findings.filter(t => !/в пределах референсов/.test(t)) : [];
  const fnd = estF.slice(0, salF.length ? Math.max(4, 8 - salF.length) : 8).concat(salF).slice(0, 8);
  s += label(30, fy + 42, 'Основные выводы', 15, C.accent, 'start', 700, FONTC);
  if (!fnd.length) s += label(30, fy + 68, 'Значимых отклонений не выявлено.', 13, C.ink);
  fnd.forEach((t, i) => {
    const col = i < 4 ? 0 : 1, row = i % 4;
    const x = 30 + col * 785, y = fy + 68 + row * 24;
    s += '<circle cx="' + (x + 5) + '" cy="' + (y - 4.5) + '" r="3.5" fill="' + C.accent + '"/>';
    s += label(x + 16, y, t.length > 105 ? t.slice(0, 103) + '…' : t, 13, C.ink);
  });
  s += label(W - 30, H - 14, 'Сформировано ' + new Date().toLocaleDateString('ru-RU') + ' · интерпретация вспомогательная, решение о назначениях принимает лечащий врач', 11, C.grey, 'end');
  s += '</svg>';
  return s;
}

/* ---------- export ---------- */
function meta() {
  const K = window.__calc;
  const d = document.getElementById('scDate').value;
  return {
    fio: document.getElementById('scFio').value.trim(),
    date: d ? new Date(d + 'T00:00').toLocaleDateString('ru-RU') : '',
    doctor: document.getElementById('scDoc').value.trim(),
    age: (document.getElementById('age') || {}).value || ''
  };
}
function render() {
  const box = document.getElementById('schemaBox'); if (!box) return;
  box.innerHTML = buildSvg(meta());
}
function fileBase() {
  const m = meta();
  return ('Схема_эстрогены_' + (m.fio || 'пациент') + (m.date ? '_' + m.date : '')).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
}
function toCanvas(scale) {
  return new Promise((res, rej) => {
    const svg = buildSvg(meta());
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height); res(c);
    };
    img.onerror = () => rej(new Error('не удалось построить изображение'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function note(msg, err) { const el = document.getElementById('scMsg'); el.textContent = msg; el.style.color = err ? 'var(--bad)' : 'var(--ok)'; }
async function exportPng() {
  try { note('Готовлю PNG…'); const c = await toCanvas(2); c.toBlob(b => { download(b, fileBase() + '.png'); note('PNG сохранён. Если файл не появился, откройте сайт в отдельной вкладке браузера.'); }, 'image/png'); }
  catch (e) { note('Не удалось сохранить PNG: ' + e.message, true); }
}
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/jspdf.umd.min.js'; s.onload = res; s.onerror = () => rej(new Error('модуль PDF не загрузился')); document.head.appendChild(s); });
}
async function exportPdf() {
  try {
    note('Готовлю PDF…');
    await loadJsPdf();
    const c = await toCanvas(2);
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pw = 297, ph = 210, m = 6, w = pw - 2 * m, h = w * H / W;
    pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', m, (ph - h) / 2, w, h);
    pdf.setProperties({ title: 'Схема стероидогенеза и метаболизма эстрогенов', subject: meta().fio || '' });
    download(pdf.output('blob'), fileBase() + '.pdf');
    note('PDF сохранён (A4, альбомная). Если файл не появился, откройте сайт в отдельной вкладке браузера.');
  } catch (e) { note('Не удалось сохранить PDF: ' + e.message, true); }
}
window.Schema = { render, exportPng, exportPdf, buildSvg };
})();
