/* Saliva steroid profile: free fractions (Gemotest 2.80 / 2.79 / 2.75 and similar panels), import, ratios, interpretation. */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const K = () => window.__calc;
const num = s => { if (s == null) return null; const t = String(s).trim().replace(/\s/g, '').replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };

/* ---------- Catalogue ---------- */
const SAL = [
  { k: 'CORT', name: 'Кортизол', sub: 'однократно (утро)', mw: 362.46, unit: 'нг/мл', grp: 'Глюкокортикоиды' },
  { k: 'CORTISONE', name: 'Кортизон', mw: 360.44, unit: 'нг/мл', grp: 'Глюкокортикоиды' },
  { k: 'PREG', name: 'Прегненолон', mw: 316.48, unit: 'пг/мл', grp: 'Предшественники', opt: true },
  { k: 'OHP', name: '17-OH-прогестерон', mw: 330.46, unit: 'пг/мл', grp: 'Предшественники' },
  { k: 'DHEA', name: 'ДГЭА', sub: 'дегидроэпиандростерон', mw: 288.42, unit: 'пг/мл', grp: 'Андрогены' },
  { k: 'A4', name: 'Андростендион', mw: 286.41, unit: 'пг/мл', grp: 'Андрогены' },
  { k: 'T', name: 'Тестостерон', mw: 288.42, unit: 'пг/мл', grp: 'Андрогены' },
  { k: 'E2', name: 'Эстрадиол', mw: 272.38, unit: 'пг/мл', grp: 'Эстрогены и прогестерон' },
  { k: 'P4', name: 'Прогестерон', mw: 314.46, unit: 'пг/мл', grp: 'Эстрогены и прогестерон' },
  { k: 'C1', name: 'Кортизол · 1-я порция', sub: 'утро', mw: 362.46, unit: 'нг/мл', grp: 'Суточный ритм кортизола' },
  { k: 'C2', name: 'Кортизол · 2-я порция', sub: 'полдень', mw: 362.46, unit: 'нг/мл', grp: 'Суточный ритм кортизола' },
  { k: 'C3', name: 'Кортизол · 3-я порция', sub: 'вечер', mw: 362.46, unit: 'нг/мл', grp: 'Суточный ритм кортизола' },
  { k: 'C4', name: 'Кортизол · 4-я порция', sub: 'ночь', mw: 362.46, unit: 'нг/мл', grp: 'Суточный ритм кортизола' }
];
const SI = Object.fromEntries(SAL.map(a => [a.k, a]));
const UNITS = ['пг/мл', 'нг/мл', 'нмоль/л', 'пмоль/л'];
// value in pg/mL
function toPg(v, unit, mw) {
  if (v == null) return null;
  if (unit === 'нг/мл') return v * 1000;
  if (unit === 'нмоль/л') return v * mw;
  if (unit === 'пмоль/л') return v * mw / 1000;
  return v;
}
const toPmol = (v, unit, mw) => { const p = toPg(v, unit, mw); return p == null ? null : p / mw * 1000; };

const state = { rows: {}, imp: null, last: null };
SAL.forEach(a => { state.rows[a.k] = { v: null, unit: a.unit, lo: null, hi: null, q: '' }; });

/* ---------- Table ---------- */
function buildTable() {
  const tb = $('salRows'); if (!tb) return;
  let grp = '', h = '';
  SAL.forEach(a => {
    if (a.grp !== grp) { grp = a.grp; h += '<tr class="grp"><td colspan="6">' + esc(grp) + '</td></tr>'; }
    const r = state.rows[a.k];
    const uo = UNITS.map(u => '<option' + (u === r.unit ? ' selected' : '') + '>' + u + '</option>').join('');
    const f = x => (x == null ? '' : String(x).replace('.', ','));
    h += '<tr data-k="' + a.k + '"><td><span class="code">' + esc(a.name) + '</span>' + (a.sub ? ' <span class="muted" style="font-size:12px;">' + esc(a.sub) + '</span>' : '') + '</td>' +
      '<td><input class="v" id="sv_' + a.k + '" inputmode="decimal" value="' + (r.q ? r.q : '') + f(r.v) + '" aria-label="' + esc(a.name) + ', результат"></td>' +
      '<td><select class="u" id="su_' + a.k + '" aria-label="единицы">' + uo + '</select></td>' +
      '<td><div style="display:flex;gap:4px;align-items:center;"><input class="r" id="sl_' + a.k + '" inputmode="decimal" placeholder="от" value="' + f(r.lo) + '" aria-label="референс от"><span>–</span><input class="r" id="sh_' + a.k + '" inputmode="decimal" placeholder="до" value="' + f(r.hi) + '" aria-label="референс до"></div></td>' +
      '<td class="st"></td><td class="br"></td></tr>';
  });
  tb.innerHTML = h;
  SAL.forEach(a => {
    const r = state.rows[a.k];
    $('sv_' + a.k).addEventListener('input', e => {
      const raw = e.target.value.trim(); const q = /^[<>]/.test(raw) ? raw[0] : '';
      const n = num(raw.replace(/^[<>]\s*/, ''));
      r.v = n != null && n >= 0 ? n : null; r.q = r.v != null ? q : '';
      e.target.classList.toggle('invalid', raw !== '' && r.v == null); changed();
    });
    $('su_' + a.k).addEventListener('change', e => { r.unit = e.target.value; changed(); });
    $('sl_' + a.k).addEventListener('input', e => { r.lo = num(e.target.value); changed(); });
    $('sh_' + a.k).addEventListener('input', e => { r.hi = num(e.target.value); changed(); });
  });
}
function changed() { const k = K(); if (k && k.compute) k.compute(); else compute(); }

