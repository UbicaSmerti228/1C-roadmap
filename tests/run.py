#!/usr/bin/env python3
"""Запуск тестов сайта в настоящем браузере без окна.

Поднимает локальный сервер, открывает tests/tests.html в headless-браузере и ждёт,
пока страница пришлёт результаты. Браузер: переменная BROWSER или первый найденный
из firefox, zen-browser, chromium, google-chrome.

Запуск: python3 tests/run.py
"""
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIMEOUT = 180
result = {}
done = threading.Event()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if self.path == "/__result":
            result.update(json.loads(body))
            done.set()
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def find_browser():
    names = [os.environ.get("BROWSER"), "firefox", "zen-browser", "chromium", "chromium-browser", "google-chrome"]
    for name in names:
        if name and shutil.which(name):
            return name
    sys.exit("не найден браузер: поставь firefox или chromium, либо задай BROWSER")


def main():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:%d/tests/tests.html" % server.server_address[1]

    browser = find_browser()
    profile = tempfile.mkdtemp(prefix="roadmap-tests-")
    if "chrom" in browser:
        cmd = [browser, "--headless=new", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + profile, url]
    else:
        cmd = [browser, "--headless", "--no-remote", "--profile", profile, url]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        finished = done.wait(TIMEOUT)
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)
        server.shutdown()

    if not finished:
        sys.exit("тесты не завершились за %d секунд" % TIMEOUT)
    tests = result.get("tests", [])
    failed = [t for t in tests if not t["ok"]]
    for t in tests:
        print(("ok    " if t["ok"] else "FAIL  ") + t["name"] + ("" if t["ok"] else "\n        " + t["error"]))
    print("Тестов: %d, упало: %d" % (len(tests), len(failed)))
    return 1 if failed or not tests else 0


if __name__ == "__main__":
    sys.exit(main())
