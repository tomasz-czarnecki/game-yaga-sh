"""Checks that every word the game asks for exists in words/en.json.

Run from anywhere: uv run --no-project python tools/check_words.py
Prints what is missing (errors) and what nothing seems to use (notes). Exits with 1 if there are errors.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
code = "\n".join(f.read_text() for f in sorted((ROOT / "code").glob("*.js")))   # every module, not code/lib
app = (ROOT / "code" / "app.js").read_text()
page = (ROOT / "index.html").read_text()
bug_ids = re.findall(r"'(\w+)'", re.search(r"export const BUGS = \[(.*?)\]", (ROOT / "code" / "bug-models.js").read_text()).group(1))

errors, notes = [], []
try:
    words = json.loads((ROOT / "words" / "en.json").read_text())
except json.JSONDecodeError as e:
    sys.exit(f"words/en.json is not valid JSON: {e}")

for section in ("lang", "yaga", "house", "defendBox", "box", "arguments", "pokeEnd", "gibberish", "bugs", "ui"):
    if section not in words:
        errors.append(f"section missing: {section}")
if errors:
    sys.exit("\n".join(errors))

yaga, box, ui = words["yaga"], words["box"], words["ui"]

# every line list must have at least one line (an empty one makes pick() crash)
for name, table in (("yaga", yaga), ("box", box)):
    for key, lines in table.items():
        if not isinstance(lines, list) or not lines or not all(isinstance(s, str) and s for s in lines):
            errors.append(f"{name}.{key} must be a list of non-empty lines")
for name in ("house", "defendBox", "pokeEnd"):
    if not words[name]:
        errors.append(f"{name} must not be empty")
if len(words["pokeEnd"]) < 2:
    errors.append("pokeEnd needs two lines")
for i, dialog in enumerate(words["arguments"]):
    if not dialog or any(len(t) != 2 or t[0] not in ("y", "b") or not t[1] for t in dialog):
        errors.append(f"arguments[{i}]: each turn must be [\"y\" or \"b\", text]")

# keys the code asks for
used_yaga = set()
for key, plus in re.findall(r"\b(?:say|drawLine)\(\s*'(\w+)'\s*(\+)?", code):
    if plus:                                           # a prefix: 'crave_' + a bug id
        for bug in bug_ids:
            used_yaga.add(key + bug)
    else:
        used_yaga.add(key)
for a, b in re.findall(r"\bsay\([^;'\n]*\?\s*'(\w+)'\s*:\s*'(\w+)'", code):   # say(x ? 'one' : 'other')
    used_yaga |= {a, b}
no_say = re.search(r"const NO_SAY = \{(.*?)\};", app, re.S)                       # her line for each reason she can't
no_say = dict(re.findall(r"(\w+): '(\w+)'", no_say.group(1))) if no_say else {}
used_yaga |= set(no_say.values())
used_yaga |= set(re.findall(r"\bLINES\.(\w+)", code))
for key in sorted(used_yaga):
    if key not in yaga:
        errors.append(f"yaga line list missing: {key}")

used_box = set(re.findall(r"\bboxReact\(\s*'(\w+)'", code)) | set(re.findall(r"\bBOX_LINES\.(\w+)", code))
for key in sorted(used_box):
    if key not in box:
        errors.append(f"box line list missing: {key}")

# the screen's words
def has(path):
    node = ui
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return False
        node = node[part]
    return True

for path in sorted(set(re.findall(r"\bUI\.(\w+(?:\.\w+)*)", code))):
    if not has(path):
        errors.append(f"ui.{path} missing (used in code/)")
for attr in ("data-word", "data-word-aria", "data-word-alt"):
    for path in sorted(set(re.findall(rf'{attr}="([\w.:]+)"', page))):
        if not has(path):
            errors.append(f"ui.{path} missing (used by {attr} in index.html)")

# tables the code looks up by a key it works out: each needs every key
def need(table, keys, what):
    for k in keys:
        if k not in ui.get(table, {}):
            errors.append(f"ui.{table}.{k} missing ({what})")
tools = re.findall(r"'([\w:]+)'", re.search(r"const TOOLS = \[(.*?)\]", app).group(1))
need("tool", tools, "a hotbar slot"); need("toolHint", tools, "a hotbar slot")
need("no", no_say.keys(), "a reason in NO_SAY")
acts = re.findall(r"^  (\w+): \{ clip", (ROOT / "code" / "farm.js").read_text(), re.M) + ["walk", "swat", "shop", "bed", "nothing"]
need("act", acts, "an action")
goals = re.findall(r"\{ id: '(\w+)'", (ROOT / "code" / "goals.js").read_text())
need("goals", goals, "a goal in code/goals.js")
crops = re.findall(r"^    (\w+): \{ days", (ROOT / "settings.js").read_text(), re.M)
need("items", crops + [f"seed:{c}" for c in crops] + ["egg", "feed", "hen", "bigCan", "steelShovel"], "an item")
for key in ("growing",):
    if not isinstance(ui.get("no", {}).get(key), list) or len(ui["no"][key]) != 2:
        errors.append(f"ui.no.{key} must be [one, many]")
for key, pair in ui.get("summary", {}).items():
    if isinstance(pair, list) and len(pair) != 2:
        errors.append(f"ui.summary.{key} must be [one, many]")

for bug in bug_ids:
    entry = words["bugs"].get(bug, {})
    for field in ("name", "a", "plural"):
        if not entry.get(field):
            errors.append(f"bugs.{bug}.{field} missing")

# placeholders must be ones the code fills in
fills = {"n", "bug", "crop"}
for table in (yaga, box):
    for key, lines in table.items():
        for line in lines:
            for slot in re.findall(r"\{(\w+)\}", line):
                if slot not in fills:
                    errors.append(f"unknown {{{slot}}} in: {line}")
# the screen's placeholders: the ones its code fills in (a table's entries share its list)
ui_slots = {"clockAria": {"time", "day", "phase"}, "dayN": {"n"}, "resting": {"n"}, "plusItem": {"item"}, "plusCoins": {"n"},
            "act": {"crop", "n", "item", "bug"}, "no": {"crop", "n", "item", "bug"}, "itemInfo": {"days", "sell", "n", "m", "most"},
            "stall": {"n"}, "bag": {"n", "m"}, "goal": {"goal", "n"}, "bed": {"time"}, "summary": {"n", "coins", "day"}}
def texts(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, list):
        for x in node:
            yield from texts(x)
    elif isinstance(node, dict):
        for x in node.values():
            yield from texts(x)
for key, node in ui.items():
    allowed = ui_slots.get(key, set())
    for text in texts(node):
        for slot in re.findall(r"\{(\w+)\}", text):
            if slot not in allowed:
                errors.append(f"ui.{key}: unknown {{{slot}}} in: {text}")

# lists nothing seems to use (fine if the code builds the key some other way)
for key in sorted(set(yaga) - used_yaga):
    notes.append(f"yaga.{key}: no code asks for it")
for key in sorted(set(box) - used_box):
    notes.append(f"box.{key}: no code asks for it")

print(f"{sum(len(v) for v in yaga.values())} lines for Yaga in {len(yaga)} lists, {sum(len(v) for v in box.values())} for the Box in {len(box)}, {len(words['arguments'])} arguments.")
for n in notes:
    print("note:", n)
for e in errors:
    print("ERROR:", e)
print("OK: every word the game asks for is in words/en.json" if not errors else f"{len(errors)} problem(s) found")
sys.exit(1 if errors else 0)