/* ---------- Compute ---------- */
const PHASE = () => { const s = $('status') ? $('status').value : 'lut'; return s; };
function classifyRow(r) {
  if (r.v == null) return 'none';
  if (r.lo == null && r.hi == null) return 'noref';
  if (r.q === '<' && r.lo != null && r.v <= r.lo) return 'low';
  return K().classify(r.v, [r.lo, r.hi]);
}
function compute() {
  const k = K(); if (!k) return null;
  const R = state.rows, S = {}, V = {};
  SAL.forEach(a => { S[a.k] = classifyRow(R[a.k]); V[a.k] = R[a.k].v; });
  const has = key => R[key].v != null;
  const pg = key => toPg(R[key].v, R[key].unit, SI[key].mw);
  const pm = key => toPmol(R[key].v, R[key].unit, SI[key].mw);
  const st = PHASE(), male = st === 'male', lut = st === 'lut' || st === 'pmhrt';
  // morning cortisol: single sample, else first of the series
  const cm = has('CORT') ? 'CORT' : has('C1') ? 'C1' : null;
  const curve = ['C1', 'C2', 'C3', 'C4'].filter(has);

  const RT = [];
  const ratio = (key, name, a, b, f, note, judge) => {
    if (a == null || b == null || b === 0) return;
    const val = f ? f(a, b) : a / b;
    RT.push(Object.assign({ key, name, val, note }, judge ? judge(val) : { st: 'orient', ref: '' }));
  };
  ratio('pge2', 'Прогестерон / эстрадиол (пг/пг)', has('P4') ? pg('P4') : null, has('E2') ? pg('E2') : null, null,
    'Баланс прогестерона и эстрогенов',
    v => (!male && lut) ? { st: v < 100 ? 'low' : v > 500 ? 'high' : 'ok', ref: '100–500 (лютеиновая фаза, ориентир ZRT)' } : { st: 'orient', ref: male ? '—' : 'оценивается в лютеиновую фазу' });
  ratio('ff', 'Кортизол / кортизон (моль)', cm ? pm(cm) : null, has('CORTISONE') ? pm('CORTISONE') : null, null,
    'Активность 11β-ГСД 2-го типа: в слюне кортизона обычно больше, чем кортизола',
    v => ({ st: v > 1 ? 'high' : 'ok', ref: '< 1 (ориентир)' }));
  ratio('cd', 'Кортизол / ДГЭА (моль)', cm ? pm(cm) : null, has('DHEA') ? pm('DHEA') : null, null, 'Баланс катаболических и анаболических гормонов надпочечников');
  ratio('ta4', 'Тестостерон / андростендион (моль)', has('T') ? pm('T') : null, has('A4') ? pm('A4') : null, null, 'Превращение андростендиона в тестостерон (17β-ГСД)');
  ratio('e2t', 'Эстрадиол / тестостерон (моль)', has('E2') ? pm('E2') : null, has('T') ? pm('T') : null, null, 'Косвенный показатель ароматизации');
  ratio('a4ohp', 'Андростендион / 17-OH-прогестерон (моль)', has('A4') ? pm('A4') : null, has('OHP') ? pm('OHP') : null, null, 'Лиазная активность CYP17A1');
  if (curve.length >= 3 && has('C1')) {
    const last = has('C4') ? 'C4' : curve[curve.length - 1];
    ratio('slope', 'Утро / ' + (last === 'C4' ? 'ночь' : 'вечер') + ' (кортизол)', pg('C1'), pg(last), null, 'Амплитуда суточного ритма',
      v => ({ st: v < 3 ? 'low' : 'ok', ref: '≥ 3 (ориентир)' }));
  }
  const RV = Object.fromEntries(RT.map(r => [r.key, r]));

  /* ---------- flags ---------- */
  const F = {};
  const hi = key => S[key] === 'high', lo = key => S[key] === 'low';
  F.cortMorningLow = cm && lo(cm);
  F.cortMorningHigh = cm && hi(cm);
  F.cortEveningHigh = hi('C3') || hi('C4');
  F.flat = RV.slope && RV.slope.st === 'low';
  F.hpaHigh = F.cortMorningHigh || F.cortEveningHigh;
  F.hpaLow = F.cortMorningLow || (F.flat && !F.cortEveningHigh);
  F.dheaLow = lo('DHEA'); F.dheaHigh = hi('DHEA');
  F.catabolic = (F.hpaHigh || hi('CORTISONE')) && F.dheaLow;
  F.ohpHigh = hi('OHP');
  F.androHigh = !male && (hi('T') || hi('A4') || F.dheaHigh);
  F.tLowMale = male && lo('T');
  F.tHighMale = male && hi('T');
  F.p4Low = !male && lo('P4') && st !== 'pm';
  F.estDom = !male && RV.pge2 && RV.pge2.st === 'low';
  F.e2High = hi('E2'); F.e2Low = lo('E2') && st !== 'pm';
  F.e2HighMale = male && hi('E2');
  F.ffHigh = RV.ff && RV.ff.st === 'high';
  F.any = SAL.some(a => has(a.k));
  F.noRefs = SAL.some(a => has(a.k) && S[a.k] === 'noref');

  /* ---------- findings ---------- */
  const fnd = [];
  if (F.cortEveningHigh) fnd.push('Повышен вечерний/ночной кортизол: суточный ритм нарушен.');
  if (F.cortMorningHigh) fnd.push('Утренний кортизол выше референса: активация оси стресса.');
  if (F.cortMorningLow) fnd.push('Утренний кортизол снижен: недостаточный подъём кортизола.');
  if (F.flat && !F.cortMorningLow) fnd.push('Кривая кортизола уплощена: малая разница утро/вечер.');
  if (F.ffHigh) fnd.push('Кортизол преобладает над кортизоном: возможна сниженная инактивация кортизола (11β-ГСД2).');
  if (F.catabolic) fnd.push('Высокий кортизол при низком ДГЭА: катаболический сдвиг.');
  else if (F.dheaLow) fnd.push('ДГЭА снижен: надпочечниковый андрогенный резерв снижен.');
  if (F.ohpHigh) fnd.push('17-OH-прогестерон повышен: исключить неклассическую ВДКН.');
  if (F.androHigh) fnd.push('Андрогены выше референса: признаки гиперандрогении.');
  if (F.tLowMale) fnd.push('Свободный тестостерон снижен.');
  if (F.tHighMale) fnd.push('Свободный тестостерон выше референса.');
  if (F.e2HighMale) fnd.push('Эстрадиол у мужчины повышен: усиленная ароматизация.');
  if (F.p4Low) fnd.push('Прогестерон снижен' + (st === 'lut' ? ': вероятна недостаточность лютеиновой фазы.' : '.'));
  if (F.estDom) fnd.push('Низкое соотношение прогестерон/эстрадиол: относительный избыток эстрогенов.');
  if (!male && F.e2High) fnd.push('Свободный эстрадиол выше референса.');
  if (F.e2Low) fnd.push('Свободный эстрадиол снижен.');
  if (!fnd.length && F.any && !F.noRefs) fnd.push('Стероиды слюны в пределах референсов.');

  state.last = { R: JSON.parse(JSON.stringify(R)), S, V, RT, RV, F, findings: fnd, cm, curve, st };
  renderTab();
  return state.last;
}

