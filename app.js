"use strict";
// ---------- хранилище ----------
const K = {st:"1c-roadmap-v1", days:"1c-roadmap-days", notes:"1c-roadmap-notes", pace:"1c-roadmap-pace", open:"1c-roadmap-open",
  quiz:"1c-roadmap-quiz", ck:"1c-roadmap-ck", theme:"1c-roadmap-theme", view:"1c-roadmap-view",
  oldChk:"1c-roadmap-chk", skip0:"1c-roadmap-skip0", hideDone:"1c-roadmap-hd", srs:"1c-roadmap-srs",
  doneAt:"1c-roadmap-done-at", backup:"1c-roadmap-backup", snooze:"1c-roadmap-backup-snooze", exam:"1c-roadmap-exam", news:"1c-roadmap-news"};
const ls = {
  get(k, def){ try{ const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v) }catch(e){ return def } },
  raw(k){ try{ return localStorage.getItem(k) }catch(e){ return null } },
  set(k, v){ try{ localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)) }catch(e){} }
};
let S = ls.get(K.st, {}), DY = ls.get(K.days, []), NT = ls.get(K.notes, {}), QZ = ls.get(K.quiz, {}), CK = ls.get(K.ck, {}), OPEN = ls.get(K.open, {});
let PW = parseInt(ls.raw(K.pace) || "8", 10); if(!(PW > 0)) PW = 8;
let SKIP0 = ls.raw(K.skip0) === "1";
let SRS = ls.get(K.srs, {}); if(!SRS || typeof SRS !== "object") SRS = {};
// DA — когда тема отмечена готовой (для фактического темпа), EX — лучший результат экзамена этапа
let DA = ls.get(K.doneAt, {}); if(!DA || typeof DA !== "object") DA = {};
let EX = ls.get(K.exam, {}); if(!EX || typeof EX !== "object") EX = {};
if(!S || typeof S !== "object") S = {}; if(!Array.isArray(DY)) DY = []; if(!NT || typeof NT !== "object") NT = {};
const save = {
  st(){ ls.set(K.st, S) }, days(){ ls.set(K.days, DY) }, notes(){ ls.set(K.notes, NT) }, quiz(){ ls.set(K.quiz, QZ) },
  ck(){ ls.set(K.ck, CK) }, open(){ ls.set(K.open, OPEN) }, pace(){ ls.set(K.pace, String(PW)) }, srs(){ ls.set(K.srs, SRS) },
  doneAt(){ ls.set(K.doneAt, DA) }, exam(){ ls.set(K.exam, EX) }
};

// Перенос прогресса со старой карты: "узел:индекс" → "узел.подтема"
const RANK = {todo:0, learning:1, done:2};
function migrate(){
  let changed = false;
  for(const k of Object.keys(S)){
    let v = S[k]; if(v === 1 || v === true) v = "done";
    if(!k.includes(":")){ if(v !== S[k]){ S[k] = v; changed = true } continue }
    const nk = MIGRATE[k];
    if(nk && RANK[v] > (RANK[S[nk]] || 0)) S[nk] = v;
    delete S[k]; changed = true;
  }
  // подтемы, переехавшие в другой узел: статус, заметка, тест, отметки и очередь повторения
  if(typeof RENAME !== "undefined") for(const [o, n] of Object.entries(RENAME)){
    if(S[o] !== undefined){ if(RANK[S[o]] > (RANK[S[n]] || 0)) S[n] = S[o]; delete S[o]; changed = true }
    if(NT[o] !== undefined){ NT[n] = NT[n] ? NT[n] + "\n\n" + NT[o] : NT[o]; delete NT[o]; changed = true }
    if(QZ[o] !== undefined){ if(!QZ[n] || QZ[o].s > QZ[n].s) QZ[n] = QZ[o]; delete QZ[o]; changed = true }
    for(const suf of ["", "#sc", "#st"]) if(CK[o + suf] !== undefined){
      CK[n + suf] = [...new Set([...(CK[n + suf] || []), ...CK[o + suf]])].sort((a, b) => a - b); delete CK[o + suf]; changed = true;
    }
    for(const q of Object.keys(SRS)) if(q.startsWith(o + "#")){ SRS[n + q.slice(o.length)] = SRS[q]; delete SRS[q]; changed = true }
    if(DA[o] !== undefined){ if(!DA[n]) DA[n] = DA[o]; delete DA[o]; changed = true }
  }
  for(const k of Object.keys(NT)){
    if(!k.includes(":")) continue;
    const nk = MIGRATE[k];
    if(nk && NT[k]) NT[nk] = NT[nk] ? NT[nk] + "\n\n" + NT[k] : NT[k];
    delete NT[k]; changed = true;
  }
  // отметки «Умеешь» прошлой версии: "узел:подтема:cN" → CK["узел.подтема#sc"]
  const old = ls.get(K.oldChk, null);
  if(old && typeof old === "object"){
    for(const ck of Object.keys(old)){
      const m = /^(.*):c(\d+)$/.exec(ck), map = m && CHMAP[m[1]];
      if(!map || !old[ck]) continue;
      const key = map[0] + "#sc", i = map[1] + +m[2], arr = CK[key] || [];
      if(!arr.includes(i)){ arr.push(i); arr.sort((a, b) => a - b); CK[key] = arr; changed = true }
    }
  }
  if(changed){ save.st(); save.notes(); save.ck(); save.quiz(); save.srs(); save.doneAt() }
}
migrate();

// ---------- модель ----------
const SUBS = [], BYKEY = {};
D.forEach((sg, si) => sg.n.forEach(nd => nd.sub.forEach(sb => {
  const k = nd.id + "." + sb.id, rec = {k, sg, si, nd, sb};
  SUBS.push(rec); BYKEY[k] = rec;
})));
const st = k => (S[k] === "done" || S[k] === "learning") ? S[k] : "todo";
const today = () => ymd(new Date());
function ymd(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") }
function markDay(){ const t = today(); if(!DY.includes(t)){ DY.push(t); DY.sort(); save.days() } }

// ---------- утилиты ----------
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// `код` — в строке, блок ``` … ``` — многострочный код в вопросах
const rich = s => {
  const blocks = [];
  const t = String(s).replace(/```\n?([\s\S]*?)\n?```/g, (_, c) => "\u0000" + (blocks.push(c) - 1) + "\u0000");
  return esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\u0000(\d+)\u0000/g, (_, i) => '<pre class="qcode"><code>' + esc(blocks[i]) + "</code></pre>");
};
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c) };
const P = {
  doc:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  play:'<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
  book:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  code:'<path d="m4 17 6-6-6-6M12 19h8"/>',
  quiz:'<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  edit:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  chev:'<path d="m9 18 6-6-6-6"/>',
  ext:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  zap:'<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  graph:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  theme:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  more:'<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  down:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  up:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  expand:'<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
  collapse:'<path d="m7 20 5-5 5 5M7 4l5 5 5-5"/>',
  trash:'<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
};
const I = (n, cls = "") => '<svg class="i ' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + P[n] + "</svg>";
const SRC = {"v8.1c.ru":"1С","its.1c.ru":"ИТС","1c.ru":"1С","infostart.ru":"Инфостарт","forum.infostart.ru":"Форум Инфостарта","habr.com":"Хабр",
  "qna.habr.com":"Хабр Q&A","skillbox.ru":"Skillbox Media","buhexpert8.ru":"Бухэксперт8","buh.ru":"БУХ.1С","www.moysklad.ru":"МойСклад",
  "github.com":"GitHub","docs.github.com":"GitHub Docs","git-scm.com":"git-scm","www.cleverence.ru":"Клеверенс","hh.ru":"hh.ru",
  "career.habr.com":"Хабр Карьера","developer.1c.ru":"1С:Разработчикам","edt.1c.ru":"1C:EDT"};
const src = u => { try{ const h = new URL(u).hostname; return SRC[h] || h.replace(/^www\./, "") }catch(e){ return "" } };
function rng(seed){ let h = 2166136261; for(let i = 0; i < seed.length; i++){ h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296 } }

