#!/usr/bin/env python3
"""Проверка, что ссылки и видео из data.js живы.

Мёртвой считается ссылка с ответом 404 или 410, страница «материал снят с публикации»
(Хабр отдаёт её с кодом 403, как защиту от ботов) и видео, которого нет на YouTube — это код выхода 1.
Остальные ответы (403 от защиты от ботов, 429, таймауты) печатаются как предупреждения:
их стоит открыть руками, но сборку они не роняют.

Запуск: python3 scripts/check_links.py
        python3 scripts/check_links.py --titles   # ещё и заголовок каждой страницы рядом с подписью в карте
"""
import html
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from roadmap import load, subs

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
OEMBED = "https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v="
DEAD = {404, 410}
# Тексты, по которым видно, что статью убрали, хотя сайт ответил не 404.
GONE = ("Материал был снят с публикации", "Публикация удалена", "Статья недоступна")


def gone(resp):
    try:
        body = resp.read(200_000).decode("utf-8", "replace")
    except Exception:
        return False
    return any(g in body for g in GONE)


def status(url, tries=3):
    last = "нет ответа"
    for attempt in range(tries):
        if attempt:
            time.sleep(3 * attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru,en"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if e.code in DEAD:
                return e.code
            if e.code == 403 and gone(e):
                return "снята с публикации"
            last = e.code
        except Exception as e:  # таймаут, DNS, TLS
            last = type(e).__name__
    return last


TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)


def page_title(url):
    """Код ответа и заголовок страницы — чтобы сверить, что ссылка ведёт на нужный материал."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru,en"})
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read(400_000)
            enc = r.headers.get_content_charset() or "utf-8"
            m = TITLE.search(raw.decode(enc, "replace"))
            return r.status, " ".join(html.unescape(m.group(1)).split())[:160] if m else ""
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return type(e).__name__, ""


def titles(D):
    names = {}
    for key, _, _, u in subs(D):
        for f in "adpb":
            for m in u.get(f) or []:
                names.setdefault(m[1], (m[0], key))
    with ThreadPoolExecutor(6) as ex:
        res = dict(zip(names, ex.map(page_title, names)))
    for url in sorted(names):
        code, title = res[url]
        print(f"{code} | {names[url][1]} | в карте: {names[url][0]} | на странице: {title} | {url}")
    return 0


def main():
    C = load()
    if "--titles" in sys.argv:
        return titles(C["D"])
    D = C["D"]
    links, videos = {}, {}
    for key, _, _, u in subs(D):
        for f in "adpb":
            for m in u.get(f) or []:
                links.setdefault(m[1], []).append(key)
        for v in u.get("v") or []:
            videos.setdefault(v[0], []).append(key)
    for yt, url in C.get("MIRROR", {}).items():
        links.setdefault(url, []).append("зеркало " + yt)

    with ThreadPoolExecutor(6) as ex:
        link_res = dict(zip(links, ex.map(status, links)))
        video_res = dict(zip(videos, ex.map(lambda v: status(OEMBED + v), videos)))

    dead, soft = [], []
    for url, code in link_res.items():
        if code in DEAD or code == "снята с публикации":
            dead.append(f"{code} {url} ({', '.join(links[url])})")
        elif code != 200:
            soft.append(f"{code} {url}")
    for vid, code in video_res.items():
        where = f"https://youtu.be/{vid} ({', '.join(videos[vid])})"
        if code in DEAD:
            dead.append(f"{code} видео удалено: {where}")
        elif code == 401:
            soft.append(f"401 видео нельзя встроить на сайт: {where}")
        elif code != 200:
            soft.append(f"{code} {where}")

    print(f"Ссылок: {len(links)}, видео: {len(videos)}")
    for s in sorted(soft):
        print("проверь руками:", s)
    for d in sorted(dead):
        print("МЁРТВАЯ:", d)
    print(f"Мёртвых: {len(dead)}, требуют ручной проверки: {len(soft)}")
    return 1 if dead else 0


if __name__ == "__main__":
    sys.exit(main())
