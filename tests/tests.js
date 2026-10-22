"use strict";
// Тесты сайта. Каждый тест получает чистое приложение в iframe: пустой localStorage и свежую загрузку.
const frame = document.getElementById("app");
const tests = [];
const test = (name, fn) => tests.push({name, fn});

const sleep = ms => new Promise(r => setTimeout(r, ms));
function assert(cond, msg){ if(!cond) throw new Error(msg || "условие не выполнено") }
function eq(got, want, msg){ if(got !== want) throw new Error((msg ? msg + ": " : "") + "получено " + JSON.stringify(got) + ", ожидалось " + JSON.stringify(want)) }

// load открывает приложение. storage — что положить в localStorage до загрузки, hash — якорь в адресе.
async function load({storage = {}, hash = "", keep = false} = {}){
  if(!keep) localStorage.clear();
  for(const [k, v] of Object.entries(storage)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  const errors = [];
  await new Promise(resolve => {
    frame.onload = resolve;
    frame.src = "about:blank";
    setTimeout(() => { frame.src = "../index.html?t=" + Math.random() + hash }, 0);
  });
  // первый onload — about:blank, ждём настоящую страницу
  for(let i = 0; i < 200 && !(frame.contentWindow && frame.contentWindow.RM); i++) await sleep(25);
  const w = frame.contentWindow, d = w.document;
  assert(w.RM, "приложение не загрузилось");
  w.addEventListener("error", e => errors.push(e.message));
  const $ = (s, r = d) => r.querySelector(s), $$ = (s, r = d) => [...r.querySelectorAll(s)];
  return {w, d, $, $$, errors, RM: w.RM, ls: k => JSON.parse(localStorage.getItem(k) || "null")};
}
const sub = (app, k) => app.d.getElementById("s-" + k);

// ---------- базовое поведение ----------

test("страница рендерится: этапы, темы, счётчики", async () => {
  const app = await load();
  const topics = app.RM.D.reduce((n, s) => n + s.n.reduce((m, nd) => m + nd.sub.length, 0), 0);
  eq(app.$$(".stage").length, app.RM.D.length, "число этапов");
  eq(app.$$(".sub").length, topics, "число тем");
  assert(app.$("#gCnt").textContent.startsWith("0/" + topics), "общий счётчик: " + app.$("#gCnt").textContent);
  assert(app.$("#heroStats").textContent.includes(topics + " подтем"), "строка в шапке: " + app.$("#heroStats").textContent);
  eq(app.errors.length, 0, "ошибки JS: " + app.errors.join("; "));
});

test("тема раскрывается и показывает шаги, задание и критерии", async () => {
  const app = await load();
  app.RM.goto("lang.strdate");
  const el = sub(app, "lang.strdate");
  assert(el.classList.contains("op"), "тема не раскрыта");
  assert(app.$(".task", el), "нет задания");
  assert(app.$$(".ac li", el).length >= 2, "нет критериев приёмки");
  assert(app.$$(".q", el).length >= 5, "нет вопросов теста");
  eq(app.$$(".step", el).length, 5, "число шагов");
});

test("книги показываются отдельным списком в «Углубись»", async () => {
  const app = await load();
  app.RM.goto("lang.types");
  const el = sub(app, "lang.types");
  const g = app.$$(".res-g", el).find(x => x.querySelector("h5").textContent.includes("Книги"));
  assert(g, "нет раздела «Книги»");
  assert(app.$('a[href="https://v8.1c.ru/metod/books/152105.htm"]', g), "нет ссылки на книгу");
});

test("статус темы переключается и сохраняется", async () => {
  let app = await load();
  app.RM.goto("zero-start.platform");
  app.$('.st-seg button[data-v="done"]', sub(app, "zero-start.platform")).click();
  eq(app.RM.st("zero-start.platform"), "done");
  assert(app.$("#gCnt").textContent.startsWith("1/"), "счётчик не обновился: " + app.$("#gCnt").textContent);
  app = await load({keep: true});
  eq(app.RM.st("zero-start.platform"), "done", "после перезагрузки");
  assert(sub(app, "zero-start.platform").classList.contains("st-done"), "класс статуса после перезагрузки");
});

test("тест: верные ответы засчитываются, ошибка попадает в повторение", async () => {
  const app = await load();
  app.RM.goto("zero-start.platform");
  const el = sub(app, "zero-start.platform"), qs = app.$$(".q", el);
  qs.forEach((q, i) => app.$('input[data-ok="' + (i === 0 ? 0 : 1) + '"]', q).click()); // первый ответ неверный
  app.$('[data-act="qcheck"]', el).click();
  assert(app.$(".quiz-res", el).textContent.includes((qs.length - 1) + " из " + qs.length), app.$(".quiz-res", el).textContent);
  const srs = app.ls("1c-roadmap-srs");
  assert(srs && srs["zero-start.platform#0"], "ошибка не попала в повторение");
  eq(app.RM.st("zero-start.platform"), "learning", "тема должна стать «Изучаю»");
});

test("варианты ответа перемешаны: верный не всегда первый", async () => {
  const app = await load();
  app.RM.goto("lang-data.coll");
  const pos = app.$$(".q", sub(app, "lang-data.coll")).map(q => app.$$("input", q).findIndex(i => i.dataset.ok === "1"));
  assert(new Set(pos).size > 1, "верный ответ всегда на позиции " + pos[0]);
});

test("фильтр «Не пройдено» скрывает готовые темы", async () => {
  const app = await load({storage: {"1c-roadmap-v1": {"zero-start.platform": "done"}}});
  app.$('.chip[data-f="open"]').click();
  assert(sub(app, "zero-start.platform").hidden, "готовая тема видна");
  assert(!sub(app, "zero-start.install").hidden, "непройденная тема скрыта");
});

test("экспорт и импорт переносят прогресс", async () => {
  let app = await load({storage: {"1c-roadmap-v1": {"lang.types": "done"}, "1c-roadmap-notes": {"lang.types": "заметка"}}});
  let exported = null;
  app.w.URL.createObjectURL = blob => { exported = blob; return "blob:test" };
  app.$("#mExport").click();
  assert(exported, "экспорт не создал файл");
  const data = JSON.parse(await exported.text());
  eq(data.status["lang.types"], "done", "статус в экспорте");
  eq(data.notes["lang.types"], "заметка", "заметка в экспорте");

  app = await load();
  const file = new app.w.File([JSON.stringify(data)], "progress.json", {type: "application/json"});
  const dt = new app.w.DataTransfer(); dt.items.add(file);
  const input = app.$("#fi"); input.files = dt.files; input.dispatchEvent(new app.w.Event("change"));
  for(let i = 0; i < 40 && app.RM.st("lang.types") !== "done"; i++) await sleep(25);
  eq(app.RM.st("lang.types"), "done", "статус после импорта");
});

test("поиск находит тему по смыслу запроса", async () => {
  const app = await load();
  const q = app.$("#q");
  q.focus(); q.value = "почему остатки на дату не включают документ"; q.dispatchEvent(new app.w.Event("input", {bubbles: true}));
  for(let i = 0; i < 200 && (app.$("#sres").hidden || !app.$("#sres").textContent.trim()); i++) await sleep(50);
  assert(!app.$("#sres").hidden, "панель результатов не открылась");
  assert(/остат/i.test(app.$("#sres").textContent), "в результатах нет остатков: " + app.$("#sres").textContent.slice(0, 200));
});

test("граф открывается без ошибок", async () => {
  const app = await load();
  app.$("#vG").click();
  await sleep(300);
  assert(app.d.body.classList.contains("gmode"), "режим графа не включился");
  eq(app.errors.length, 0, "ошибки JS: " + app.errors.join("; "));
  app.$("#vL").click();
  assert(!app.d.body.classList.contains("gmode"), "режим списка не вернулся");
});

// ---------- ссылки на темы ----------

test("ссылка с якорем открывает тему при загрузке", async () => {
  const app = await load({hash: "#lang-data.coll"});
  assert(sub(app, "lang-data.coll").classList.contains("op"), "тема из адреса не раскрыта");
  assert(app.d.getElementById("n-lang-data").classList.contains("op"), "узел темы не раскрыт");
});

test("адрес страницы следует за открытой темой", async () => {
  const app = await load();
  app.$(".sub-main", sub(app, "zero-start.conf")).click();
  eq(app.w.location.hash, "#zero-start.conf", "после открытия");
  app.$(".sub-main", sub(app, "zero-start.conf")).click();
  eq(app.w.location.hash, "", "после закрытия");
});

test("кнопка «Ссылка на тему» копирует адрес темы", async () => {
  const app = await load();
  let copied = null;
  Object.defineProperty(app.w.navigator, "clipboard", {value: {writeText: s => { copied = s; return Promise.resolve() }}, configurable: true});
  app.RM.goto("qry.qtemp");
  const btn = app.$('[data-act="link"]', sub(app, "qry.qtemp"));
  btn.click(); await sleep(50);
  assert(copied && copied.endsWith("#qry.qtemp") && copied.startsWith("http"), "скопировано: " + copied);
  assert(btn.textContent.includes("скопирована"), "кнопка не подтвердила копирование: " + btn.textContent);
});

test("«Сообщить об ошибке» ведёт на готовый issue с темой", async () => {
  const app = await load();
  app.RM.goto("qry.qjoin");
  const a = app.$('.sub-f a.note-btn', sub(app, "qry.qjoin"));
  assert(a.href.startsWith("https://github.com/UbicaSmerti228/1c-roadmap/issues/new?"), a.href);
  const params = new URL(a.href).searchParams;
  assert(params.get("title").includes("Соединения"), "заголовок: " + params.get("title"));
  assert(params.get("body").includes("qry.qjoin"), "тело: " + params.get("body"));
  eq(a.target, "_blank");
});

// ---------- клавиатура ----------

test("тема и узел раскрываются с клавиатуры", async () => {
  const app = await load();
  const main = app.$(".sub-main", sub(app, "zero-acc.acc"));
  eq(main.getAttribute("role"), "button"); eq(main.tabIndex, 0);
  main.focus();
  main.dispatchEvent(new app.w.KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}));
  assert(sub(app, "zero-acc.acc").classList.contains("op"), "Enter не раскрыл тему");
  eq(main.getAttribute("aria-expanded"), "true");
  main.dispatchEvent(new app.w.KeyboardEvent("keydown", {key: " ", bubbles: true, cancelable: true}));
  assert(!sub(app, "zero-acc.acc").classList.contains("op"), "пробел не свернул тему");
  eq(main.getAttribute("aria-expanded"), "false");

  const node = app.d.getElementById("n-zero-acc"), head = app.$(".node-h", node);
  eq(head.tabIndex, 0);
  head.dispatchEvent(new app.w.KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}));
  assert(node.classList.contains("op"), "Enter не раскрыл узел");
});

