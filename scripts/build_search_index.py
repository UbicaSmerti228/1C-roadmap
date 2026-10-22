#!/usr/bin/env python3
"""Сборка search-index.js: разделы статей и главы видео для поиска на сайте.

По умолчанию достраивает индекс: скачивает только те статьи и видео, которых в нём ещё нет,
и убирает записи о материалах, удалённых из data.js. Уже собранное не трогает.

Запуск:
  python3 scripts/build_search_index.py          # достроить
  python3 scripts/build_search_index.py --all    # пересобрать с нуля, идёт долго
"""
import html
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser

from roadmap import ROOT, load, subs

OUT = os.path.join(ROOT, "search-index.js")
HEAD = "// Поисковый индекс: разделы статей и главы видео. Собирается скриптом scripts/build_search_index.py из data.js.\n"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SNIP = 260          # длина фрагмента раздела
MAX_SECTIONS = 28   # разделов на статью
SKIP = {"script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "button", "template"}
VOID = {"br", "img", "hr", "input", "meta", "link", "source", "wbr", "area", "base", "col", "embed", "track"}
HEADINGS = {"h2", "h3", "h4"}  # h1 — заголовок страницы, он остаётся в первом разделе
# где лежит текст статьи: (тег, id); первым совпавшим ограничиваем разбор
SCOPES = [("div", "post-content-body"), ("article", None), ("main", None)]
TS = re.compile(r"^\W{0,3}(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:|]?\s*(.+)$")


def fetch(url, tries=3):
    for attempt in range(tries):
        if attempt:
            time.sleep(3 * attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru,en", "Cookie": "CONSENT=YES+1"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read(3_000_000).decode("utf-8", "ignore")
        except Exception:
            pass
    return None


class Sections(HTMLParser):
    """Делит страницу на разделы по заголовкам h1–h4. Если есть <article> или <main>, берёт текст только из них."""

    def __init__(self, scope):
        super().__init__(convert_charrefs=True)
        self.scope, self.scope_id = scope or ("", None)
        self.depth = 0
        self.skip_tag, self.skip_n = None, 0  # считаем только вложенность того же тега: HTML часто не закрывает <li> и <p>
        self.title, self.in_title = "", False
        self.sections = [["", [], ""]]  # заголовок, куски текста, якорь
        self.heading = None

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        a = dict(attrs)
        if tag == "title" and not self.title:
            self.in_title = True
        if self.skip_tag:
            if tag == self.skip_tag:
                self.skip_n += 1
            return
        if tag in SKIP:
            self.skip_tag, self.skip_n = tag, 1
            return
        if tag == self.scope and (self.depth or self.scope_id is None or a.get("id") == self.scope_id):
            self.depth += 1
        if self.scope and not self.depth:
            return
        if tag in HEADINGS:
            self.heading = [[], a.get("id") or ""]
        elif self.heading is not None and tag == "a" and not self.heading[1]:
            self.heading[1] = a.get("id") or a.get("name") or ""

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag == "title":
            self.in_title = False
        if self.skip_tag:
            if tag == self.skip_tag:
                self.skip_n -= 1
                if not self.skip_n:
                    self.skip_tag = None
            return
        if tag in HEADINGS and self.heading is not None:
            text = " ".join("".join(self.heading[0]).replace("¶", " ").split())
            if text:
                self.sections.append([text, [], self.heading[1]])
            self.heading = None
        if tag == self.scope and self.depth:
            self.depth -= 1

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.skip_tag or (self.scope and not self.depth):
            return
        if self.heading is not None:
            self.heading[0].append(data)
        else:
            self.sections[-1][1].append(data)


def article_sections(page):
    scope = None
    for tag, tid in SCOPES:
        if re.search(r"<%s[^>]*\sid=\"%s\"" % (tag, tid) if tid else r"<%s[\s>]" % tag, page):
            scope = (tag, tid)
            break
    p = Sections(scope)
    try:
        p.feed(page)
    except Exception:
        return []
    out = []
    for i, (head, parts, anchor) in enumerate(p.sections):
        text = " ".join(" ".join(parts).split())
        if not text:
            continue
        row = [head, text[:SNIP]]
        if anchor:
            row.append(anchor)
        out.append(row)
    return out[:MAX_SECTIONS]


def video_chapters(vid):
    page = fetch("https://www.youtube.com/watch?v=" + vid)
    if not page:
        return None
    # главы, размеченные самим YouTube
    out, seen = [], set()
    for m in re.finditer(r'"chapterRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\},"timeRangeStartMillis":(\d+)', page):
        sec = int(m.group(2)) // 1000
        if sec not in seen:
            seen.add(sec)
            out.append([sec, json.loads('"' + m.group(1) + '"')[:120]])
    if len(out) >= 2:
        return sorted(out)
    # иначе — метки времени в описании
    m = re.search(r'"shortDescription":"((?:[^"\\]|\\.)*)"', page)
    if not m:
        return []
    try:
        desc = json.loads('"' + m.group(1) + '"')
    except ValueError:
        return []
    out = []
    for line in desc.split("\n"):
        t = TS.match(line.strip())
        if t:
            sec = int(t.group(1) or 0) * 3600 + int(t.group(2)) * 60 + int(t.group(3))
            title = t.group(4).strip(" -–—:|")
            if title:
                out.append([sec, html.unescape(title)[:120]])
    # главы — это возрастающие метки, начиная с нуля; случайные упоминания времени отбрасываем
    if len(out) < 2 or out[0][0] != 0 or any(b[0] <= a[0] for a, b in zip(out, out[1:])):
        return []
    return out


def read_old():
    if not os.path.exists(OUT):
        return {"a": [], "s": [], "c": [], "vt": {}}
    raw = open(OUT, encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):raw.rindex("}") + 1])