/* ---------- Render tab ---------- */
const PSAL = { ok: ['ok', 'в норме'], low: ['low', 'ниже'], high: ['high', 'выше'], edge: ['edge', 'у границы'], none: ['none', 'нет данных'], noref: ['none', 'нет референса'], orient: ['none', 'для динамики'] };
const pillS = s => '<span class="pill ' + PSAL[s][0] + '">' + PSAL[s][1] + '</span>';
function renderTab() {
  const L = state.last; if (!L || !$('salRows')) return;
  const k = K();
  document.querySelectorAll('#salRows tr[data-k]').forEach(tr => {
    const key = tr.dataset.k, r = L.R[key];
    tr.querySelector('.st').innerHTML = pillS(L.S[key]);
    tr.querySelector('.br').innerHTML = r.v == null ? '' : k.bar(r.v, [r.lo, r.hi]);
  });
  const rt = $('salRatios');
  rt.innerHTML = L.RT.length ? L.RT.map(r => '<tr><td>' + esc(r.name) + '<div class="muted" style="font-size:12px;">' + esc(r.note) + '</div></td><td class="num">' + k.fmt(r.val) + '</td><td>' + esc(r.ref || '—') + '</td><td>' + pillS(r.st) + '</td></tr>').join('')
    : '<tr><td colspan="4" class="muted">Соотношения появятся после ввода пар показателей.</td></tr>';
  $('salFind').innerHTML = L.findings.length ? L.findings.map(t => '<li>' + esc(t) + '</li>').join('') : '<li class="muted">Введите результаты или загрузите бланк.</li>';
  $('salNoRef').classList.toggle('hidden', !L.F.noRefs);
  const c = $('concl'); if (c && $('salConcl')) $('salConcl').value = c.value;
}

