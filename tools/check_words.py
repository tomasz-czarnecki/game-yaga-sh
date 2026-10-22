"""Checks that every word the game asks for exists in words/en.json.

Run from anywhere: uv run --no-project python tools/check_words.py
Prints what is missing (errors) and what nothing seems to use (notes). Exits with 1 if there are errors.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
code = (ROOT / "code" / "app.js").read_text()
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
        errors.append(f"ui.{path} missing (used in code/app.js)")
for attr in ("data-word", "data-word-aria", "data-word-alt"):
    for path in sorted(set(re.findall(rf'{attr}="([\w.]+)"', page))):
        if not has(path):
            errors.append(f"ui.{path} missing (used by {attr} in index.html)")

for bug in bug_ids:
    entry = words["bugs"].get(bug, {})
    for field in ("name", "a", "plural"):
        if not entry.get(field):
            errors.append(f"bugs.{bug}.{field} missing")

# placeholders must be ones the code fills in
fills = {"n", "bug", "crave"}
for table in (yaga, box):
    for key, lines in table.items():
        for line in lines:
            for slot in re.findall(r"\{(\w+)\}", line):
                if slot not in fills:
                    errors.append(f"unknown {{{slot}}} in: {line}")
ui_slots = {"trayHunt": {"a", "n"}, "trayNone": {"plural"}, "clean": {"n"}, "clockAria": {"time", "phase", "next"}, "nextIn": {"phase", "m", "s"}}
for key, allowed in ui_slots.items():
    for slot in re.findall(r"\{(\w+)\}", ui.get(key, "")):
        if slot not in allowed:
            errors.append(f"ui.{key}: unknown {{{slot}}} (allowed: {', '.join(sorted(allowed))})")

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