def main():
    rebuild = "--all" in sys.argv
    D = load()["D"]
    old = {"a": [], "s": [], "c": [], "vt": {}} if rebuild else read_old()

    old_secs = {}
    for row in old["s"]:
        old_secs.setdefault(old["a"][row[0]][1], []).append(row[1:])
    old_chap = {}
    for row in old["c"]:
        old_chap.setdefault(row[0], []).append(row[1:3])

    arts, vids = {}, {}
    for key, _, _, u in subs(D):
        for f in "ad":
            for m in u.get(f) or []:
                arts.setdefault(m[1], (m[0], key))
        for v in u.get("v") or []:
            vids.setdefault(v[0], (v[1], key))

    new_urls = [u for u in arts if u not in old_secs]
    new_vids = [v for v in vids if v not in old["vt"]]
    print(f"Статей: {len(arts)}, новых: {len(new_urls)}. Видео: {len(vids)}, новых: {len(new_vids)}.")

    with ThreadPoolExecutor(6) as ex:
        pages = dict(zip(new_urls, ex.map(fetch, new_urls)))
        chaps = dict(zip(new_vids, ex.map(video_chapters, new_vids)))

    a, s, failed = [], [], []
    for url, (title, key) in arts.items():
        if url in old_secs:
            secs = old_secs[url]
        else:
            secs = article_sections(pages[url]) if pages.get(url) else []
            if not secs:
                failed.append(url)
                continue
        a.append([title, url, key])
        s += [[len(a) - 1] + row for row in secs]

    c, vt = [], {}
    for vid, (title, key) in vids.items():
        if vid in old["vt"]:
            rows = old_chap.get(vid, [])
        elif chaps.get(vid) is None:
            failed.append("https://youtu.be/" + vid)
            continue
        else:
            rows = chaps[vid]
        vt[vid] = title
        c += [[vid, sec, name, key] for sec, name in rows]

    data = json.dumps({"a": a, "s": s, "c": c, "vt": vt}, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8").write(HEAD + "window.SX = " + data + ";\n")
    print(f"В индексе: статей {len(a)}, разделов {len(s)}, видео {len(vt)}, глав {len(c)}.")
    for u in failed:
        print("не удалось скачать, в индекс не попало:", u)
    return 0


if __name__ == "__main__":
    sys.exit(main())