// ---------- нужные узлы ----------

test("узел подсказывает, что пройти до него", async () => {
  let app = await load();
  const req = () => app.$('[data-req="lang-data"]');
  assert(req().textContent.startsWith("Сначала пройди: Основы языка"), req().textContent);
  assert(app.d.getElementById("n-lang-data").classList.contains("early"), "узел не помечен как ранний");

  const done = {};
  app.RM.D[1].n.find(n => n.id === "lang").sub.forEach(s => done["lang." + s.id] = "done");
  app = await load({storage: {"1c-roadmap-v1": done}});
  assert(req().textContent.startsWith("Нужные узлы пройдены"), req().textContent);
  assert(!app.d.getElementById("n-lang-data").classList.contains("early"), "узел всё ещё помечен как ранний");
});

// ---------- экзамен этапа ----------

async function runExam(app, wrongAt){
  app.$('[data-act="exam"][data-si="1"]').click();
  assert(!app.$("#review").hidden, "окно экзамена не открылось");
  assert(app.$("#rvTitle").textContent.includes("Экзамен этапа 1"), app.$("#rvTitle").textContent);
  for(let i = 0; i < 10; i++){
    assert(app.$(".rv-top").textContent.includes("Вопрос " + (i + 1) + " из 10"), app.$(".rv-top").textContent);
    app.$('#rvBody input[data-ok="' + (i === wrongAt ? 0 : 1) + '"]').click();
    app.$('[data-rv="check"]').click();
    app.$('[data-rv="next"]').click();
  }
}