/* ---------- Contribution to the shared conclusion ---------- */
function contrib(ctx) {
  const L = state.last; if (!L || !L.F.any) return null;
  const F = L.F, k = K(), R = L.R, male = L.st === 'male';
  const preg = ctx && ctx.cPreg;
  const vtxt = key => { const r = R[key]; return r.v == null ? null : (r.q || '') + k.fmt(r.v) + ' ' + r.unit; };
  const out = { lines: [], targets: [], sleep: [], life: [], food: [], move: [], supp1: [], exam: [], ctrl: [], warn: [] };
  // findings line(s) for section I
  const t = [];
  const hpa = [];
  if (L.curve.length >= 2) hpa.push('суточный ритм кортизола: ' + ['C1', 'C2', 'C3', 'C4'].filter(x => R[x].v != null).map(x => vtxt(x)).join(' → '));
  else if (L.cm) hpa.push('утренний кортизол ' + vtxt(L.cm));
  if (F.cortEveningHigh) hpa.push('вечерний/ночной кортизол повышен');
  if (F.cortMorningHigh) hpa.push('утренний кортизол повышен');
  if (F.cortMorningLow) hpa.push('утренний кортизол снижен');
  if (F.flat) hpa.push('кривая уплощена');
  if (F.ffHigh) hpa.push('кортизол преобладает над кортизоном');
  if (hpa.length) t.push('Ось стресса: ' + hpa.join('; ') + '.');
  const adr = [];
  if (F.catabolic) adr.push('высокий кортизол при низком ДГЭА (катаболический сдвиг)');
  else if (F.dheaLow) adr.push('ДГЭА снижен');
  else if (F.dheaHigh) adr.push('ДГЭА повышен');
  if (F.ohpHigh) adr.push('17-OH-прогестерон повышен');
  if (F.androHigh) adr.push('андрогены повышены');
  if (F.tLowMale) adr.push('свободный тестостерон снижен');
  if (F.tHighMale) adr.push('свободный тестостерон повышен');
  if (adr.length) t.push('Надпочечники и андрогены: ' + adr.join('; ') + '.');
  const sx = [];
  if (F.p4Low) sx.push('прогестерон снижен' + (L.st === 'lut' ? ' (недостаточность лютеиновой фазы)' : ''));
  if (L.RV.pge2) sx.push('Pg/E2 = ' + k.fmt(L.RV.pge2.val) + (F.estDom ? ': относительный избыток эстрогенов' : ''));
  if (F.e2High) sx.push('свободный эстрадиол повышен');
  if (F.e2Low) sx.push('свободный эстрадиол снижен');
  if (sx.length) t.push('Половые стероиды: ' + sx.join('; ') + '.');
  if (!t.length) t.push(F.noRefs ? 'Для оценки введите референсы с бланка.' : 'Свободные фракции стероидов в пределах референсов.');
  out.lines = t;

  const add = (arr, cond, s) => { if (cond && out[arr].indexOf(s) < 0) out[arr].push(s); };
  add('targets', F.hpaHigh || F.flat, 'нормализовать суточный ритм кортизола');
  add('targets', F.hpaLow && !F.hpaHigh, 'поддержать утренний подъём кортизола и резерв надпочечников');
  add('targets', F.catabolic || F.dheaLow, 'восстановить баланс кортизол/ДГЭА');
  add('targets', F.androHigh || F.ohpHigh, 'уточнить источник андрогенов и снизить гиперандрогению');
  add('targets', F.tLowMale, 'восстановить уровень тестостерона');
  add('targets', F.p4Low || F.estDom, 'восстановить баланс прогестерона и эстрогенов');
  add('targets', F.e2HighMale, 'снизить ароматизацию');

  add('sleep', F.hpaHigh || F.flat, 'Ритм кортизола: подъём в одно время, 10–20 минут дневного света в первый час, тёплый тусклый свет вечером.');
  add('sleep', F.cortEveningHigh, 'Вечером без интенсивных тренировок, работы и новостей за 2 часа до сна; кофеин только до 12:00.');
  add('sleep', F.hpaLow, 'Не пропускать завтрак с белком; дневной сон не дольше 20–30 минут.');
  add('sleep', F.hpaHigh || F.hpaLow || F.catabolic, 'Ежедневная практика восстановления 10–15 минут: медленное дыхание (6 вдохов в минуту), прогулка, медитация.');
  add('life', F.hpaHigh || F.catabolic, 'Разобрать источники хронического стресса; при выраженной тревоге или бессоннице — психотерапевт.');
  add('life', F.androHigh || F.tLowMale || F.e2HighMale, 'Нормализация массы тела и чувствительности к инсулину: главный модифицируемый фактор андрогенного баланса.');
  add('food', F.hpaHigh || F.hpaLow, 'Регулярное питание 3 раза в день без длительных голодовок; сложные углеводы на ужин улучшают сон.');
  add('food', F.androHigh, 'Низкогликемическое питание, клетчатка, ограничение сахара и молочных продуктов с высоким инсулиновым индексом.');
  add('food', F.tLowMale, 'Достаточно калорий, жиров и белка; цинк из пищи (мясо, морепродукты, тыквенные семечки).');
  add('move', F.hpaHigh || F.catabolic || F.hpaLow, 'Без перетренированности: высокоинтенсивные нагрузки не чаще 2–3 раз в неделю и не вечером; больше ходьбы и йоги.');
  add('move', F.tLowMale, 'Силовые тренировки с базовыми упражнениями 3 раза в неделю.');
  if (!preg) {
    add('supp1', F.hpaHigh || F.catabolic, 'Ашваганда (стандартизированный экстракт корня) 300–600 мг/сут, курс 8 недель; осторожно при гипертиреозе и аутоиммунных заболеваниях.');
    add('supp1', F.cortEveningHigh, 'Фосфатидилсерин 100–300 мг вечером; L-теанин 200 мг перед сном.');
    add('supp1', F.hpaLow, 'Родиола розовая 200–400 мг утром; витамин C 500–1000 мг/сут; пантотеновая кислота (B5) 250–500 мг/сут.');
    add('supp1', F.hpaHigh || F.hpaLow || F.catabolic, 'Магний (глицинат или цитрат) 200–400 мг/сут вечером.');
    add('supp1', F.p4Low, 'Витамин B6 (P5P) 25–50 мг/сут; Vitex agnus-castus (экстракт плодов) 20–40 мг/сут курсом 3 цикла, не на фоне КОК.');
    add('supp1', F.androHigh, 'Мио-инозитол 2–4 г/сут (с D-хиро-инозитолом 40:1); цинк 15–30 мг/сут.');
    add('supp1', F.androHigh, 'Омега-3 (EPA+DHA) 1–2 г/сут.');
    add('supp1', F.tLowMale, 'Витамин D до целевого 40–60 нг/мл; цинк 15–30 мг/сут при дефиците.');
    add('supp1', F.dheaLow && !F.androHigh, 'Препараты ДГЭА только после оценки ДГЭА-С сыворотки, по назначению врача и под контролем.');
  }
  add('exam', F.cortEveningHigh, 'Поздний вечерний кортизол в слюне повторно (2 раза); при подтверждении — малая дексаметазоновая проба (1 мг), консультация эндокринолога.');
  add('exam', F.cortMorningLow, 'Кортизол сыворотки утром и АКТГ; при клинике надпочечниковой недостаточности — консультация эндокринолога.');
  add('exam', F.hpaHigh || F.hpaLow || F.flat, 'ТТГ, свТ4, глюкоза, инсулин.');
  add('exam', F.dheaLow || F.catabolic, 'ДГЭА-сульфат сыворотки.');
  add('exam', F.ohpHigh, '17-OH-прогестерон сыворотки на 3–5 день цикла утром; при значении выше 2 нг/мл — проба с АКТГ или генетика CYP21A2.');
  add('exam', F.androHigh, 'Тестостерон общий, ГСПГ, ДГЭА-С, андростендион сыворотки, УЗИ яичников, HOMA-IR, пролактин.');
  add('exam', F.tLowMale, 'Тестостерон общий утром (дважды), ГСПГ, ЛГ, ФСГ, пролактин, эстрадиол.');
  add('exam', F.p4Low && L.st === 'lut', 'Подтверждение овуляции: прогестерон сыворотки на 7-й день после овуляции, УЗИ-фолликулометрия.');
  add('ctrl', F.any, 'Повтор стероидного профиля слюны через 8–12 недель: в то же время суток, в ту же фазу цикла и в той же лаборатории.');
  add('warn', true, 'Слюна собирается без чистки зубов и еды за 30 минут, без следов крови; гели и кремы с гормонами искажают результат.');
  return out;
}

