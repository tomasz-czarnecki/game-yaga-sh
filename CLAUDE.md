# Pani Yaga game (game.yaga.sh)

A small 3D farm game. Pani Yaga, a witch whose hut stands on chicken legs, lives in a world of 50 cm boxes: she hunts bugs, fights hostile ones with a broom, digs farmland with a shovel, grows pumpkins and cabbages, and protects her hens. It is a static site with no build step: plain ES modules plus three.js (vendored in `code/lib/`), deployed by Vercel from GitHub `main`.

## How we work here (read this first)
- **Never create git branches or worktrees.** Always work directly on `main`, in the local folder `/Users/tomas/000_Dev/game-yaga-sh`. Do not use hidden worktrees (`.claude/worktrees/...`) or feature branches, so the user never has to hunt for where the work went. If a session starts inside a worktree or on another branch, say so and move to the local folder before changing anything.
- **Commit and push only when the user asks.** Pushing to `main` deploys to game.yaga.sh within about 30 seconds. Keep commits small and separate (one idea each), with a message that says why.
- The GitHub repo is `github.com/tomasz-czarnecki/game-yaga-sh` (remote `origin`, branch `main`).
- Everything in the repo root is served publicly by Vercel, this file included. Keep secrets and private notes out of the repo.
- The user's global rules in `~/.claude/CLAUDE.md` also apply: simple and incremental, find the root cause before fixing, use `uv` for Python.

## Run and check it
- Serve it: `uv run --no-project python -m http.server 8000` from the repo root, then open `http://localhost:8000`. (Claude Code's preview uses `.claude/launch.json`, config `yaga-site`; that file is git-ignored.)
- There is no build and no test suite. Check changes in the browser: the console is clean, then play the feature.
- Debug handle: `window.yaga` (state `S`, `world`, `brain`, `pet`, `advance(seconds)`, `go`, `setTool`, `spawnHostile`, `setZoom`, ...). `advance()` steps the simulation, which is the reliable way to test timing.
- A game day is 300 s and the clock overrides `S.night`. To test night or day, set `yaga.S.dayOff` (noon: `((150 - (Date.now()/1000 % 300)) % 300 + 300) % 300`).
- The preview pane runs the game slowly when it is hidden, and its screenshots can lag one step behind. Prefer asserting on state, and check that nobody else is tapping in the pane.

## Files
- `index.html`: all CSS and the HUD (stats, bug tray, clock, bottom hotbar with health/mana/stamina and the two tools). Its labels have no text of their own: `data-word`, `data-word-aria` and `data-word-alt` attributes point into `words/en.json`.
- `settings.js`: the balance numbers (day length, how fast her bars move, what a meal gives, bugs, biters, broom, farming, hens), each with a note. Plain `export default`, so `//` comments work.
- `words/en.json`: everything she, the Box and the screen say. One file per language (a Polish file would sit beside it).
- `assets/models/`: her model (`pani-yaga-dressed.glb`), the scenery (`environment.glb`) and the poo (`pupu.glb`). `assets/images/`: her portrait.
- `assets/worlds/home.json`: the map (a text grid of types plus block heights, 0.5 m per cell). The format a future generator should write.
- `assets/boxes/*.json`: the hen, egg, pumpkin, cabbage and shovel, as materials plus boxes (see "Box models" below).
- `code/`: all JavaScript, plus `code/lib/` (three.js, vendored, untouched).
  - `app.js`: the game. Saved state (`S`), Pani Yaga (`YagaPet`), the Box sidekick, the brain, bugs, hostile bugs and combat, the farm actions, the hens, input, sound, speech. About 2,900 lines; splitting it by topic is a planned later step.
  - `terrain.js`: the box ground, loaded from `assets/worlds/home.json`. `groundY`, `walkable`, `waypoint`, `tillCell`.
  - `camera-rig.js`: the camera, from isometric (default) through zoom-out to a human close-up (mouse wheel).
  - `box-model.js`: builds the models in `assets/boxes/` (`loadBoxModels`, `buildBoxModel`).
  - `chickens.js`: animates the hen's named parts and makes the egg.
  - `tools.js`: the shovel, where it sits in her hand (`GRIP`), and the broom swing.
  - `farm.js`: what the shovel can do (dig, plant, harvest, Grow spell), crop stages and growth times.
  - `bug-models.js`: the bugs. (They, the hut and the Box sidekick are still built in code, not from JSON.)
- `tools/check_words.py`: run `uv run --no-project python tools/check_words.py` after touching `words/en.json` or adding a line key; it lists every key the code asks for that is missing.
- `manual_uploads/`: the owner's Blender sources and drafts. Not committed; leave untouched.

## Gotchas
- **New per-frame ticks go in both `simulate()` and `frame()`** in `app.js` (and `advance()` only runs `simulate()`).
- **Modes are listed by string in several places.** A new brain mode must be added to the `tickBrain` switch, `BUSY`, `arrive()`, and the animation mapping.
- **Saving:** `loadSave()` copies listed fields only. A new saved field needs a default in `S`, a line in `loadSave()`, and a line in `save()`.
- **Use `clock.t` timers, not `setTimeout`**, for game logic (`advance()` does not step `setTimeout`).
- **Arrays like `world.hens` are replaced when something is removed.** Don't hold a reference to one across frames.
- Her broom swing clip has a long text name (a prompt, not a label); it is looked up in `SWING.clip`.
- Timestamps that must survive a closed tab (crops) use `Date.now()`; the rest of the game uses `clock.t`.
- **Paths:** `fetch`, `GLTFLoader`, `<script src>` and `<img>` paths resolve against `index.html` (`./assets/...`, `./words/en.json`); module `import`s resolve against the importing file (`./terrain.js`, `../settings.js`).
- **Words:** never put text in the code. Add the line to `words/en.json` (same key the code uses with `say('key')`, `boxReact('key')` or `UI.key`), then run `tools/check_words.py`. Placeholders are `{n}`, `{bug}`, `{crave}` and the few listed in the checker. Only the `#oops` error text stays in code, because it must work when the words fail to load.
- **Settings vs code:** a number goes in `settings.js` if it is balance (how fast, how much, how many). Numbers tied to a model or animation (`MODEL_H`, stride, `GRIP`, the `FARM` beats and `dur`s, camera, render) stay in code.
- **Box models:** a file has `defaults`, named `materials`, `boxes` (`size`, `material`, `at`, optional `turn` in degrees, optional `shape: "sphere"`), named `parts` that hold more boxes and parts, optional `variants` (colour sets, the hens) and `stages` (growth looks, the crops). The code moves parts by name: the hen needs `body`, `head`, `tail`, `legL`, `legR`; the shovel's materials are lit at night. A new box model file must also be added to the `loadBoxModels([...])` list in `boot()`.
- **A typo in a JSON file** shows "could not load her game files" on screen and names the file and line in the console.