// ---------- статистика ----------
function stats(){
  const r = {tot:0, dn:0, hrsLeft:0, hrsAll:0, stages:[], nodes:{}, learning:[]};
  D.forEach((sg, si) => {
    const s = {tot:0, dn:0, hrs:0}, skip = si === 0 && SKIP0;
    sg.n.forEach(nd => {
      const n = {tot:0, dn:0, lr:0};
      nd.sub.forEach(sb => {
        const k = nd.id + "." + sb.id, v = st(k);
        n.tot++; s.tot++;
        if(v === "done"){ n.dn++; s.dn++ } else s.hrs += sb.h;
        if(!skip){ r.tot++; r.hrsAll += sb.h; if(v === "done") r.dn++; else r.hrsLeft += sb.h }
        if(v === "learning"){ n.lr++; r.learning.push(BYKEY[k]) }
      });
      r.nodes[nd.id] = n;
    });
    r.stages[si] = s;
  });
  return r;
}
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
function forecast(h, pace = PW){
  if(!(pace > 0) || !(h > 0)) return null;
  const w = Math.ceil(h / pace), d = new Date(); d.setDate(d.getDate() + w * 7);
  return {w, date:d.toLocaleDateString("ru-RU", {day:"numeric", month:"long", year:"numeric"})};
}
const daysSince = d => Math.round((new Date(today()) - new Date(d)) / 864e5);
// фактический темп: часы тем, отмеченных готовыми за последние 4 недели, в пересчёте на неделю.
// Пока с первой готовой темы не прошла неделя, данных мало — возвращает null.
function realPace(){
  const dates = Object.keys(DA).filter(k => BYKEY[k]).map(k => DA[k]).sort(); if(!dates.length) return null;
  const span = Math.min(28, daysSince(dates[0]) + 1);
  if(span < 7) return null;
  let h = 0; for(const k in DA) if(BYKEY[k] && daysSince(DA[k]) < 28) h += BYKEY[k].sb.h;
  return h > 0 ? h / (span / 7) : null;
}
function streak(){
  const set = new Set(DY); let s = 0; const d = new Date();
  if(!set.has(today())) d.setDate(d.getDate() - 1);
  while(set.has(ymd(d))){ s++; d.setDate(d.getDate() - 1) }
  return s;
}
function lastAct(){
  if(!DY.length) return "ещё не было";
  const diff = Math.round((new Date(today()) - new Date(DY[DY.length - 1])) / 864e5);
  return diff <= 0 ? "сегодня" : diff === 1 ? "вчера" : diff + " " + plural(diff, "день", "дня", "дней") + " назад";
}

