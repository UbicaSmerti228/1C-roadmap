#!/usr/bin/env python3
"""Проверка структуры data.js. Ошибки — код выхода 1, предупреждения только печатаются.

Запуск: python3 scripts/validate.py
"""
import json
import os
import re
import sys

from roadmap import ROOT, load, subs

errors, warns = [], []
err, warn = errors.append, warns.append

C = load()
D = C["D"]
YT = re.compile(r"^[\w-]{11}$")
DUR = re.compile(r"^(\d+:)?\d{1,2}:\d{2}$")

# ---- узлы и зависимости
order = [n["id"] for s in D for n in s["n"]]
for nid in {x for x in order if order.count(x) > 1}:
    err(f"узел {nid}: id повторяется")
for s in D:
    for n in s["n"]:
        if n.get("m") not in ("seq", "par"):
            err(f"узел {n['id']}: m должно быть seq или par")
        for r in n.get("req") or []:
            if r not in order:
                err(f"узел {n['id']}: req ссылается на несуществующий узел {r}")
            elif order.index(r) > order.index(n["id"]):
                err(f"узел {n['id']}: req {r} стоит позже в карте")
        ids = [u["id"] for u in n["sub"]]
        for x in {i for i in ids if ids.count(i) > 1}:
            err(f"узел {n['id']}: подтема {x} повторяется")
    mi = s.get("mi")
    if not mi or not mi.get("t") or not mi.get("c"):
        err(f"этап «{s['s']}»: нет milestone с t и c")
    elif mi.get("p") and not mi.get("pc"):
        err(f"этап «{s['s']}»: у шага проекта нет чек-листа pc")
    if mi and mi.get("ref") and not str(mi["ref"]).startswith("https://"):
        err(f"этап «{s['s']}»: ref должен быть ссылкой https")

# ---- подтемы
keys = set()
for key, si, node, u in subs(D):
    keys.add(key)
    for f in ("w", "y", "t"):
        if not u.get(f):
            err(f"{key}: нет поля {f}")
    if not isinstance(u.get("h"), int) or u["h"] <= 0:
        err(f"{key}: h должно быть целым числом часов")
    st = u.get("s")
    if not st:
        err(f"{key}: нет «Начни с этого» (s)")
    elif st[0] not in "avd" or not st[1:].isdigit() or int(st[1:]) >= len(u.get(st[0]) or []):
        err(f"{key}: s={st} указывает на несуществующий материал")
    for f in ("a", "d", "p", "b"):
        for m in u.get(f) or []:
            if len(m) not in (2, 3) or (len(m) == 3 and m[2] != "en"):
                err(f"{key}: неверная запись в {f}: {m}")
            elif not m[1].startswith("https://"):
                err(f"{key}: ссылка не https: {m[1]}")
    for v in u.get("v") or []:
        if len(v) not in (4, 5) or not YT.match(v[0]) or not DUR.match(v[3]) or (len(v) == 5 and v[4] != "en"):
            err(f"{key}: неверная запись видео: {v}")
    for j, q in enumerate(u.get("q") or []):
        where = f"{key}, вопрос {j + 1}"
        if len(q) != 4 or not all(isinstance(x, str) and x for x in (q[0], q[1], q[3])):
            err(f"{where}: нужен формат [вопрос, верный ответ, [неверные], пояснение]")
            continue
        if len(q[2]) != 3:
            err(f"{where}: неверных вариантов {len(q[2])}, нужно 3")
        if q[1] in q[2] or len(set(q[2])) != len(q[2]):
            err(f"{where}: варианты ответа повторяются")
    ac = u.get("ac")
    if ac is not None and not (isinstance(ac, list) and 2 <= len(ac) <= 4 and all(isinstance(x, str) and x for x in ac)):
        err(f"{key}: ac должен быть списком из 2–4 строк")
    if not ac and not u.get("ck"):
        warn(f"{key}: нет критериев приёмки задания (ac)")
    if not u.get("sc") and not u.get("ck"):
        warn(f"{key}: нет самопроверки (sc) или чек-листа (ck)")
    if not u.get("q") and not u.get("ck"):
        warn(f"{key}: нет теста")

# ---- зеркала видео
all_vids = {v[0] for _, _, _, u in subs(D) for v in u.get("v") or []}
for yt, url in C.get("MIRROR", {}).items():
    if yt not in all_vids:
        err(f"MIRROR: видео {yt} нет ни в одной подтеме")
    if not re.match(r"^https://(rutube\.ru/video/|vkvideo\.ru/video|vk\.com/video)", url):
        err(f"MIRROR: {yt} — нужна ссылка на Rutube или VK Видео, получено {url}")

# ---- список «что нового»
news = C.get("NEWS", [])
for i, item in enumerate(news):
    if len(item) != 2 or not re.match(r"^\d{4}-\d{2}-\d{2}$", str(item[0])) or not item[1] or not all(isinstance(x, str) and x for x in item[1]):
        err(f"NEWS[{i}]: нужен формат [\"ГГГГ-ММ-ДД\", [\"изменение\", …]]")
if [x[0] for x in news] != sorted((x[0] for x in news), reverse=True):
    err("NEWS: новые записи должны идти первыми")

# ---- таблицы переноса прогресса
for old, new in C.get("MIGRATE", {}).items():
    if new not in keys:
        err(f"MIGRATE: {old} → {new}, такой подтемы нет")
for old, new in C.get("RENAME", {}).items():
    if new not in keys:
        err(f"RENAME: {old} → {new}, такой подтемы нет")
    if old in keys:
        err(f"RENAME: старый ключ {old} снова существует в карте")
for old, new in C.get("CHMAP", {}).items():
    if new[0] not in keys:
        err(f"CHMAP: {old} → {new[0]}, такой подтемы нет")

# ---- поисковый индекс должен ссылаться на существующие подтемы
idx = os.path.join(ROOT, "search-index.js")
if os.path.exists(idx):
    raw = open(idx, encoding="utf-8").read()
    sx = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    stale = {a[2] for a in sx.get("a", []) if a[2] not in keys} | {c[3] for c in sx.get("c", []) if c[3] not in keys}
    for k in sorted(stale):
        err(f"search-index.js: ссылка на несуществующую подтему {k}")
    have = {a[1] for a in sx.get("a", [])}
    want = {m[1] for _, _, _, u in subs(D) for f in "ad" for m in u.get(f) or []}
    vids = {x[0] for _, _, _, u in subs(D) for x in u.get("v") or []}
    missing = len(want - have) + len(vids - set(sx.get("vt", {})))
    if missing:
        warn(f"в поисковом индексе нет {missing} материалов — запусти python3 scripts/build_search_index.py")

total = sum(u["h"] for _, _, _, u in subs(D))
print(f"Этапов: {len(D)}, узлов: {len(order)}, подтем: {len(keys)}, часов: {total}")
for w in warns:
    print("предупреждение:", w)
for e in errors:
    print("ОШИБКА:", e)
print(f"Ошибок: {len(errors)}, предупреждений: {len(warns)}")
sys.exit(1 if errors else 0)
