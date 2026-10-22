# Yaga game (game.yaga.sh)

A small 3D farm game. Yaga, a witch whose hut stands on chicken legs, lives in a world of 50 cm boxes: she hunts bugs, fights hostile ones with a broom, digs farmland with a shovel, grows pumpkins and cabbages, and protects her hens. It is a static site with no build step: plain ES modules plus three.js (vendored in `code/lib/`), deployed by Vercel from GitHub `main`.

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
- `assets/models/`: every model, one folder per kind. `.glb` files are exported from Blender and can't be edited by hand; `.json` files are text.
  - `yaga/`: her model (`yaga-dressed.glb`: body, clothes, hair, skeleton and all animation clips) and her poo (`pupu.glb`).
  - `animals/`: `hen.json`, `egg.json` (box models). `plants/`: `pumpkin.json`, `cabbage.json` (box models, one look per growth stage).
  - `tools/`: `broom.glb` and `shovel.json` (box model).
  - `environment/`: the scenery (`environment.glb`: the tree, rocks and fruit; the mountains are built from its rocks) and `house.json` (the hut's colours, size and wall height; the hut itself is drawn in `app.js`).
  - `box/box.json`: the black box sidekick's size, fur, eyes and mouth colours (drawn in `app.js`).
  - `enemies/<bug>.json`: each bug's colours and overall size (drawn in `bug-models.js`). The monsters are beetles and ants made bigger and red.
- `assets/world/home.json`: the map (a text grid of block kinds plus heights, 0.5 m per cell). The format a future generator should write. `assets/world/blocks/<kind>.json`: how each kind of block looks (dirt, grass, field, road, sand, stone, farmland, water).
- `assets/images/`: her portrait.
- `code/`: all JavaScript, plus `code/lib/` (three.js, vendored, untouched).
  - `app.js`: the game. Saved state (`S`), Yaga (`YagaPet`), the Box sidekick, the brain, bugs, hostile bugs and combat, the farm actions, the hens, input, sound, speech. About 2,900 lines; splitting it by topic is a planned later step.
  - `terrain.js`: the box ground, loaded from `assets/world/home.json` with the looks in `assets/world/blocks/`. `loadBlocks`, `groundY`, `walkable`, `waypoint`, `tillCell` (turns a block into `farmland`).
  - `camera-rig.js`: the camera, from isometric (default) through zoom-out to a human close-up (mouse wheel).
  - `box-model.js`: builds the box models (`loadBoxModels`, `buildBoxModel`). A model's name is its path in `assets/models/` without `.json`, e.g. `animals/hen`.
  - `chickens.js`: animates the hen's named parts and makes the egg.
  - `tools.js`: how a prop sits in her hand (`GRIP`), the shovel, and the broom swing numbers.
  - `farm.js`: what the shovel can do (dig, plant, harvest, Grow spell), crop stages and growth times.
  - `bug-models.js`: draws the bugs, with colours and size from `assets/models/enemies/` (`loadBugLooks`).
- `tools/check_words.py`: run `uv run --no-project python tools/check_words.py` after touching `words/en.json` or adding a line key; it lists every key the code asks for that is missing.
- `manual_uploads/`: the owner's Blender sources and drafts. Not committed; leave untouched.

## Gotchas
- **New per-frame ticks go in both `simulate()` and `frame()`** in `app.js` (and `advance()` only runs `simulate()`).
- **Modes are listed by string in several places.** A new brain mode must be added to the `tickBrain` switch, `BUSY`, `arrive()`, and the animation mapping.
- **Saving:** `loadSave()` copies listed fields only. A new saved field needs a default in `S`, a line in `loadSave()`, and a line in `save()`.
- **Use `clock.t` timers, not `setTimeout`**, for game logic (`advance()` does not step `setTimeout`).
- **Arrays like `world.hens` are replaced when something is removed.** Don't hold a reference to one across frames.
- Her broom swing clip has a long text name (a prompt, not a label); it is looked up in `SWING.clip`.
- **The broom and the shovel are props on her right-hand bone** (`attachInHand` + `GRIP` in `tools.js`), shown or hidden by the selected tool. A prop's origin is at the grip, handle up (+y), head down. `broom.glb` was cut out of her model in exactly that space, so a new body needs no broom baked in. If a new body's right-hand bone is oriented differently, `GRIP` has to be re-measured.
- Timestamps that must survive a closed tab (crops) use `Date.now()`; the rest of the game uses `clock.t`.
- **Paths:** `fetch`, `GLTFLoader`, `<script src>` and `<img>` paths resolve against `index.html` (`./assets/...`, `./words/en.json`); module `import`s resolve against the importing file (`./terrain.js`, `../settings.js`).
- **Words:** never put text in the code. Add the line to `words/en.json` (same key the code uses with `say('key')`, `boxReact('key')` or `UI.key`), then run `tools/check_words.py`. Placeholders are `{n}`, `{bug}`, `{crave}` and the few listed in the checker. Only the `#oops` error text stays in code, because it must work when the words fail to load.
- **Settings vs code:** a number goes in `settings.js` if it is balance (how fast, how much, how many). Numbers tied to a model or animation (`MODEL_H`, stride, `GRIP`, the `FARM` beats and `dur`s, camera, render) stay in code.
- **Box models:** a file has `defaults`, named `materials`, `boxes` (`size`, `material`, `at`, optional `turn` in degrees, optional `shape: "sphere"`), named `parts` that hold more boxes and parts, optional `variants` (colour sets, the hens) and `stages` (growth looks, the crops). The code moves parts by name: the hen needs `body`, `head`, `tail`, `legL`, `legR`; the shovel's materials are lit at night. A new box model file must also be added to the `loadBoxModels([...])` list in `boot()`.
- **Looks in files, shapes in code:** the black box, the bugs and the hut are drawn in code, but their colours and sizes come from `box/box.json`, `enemies/*.json` and `environment/house.json`. A new colour key in one of those files does nothing until the code reads it. A new kind of ground block needs its file in `assets/world/blocks/` and a place in `BLOCKS` in `terrain.js`.
- **A typo in a JSON file** shows "could not load her game files" on screen and names the file and line in the console.