// ---------- рендер ----------
const TXT = {todo:"Не начато", learning:"Изучаю", done:"Готово"};
// ---------- шаги подтемы: Пойми → Углубись → Сделай → Проверь себя → Умеешь ----------
// отметки шагов хранятся в CK[key + "#st"]: 0 — главный материал изучен, 2 — задание сделано
const STEP_T = {learn:"изучи главный материал", do:"сделай задание", quiz:"пройди тест", sc:"отметь, что умеешь"};
function steps(r){
  const {k, sb} = r, marks = CK[k + "#st"] || [], out = [];
  if(sb.s) out.push({id:"learn", done:marks.includes(0)});
  out.push({id:"do", done:sb.ck ? (CK[k] || []).length >= sb.ck.length : marks.includes(2)});
  if(sb.q){ const q = QZ[k]; out.push({id:"quiz", done:!!q && q.n === sb.q.length && q.s === q.n}) }
  if(sb.sc) out.push({id:"sc", done:(CK[k + "#sc"] || []).length >= sb.sc.length});
  return out;
}
function nextStep(r){ const s = steps(r).find(x => !x.done); return s ? STEP_T[s.id] : "все шаги пройдены" }
function subHTML(r){
  const {k, sb} = r, v = st(k), q = QZ[k], ss = steps(r), dn = ss.filter(x => x.done).length;
  let meta = '<span>' + I("clock") + "~" + sb.h + " ч</span>";
  if(sb.a) meta += "<span>" + I("doc") + sb.a.length + "</span>";
  if(sb.v) meta += "<span>" + I("play") + sb.v.length + "</span>";
  meta += '<span class="qb' + (dn ? (dn === ss.length ? " ok" : " part") : "") + '">' + I("check") + "шаги " + dn + "/" + ss.length + "</span>";
  if(sb.q){
    const stale = q && q.n !== sb.q.length;
    meta += '<span class="qb' + (q ? (!stale && q.s === q.n ? " ok" : " part") : "") + '">' + I("quiz") + (!q ? "тест · " + sb.q.length : stale ? "тест: новые вопросы" : "тест " + q.s + "/" + q.n) + "</span>";
  }
  if(NT[k]) meta += "<span>" + I("edit") + "заметка</span>";
  return '<div class="sub st-' + v + '" id="s-' + k + '" data-k="' + k + '"><div class="sub-h">' +
    '<button class="stt" data-act="cycle" title="' + TXT[v] + ' — нажми, чтобы сменить" aria-label="Статус: ' + TXT[v] + '"></button>' +
    '<div class="sub-main" data-act="toggle" role="button" tabindex="0" aria-expanded="false"><div class="sub-t">' + esc(sb.w) + '</div><div class="sub-m">' + meta + "</div></div>" +
    '<button class="chev" data-act="toggle" aria-label="Подробнее">' + I("chev") + '</button></div><div class="sub-b" hidden></div></div>';
}
const enTag = x => x === "en" ? '<span class="en">EN</span>' : "";
function lnkList(arr){
  return "<ul>" + arr.map(x => '<li><a class="lnk" href="' + esc(x[1]) + '" target="_blank" rel="noopener"><span class="src">' + esc(src(x[1])) + '</span><span class="lt">' + esc(x[0]) + enTag(x[2]) + "</span></a></li>").join("") + "</ul>";
}
// копия видео на Rutube или VK Видео: YouTube в России открывается не у всех
const MIR = typeof MIRROR !== "undefined" ? MIRROR : {};
const mirName = u => /rutube\./.test(u) ? "Rutube" : "VK Видео";
const mirLink = yt => MIR[yt] ? '<a class="mir" href="' + esc(MIR[yt]) + '" target="_blank" rel="noopener">' + I("ext") + "Смотреть на " + mirName(MIR[yt]) + "</a>" : "";
const vidHTML = x => '<div><button class="vid" data-act="video" data-yt="' + esc(x[0]) + '"><span class="thumb"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + esc(x[0]) + '/mqdefault.jpg"><span class="play">' + I("play") + '</span><span class="dur">' + esc(x[3]) + '</span></span><span><span class="vt">' + esc(x[1]) + enTag(x[4]) + '</span><span class="vc">' + esc(x[2]) + "</span></span></button>" + mirLink(x[0]) + "</div>";
const ckList = (items, done, act) => items.map((c, i) => '<label><input type="checkbox" data-act="' + act + '" data-i="' + i + '"' + (done.includes(i) ? " checked" : "") + "><span>" + esc(c) + "</span></label>").join("");
const stepCk = (i, on, label) => '<label class="step-ck"><input type="checkbox" data-act="step" data-i="' + i + '"' + (on ? " checked" : "") + ">" + label + "</label>";
function stepHTML(n, id, title, hint, body, done, ck){
  return '<li class="step' + (done ? " done" : "") + '" data-step="' + id + '"><div class="step-h"><span class="step-n"><em>' + n + "</em>" + I("check") + "</span><b>" + title + "</b>" +
    (hint ? '<span class="step-hint">' + hint + "</span>" : "") + (ck || "") + '</div><div class="step-b">' + body + "</div></li>";
}
function subBody(r){
  const {k, sb} = r, v = st(k), marks = CK[k + "#st"] || [], done = {};
  steps(r).forEach(x => done[x.id] = x.done);
  let h = '<p class="why">' + rich(sb.y) + "</p>";
  if(sb.kc) h += '<div class="kc"><b>Суть</b>' + sb.kc.map(c => '<div class="kc-row">' + c.split("→").map(x => "<span>" + rich(x.trim()) + "</span>").join('<i aria-hidden="true">→</i>') + "</div>").join("") + "</div>";
  h += '<div class="st-seg">' + ["todo", "learning", "done"].map(x => '<button data-act="set" data-v="' + x + '" class="' + (v === x ? "on" : "") + '"><span class="stt ' + x + '" style="width:14px;height:14px;border-width:2px;pointer-events:none"></span>' + TXT[x] + "</button>").join("") + "</div>";
  let n = 0, out = "";
  // 1. главный материал
  if(sb.s){
    const t = sb.s[0], x = sb[t][+sb.s.slice(1)];
    const body = t === "v" ? '<div class="start">' + vidHTML(x) + "</div>"
      : '<div class="start"><a class="start-a" href="' + esc(x[1]) + '" target="_blank" rel="noopener"><span class="src">' + esc(src(x[1])) + '</span><b>' + esc(x[0]) + enTag(x[2]) + '</b><span class="start-go">Открыть ' + I("ext") + "</span></a></div>";
    out += stepHTML(++n, "learn", "Пойми", "начни с этого материала", body, done.learn, stepCk(0, marks.includes(0), "Готово"));
  }
  // 2. остальные материалы
  const rest = f => (sb[f] || []).filter((_, i) => sb.s !== f + i);
  const ra = rest("a"), rd = rest("d"), rv = rest("v"), rb = sb.b || [];
  if(ra.length || rd.length || rv.length || rb.length){
    let b = '<div class="res">';
    if(ra.length) b += '<div class="res-g"><h5>' + I("doc") + "Статьи</h5>" + lnkList(ra) + "</div>";
    if(rd.length) b += '<div class="res-g"><h5>' + I("book") + "Документация</h5>" + lnkList(rd) + "</div>";
    if(rb.length) b += '<div class="res-g"><h5>' + I("book") + "Книги</h5>" + lnkList(rb) + "</div>";
    if(rv.length) b += '<div class="res-g vids"><h5>' + I("play") + 'Видео</h5><div class="vgrid">' + rv.map(vidHTML).join("") + "</div></div>";
    out += stepHTML(++n, "deep", "Углубись", sb.s ? "если что-то осталось непонятным" : "", b + "</div>", false);
  }
  // 3. задание и практика
  let b = '<div class="task"><b>Задание</b>' + rich(sb.t) + "</div>";
  if(sb.ac) b += '<div class="ac"><b>Как понять, что сделано</b><ul>' + sb.ac.map(x => "<li>" + rich(x) + "</li>").join("") + "</ul></div>";
  if(sb.p) b += '<div class="res-g prac"><h5>' + I("code") + "Практика</h5>" + lnkList(sb.p) + "</div>";
  if(sb.ck) b += '<div class="ck"><div class="quiz-h">' + I("check") + "Чек-лист проекта</div>" + ckList(sb.ck, CK[k] || [], "ck") + "</div>";
  out += stepHTML(++n, "do", "Сделай", sb.ck ? "шаг закроется, когда отмечен весь чек-лист" : "руками закрепляется лучше всего", b, done.do, sb.ck ? "" : stepCk(2, marks.includes(2), "Сделано"));
  // 4. тест
  if(sb.q){
    const q = QZ[k], stale = q && q.n !== sb.q.length;
    const hint = !q ? sb.q.length + " " + plural(sb.q.length, "вопрос", "вопроса", "вопросов") + ", ошибки вернутся в повторение"
      : stale ? "в тесте появились новые вопросы — пройди ещё раз" : "лучший результат: " + q.s + " из " + q.n;
    out += stepHTML(++n, "quiz", "Проверь себя", hint, quizHTML(r), done.quiz);
  }
  // 5. самопроверка
  if(sb.sc) out += stepHTML(++n, "sc", "Умеешь", "отметь, что уже получается без подсказок", '<div class="ck">' + ckList(sb.sc, CK[k + "#sc"] || [], "sc") + "</div>", done.sc);
  h += '<ol class="steps">' + out + "</ol>";
  h += '<div class="all-done"' + (steps(r).every(x => x.done) && v !== "done" ? "" : " hidden") + ">" + I("check") + 'Все шаги пройдены. Отметить тему готовой?<button class="btn sm" data-act="set" data-v="done">Да, готово</button></div>';
  const nv = NT[k] || "";
  h += '<div class="sub-f"><button class="note-btn' + (nv ? " has" : "") + '" data-act="note">' + I("edit") + (nv ? "Заметка" : "Добавить заметку") + "</button>" +
    '<button class="note-btn" data-act="link">' + I("link") + "Ссылка на тему</button>" +
    '<a class="note-btn" target="_blank" rel="noopener" href="' + esc(issueURL(r)) + '">' + I("flag") + "Сообщить об ошибке</a></div>" +
    '<textarea class="note" placeholder="Свои заметки, ссылки, выводы…"' + (nv ? "" : " hidden") + ">" + esc(nv) + "</textarea>";
  return h;
}
const REPO = "https://github.com/UbicaSmerti228/1c-roadmap";
const topicURL = k => location.origin + location.pathname + "#" + k;
// готовый issue на GitHub: тема и ссылка уже подставлены
function issueURL(r){
  return REPO + "/issues/new?title=" + encodeURIComponent("Ошибка в теме «" + r.sb.w + "»") +
    "&body=" + encodeURIComponent("Тема: " + r.k + "\nСсылка: " + topicURL(r.k) + "\n\nЧто не так:\n");
}
function quizHTML(r){
  const {k, sb} = r;
  let h = '<div class="quiz"><ol class="qs">';
  sb.q.forEach((q, i) => {
    const opts = [[q[1], 1], ...q[2].map(x => [x, 0])], rnd = rng(k + i);
    for(let j = opts.length - 1; j > 0; j--){ const t = Math.floor(rnd() * (j + 1)); [opts[j], opts[t]] = [opts[t], opts[j]] }
    h += '<li class="q"><div class="q-t">' + rich(q[0]) + '</div><div class="opts">' + opts.map(o => '<label class="opt"><input type="radio" name="q-' + k + "-" + i + '" data-ok="' + o[1] + '"><span>' + rich(o[0]) + "</span></label>").join("") + '</div><div class="q-ex" hidden>' + rich(q[3]) + "</div></li>";
  });
  return h + '</ol><div class="quiz-f"><button class="btn primary" data-act="qcheck">Проверить</button><button class="btn ghost" data-act="qreset">Сбросить ответы</button><span class="quiz-res"></span></div></div>';
}
// обновить отметки шагов и баннер «все шаги пройдены» у открытой подтемы
function updateSteps(k){
  const el = document.getElementById("s-" + k); if(!el) return;
  const ss = steps(BYKEY[k]);
  ss.forEach(x => { const li = $('.step[data-step="' + x.id + '"]', el); if(li) li.classList.toggle("done", x.done) });
  const all = $(".all-done", el); if(all) all.hidden = !(ss.every(x => x.done) && st(k) !== "done");
  const q = QZ[k], hint = $('.step[data-step="quiz"] .step-hint', el);
  if(hint && q) hint.textContent = q.n !== BYKEY[k].sb.q.length ? "в тесте появились новые вопросы — пройди ещё раз" : "лучший результат: " + q.s + " из " + q.n;
}
// любое действие в теме: начатая тема сама становится «Изучаю» и попадает в «Сегодня»
function afterProgress(k){
  if(st(k) === "todo") setStatus(k, "learning");
  updateSteps(k); refreshMeta(k); updateStats();
}
const NDT = {}, NREQ = {}; D.forEach(sg => sg.n.forEach(nd => { NDT[nd.id] = nd.t; if(nd.req) NREQ[nd.id] = nd.req }));
// milestone этапа: критерии (CK["miN"]) и шаг сквозного проекта (CK["miN#p"], ссылка на репозиторий — NT["miN"])
function mileHTML(mi, si){
  let h = '<div class="mile" data-mi="' + si + '"><h3>' + I("flag") + esc(mi.t) + '<span class="mile-cnt" data-mc="c"></span></h3><div class="ck mile-ck">' + ckList(mi.c, CK["mi" + si] || [], "mi") + "</div>";
  if(examQids(si).length) h += '<div class="exam"><button class="btn sm" data-act="exam" data-si="' + si + '">' + I("quiz") + 'Экзамен этапа</button><span class="mut" data-ex="' + si + '"></span></div>';
  if(mi.p){
    const link = NT["mi" + si] || "";
    h += '<div class="proj"><div class="proj-h">' + I("box") + "<b>" + esc(mi.p[0]) + '</b><span class="mile-cnt" data-mc="p"></span></div><p>' + esc(mi.p[1]) + '</p><div class="ck">' + ckList(mi.pc, CK["mi" + si + "#p"] || [], "mip") + "</div>" +
      (mi.ref ? '<a class="proj-ref" href="' + esc(mi.ref) + '" target="_blank" rel="noopener">' + I("code") + "<span><b>Сверить с эталоном</b><small>Сначала сделай версию сам, потом сравни. Эталон — один из разумных вариантов, а не единственно верный.</small></span>" + I("ext") + "</a>" : "") +
      '<label class="proj-link">' + I("link") + '<input type="url" data-act="milink" placeholder="Ссылка на репозиторий или коммит этой версии" value="' + esc(link) + '"><a class="proj-open" target="_blank" rel="noopener"' + (/^https?:\/\//.test(link) ? ' href="' + esc(link) + '"' : " hidden") + ">Открыть " + I("ext") + "</a></label></div>";
  }
  return h + "</div>";
}
function mileState(si){
  const mi = D[si].mi, c = (CK["mi" + si] || []).length, p = (CK["mi" + si + "#p"] || []).length;
  return {c, cn:mi.c.length, p, pn:mi.pc ? mi.pc.length : 0};
}
function updateMile(si){
  const el = $('.mile[data-mi="' + si + '"]'); if(!el) return;
  const m = mileState(si), c = $('[data-mc="c"]', el), p = $('[data-mc="p"]', el);
  c.textContent = m.c + "/" + m.cn; c.classList.toggle("full", m.c === m.cn);
  if(p){ p.textContent = m.p + "/" + m.pn; p.classList.toggle("full", m.p === m.pn) }
  el.classList.toggle("m-done", m.c === m.cn && m.p === m.pn);
  const a = $(".proj-open", el), link = NT["mi" + si] || "";
  if(a){ const ok = /^https?:\/\//.test(link); a.hidden = !ok; if(ok) a.href = link }
  const ex = $('[data-ex="' + si + '"]', el), best = EX[si];
  if(ex) ex.textContent = best ? "лучший результат: " + best.s + " из " + best.n : "10 случайных вопросов по темам этапа";
}
function renderApp(){
  let h = "";
  D.forEach((sg, si) => {
    const skip = si === 0 && SKIP0;
    h += '<section class="stage' + (skip ? " skipped" : "") + '" id="stage-' + si + '" data-si="' + si + '"><div class="stage-h"><div class="stage-num">' + String(si).padStart(2, "0") + '</div><div style="flex:1;min-width:0"><h2>' + esc(sg.s) + "</h2><p>" + esc(sg.d) + '</p><div class="stage-prog"><div class="bar"><i data-sbar="' + si + '"></i></div><span data-stxt="' + si + '"></span></div>';
    if(si === 0) h += '<button class="btn sm skip-btn" data-act="skip0">' + (skip ? "Вернуть этап 0 в карту" : "У меня есть опыт — пропустить этап") + "</button>";
    h += '</div></div><div class="nodes">';
    sg.n.forEach(nd => {
      h += '<div class="node' + (OPEN["n-" + nd.id] ? " op" : "") + '" id="n-' + nd.id + '" data-nid="' + nd.id + '"><div class="node-h" data-act="node" role="button" tabindex="0"><div class="node-main"><span class="tag ' + nd.m + '">' + (nd.m === "seq" ? "по порядку" : "можно параллельно") + '</span><div class="node-t">' + esc(nd.t) + '</div><div class="node-d">' + esc(nd.ds) + "</div>" +
        (nd.req ? '<div class="req" data-req="' + nd.id + '"></div>' : "") +
        '</div><span class="pill" data-npill="' + nd.id + '"></span><button class="chev" aria-label="Развернуть">' + I("chev") + '</button></div><div class="node-b">';
      nd.sub.forEach(sb => { h += subHTML(BYKEY[nd.id + "." + sb.id]) });
      h += "</div></div>";
    });
    if(sg.mi) h += mileHTML(sg.mi, si);
    h += "</div></section>";
  });
  if(typeof NEXT !== "undefined") h += '<section class="next" id="next"><h2>' + I("flag") + "Когда карта пройдена</h2><p class=mut>Не обязательно для первой работы — выбирай по вакансиям, которые нравятся.</p><div class=\"next-grid\">" + NEXT.map(x => '<div class="card"><b>' + esc(x[0]) + "</b><div class=mut>" + esc(x[1]) + "</div></div>").join("") + "</div></section>";
  h += '<div class="nores" id="nores" hidden>Ничего не найдено. Попробуй другой запрос или сбрось фильтр.</div>';
  $("#app").innerHTML = h;
  let nav = "", chips = "";
  D.forEach((sg, si) => {
    nav += '<a href="#stage-' + si + '" data-nav="' + si + '"><div class="sn-t"><span class="sn-n">' + String(si).padStart(2, "0") + "</span>" + esc(sg.s) + '</div><div class="sn-p"><div class="bar"><i data-nbar="' + si + '"></i></div><span data-ntxt="' + si + '"></span></div></a>';
    chips += '<a href="#stage-' + si + '">' + si + ". " + esc(sg.s) + '<small data-ctxt="' + si + '"></small></a>';
  });
  $("#snav").innerHTML = nav; $("#stageChips").innerHTML = chips;
  updateStats();
}
// «Сегодня»: что делать прямо сейчас — следующий шаг темы, повторение ошибок, задача дня по алгоритмам
const DAILY = [];
// задача дня: практика из узла с флагом daily (по порядку тем), если такой узел есть в карте
const DNODE = D.flatMap(sg => sg.n).find(nd => nd.daily);
if(DNODE) DNODE.sub.forEach(sb => (sb.p || []).forEach(x => DAILY.push({x, k:DNODE.id + "." + sb.id})));
function todayHTML(r){
  const first = SUBS.find(x => !(x.si === 0 && SKIP0) && st(x.k) === "learning") || SUBS.find(x => !(x.si === 0 && SKIP0) && st(x.k) === "todo");
  let h = "";
  if(first){
    h += '<button class="now-item" data-goto="' + first.k + '"><span class="stt ' + st(first.k) + '" style="pointer-events:none"></span><span><b>' + esc(first.sb.w) + "</b><small>" +
      (st(first.k) === "learning" ? "Следующий шаг: " + nextStep(first) : "Следующая тема · " + esc(first.nd.t)) + "</small></span></button>";
    const more = r.learning.filter(x => x !== first).slice(0, 2);
    if(more.length) h += more.map(x => '<button class="now-item sm" data-goto="' + x.k + '"><span class="stt learning" style="pointer-events:none"></span><span><b>' + esc(x.sb.w) + "</b><small>" + nextStep(x) + "</small></span></button>").join("");
  } else h += '<div class="empty">Карта пройдена. Время откликаться и проходить собеседования.</div>';
  const due = srsDue().length;
  if(due) h += '<button class="today-row" data-act="review">' + I("quiz") + "<span>Повторить ошибки: <b>" + due + "</b></span><i>" + I("chev") + "</i></button>";
  // задача дня появляется, когда дорожка с практикой уже начата
  const solved = CK.daily || [], started = DAILY.some(d => st(d.k) !== "todo");
  const task = started && DAILY.find(d => !solved.includes(d.x[1]));
  if(task) h += '<div class="today-row daily">' + I("code") + '<span>Задача дня: <a href="' + esc(task.x[1]) + '" target="_blank" rel="noopener">' + esc(task.x[0]) + "</a> <small class=mut>решено " + solved.length + " из " + DAILY.length + '</small></span><button class="btn sm" data-act="daily" data-u="' + esc(task.x[1]) + '">Решил</button></div>';
  return h;
}
function updateStats(){
  const r = stats(), p = pct(r.dn, r.tot);
  $("#gBar").style.width = p + "%"; $("#gPct").textContent = p + "%";
  $("#gCnt").textContent = r.dn + "/" + r.tot + " · осталось ~" + r.hrsLeft + " ч";
  r.stages.forEach((s, si) => {
    const sp = pct(s.dn, s.tot);
    $$('[data-sbar="' + si + '"],[data-nbar="' + si + '"]').forEach(e => e.style.width = sp + "%");
    const skip = si === 0 && SKIP0;
    const t = $('[data-stxt="' + si + '"]'); if(t) t.textContent = skip ? "пропущен — не входит в прогресс и прогноз" : s.dn + " из " + s.tot + " · " + sp + "%" + (s.hrs ? " · осталось ~" + s.hrs + " ч" : " · пройдено");
    const n = $('[data-ntxt="' + si + '"]'); if(n) n.textContent = skip ? "пропущен" : sp + "%";
    const c = $('[data-ctxt="' + si + '"]'); if(c) c.textContent = skip ? "—" : sp + "%";
  });
  for(const id in r.nodes){
    const n = r.nodes[id], el = $('[data-npill="' + id + '"]'); if(!el) continue;
    el.textContent = n.dn + "/" + n.tot; el.classList.toggle("full", n.dn === n.tot);
    const node = el.closest(".node");
    node.classList.toggle("n-done", n.dn === n.tot); node.classList.toggle("n-learning", n.dn < n.tot && (n.lr > 0 || n.dn > 0));
  }
  // дашборд
  $("#nowList").innerHTML = todayHTML(r);
  D.forEach((sg, si) => { if(sg.mi) updateMile(si) });
  const sk = streak();
  $("#streak").innerHTML = sk + ' <small>' + plural(sk, "день", "дня", "дней") + " подряд</small>";
  $("#lastAct").textContent = "Последняя активность: " + lastAct();
  let heat = ""; const set = new Set(DY), d = new Date(); d.setDate(d.getDate() - 20);
  for(let i = 0; i < 21; i++){ const k = ymd(d); heat += '<i class="' + (set.has(k) ? "on" : "") + (i === 20 ? " today" : "") + '" title="' + k + '"></i>'; d.setDate(d.getDate() + 1) }
  $("#heat").innerHTML = heat;
  const f = forecast(r.hrsLeft);
  $("#fcAll").innerHTML = f ? "Финиш карты: <b>" + f.date + "</b> <span class=mut>(~" + f.w + " нед.)</span>" : "Карта пройдена 🎉";
  let mi = "Все milestone закрыты";
  for(let si = SKIP0 ? 1 : 0; si < D.length; si++){
    const s = r.stages[si];
    if(s.dn < s.tot){ const ff = forecast(s.hrs); mi = esc(D[si].mi.t) + ": осталось " + (s.tot - s.dn) + " " + plural(s.tot - s.dn, "подтема", "подтемы", "подтем") + " (~" + s.hrs + " ч)" + (ff ? " → <b>" + ff.date + "</b>" : ""); break }
  }
  $("#fcMile").innerHTML = mi;
  const rp = realPace(), rf = rp ? forecast(r.hrsLeft, rp) : null;
  $("#fcReal").innerHTML = rf ? "По факту за 4 недели ты проходишь <b>~" + (Math.round(rp * 10) / 10) + " ч в неделю</b> → финиш " + rf.date
    : Object.keys(DA).length && r.hrsLeft > 0 ? "Фактический темп появится через неделю после первой готовой темы." : "";
  // нужные узлы: пока они не пройдены, узел помечен как «рано»
  for(const id in NREQ){
    const el = $('[data-req="' + id + '"]'); if(!el) continue;
    const miss = NREQ[id].filter(x => r.nodes[x] && r.nodes[x].dn < r.nodes[x].tot), n = r.nodes[id];
    el.textContent = miss.length ? "Сначала пройди: " + miss.map(x => NDT[x] || x).join(" · ") : "Нужные узлы пройдены: " + NREQ[id].map(x => NDT[x] || x).join(" · ");
    el.classList.toggle("ok", !miss.length);
    el.closest(".node").classList.toggle("early", miss.length > 0 && n.dn < n.tot);
  }
  updateBackupHint();
  const due = srsDue(), queued = Object.keys(SRS).filter(qById);
  const next = queued.map(q => SRS[q].due).sort()[0];
  $("#revBody").innerHTML = due.length
    ? '<div class="big">' + due.length + " <small>" + plural(due.length, "вопрос", "вопроса", "вопросов") + ' на сегодня</small></div><p class="mut">Вопросы, где ты ошибся. Повторяй, пока не запомнятся.</p><button class="btn primary" data-act="review">Повторить</button>'
    : queued.length ? '<div class="empty">На сегодня всё. В очереди ' + queued.length + " " + plural(queued.length, "вопрос", "вопроса", "вопросов") + ", ближайшее повторение — " + new Date(next).toLocaleDateString("ru-RU", {day:"numeric", month:"long"}) + ".</div>"
    : '<div class="empty">Ошибки из тестов попадут сюда и вернутся через 1, 3, 7 и 14 дней — пока не запомнятся.</div>';
  const wl = weakList().slice(0, 5);
  $("#weakBody").innerHTML = wl.length
    ? wl.map(x => '<button class="weak-item" data-goto="' + x.r.k + '"><b>' + esc(x.r.sb.w) + "</b><span>" + x.why.map(w => "<i>" + esc(w) + "</i>").join("") + "</span></button>").join("")
    : '<div class="empty">Здесь появятся темы, где тест пройден не полностью, были ошибки или не отмечено «Умеешь».</div>';
  // пора откликаться: пройден этап с флагом apply или собрана версия сквозного проекта этого этапа
  const ai = D.findIndex(sg => sg.apply), svc = r.stages[ai], m4 = ai >= 0 ? mileState(ai) : {pn:0}, ready = ai >= 0 && ((svc && svc.dn === svc.tot) || (m4.pn > 0 && m4.p === m4.pn));
  const job = D[D.length - 1].n.find(n => n.id === "job");
  $("#applyHint").hidden = !ready || !job || job.sub.every(sb => st("job." + sb.id) === "done");
  const pw = $("#pw"); if(document.activeElement !== pw) pw.value = PW;
  if(window.gRefresh) window.gRefresh();
}

// напоминание о копии: прогресс живёт только в этом браузере
function updateBackupHint(){
  const el = $("#backupHint"); if(!el) return;
  const last = ls.raw(K.backup), snooze = ls.raw(K.snooze) || "", has = Object.keys(S).length + Object.keys(QZ).length > 0;
  const due = has && today() >= snooze && (last ? daysSince(last) >= 14 : DY.length >= 3);
  el.hidden = !due;
  if(due){ const n = last ? daysSince(last) : 0; $("#bkText").textContent = last ? "Последняя копия сделана " + n + " " + plural(n, "день", "дня", "дней") + " назад." : "У прогресса ещё нет копии." }
  const info = $("#bkInfo");
  if(info) info.textContent = last ? "Последняя копия: " + new Date(last).toLocaleDateString("ru-RU", {day:"numeric", month:"long", year:"numeric"}) : "Копий прогресса ещё не было";
}

// ---------- действия ----------
function setStatus(k, v){
  if(v === "todo") delete S[k]; else S[k] = v;
  if(v === "done"){ markDay(); if(!DA[k]) DA[k] = today() } else delete DA[k];
  save.doneAt();
  save.st();
  const el = document.getElementById("s-" + k);
  if(el){
    el.className = el.className.replace(/st-\w+/, "st-" + v);
    const b = $(".stt", el); b.title = TXT[v] + " — нажми, чтобы сменить"; b.setAttribute("aria-label", "Статус: " + TXT[v]);
    $$(".st-seg button", el).forEach(x => x.classList.toggle("on", x.dataset.v === v));
  }
  updateSteps(k);
  updateStats();
}
function refreshMeta(k){
  const el = document.getElementById("s-" + k); if(!el) return;
  const tmp = document.createElement("div"); tmp.innerHTML = subHTML(BYKEY[k]);
  $(".sub-m", el).replaceWith($(".sub-m", tmp));
}
function openSub(el, force){
  const k = el.dataset.k, body = $(".sub-b", el), on = force === undefined ? body.hidden : force;
  if(on && !body.dataset.ready){ body.innerHTML = subBody(BYKEY[k]); body.dataset.ready = "1" }
  body.hidden = !on; el.classList.toggle("op", on);
  $(".sub-main", el).setAttribute("aria-expanded", on);
  // адрес страницы ведёт на открытую тему: ссылкой можно поделиться
  if(on) setHash(k); else if(hashKey() === k) setHash("");
}
const hashKey = () => { try{ return decodeURIComponent(location.hash.slice(1)) }catch(e){ return "" } };
function setHash(k){ try{ history.replaceState(null, "", k ? "#" + k : location.pathname + location.search) }catch(e){} }
function openFromHash(){ const k = hashKey(); if(BYKEY[k]) goto(k) }
function copyLink(btn, k){
  if(btn.dataset.busy) return;
  const url = topicURL(k), old = btn.innerHTML;
  const done = () => { btn.dataset.busy = "1"; btn.innerHTML = I("check") + "Ссылка скопирована"; setTimeout(() => { btn.innerHTML = old; delete btn.dataset.busy }, 1500) };
  setHash(k);
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt("Ссылка на тему:", url));
  else prompt("Ссылка на тему:", url);
}
function goto(k){
  const r = BYKEY[k]; if(!r) return;
  if(document.body.classList.contains("gmode")) setView("l");
  const node = document.getElementById("n-" + r.nd.id), el = document.getElementById("s-" + k);
  node.classList.add("op"); OPEN["n-" + r.nd.id] = 1; save.open();
  el.hidden = false; node.hidden = false; node.closest(".stage").hidden = false;
  openSub(el, true);
  el.scrollIntoView({behavior:"smooth", block:"start"});
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}
function checkQuiz(el, k){
  const quiz = $(".quiz", el), qs = $$(".q", quiz); let ok = 0, answered = 0;
  qs.forEach(q => {
    const sel = $("input:checked", q); q.classList.toggle("skip", !sel);
    $$(".opt", q).forEach(o => o.classList.remove("ok", "bad"));
    if(!sel) return;
    answered++;
    const lab = sel.closest(".opt");
    if(sel.dataset.ok === "1"){ ok++; lab.classList.add("ok") } else { lab.classList.add("bad"); $('input[data-ok="1"]', q).closest(".opt").classList.add("ok") }
    $(".q-ex", q).hidden = false;
    if(!q.dataset.rec){ srsRecord(k + "#" + qs.indexOf(q), sel.dataset.ok === "1"); q.dataset.rec = "1" }
  });
  const n = qs.length, res = $(".quiz-res", quiz);
  if(!answered){ res.className = "quiz-res part"; res.textContent = "Выбери ответы"; return }
  res.className = "quiz-res " + (ok === n ? "ok" : "part");
  res.textContent = ok === n ? "Все " + n + " верно!" : "Верно " + ok + " из " + n;
  // лучший результат; если в тест добавили вопросы, старый результат заменяется новым
  if(answered === n && (!QZ[k] || QZ[k].n !== n || ok >= QZ[k].s)){ QZ[k] = {s:ok, n}; save.quiz() }
  markDay(); afterProgress(k);
}
function resetQuiz(el){
  const quiz = $(".quiz", el);
  $$("input", quiz).forEach(i => i.checked = false);
  $$(".opt", quiz).forEach(o => o.classList.remove("ok", "bad"));
  $$(".q", quiz).forEach(q => { q.classList.remove("skip"); delete q.dataset.rec });
  $$(".q-ex", quiz).forEach(x => x.hidden = true);
  $(".quiz-res", quiz).textContent = "";
}

document.addEventListener("click", e => {
  const g = e.target.closest("[data-goto]"); if(g){ goto(g.dataset.goto); return }
  const a = e.target.closest("[data-act]"); if(!a) return;
  const act = a.dataset.act, el = a.closest(".sub"), k = el && el.dataset.k;
  if(act === "node"){ if(e.target.closest("a")) return; const n = a.closest(".node"); n.classList.toggle("op"); if(n.classList.contains("op")) OPEN[n.id] = 1; else delete OPEN[n.id]; save.open(); return }
  if(act === "toggle"){ openSub(el); return }
  if(act === "review"){ openReview(); return }
  if(act === "exam"){ openExam(+a.dataset.si); return }
  if(act === "link"){ copyLink(a, k); return }
  if(act === "daily"){ CK.daily = [...(CK.daily || []), a.dataset.u]; save.ck(); markDay(); updateStats(); return }
  if(act === "skip0"){ SKIP0 = !SKIP0; ls.set(K.skip0, SKIP0 ? "1" : "0"); renderApp(); applyFilter(); return }
  if(act === "cycle"){ const c = st(k); setStatus(k, c === "todo" ? "learning" : c === "learning" ? "done" : "todo"); return }
  if(act === "set"){ setStatus(k, a.dataset.v); return }
  if(act === "qcheck"){ checkQuiz(el, k); return }
  if(act === "qreset"){ resetQuiz(el); return }
  if(act === "note"){ const t = $(".note", el); t.hidden = !t.hidden; if(!t.hidden) t.focus(); return }
  if(act === "video"){
    const box = a.parentElement, ex = $(".player", box);
    if(ex){ ex.remove(); return }
    playVideo(el, box, a.dataset.yt, 0);
    return;
  }
});
function playVideo(el, box, yt, start){
  $$(".player", el).forEach(p => p.remove());
  const t = start ? "&start=" + (start | 0) : "", tw = start ? "&t=" + (start | 0) + "s" : "";
  box.insertAdjacentHTML("beforeend", '<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(yt) + '?autoplay=1&rel=0' + t + '" title="Видео" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><div class="player-f"><a href="https://www.youtube.com/watch?v=' + encodeURIComponent(yt) + tw + '" target="_blank" rel="noopener">Открыть на YouTube ' + I("ext") + "</a>" + mirLink(yt) + '<button class="btn sm ghost" data-act="video" data-yt="' + esc(yt) + '">Закрыть</button></div></div>');
  const p = $(".player", box); if(p) setTimeout(() => p.scrollIntoView({behavior:"smooth", block:"center"}), 60);
}
function openVideo(k, yt, start){
  goto(k);
  const el = document.getElementById("s-" + k), btn = el && $('.vid[data-yt="' + CSS.escape(yt) + '"]', el);
  if(btn) setTimeout(() => playVideo(el, btn.parentElement, yt, start), 300);
  else window.open("https://www.youtube.com/watch?v=" + encodeURIComponent(yt) + "&t=" + (start | 0) + "s", "_blank", "noopener");
}
// отметки хранятся списками индексов: CK[key] = [0, 2, …]
function toggleMark(key, i, on){
  const arr = (CK[key] || []).filter(x => x !== i); if(on) arr.push(i);
  arr.sort((a, b) => a - b); if(arr.length) CK[key] = arr; else delete CK[key];
  save.ck(); markDay();
}
const MARK = {sc:"#sc", step:"#st", ck:""};
document.addEventListener("change", e => {
  const c = e.target.closest("[data-act]"); if(!c) return;
  const act = c.dataset.act;
  if(act in MARK){
    const k = c.closest(".sub").dataset.k;
    toggleMark(k + MARK[act], +c.dataset.i, c.checked); afterProgress(k); return;
  }
  if(act === "mi" || act === "mip"){
    const si = c.closest(".mile").dataset.mi;
    toggleMark("mi" + si + (act === "mip" ? "#p" : ""), +c.dataset.i, c.checked); updateMile(si); updateStats();
  }
});
let noteT = null;
document.addEventListener("input", e => {
  const ml = e.target.closest('[data-act="milink"]');
  if(ml){
    const key = "mi" + ml.closest(".mile").dataset.mi, v = ml.value.trim();
    if(v) NT[key] = v; else delete NT[key];
    clearTimeout(noteT); noteT = setTimeout(() => { save.notes(); updateMile(key.slice(2)) }, 300); return;
  }
  const t = e.target.closest(".note"), el = t && t.closest(".sub"); if(!el) return;
  const k = el.dataset.k;
  if(t.value) NT[k] = t.value; else delete NT[k];
  clearTimeout(noteT); noteT = setTimeout(() => { save.notes(); refreshMeta(k); const b = $(".note-btn", el); b.classList.toggle("has", !!t.value) }, 300);
});

// ---------- повторение ошибок (интервальные повторения) ----------
const IV = [1, 3, 7, 14];
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) };
function qById(qid){
  const i = qid.lastIndexOf("#"), r = BYKEY[qid.slice(0, i)], n = +qid.slice(i + 1);
  return r && r.sb.q && r.sb.q[n] ? {r, q:r.sb.q[n], n} : null;
}
// ошибка → вернётся завтра; верный ответ → следующий интервал; после 14 дней вопрос считается выученным
function srsRecord(qid, ok){
  const c = SRS[qid];
  if(!ok) SRS[qid] = {b:0, due:addDays(IV[0]), w:(c ? c.w : 0) + 1};
  else if(c){ const b = c.b + 1; if(b >= IV.length) delete SRS[qid]; else SRS[qid] = {b, due:addDays(IV[b]), w:c.w} }
  else return;
  save.srs();
}
const srsDue = () => { const t = today(); return Object.keys(SRS).filter(q => SRS[q].due <= t && qById(q)) };
let RV = null;
function openReview(){
  const due = srsDue(); if(!due.length) return;
  const rnd = rng(today() + due.length);
  RV = {list:due.map(q => [rnd(), q]).sort((a, b) => a[0] - b[0]).map(x => x[1]), i:0, ok:0};
  openModal("Повторение ошибок");
}
function openModal(title){
  $("#rvTitle").textContent = title; $("#review").hidden = false; document.body.classList.add("modal-open"); showCard();
  const b = $("#review .icon-btn"); if(b) b.focus();
}
// экзамен этапа: 10 случайных вопросов из всех тем этапа, ошибки уходят в повторение
function examQids(si){
  const out = [];
  D[si].n.forEach(nd => nd.sub.forEach(sb => (sb.q || []).forEach((_, i) => out.push(nd.id + "." + sb.id + "#" + i))));
  return out;
}
function openExam(si){
  const all = examQids(si); if(!all.length) return;
  for(let j = all.length - 1; j > 0; j--){ const t = Math.floor(Math.random() * (j + 1)); [all[j], all[t]] = [all[t], all[j]] }
  RV = {list:all.slice(0, 10), i:0, ok:0, exam:si, miss:new Set()};
  openModal("Экзамен этапа " + si + " · " + D[si].s);
}
function closeReview(){ if(!RV) return; RV = null; $("#review").hidden = true; document.body.classList.remove("modal-open"); updateStats() }
function showCard(){
  const box = $("#rvBody");
  if(RV.i >= RV.list.length && RV.exam !== undefined){
    const n = RV.list.length, best = EX[RV.exam];
    if(!best || best.n !== n || RV.ok > best.s){ EX[RV.exam] = {s:RV.ok, n, d:today()}; save.exam() }
    const miss = [...RV.miss].map(k => BYKEY[k]).filter(Boolean);
    box.innerHTML = '<div class="rv-sum"><div class="big">' + RV.ok + " <small>из " + n + ' верно</small></div><p class="mut">' +
      (RV.ok / n >= 0.8 ? "Этап усвоен: верных ответов не меньше 80%." : "Меньше 80%. Повтори темы с ошибками и пройди экзамен ещё раз.") +
      (miss.length ? " Ошибки добавлены в повторение." : "") + "</p>" +
      (miss.length ? '<div class="weak-list">' + miss.map(r => '<button class="weak-item" data-rv="topic" data-k="' + r.k + '"><b>' + esc(r.sb.w) + "</b></button>").join("") + "</div>" : "") +
      '<button class="btn primary" data-rv="close">Готово</button></div>';
    return;
  }
  if(RV.i >= RV.list.length){
    box.innerHTML = '<div class="rv-sum"><div class="big">' + RV.ok + ' <small>из ' + RV.list.length + " верно</small></div><p class=mut>Ошибки вернутся завтра, верные ответы — через 3, 7 и 14 дней. После этого вопрос считается выученным.</p><button class=\"btn primary\" data-rv=\"close\">Готово</button></div>";
    return;
  }
  const qid = RV.list[RV.i], x = qById(qid), q = x.q, rnd = rng(qid + RV.i);
  const opts = [[q[1], 1], ...q[2].map(o => [o, 0])];
  for(let j = opts.length - 1; j > 0; j--){ const t = Math.floor(rnd() * (j + 1)); [opts[j], opts[t]] = [opts[t], opts[j]] }
  box.innerHTML = '<div class="rv-top"><span>Вопрос ' + (RV.i + 1) + " из " + RV.list.length + '</span><span class="mut">' + esc(x.r.sb.w) + '</span></div><div class="q"><div class="q-t">' + rich(q[0]) + '</div><div class="opts">' +
    opts.map(o => '<label class="opt"><input type="radio" name="rv" data-ok="' + o[1] + '"><span>' + rich(o[0]) + "</span></label>").join("") +
    '</div><div class="q-ex" hidden>' + rich(q[3]) + '</div></div><div class="quiz-f"><button class="btn primary" data-rv="check">Проверить</button><button class="btn ghost" data-rv="topic" data-k="' + x.r.k + '">Открыть тему</button><span class="quiz-res"></span></div>';
}
$("#review").addEventListener("click", e => {
  if(e.target.id === "review"){ closeReview(); return }
  const b = e.target.closest("[data-rv]"); if(!b || !RV) return;
  const act = b.dataset.rv, box = $("#rvBody");
  if(act === "close") closeReview();
  else if(act === "topic"){ const k = b.dataset.k; closeReview(); goto(k) }
  else if(act === "next"){ RV.i++; showCard() }
  else if(act === "check"){
    const sel = $("input:checked", box), res = $(".quiz-res", box);
    if(!sel){ res.className = "quiz-res part"; res.textContent = "Выбери ответ"; return }
    const ok = sel.dataset.ok === "1";
    sel.closest(".opt").classList.add(ok ? "ok" : "bad");
    if(!ok) $('input[data-ok="1"]', box).closest(".opt").classList.add("ok");
    $$("input", box).forEach(i => i.disabled = true);
    $(".q-ex", box).hidden = false;
    res.className = "quiz-res " + (ok ? "ok" : "part"); res.textContent = ok ? "Верно" : "Неверно — вернётся завтра";
    if(ok) RV.ok++; else if(RV.miss) RV.miss.add(RV.list[RV.i].slice(0, RV.list[RV.i].lastIndexOf("#")));
    srsRecord(RV.list[RV.i], ok); markDay();
    b.textContent = RV.i + 1 < RV.list.length ? "Дальше" : "Итог"; b.dataset.rv = "next";
  }
});
// слабые места: тест пройден не полностью, есть ошибки в повторении, не отмечено «Умеешь» у начатой темы
function weakList(){
  const out = [];
  SUBS.forEach(r => {
    const k = r.k, q = QZ[k], v = st(k), why = []; let score = 0;
    if(q && q.s < q.n){ score += (1 - q.s / q.n) * 3; why.push("тест " + q.s + "/" + q.n) }
    const w = (r.sb.q || []).reduce((a, _, i) => a + ((SRS[k + "#" + i] || {}).w || 0), 0);
    if(w){ score += w; why.push(w + " " + plural(w, "ошибка", "ошибки", "ошибок") + " в повторении") }
    if(r.sb.sc && v !== "todo"){ const c = (CK[k + "#sc"] || []).length, n = r.sb.sc.length; if(c < n){ score += (1 - c / n) * (v === "done" ? 2 : 1); why.push("умеешь " + c + "/" + n) } }
    if(v === "done" && r.sb.q && !q){ score += 1; why.push("тест не пройден") }
    if(q && r.sb.q && q.n !== r.sb.q.length && v !== "todo"){ score += .5; why.push("в тесте новые вопросы") }
    if(score > 0) out.push({r, score, why});
  });
  return out.sort((a, b) => b.score - a.score);
}