/* ---------- Import ---------- */
const NAMES = [
  ['OHP', /(?:17\s*-?\s*(?:ох|он|oh|о[нh]|гидрокси|α?-?гидрокси)\s*-?\s*прогест|17\s*-?\s*ohp|17\s*-?\s*оп[гп](?![а-я]))/],
  ['PREG', /(?<!17\s*-?\s*(?:он|oh|гидрокси)\s*-?\s*)прегненолон|pregnenolone/],
  ['P4', /прогестерон|progesterone/],
  ['DHEA', /дегидроэпиандростерон(?!\s*-?\s*сульфат)|дгэа(?!\s*-?\s*с(?:[^а-я]|$))|\bdhea\b(?!\s*-?\s*s)/],
  ['A4', /андростендион|androstenedione/],
  ['T', /(?<!дигидро)тестостерон|testosterone/],
  ['E2', /эстрадиол|estradiol/],
  ['CORTISONE', /кортизон(?!\w)|cortisone/],
  ['CORT', /кортизол|cortisol/]
];
const UNIT_RE = /(?:пг|нг|мкг|pg|ng|nr|hr|пr|нr)\s*\/\s*(?:мл|ml|mn|mл|мn)|(?:н|п)моль\s*\/\s*л|(?:n|p)mol\s*\/\s*l/;
const UMAP = u => { u = u.replace(/\s/g, ''); if (/^(пг|pg|nr|пr)/.test(u)) return 'пг/мл'; if (/^(нг|ng|hr|нr)/.test(u)) return 'нг/мл'; if (/^(нмоль|nmol)/.test(u)) return 'нмоль/л'; if (/^(пмоль|pmol)/.test(u)) return 'пмоль/л'; if (/^мкг/.test(u)) return 'мкг/мл'; return null; };
const PH = { lut: /лютеин|luteal/, pm: /постменоп|менопауз|postmeno/, fol: /фолликул|пролифератив|follicul/, ov: /овулятор|ovulat/, men: /менструал/, male: /мужч|male(?!\w)|муж\.?(?!\w)/, fem: /женщ|female|жен\.?(?!\w)/ };
const N = '(\\d+(?:[.,]\\d+)?)';
function normL(s) { return s.toLowerCase().replace(/ё/g, 'е').replace(/[‐‑‒–—−]/g, '-').replace(/ /g, ' '); }
function slotOf(l) {
  let m = l.match(/(\d)\s*-?\s*(?:е|я|й|ая|ое)?\s*(?:взяти|порци|проб)/) || l.match(/(?:взяти|порци|проб)\w*\s*(?:№|n)?\s*(\d)/);
  if (m && +m[1] >= 1 && +m[1] <= 4) return 'C' + m[1];
  if (/утр|пробужд/.test(l)) return 'C1';
  if (/полдень|полдн|обед/.test(l)) return 'C2';
  if (/ноч|полноч/.test(l)) return 'C4';
  if (/вечер/.test(l)) return 'C3';
  if (/(?:^|[^0-9])(?:день|днем|дневн)/.test(l)) return 'C2';
  m = l.match(/(?:^|[^0-9])([0-2]?\d)[:.]([0-5]\d)/);
  if (m) { const h = +m[1]; return h < 10 ? 'C1' : h < 15 ? 'C2' : h < 21 ? 'C3' : 'C4'; }
  return null;
}
function cleanSeg(s) {
  return s.replace(/\([^)]*\d{1,2}:\d{2}[^)]*\)/g, ' ')
    .replace(/\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?/g, ' ')
    .replace(/\d\s*-?\s*(?:е|я|й|ая|ое)?\s*(?:взяти|порци|проб)\S*/g, ' ')
    .replace(/(?:взяти|порци|проб)\S*\s*(?:№|n)?\s*\d/g, ' ')
    .replace(/\d+\s*-\s*\d+\s*-?\s*(?:й|го|ый)?\s*(?:день|дн)\S*/g, ' ')
    .replace(/(?:старше|младше|от|до)?\s*\d{1,2}\s*(?:-\s*\d{1,3})?\s*(?:лет|года?)(?![а-я])/g, ' ')
    .replace(/\d+\s*(?:ч|час\S*)(?![а-я])/g, ' ');
}
function ranges(seg) {
  seg = cleanSeg(seg);
  const out = [];
  const re = new RegExp('(?:' + N + '\\s*-\\s*' + N + ')|(?:(?:<|≤|до|менее)\\s*' + N + ')|(?:(?:>|≥|от|более)\\s*' + N + '(?!\\s*-))', 'g');
  let m;
  while ((m = re.exec(seg))) {
    if (m[1] != null) out.push({ lo: num(m[1]), hi: num(m[2]), at: m.index });
    else if (m[3] != null) out.push({ lo: null, hi: num(m[3]), at: m.index });
    else out.push({ lo: num(m[4]), hi: null, at: m.index });
  }
  return out;
}
function pickRef(cands, status, ageN) {
  if (!cands.length) return null;
  const st = status === 'pmhrt' ? 'lut' : status;
  const male = st === 'male';
  const tagged = cands.map(c => {
    const t = c.ctx;
    const sexOk = male ? !PH.fem.test(t) || PH.male.test(t) : !PH.male.test(t) || PH.fem.test(t);
    const ph = ['lut', 'pm', 'fol', 'ov'].find(p => PH[p].test(t));
    return Object.assign({}, c, { sexOk, ph });
  });
  let pool = tagged.filter(c => c.sexOk); if (!pool.length) pool = tagged;
  if (!male) { const byPh = pool.filter(c => c.ph === st); if (byPh.length) pool = byPh; else { const noPh = pool.filter(c => !c.ph); if (noPh.length) pool = noPh; } }
  if (ageN != null) {
    const ag = pool.filter(c => { const m = c.ctx.match(/(\d{2})\s*-\s*(\d{2})\s*(?:лет|г)/); return m && ageN >= +m[1] && ageN <= +m[2]; });
    if (ag.length) pool = ag;
  }
  return pool[0];
}
function parseLines(lines, status, age) {
  const found = {}; const cortHits = [];
  let prev = null;
  lines.forEach((raw, idx) => {
    const l = normL(raw);
    if (l.length > 220) { prev = null; return; }
    const hits = NAMES.map(([k, re]) => { const m = l.match(re); return m ? { k, at: m.index, len: m[0].length } : null; }).filter(Boolean);
    // 17-OH-progesterone also matches "прогестерон"; pregnenolone variants
    const ohp = hits.find(h => h.k === 'OHP');
    let hs = hits.filter(h => !(ohp && h.k === 'P4' && Math.abs(h.at - ohp.at) < 16));
    if (hs.some(h => h.k === 'CORTISONE')) hs = hs.filter(h => !(h.k === 'CORT' && hs.find(x => x.k === 'CORTISONE' && x.at === h.at)));
    if (!hs.length) {
      // continuation: reference ranges on the next line(s)
      if (prev && idx - prev.idx <= 3 && ranges(l).length && !/[а-я]{4,}\s+[а-я]{4,}\s+[а-я]{4,}\s+[а-я]{4,}/.test(l.replace(/фаза|лютеин\S*|фолликул\S*|овулятор\S*|постменопауз\S*|мужчин\S*|женщин\S*|утро|вечер|день|ночь/g, ''))) {
        ranges(l).forEach(r => prev.cands.push(Object.assign(r, { ctx: l })));
      }
      return;
    }
    if (hs.length >= 3) { prev = null; return; } // panel title or list
    hs.sort((a, b) => a.at - b.at);
    const h = hs[0];
    let rest = l.slice(h.at + h.len);
    if (hs[1]) rest = rest.slice(0, hs[1].at - h.at - h.len);
    rest = cleanSeg(rest).replace(/\(\s*(?:слюна|свободн\S*|ферм\S*|вэжх\S*|метод\S*|[^)]*фракц\S*)[^)]*\)/g, ' ').replace(/^\s*[,(]?\s*(?:свободн\S*|слюна)\s*\)?/, ' ');
    // result: first number not part of a time stamp
    const vm = rest.match(/(^|[^0-9.,:\-])([<>]\s*)?(\d+(?:[.,]\d+)?)(?![:\d])/);
    if (!vm) { prev = null; return; }
    const before = rest.slice(0, vm.index + vm[1].length);
    if (/(?:^|[^0-9])[0-2]?\d[:.][0-5]\d\s*-\s*$/.test(before)) { prev = null; return; }
    const value = num(vm[3]); const q = vm[2] ? vm[2].trim() : '';
    const after = rest.slice(vm.index + vm[0].length);
    const um = (after.match(UNIT_RE) || rest.match(UNIT_RE));
    const unit = um ? UMAP(um[0]) : null;
    const cands = ranges(after.replace(UNIT_RE, ' ')).map(r => Object.assign(r, { ctx: l }));
    const entry = { k: h.k, value, q, unit, cands, line: raw.trim(), idx, slot: h.k === 'CORT' ? slotOf(l) : null };
    if (h.k === 'CORT') cortHits.push(entry); else if (!found[h.k]) found[h.k] = entry;
    prev = entry;
  });
  // cortisol: single vs diurnal series
  if (cortHits.length === 1 && !cortHits[0].slot) found.CORT = cortHits[0];
  else if (cortHits.length === 1) { const c = cortHits[0]; if (Object.keys(found).length >= 2 && c.slot === 'C1') found.CORT = c; else found[c.slot] = c; }
  else if (cortHits.length > 1) {
    let n = 1;
    cortHits.forEach(c => { let s = c.slot; if (!s || found[s]) { while (found['C' + n] && n < 5) n++; s = n <= 4 ? 'C' + n : null; } if (s) { found[s] = Object.assign(c, { k: s }); } });
  }
  Object.values(found).forEach(e => { const r = pickRef(e.cands, status, age); e.ref = r ? [r.lo, r.hi] : null; e.refCtx = r ? r.ctx : ''; });
  return found;
}
function mergePasses(passes, status, age) {
  const P = passes.map(p => parseLines(p, status, age));
  if (P.length === 1) return P[0];
  const keys = new Set(P.flatMap(p => Object.keys(p))); const out = {};
  keys.forEach(k => {
    const a = P[0][k], b = P[1][k];
    if (a && b) out[k] = Object.assign({}, a.ref ? a : b, { value: a.value, conf: Math.abs(a.value - b.value) <= 0.005 * Math.max(a.value, b.value) + 1e-9 ? 'ok' : 'check', alt: b.value });
    else out[k] = Object.assign({}, a || b, { conf: 'single' });
  });
  return out;
}
const count = f => Object.keys(f || {}).length;
function looksLikeSaliva(passes) {
  const txt = passes.map(p => p.join(' ')).join(' ').toLowerCase();
  return /слюн|saliva/.test(txt);
}