test("экзамен этапа: 10 вопросов, результат сохраняется", async () => {
  let app = await load();
  await runExam(app, -1);
  assert(app.$(".rv-sum").textContent.includes("10 из 10"), app.$(".rv-sum").textContent);
  assert(app.$(".rv-sum").textContent.includes("Этап усвоен"), app.$(".rv-sum").textContent);
  app.$('[data-rv="close"]').click();
  assert(app.$("#review").hidden, "окно не закрылось");
  assert(app.$('[data-ex="1"]').textContent.includes("10 из 10"), app.$('[data-ex="1"]').textContent);
  app = await load({keep: true});
  assert(app.$('[data-ex="1"]').textContent.includes("10 из 10"), "результат не пережил перезагрузку");
});

test("экзамен этапа: ошибка уходит в повторение и показывает тему", async () => {
  const app = await load();
  await runExam(app, 3);
  assert(app.$(".rv-sum").textContent.includes("9 из 10"), app.$(".rv-sum").textContent);
  eq(app.$$(".rv-sum .weak-item").length, 1, "тем с ошибками");
  eq(Object.keys(app.ls("1c-roadmap-srs")).length, 1, "вопросов в повторении");
});

test("экзамен этапа: худший результат не затирает лучший", async () => {
  const app = await load({storage: {"1c-roadmap-exam": {1: {s: 10, n: 10, d: "2026-01-01"}}}});
  await runExam(app, 0);
  app.$('[data-rv="close"]').click();
  eq(app.ls("1c-roadmap-exam")[1].s, 10, "лучший результат");
  assert(app.$('[data-ex="1"]').textContent.includes("10 из 10"), app.$('[data-ex="1"]').textContent);
});