// ---------- поиск и фильтр ----------
let FILTER = "all";
function applyFilter(){
  const active = FILTER !== "all";
  let any = false;
  D.forEach((sg, si) => {
    let stageVis = 0;
    sg.n.forEach(nd => {
      let vis = 0;
      nd.sub.forEach(sb => {
        const k = nd.id + "." + sb.id, el = document.getElementById("s-" + k);
        const ok = FILTER === "all" || (FILTER === "open" ? st(k) !== "done" : st(k) === FILTER);
        el.hidden = !ok; if(ok) vis++;
      });
      const node = document.getElementById("n-" + nd.id);
      node.hidden = !vis;
      if(active) node.classList.toggle("op", vis > 0); else node.classList.toggle("op", !!OPEN["n-" + nd.id]);
      stageVis += vis;
    });
    const sec = document.getElementById("stage-" + si); sec.hidden = !stageVis;
    const mile = $(".mile", sec); if(mile) mile.hidden = active;
    if(stageVis) any = true;
  });
  $("#nores").hidden = any;
  const nx = $("#next"); if(nx) nx.hidden = active;
  const s0 = $("#stage-0"); if(s0) s0.classList.toggle("force", !!active);
}

$("#chips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if(!b) return;
  FILTER = b.dataset.f; $$(".chip", $("#chips")).forEach(x => x.classList.toggle("on", x === b)); applyFilter();
  ls.set(K.hideDone, FILTER === "open" ? "1" : "0");
});
document.addEventListener("keydown", e => {
  // Enter и пробел раскрывают тему и узел так же, как клик
  if((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[role="button"][data-act]')){ e.preventDefault(); e.target.click(); return }
  if(e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)){ e.preventDefault(); if(!document.body.classList.contains("gmode")) $("#q").focus() }
  if(e.key === "Escape"){ $("#menuPop").hidden = true; closeReview(); if(document.activeElement === $("#q")){ $("#q").value = ""; $("#sres").hidden = true; $("#q").blur() } }
});

// ---------- шапка, меню, тема, вид ----------
function setView(v){
  const g = v === "g";
  document.body.classList.toggle("gmode", g);
  $("#vG").classList.toggle("on", g); $("#vL").classList.toggle("on", !g);
  ls.set(K.view, v);
  if(window.gShow) window.gShow(g);
}
$("#vL").onclick = () => setView("l");
$("#vG").onclick = () => setView("g");
$("#themeBtn").onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const nx = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nx; ls.set(K.theme, nx);
  window.dispatchEvent(new Event("rm-theme"));
};
$("#menuBtn").onclick = e => { e.stopPropagation(); $("#menuPop").hidden = !$("#menuPop").hidden };
document.addEventListener("click", e => { if(!e.target.closest(".menu")) $("#menuPop").hidden = true });
function expandAll(on){
  $$(".node").forEach(n => { n.classList.toggle("op", on); if(on) OPEN[n.id] = 1 });
  if(!on) OPEN = {}; save.open(); $("#menuPop").hidden = true;
}
$("#mExpand").onclick = $("#tExpand").onclick = () => expandAll(true);
$("#mCollapse").onclick = $("#tCollapse").onclick = () => expandAll(false);
function exportProgress(){
  const data = {v:5, status:S, days:DY, notes:NT, pace:PW, quiz:QZ, checks:CK, srs:SRS, doneAt:DA, exam:EX};
  const b = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"}), a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = "1c-roadmap-progress-" + today() + ".json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  ls.set(K.backup, today()); updateBackupHint();
}
$("#mExport").onclick = () => { exportProgress(); $("#menuPop").hidden = true };
$("#bkExport").onclick = exportProgress;
$("#bkLater").onclick = () => { ls.set(K.snooze, addDays(7)); updateBackupHint() };
$("#mImport").onclick = () => { $("#fi").click(); $("#menuPop").hidden = true };
$("#fi").onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try{
      const d = JSON.parse(rd.result);
      if(d.status && typeof d.status === "object") S = d.status;
      if(Array.isArray(d.days)) DY = d.days;
      if(d.notes && typeof d.notes === "object") NT = d.notes;
      if(d.quiz && typeof d.quiz === "object") QZ = d.quiz;
      if(d.checks && typeof d.checks === "object") CK = d.checks;
      if(d.srs && typeof d.srs === "object"){ SRS = d.srs; save.srs() }
      if(d.doneAt && typeof d.doneAt === "object"){ DA = d.doneAt; save.doneAt() }
      if(d.exam && typeof d.exam === "object"){ EX = d.exam; save.exam() }
      if(parseInt(d.pace, 10) > 0) PW = parseInt(d.pace, 10);
      migrate(); save.st(); save.days(); save.notes(); save.quiz(); save.ck(); save.pace();
      renderApp(); applyFilter();
    }catch(err){ alert("Не удалось прочитать файл: " + err) }
  };
  rd.readAsText(f); e.target.value = "";
};
$("#mReset").onclick = () => {
  $("#menuPop").hidden = true;
  if(!confirm("Сбросить весь прогресс: статусы, тесты, чек-листы, заметки и активность? Сначала можно скачать копию через меню.")) return;
  S = {}; DY = []; NT = {}; QZ = {}; CK = {}; SRS = {}; DA = {}; EX = {};
  save.st(); save.days(); save.notes(); save.quiz(); save.ck(); save.srs(); save.doneAt(); save.exam();
  renderApp(); applyFilter();
};
$("#pw").onchange = e => { PW = parseInt(e.target.value, 10); if(!(PW > 0)) PW = 8; save.pace(); updateStats() };

