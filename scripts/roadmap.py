"""Чтение data.js без Node: разбирает литералы const D, NEXT, MIGRATE, CHMAP, RENAME."""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_NUM = re.compile(r"-?\d+(\.\d+)?|true|false|null")
_KEY = re.compile(r"[\w$]+")


def _parse(src, i):
    def ws(i):
        while True:
            while i < len(src) and src[i] in " \t\r\n":
                i += 1
            if src.startswith("//", i):
                i = src.index("\n", i)
            else:
                return i

    def val(i):
        i = ws(i)
        c = src[i]
        if c in "\"'`":
            j, out = i + 1, []
            while src[j] != c:
                if src[j] == "\\":
                    out.append({"n": "\n", "t": "\t"}.get(src[j + 1], src[j + 1]))
                    j += 2
                else:
                    out.append(src[j])
                    j += 1
            return "".join(out), j + 1
        if c == "[":
            arr, i = [], ws(i + 1)
            while src[i] != "]":
                v, i = val(i)
                arr.append(v)
                i = ws(i)
                if src[i] == ",":
                    i = ws(i + 1)
            return arr, i + 1
        if c == "{":
            obj, i = {}, ws(i + 1)
            while src[i] != "}":
                if src[i] == '"':
                    k, i = val(i)
                else:
                    m = _KEY.match(src, i)
                    k, i = m.group(), m.end()
                i = ws(i)
                if src[i] != ":":
                    raise ValueError("ожидалось ':' около: " + src[i - 40:i + 40])
                v, i = val(i + 1)
                if k in obj:
                    raise ValueError("повтор ключа " + k + " около: " + src[i - 60:i])
                obj[k] = v
                i = ws(i)
                if src[i] == ",":
                    i = ws(i + 1)
            return obj, i + 1
        m = _NUM.match(src, i)
        if not m:
            raise ValueError("не удалось разобрать около: " + src[i - 40:i + 40])
        return json.loads(m.group()), m.end()

    return val(i)[0]


def load(path=None):
    """Возвращает словарь {имя константы: значение} из data.js."""
    src = open(path or os.path.join(ROOT, "data.js"), encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"^const (\w+) = ", src, flags=re.M):
        out[m.group(1)] = _parse(src, m.end())
    return out


def subs(D):
    """Все подтемы: (ключ "узел.подтема", номер этапа, узел, подтема)."""
    for si, stage in enumerate(D):
        for node in stage["n"]:
            for sub in node["sub"]:
                yield node["id"] + "." + sub["id"], si, node, sub