test("у каждого этапа с тестами есть экзамен, вопросы берутся только из его тем", async () => {
  const app = await load();
  eq(app.$$('[data-act="exam"]').length, app.RM.D.filter(s => s.n.some(n => n.sub.some(x => x.q))).length, "число кнопок");
  app.$('[data-act="exam"][data-si="0"]').click();
  const stage0 = app.RM.D[0].n.flatMap(n => n.sub.map(s => s.w));
  for(let i = 0; i < 10; i++){
    const topic = app.$(".rv-top .mut").textContent;
    assert(stage0.includes(topic), "вопрос из чужого этапа: " + topic);
    app.$("#rvBody input").click(); app.$('[data-rv="check"]').click(); app.$('[data-rv="next"]').click();
  }
});

// ---------- копия прогресса ----------

const DAY = 864e5, iso = ms => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") };

test("напоминание о копии: появляется, откладывается, исчезает после скачивания", async () => {
  let app = await load();
  assert(app.$("#backupHint").hidden, "напоминание показано новому посетителю");

  const progress = {"1c-roadmap-v1": {"zero-start.platform": "done"}, "1c-roadmap-days": [iso(Date.now() - 2 * DAY), iso(Date.now() - DAY), iso(Date.now())]};
  app = await load({storage: progress});
  assert(!app.$("#backupHint").hidden, "нет напоминания после трёх дней занятий");
  assert(app.$("#bkText").textContent.includes("ещё нет копии"), app.$("#bkText").textContent);

  app.$("#bkLater").click();
  assert(app.$("#backupHint").hidden, "«Позже» не скрыло напоминание");
  app = await load({keep: true});
  assert(app.$("#backupHint").hidden, "напоминание вернулось сразу после «Позже»");

  app = await load({storage: progress});
  app.w.URL.createObjectURL = () => "blob:test";
  app.$("#bkExport").click();
  assert(app.$("#backupHint").hidden, "напоминание осталось после скачивания");
  eq(localStorage.getItem("1c-roadmap-backup"), iso(Date.now()), "дата копии");
  assert(app.$("#bkInfo").textContent.startsWith("Последняя копия:"), app.$("#bkInfo").textContent);
});

test("напоминание о копии возвращается через две недели", async () => {
  const base = {"1c-roadmap-v1": {"zero-start.platform": "done"}};
  let app = await load({storage: {...base, "1c-roadmap-backup": iso(Date.now() - 13 * DAY)}});
  assert(app.$("#backupHint").hidden, "напоминание через 13 дней");
  app = await load({storage: {...base, "1c-roadmap-backup": iso(Date.now() - 20 * DAY)}});
  assert(!app.$("#backupHint").hidden, "нет напоминания через 20 дней");
  assert(app.$("#bkText").textContent.includes("20 дней назад"), app.$("#bkText").textContent);
});