// подсветка текущего этапа в навигации и тень у тулбара
const obs = new IntersectionObserver(es => {
  es.forEach(en => { if(en.isIntersecting){ const si = en.target.dataset.si; $$("[data-nav]").forEach(a => a.classList.toggle("cur", a.dataset.nav === si)) } });
}, {rootMargin:"-45% 0px -50% 0px"});
window.addEventListener("scroll", () => { const tb = $(".toolbar"); tb.classList.toggle("stuck", tb.getBoundingClientRect().top <= 61) }, {passive:true});

// ---------- старт ----------
$("#heroStats").textContent = SUBS.length + " подтем в " + D.length + " этапах (0–" + (D.length - 1) + ") · ~" + SUBS.reduce((a, r) => a + r.sb.h, 0) + " ч, включая сквозной проект и подготовку к экзаменам";
renderApp();
$$(".stage").forEach(s => obs.observe(s));
if(ls.raw(K.hideDone) === "1"){ FILTER = "open"; $$(".chip", $("#chips")).forEach(x => x.classList.toggle("on", x.dataset.f === "open")); applyFilter() }
if(!Object.keys(OPEN).length){ const f = $(".node"); if(f){ f.classList.add("op"); OPEN[f.id] = 1 } }

// ---------- что нового ----------
if(typeof NEWS !== "undefined" && NEWS.length){
  const latest = NEWS[0][0];
  // новому посетителю показывать «новое» незачем: для него новая вся карта
  if(!ls.raw(K.news) && !Object.keys(S).length && !Object.keys(QZ).length) ls.set(K.news, latest);
  const mark = () => { const fresh = latest > (ls.raw(K.news) || ""); $("#menuBtn").classList.toggle("dot", fresh); $("#mNews").classList.toggle("dot", fresh) };
  $("#newsBody").innerHTML = NEWS.map(x => '<div class="news-i"><time>' + new Date(x[0]).toLocaleDateString("ru-RU", {day:"numeric", month:"long", year:"numeric"}) + "</time><ul>" + x[1].map(s => "<li>" + rich(s) + "</li>").join("") + "</ul></div>").join("");
  const close = () => { $("#news").hidden = true; document.body.classList.remove("modal-open") };
  $("#mNews").onclick = () => { $("#menuPop").hidden = true; $("#news").hidden = false; document.body.classList.add("modal-open"); ls.set(K.news, latest); mark(); $("#news .icon-btn").focus() };
  $("#news").addEventListener("click", e => { if(e.target.id === "news" || e.target.closest("[data-close]")) close() });
  document.addEventListener("keydown", e => { if(e.key === "Escape") close() });
  mark();
} else $("#mNews").hidden = true;

window.addEventListener("hashchange", openFromHash);
openFromHash();

window.RM = {D, BYKEY, st, setStatus, goto, openVideo, esc, rich, I, src, QZ:() => QZ, NT:() => NT, saveNote(k, v){ if(v) NT[k] = v; else delete NT[k]; save.notes(); refreshMeta(k) }, pct, stats, TXT};
if(ls.raw(K.view) === '"g"' || ls.raw(K.view) === "g") setTimeout(() => setView("g"), 0);