function setStatus(msg, kind) { const el = $('salImpStatus'); el.textContent = msg; el.className = 'imp-status' + (kind ? ' ' + kind : ''); el.classList.remove('hidden'); }
async function handleFile(file) {
  if (!file) return;
  if (!window.LabImport || !window.LabImport.readLines) { setStatus('Модуль импорта не загрузился. Обновите страницу.', 'err'); return; }
  $('salImpReview').classList.add('hidden');
  setStatus('Открываю файл…', 'busy');
  try {
    const res = await window.LabImport.readLines(file, m => setStatus(m, 'busy'), passes => count(mergePasses(passes, PHASE(), null)) >= 2);
    receive(res.passes, file.name, res.method);
  } catch (e) {
    console.error(e);
    setStatus('Не удалось прочитать файл: ' + (e && e.message ? e.message : e) + '.', 'err');
  }
}
function receive(passes, fileName, method) {
  const age = num($('age') ? $('age').value : null);
  const found = mergePasses(passes, PHASE(), age);
  state.imp = { found, fileName, method, text: passes.map(p => p.join('\n')).join('\n\n— второй проход —\n') };
  const n = count(found);
  setStatus(n ? 'Готово: найдено ' + n + ' показ. в «' + fileName + '» (' + (method || '') + '). Проверьте и нажмите «Подставить».' : 'Показатели слюны не найдены автоматически. Проверьте распознанный текст или введите вручную.', n ? '' : 'err');
  renderImport();
}
function renderImport() {
  const d = state.imp; if (!d) return;
  const k = K();
  const rows = SAL.filter(a => d.found[a.k]).map(a => {
    const e = d.found[a.k];
    const ref = e.ref ? (e.ref[0] != null ? k.fmt(e.ref[0]) : '') + ' – ' + (e.ref[1] != null ? k.fmt(e.ref[1]) : '') : '—';
    const warn = e.conf === 'check' ? ' <span class="pill edge">проверьте: ' + k.fmt(e.alt) + '</span>' : '';
    return '<tr><td><input type="checkbox" id="si_' + a.k + '" checked aria-label="взять"></td><td>' + esc(a.name) + (a.sub ? ' <span class="muted">' + esc(a.sub) + '</span>' : '') + '</td><td class="num">' + (e.q || '') + k.fmt(e.value) + ' ' + esc(e.unit || '?') + warn + '</td><td>' + ref + '</td><td class="src">' + esc(e.line) + '</td></tr>';
  });
  $('salImpRows').innerHTML = rows.join('') || '<tr><td colspan="5" class="muted">—</td></tr>';
  $('salImpText').value = d.text;
  $('salImpReview').classList.remove('hidden');
}
function applyImport() {
  const d = state.imp; if (!d) return;
  let n = 0;
  SAL.forEach(a => {
    const e = d.found[a.k], on = $('si_' + a.k); if (!e || !on || !on.checked) return;
    const r = state.rows[a.k];
    r.v = e.value; r.q = e.q || ''; if (e.unit && UNITS.includes(e.unit)) r.unit = e.unit;
    if ($('salUseRefs').checked && e.ref) { r.lo = e.ref[0]; r.hi = e.ref[1]; }
    n++;
  });
  buildTable(); changed();
  $('salImpReview').classList.add('hidden');
  setStatus('Подставлено показателей: ' + n + '. Проверьте единицы и референсы.', '');
  $('h-sal-in').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function clearAll() {
  SAL.forEach(a => { state.rows[a.k] = { v: null, unit: a.unit, lo: null, hi: null, q: '' }; });
  buildTable(); changed();
}

function init() {
  if (!$('salRows')) return;
  buildTable();
  const inp = $('salFile');
  inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) handleFile(f); });
  const drop = $('salDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
  $('salApply').addEventListener('click', applyImport);
  $('salCancel').addEventListener('click', () => { $('salImpReview').classList.add('hidden'); $('salImpStatus').classList.add('hidden'); state.imp = null; });
  $('salClear').addEventListener('click', clearAll);
  $('salCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('salConcl').value); $('salCopyMsg').textContent = 'Скопировано'; } catch (e) { $('salConcl').select(); document.execCommand('copy'); $('salCopyMsg').textContent = 'Скопировано'; } setTimeout(() => { $('salCopyMsg').textContent = ''; }, 2000); });
}

window.Saliva = { state, compute, contrib, init, receive, clearAll, count, mergePasses, looksLikeSaliva, SAL, SI, toPg, _parse: parseLines };
})();