// ---------- фактический темп ----------

test("прогноз показывает фактический темп", async () => {
  let app = await load();
  eq(app.$("#fcReal").textContent, "", "у нового посетителя");

  app.RM.setStatus("zero-start.platform", "done");
  eq(app.ls("1c-roadmap-done-at")["zero-start.platform"], iso(Date.now()), "дата готовности");
  assert(app.$("#fcReal").textContent.includes("появится через неделю"), app.$("#fcReal").textContent);
  app.RM.setStatus("zero-start.platform", "todo");
  eq(app.ls("1c-roadmap-done-at")["zero-start.platform"], undefined, "дата не убрана после отмены");

  // четыре темы, отмеченные готовыми за последние 14 дней: темп = их часы / 2 недели
  const st = {}, da = {};
  let hours = 0;
  ["zero-start.platform", "zero-start.install", "zero-start.conf", "zero-acc.acc"].forEach((k, i) => {
    st[k] = "done"; da[k] = iso(Date.now() - (13 - i * 4) * DAY);
    hours += app.RM.BYKEY[k].sb.h;
  });
  app = await load({storage: {"1c-roadmap-v1": st, "1c-roadmap-done-at": da}});
  const pace = Math.round(hours / 2 * 10) / 10;
  assert(app.$("#fcReal").textContent.includes("~" + pace + " ч в неделю"), "ожидался темп " + pace + ": " + app.$("#fcReal").textContent);
  assert(app.$("#fcReal").textContent.includes("финиш"), app.$("#fcReal").textContent);
});

// ---------- что нового ----------

test("«Что нового»: отметка есть только у вернувшегося посетителя и пропадает после просмотра", async () => {
  let app = await load();
  assert(!app.$("#menuBtn").classList.contains("dot"), "отметка у нового посетителя");

  app = await load({storage: {"1c-roadmap-v1": {"zero-start.platform": "done"}}});
  assert(app.$("#menuBtn").classList.contains("dot"), "нет отметки у вернувшегося посетителя");
  app.$("#menuBtn").click(); app.$("#mNews").click();
  assert(!app.$("#news").hidden, "окно новостей не открылось");
  assert(app.$$("#newsBody li").length >= 3, "в окне нет записей");
  assert(!app.$("#menuBtn").classList.contains("dot"), "отметка осталась после просмотра");
  app.$("#news [data-close]").click();
  assert(app.$("#news").hidden, "окно не закрылось");
  app = await load({keep: true});
  assert(!app.$("#menuBtn").classList.contains("dot"), "отметка вернулась после перезагрузки");
});

// ---------- сброс ----------

test("экспорт содержит даты и экзамены, сброс очищает всё", async () => {
  const app = await load({storage: {"1c-roadmap-v1": {"zero-start.platform": "done"}, "1c-roadmap-done-at": {"zero-start.platform": "2026-09-01"}, "1c-roadmap-exam": {0: {s: 7, n: 10, d: "2026-09-02"}}}});
  let exported = null;
  app.w.URL.createObjectURL = blob => { exported = blob; return "blob:test" };
  app.$("#mExport").click();
  const data = JSON.parse(await exported.text());
  eq(data.doneAt["zero-start.platform"], "2026-09-01", "doneAt в экспорте");
  eq(data.exam[0].s, 7, "экзамен в экспорте");

  app.w.confirm = () => true;
  app.$("#mReset").click();
  eq(app.RM.st("zero-start.platform"), "todo", "статус после сброса");
  eq(JSON.stringify(app.ls("1c-roadmap-done-at")), "{}", "даты после сброса");
  eq(JSON.stringify(app.ls("1c-roadmap-exam")), "{}", "экзамены после сброса");
});

// ---------- запуск ----------

(async () => {
  const out = [];
  for(const t of tests){
    try{ await t.fn(); out.push({name: t.name, ok: true}) }
    catch(e){ out.push({name: t.name, ok: false, error: String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")}) }
    document.getElementById("out").textContent = out.map(r => (r.ok ? "ok    " : "FAIL  ") + r.name + (r.ok ? "" : "\n        " + r.error)).join("\n");
  }
  localStorage.clear();
  fetch("/__result", {method: "POST", body: JSON.stringify({tests: out})});
})();
