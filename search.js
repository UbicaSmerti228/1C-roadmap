"use strict";
// Умный поиск: понимает формы слов, синонимы (слайс = срез = slice) и опечатки.
// Ищет по темам карты, «сути», тестам, разделам статей и главам видео (индекс SX грузится при первом поиске).
(function(){
const {D, BYKEY, esc, I, goto} = window.RM;
const input = document.getElementById("q"), panel = document.getElementById("sres");
if(!input || !panel) return;

// ---------- русский стеммер (Snowball / Портер) ----------
const RV = /^(.*?[аеиоуыэюя])(.*)$/;
const PERF = /((ив|ивши|ившись|ыв|ывши|ывшись)|((?<=[ая])(в|вши|вшись)))$/;
const REFL = /(с[яь])$/;
const ADJ = /(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
const PART = /((ивш|ывш|ующ)|((?<=[ая])(ем|нн|вш|ющ|щ)))$/;
const VERB = /((ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)|((?<=[ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)))$/;
const NOUN = /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
const DERIV = /.*[^аеиоуыэюя]+[аеиоуыэюя].*ость?$/;
function ruStem(w){
  const m = RV.exec(w); if(!m) return w;
  const pre = m[1]; let rv = m[2], t = rv.replace(PERF, "");
  if(t === rv){
    rv = rv.replace(REFL, ""); t = rv.replace(ADJ, "");
    if(t !== rv) rv = t.replace(PART, "");
    else { t = rv.replace(VERB, ""); rv = t === rv ? rv.replace(NOUN, "") : t }
  } else rv = t;
  rv = rv.replace(/и$/, "");
  if(DERIV.test(rv)) rv = rv.replace(/ость?$/, "");
  t = rv.replace(/ь$/, "");
  if(t !== rv) rv = t; else rv = rv.replace(/ейше?/, "").replace(/нн$/, "н");
  return pre + rv;
}
const enStem = w => w.length > 4 && /[^s]s$/.test(w) ? w.slice(0, -1) : w;
const stem = w => /[а-я]/.test(w) ? ruStem(w) : enStem(w);

const STOP = new Set(("а без бы был была были было быть в вам вас весь во вот все всего всех вы где да даже для до его ее если есть еще же за зачем и из или им их к как какая какие какой когда кто ли мне может можно мы на надо нам нас не него нее нет ни них но ну о об объясни объяснить он она они оно от очень по под понимаю понятно почему при про с со так такое также там те тем то того тоже той только том ты у уже хочу чего чем что чтобы эта эти это я разница отличается отличие работает делает нужен нужно устроен устроена устроено устройство данные данных такой такая пример примеры " +
  "1с 1c один эс the a an of to in is how what why does do vs and or with for").split(" "));
// синонимы: первое слово группы — каноническое
const SYN = [
  "справочник справочники каталог catalog", "документ документы док доки document", "регистр регистры register", "движение движения проводка проводки",
  "проведение провести проводить проведен перепровести posting", "остаток остатки сальдо balance", "оборот обороты turnover", "накопление накопления",
  "сведение сведения информационный", "запрос запросы query sql селект выбрать", "соединение соединения join джоин", "объединить объединение union",
  "временная втшка вт temporary", "пакет пакетный пакетные batch", "виртуальная виртуальные", "срез срезпоследних последних",
  "группировка группировки сгруппировать group", "итог итоги total", "форма формы form", "реквизит реквизиты атрибут attribute",
  "элемент элементы", "команда команды command", "клиент клиентский", "сервер серверный серверные", "контекст бесконтекстный контекстный",
  "директива директивы", "модуль модули module", "процедура процедуры функция функции метод методы", "параметр параметры", "переменная переменные",
  "массив массивы array", "структура структуры", "соответствие соответствия map", "таблица таблицы тз", "коллекция коллекции",
  "строка строки string", "дата даты date", "число числа", "null нулл ноль", "неопределено undefined",
  "исключение исключения ошибка ошибки попытка exception", "транзакция транзакции transaction", "блокировка блокировки lock", "отладка отладчик дебаг debug",
  "роль роли право права доступ rls", "пользователь пользователи юзер", "подсистема подсистемы раздел разделы", "опция опции",
  "скд компоновка отчет отчеты report", "макет макеты печать печатная печатные шаблон", "табличный табдок", "себестоимость партия партии fifo фифо",
  "бухгалтерия бухучет бухгалтерский учет", "счет счета план субконто", "расчет зарплата начисление начисления", "вытеснение базовый",
  "бизнес бизнеспроцесс процесс задача задачи маршрут", "обмен обмены выгрузка загрузка exchange", "json джсон", "http хттп rest api веб",
  "расширение расширения extension", "обновление обновить update", "хранилище хранилищ", "edt едт", "git гит", "бсп библиотека",
  "администрирование админ кластер", "профессионал проф экзамен тест", "специалист спец", "собеседование собес интервью", "резюме cv",
  "франчайзи франч партнер", "фоновое фон регламентное задание задания"
];
const CANON = new Map();
SYN.forEach(g => { const ws = g.split(" "), c = stem(ws[0]); ws.forEach(w => CANON.set(stem(w), c)) });
function tokens(text){
  const out = [];
  String(text).toLowerCase().replace(/ё/g, "е").split(/[^a-zа-я0-9]+/).forEach(w => {
    if(w.length < 2 || STOP.has(w)) return;
    const s = stem(w); out.push(CANON.get(s) || s);
  });
  return out;
}

// ---------- индекс ----------
let DOCS = null, DF = null, VOCAB = null, AVG = 1, loading = null;
function loadIndex(){
  if(DOCS) return Promise.resolve();
  if(loading) return loading;
  loading = new Promise(res => {
    if(window.SX){ res(); return }
    const s = document.createElement("script"); s.src = "search-index.js"; s.onload = res; s.onerror = res; document.head.appendChild(s);
  }).then(build);
  return loading;
}
function add(doc, title, extra, body){
  doc.tt = tokens(title); doc.tk = tokens(extra || ""); doc.tb = tokens(body || "");
  doc.len = doc.tt.length * 3 + doc.tk.length * 2 + doc.tb.length;
  DOCS.push(doc);
}
function build(){
  DOCS = [];
  D.forEach(sg => sg.n.forEach(nd => nd.sub.forEach(sb => {
    const k = nd.id + "." + sb.id;
    add({type:"sub", k, title:sb.w, snip:(sb.kc && sb.kc[0]) || sb.y}, sb.w, (sb.kc || []).join(" "), sb.y + " " + sb.t + " " + nd.t + " " + (sb.sc || []).join(" ") + " " + (sb.ac || []).join(" "));
    // у вопроса с кодом в заголовок идёт первая содержательная строка кода, весь код — в поисковый текст
    (sb.q || []).forEach((q, i) => {
      const [ask, code = ""] = q[0].split(/\n```\n?/);
      const line = code.split("\n").map(l => l.trim()).find(l => l && !/^(func main|type |\}|\))/.test(l)) || "";
      add({type:"q", k, qi:i, title:line ? ask + " " + line : ask, snip:q[3]}, ask, q[1] + " " + code, q[3] + " " + sb.w);
    });
  })));
  const X = window.SX;
  if(X){
    X.s.forEach(r => {
      const a = X.a[r[0]], head = r[1] || a[0];
      add({type:"sec", k:a[2], title:head, art:a[0], url:a[1], hid:r[3] || "", head:r[1], snip:r[2]}, head, a[0], r[2]);
    });
    X.c.forEach(r => add({type:"ch", k:r[3], yt:r[0], t:r[1], title:r[2], vt:X.vt[r[0]], snip:X.vt[r[0]]}, r[2], "", X.vt[r[0]]));
  }
  DF = new Map(); VOCAB = [];
  let total = 0;
  DOCS.forEach(d => { total += d.len; new Set([...d.tt, ...d.tk, ...d.tb]).forEach(t => DF.set(t, (DF.get(t) || 0) + 1)) });
  AVG = total / DOCS.length || 1;
  VOCAB = [...DF.keys()];
}
function lev(a, b, max){
  if(Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({length:b.length + 1}, (_, j) => j);
  for(let i = 1; i <= a.length; i++){
    const cur = [i]; let best = i;
    for(let j = 1; j <= b.length; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if(cur[j] < best) best = cur[j];
    }
    if(best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// токены запроса с весами: точные, исправленные опечатки, продолжение последнего слова
function expand(q){
  const raw = String(q).toLowerCase().replace(/ё/g, "е").split(/[^a-zа-я0-9]+/).filter(Boolean);
  const qt = [], fixes = [];
  raw.forEach((w, idx) => {
    if(w.length < 2 || STOP.has(w)) return;
    const s = stem(w), t = CANON.get(s) || s, group = [];
    if(DF.has(t)) group.push([t, 1]);
    if(idx === raw.length - 1 && w.length >= 3 && !DF.has(t)){
      let n = 0;
      for(const v of VOCAB){ if(v !== t && v.startsWith(s) && n < 6){ group.push([v, .7]); n++ } }
    }
    if(!group.length && t.length >= 4){
      const max = t.length >= 7 ? 2 : 1; let best = null, bd = max + 1;
      for(const v of VOCAB){ if(v[0] !== t[0]) continue; const d = lev(t, v, max); if(d < bd || (d === bd && best && DF.get(v) > DF.get(best))){ bd = d; best = v } }
      if(best){ group.push([best, .8]); fixes.push(w) }
    }
    if(group.length) qt.push(group);
  });
  return {qt, fixes, words:raw};
}
const TW = {sub:1.3, q:1.1, sec:1, ch:.95};
function search(q){
  const {qt, fixes} = expand(q);
  if(!qt.length) return {res:[], fixes, qt};
  const N = DOCS.length, k1 = 1.2, b = .75, res = [];
  for(const d of DOCS){
    let score = 0, hit = 0;
    for(const group of qt){
      let gbest = 0;
      for(const [t, w] of group){
        let tf = 0;
        for(const x of d.tt) if(x === t) tf += 3;
        for(const x of d.tk) if(x === t) tf += 2;
        for(const x of d.tb) if(x === t) tf += 1;
        if(!tf) continue;
        const idf = Math.log(1 + (N - DF.get(t) + .5) / (DF.get(t) + .5));
        const s = w * idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * d.len / AVG));
        if(s > gbest) gbest = s;
      }
      if(gbest){ score += gbest; hit++ }
    }
    if(!hit) continue;
    score *= Math.pow(hit / qt.length, 1.6) * TW[d.type];
    res.push([score, d]);
  }
  res.sort((a, b) => b[0] - a[0]);
  // не больше трёх результатов из одной статьи или видео подряд
  const seen = new Map(), out = [];
  for(const [s, d] of res){
    const g = d.type === "sec" ? d.url : d.type === "ch" ? d.yt : d.type + d.k;
    const c = seen.get(g) || 0; if(c >= (d.type === "q" ? 3 : 2)) continue;
    seen.set(g, c + 1); out.push(d); if(out.length >= 14) break;
  }
  return {res:out, fixes, qt};
}

// ---------- вывод ----------
function hl(text, qset, max){
  let s = String(text);
  if(max && s.length > max){
    const words = s.split(/(\s+)/); let pos = 0, first = -1;
    for(let i = 0; i < words.length; i++){ const w = words[i].toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, ""); if(w.length > 1 && qset.has(CANON.get(stem(w)) || stem(w))){ first = pos; break } pos += words[i].length }
    const start = first > 60 ? s.lastIndexOf(" ", first - 40) + 1 : 0;
    s = (start > 0 ? "… " : "") + s.slice(start, start + max) + (start + max < s.length ? " …" : "");
  }
  return s.split(/([A-Za-zА-Яа-яЁё0-9]+)/).map((p, i) => {
    if(i % 2 === 0) return esc(p);
    const w = p.toLowerCase().replace(/ё/g, "е");
    return w.length > 1 && qset.has(CANON.get(stem(w)) || stem(w)) ? "<mark>" + esc(p) + "</mark>" : esc(p);
  }).join("");
}
const fmtT = s => (s >= 3600 ? Math.floor(s / 3600) + ":" + String(Math.floor(s % 3600 / 60)).padStart(2, "0") : Math.floor(s / 60)) + ":" + String(s % 60).padStart(2, "0");
const LBL = {sub:["target", "Тема карты"], q:["quiz", "Вопрос теста"], sec:["doc", "Раздел статьи"], ch:["play", "Момент в видео"]};
let CUR = [], ACT = -1;
function render(q){
  const {res, fixes, qt} = search(q);
  const qset = new Set(qt.flat().map(x => x[0]));
  CUR = res; ACT = res.length ? 0 : -1;
  if(!res.length){ panel.innerHTML = '<div class="sr-empty">Ничего не нашлось. Попробуй сформулировать иначе: «как работает select», «len и cap», «зачем context».</div>'; panel.hidden = false; return }
  let h = '<div class="sr-head">Где разобраться' + (fixes.length ? ' <span class="mut">· учёл опечатки</span>' : "") + '<span class="sr-keys"><kbd>↑</kbd><kbd>↓</kbd> выбрать · <kbd>Enter</kbd> открыть</span></div>';
  res.forEach((d, i) => {
    const r = BYKEY[d.k], topic = r ? r.sb.w : "";
    let meta = "";
    if(d.type === "sub") meta = esc(r.nd.t) + " · " + esc(r.sg.s);
    else if(d.type === "q") meta = "Тема: " + esc(topic);
    else if(d.type === "sec") meta = esc(d.art) + (topic ? " · тема: " + esc(topic) : "");
    else meta = esc(d.vt) + " · <b>с " + fmtT(d.t) + "</b>";
    h += '<button class="sr' + (i === 0 ? " on" : "") + '" data-i="' + i + '"><span class="sr-type t-' + d.type + '">' + I(LBL[d.type][0]) + LBL[d.type][1] + '</span><span class="sr-t">' + hl(d.title, qset) + '</span><span class="sr-s">' + hl(d.snip || "", qset, 170) + '</span><span class="sr-m">' + meta + (d.type === "sec" || d.type === "ch" ? " " + I("ext") : "") + "</span></button>";
  });
  panel.innerHTML = h; panel.hidden = false;
}
function open(i){
  const d = CUR[i]; if(!d) return;
  close();
  if(d.type === "sub") goto(d.k);
  else if(d.type === "q"){
    goto(d.k);
    setTimeout(() => { const q = document.querySelectorAll("#s-" + CSS.escape(d.k) + " .q")[d.qi]; if(q){ q.scrollIntoView({behavior:"smooth", block:"center"}); q.classList.remove("flash"); void q.offsetWidth; q.classList.add("flash") } }, 350);
  }
  else if(d.type === "sec"){
    const base = d.url.split("#")[0];
    const link = d.hid ? base + "#" + d.hid : d.head ? base + "#:~:text=" + encodeURIComponent(d.head.slice(0, 80)) : base;
    window.open(link, "_blank", "noopener");
  }
  else window.RM.openVideo(d.k, d.yt, d.t);
}
function close(){ panel.hidden = true }
let T = null;
input.addEventListener("focus", () => { loadIndex(); if(input.value.trim() && CUR.length) panel.hidden = false });
input.addEventListener("input", () => {
  clearTimeout(T);
  const q = input.value.trim();
  if(!q){ close(); return }
  T = setTimeout(() => loadIndex().then(() => render(q)), 140);
});
input.addEventListener("keydown", e => {
  if(panel.hidden || !CUR.length) return;
  if(e.key === "ArrowDown" || e.key === "ArrowUp"){
    e.preventDefault();
    ACT = (ACT + (e.key === "ArrowDown" ? 1 : -1) + CUR.length) % CUR.length;
    panel.querySelectorAll(".sr").forEach((b, i) => b.classList.toggle("on", i === ACT));
    const on = panel.querySelector(".sr.on"); if(on) on.scrollIntoView({block:"nearest"});
  }
  if(e.key === "Enter"){ e.preventDefault(); open(ACT) }
  if(e.key === "Escape") close();
});
panel.addEventListener("click", e => { const b = e.target.closest(".sr"); if(b) open(+b.dataset.i) });
document.addEventListener("click", e => { if(!e.target.closest(".search") && !e.target.closest("#sres")) close() });
window.RM.searchTest = q => loadIndex().then(() => search(q).res.map(d => d.type + ": " + d.title));
})();
