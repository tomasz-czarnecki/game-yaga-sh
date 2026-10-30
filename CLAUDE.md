# Yaga game (game.yaga.sh)

A small 3D farm game in the classic mould (Stardew Valley, Harvest Moon). Yaga, a witch whose hut stands on chicken legs, farms a world of 50 cm boxes: the player steers her to dig, plant, water and harvest pumpkins and cabbages, keep hens, trade at her stall and swat the pests that come for the crops at night. Days end in bed, with a morning summary. How it plays, and why it changed, is in `docs/mechanics.md`. It is a static site with no build step: plain ES modules plus three.js (vendored in `play/code/lib/`), deployed by Vercel from GitHub `main`. The homepage is the repo root (`index.html`, `site/`); the game is `play/`, at game.yaga.sh/play/.

## How we work here (read this first)
- **Never create git branches or worktrees.** Always work directly on `main`, in the local folder `/Users/tomas/000_Dev/game-yaga-sh`. Do not use hidden worktrees (`.claude/worktrees/...`) or feature branches, so the user never has to hunt for where the work went. If a session starts inside a worktree or on another branch, say so and move to the local folder before changing anything.
- **Commit and push only when the user asks.** Pushing to `main` deploys to game.yaga.sh within about 30 seconds. Keep commits small and separate (one idea each), with a message that says why.
- The GitHub repo is `github.com/tomasz-czarnecki/game-yaga-sh` (remote `origin`, branch `main`).
- Vercel serves the whole repo except what `.vercelignore` lists (`CLAUDE.md`, `README.md`, `docs/`, `tools/`). Anything else you add is public. Keep secrets and private notes out of the repo.
- The user's global rules in `~/.claude/CLAUDE.md` also apply: simple and incremental, find the root cause before fixing, use `uv` for Python.

## Run and check it
- Serve it: `uv run --no-project python -m http.server 8000` from the repo root, then open `http://localhost:8000` (the homepage) or `http://localhost:8000/play/` (the game). (Claude Code's preview uses `.claude/launch.json`, config `yaga-site`; that file is git-ignored.)
- There is no build and no test suite. Check changes in the browser: the console is clean, then play the feature.
- Debug handle: `window.yaga` (state `S`, `her`, `world`, `pet`, `advance(seconds)`, `planFor`, `command`, `setTool`, `setHour`, `sleep`, `wake`, `spawnPest`, `pests`, `stall`, `setZoom`, ...). `advance()` steps the simulation, which is the reliable way to test timing. A tap is `command(planFor({ kind: 'ground', x, z }))`.
- Time is `S.hour`, game hours from 6 to 26 (2:00), 12.5 s each. It moves only while the game runs and stands still while a panel is open. Night: `yaga.setHour(21)`. End the day: `yaga.sleep()`, then `yaga.wake()` closes the morning summary.
- The preview pane runs the game slowly when it is hidden, and its screenshots can lag one step behind. Prefer asserting on state, and check that nobody else is tapping in the pane.

## Files
At the root: `index.html`, the homepage (hero, how a day goes, controls); `site/`, its stylesheet, screenshots and favicon. Everything else below is in `play/` unless it starts with `tools/`, `docs/` or `manual_uploads/`.
- `play/index.html`: the game page. All the game's CSS and the HUD: her portrait with coins, stamina and mana top left, and under them the bag and next-goal pills; the clock with the day top right; the seven-slot hotbar with its hint line at the bottom; the small link back to the homepage (`.home`); the block label (`#tileTip`); the panel (`#panel`), toasts and the night fade. Its labels have no text of their own: `data-word`, `data-word-aria` and `data-word-alt` attributes point into `words/en.json`.
- `settings.js`: the balance numbers (day, stamina costs, mana, crops and prices, soil, can and shovel upgrades, starting kit, stall, bugs, pests, broom, hens, goal rewards), each with a note. Plain `export default`, so `//` comments work.
- `docs/mechanics.md`: the game loop, the controls and where each number lives. Keep it in step with the code.
- `words/en.json`: everything she, the Box and the screen say. One file per language (a Polish file would sit beside it).
- `assets/models/`: every model, one folder per kind. `.glb` files are exported from Blender and can't be edited by hand; `.json` files are text.
  - `yaga/`: her model (`yaga-dressed.glb`: body, clothes, hair, skeleton and all animation clips).
  - `animals/`: `hen.json`, `egg.json` (box models). `plants/`: `pumpkin.json`, `cabbage.json` (box models, one look per growth stage).
  - `tools/`: `broom.glb`, and the box models `shovel.json`, `watering-can.json` and `seed-bag.json` (variants: pumpkin seeds, cabbage seeds, hen feed).
  - `farm/`: `stall.json`, `well.json`, `trough.json` (box models; where they stand is `STALL`, `WELL`, `TROUGH` in `app.js`).
  - `environment/`: the scenery (`environment.glb`: the tree, rocks and fruit; the mountains are built from its rocks) and `house.json` (the hut's colours, size and wall height; the hut itself is drawn in `app.js`).
  - `box/box.json`: the black box sidekick's size, fur, eyes and mouth colours (drawn in `app.js`).
  - `enemies/<bug>.json`: each bug's colours and overall size (drawn in `bug-models.js`). The night pests are beetles and ants made bigger and red (`pests.size`).
- `assets/world/home.json`: the map (a text grid of block kinds plus heights, 0.5 m per cell). The format a future generator should write. `assets/world/blocks/<kind>.json`: how each kind of block looks (dirt, grass, field, road, sand, stone, farmland, water). `farmland.json` also has the watered colours (`wet`, `wet2`).
- `assets/images/`: her portrait (also the page icon).
- `code/`: all JavaScript, plus `code/lib/` (three.js, vendored, untouched).
  - `app.js`: the world. Saved state (`S`, `loadSave`, `save`), Yaga (`YagaPet`), the Box sidekick, the stall, well and trough, friendly bugs, night pests, hens, the field's drawing, her control (`her`, `planFor`, `command`, `beginWork`, `finish`, `tickHer`), the end of the day, input, the block highlight, item icons, HUD, sound, speech. About 2,800 lines.
  - `farm.js`: the plot rules (`ripe`, `stageOf`, `atRisk`, `overnight`) and each action's animation timing (`FARM`).
  - `day.js`: the game clock (`HOUR`, `isNight`, `clockText`), how many pests come (`pestsDue`), and `endDay()`, which works out the night.
  - `inventory.js`: her bag and coins (`count`, `add`, `take`, `sell`), sell prices, and the stall's `OFFERS`.
  - `goals.js`: the goal list (`GOALS`, `reached`, `nextGoal`).
  - `hud.js`: the panels (stall, bag, goals, bed, morning summary), `toast`, `hint`, and `fill`/`plural` for the words' placeholders.
  - `terrain.js`: the box ground, loaded from `assets/world/home.json` with the looks in `assets/world/blocks/`. `loadBlocks`, `groundY`, `walkable`, `waypoint`, `isWater`, `tillCell`, `wetCell` (watered or dry farmland), `untillCell` (back to what it was).
  - `camera-rig.js`: the camera, from isometric (default) through zoom-out to a human close-up (mouse wheel).
  - `box-model.js`: builds the box models (`loadBoxModels`, `buildBoxModel`). A model's name is its path in `assets/models/` without `.json`, e.g. `animals/hen`.
  - `chickens.js`: animates the hen's named parts and makes the egg.
  - `tools.js`: how a prop sits in her hand (`GRIP`), the shovel, can and seed bags, and the broom swing numbers.
  - `bug-models.js`: draws the bugs, with colours and size from `assets/models/enemies/` (`loadBugLooks`).
  - `loading.js`: the loading screen (`#loading` in `index.html`): `getJSON` and `loadGLB` load every file and move the bar; `building()` shows the last step; `hide()` fades it out after her first frame.
- `tools/check_words.py`: run `uv run --no-project python tools/check_words.py` after touching `play/words/en.json` or adding a line key; it reads every module in `play/code/` and lists every key the code asks for that is missing (also the `ui` tables looked up by tool, action, reason, goal and item).
- `tools/shrink_textures.py`: shrinks every texture inside a `.glb` to at most 1024 px (or the size given) and checks that nothing else in the file changed. Run `uv run --no-project --with pillow python tools/shrink_textures.py play/assets/models/<folder>/<file>.glb`.
- `manual_uploads/`: the owner's Blender sources and drafts. Not committed; leave untouched.

## Gotchas
Paths here are inside `play/` too, unless they name the root.
- **Game ticks go in `simulate()`.** `frame()` calls it and then only draws (camera, hover, HUD); `advance()` runs `simulate()` alone.
- **She never acts on her own.** Everything she does starts from `command()` (a tap, E/Space, or the queue). Idle animations and chatter are only for show. Her modes (`idle`, `walk`, `work`, `rest`, `faint`, `sleep`) are listed in `tickHer()` and `YagaPet.moodClip()`.
- **A new action** needs a case in `planFor()` (when a tap means it), timing in `FARM` (`farm.js`) or its own branch in `beginWork()`, its result in `finish()`, a cost in `settings.stamina`, and words in `ui.act`, plus `ui.no` and `NO_SAY` for each reason it can be refused.
- **Saving:** `loadSave()` reads each field with a default, so old or broken saves load. A new saved field needs a default in `S`, a line in `loadSave()` and a line in `save()`. The key is `yaga-farm-v2`; the pet game's `yaga-pet-v1` is brought over once (its plots and the sound setting).
- **Use `clock.t` timers (`later(secs, fn)`), not `setTimeout`**, for anything in the game (`advance()` does not step `setTimeout`).
- **Arrays like `world.items`, `world.hens`, `S.plots` and `S.eggs` are replaced when something is removed.** Don't hold a reference to one across frames.
- **The clock and the pests stop while a panel is open** (`paused()`). A panel that should not stop time doesn't belong in `#panel`.
- Her broom swing clip has a long text name (a prompt, not a label); it is looked up in `SWING.clip`.
- **The broom, shovel, watering can and seed bags are props on her right-hand bone** (`attachInHand` + `GRIP` in `tools.js`), shown or hidden by the selected tool. A prop's origin is at the grip, handle up (+y), head down. `broom.glb` was cut out of her model in exactly that space, so a new body needs no broom baked in. If a new body's right-hand bone is oriented differently, `GRIP` has to be re-measured.
- Nothing happens while the page is closed: the farm waits at the hour it was left. Crops grow only overnight, in `endDay()`.
- **Paths:** `fetch`, `GLTFLoader`, `<script src>` and `<img>` paths resolve against `play/index.html` (`./assets/...`, `./words/en.json`); module `import`s resolve against the importing file (`./terrain.js`, `../settings.js`). They only work at `/play/` with its last slash, so an inline script at the top of `play/index.html` adds it. The game and the homepage link to each other relatively (`play/`, `../`).
- **The homepage reads the save:** `index.html` turns Start into Continue if `localStorage` has the game's keys. If `SAVE_KEY` in `app.js` changes, change it there too.
- **Homepage pictures are real screenshots** of the game, WebP, phone hero about 30 KB, desktop hero about 50 KB. Re-shoot them when the game's look changes much. The `og.jpg` link in `index.html` uses the full `https://game.yaga.sh/` address because share previews need it.
- **Words:** never put text in the code. Add the line to `words/en.json` (same key the code uses with `say('key')`, `boxReact('key')` or `UI.key`), then run `tools/check_words.py`. Her lines may use `{n}`, `{bug}` and `{crop}`; the screen's placeholders are listed per `ui` table in the checker. `[one, many]` pairs go through `plural()`. Only the `#oops` error text and the loading screen's texts (`index.html`, `code/loading.js`) stay out of it, because they must work before the words have loaded.
- **Settings vs code:** a number goes in `settings.js` if it is balance (how fast, how much, how many). Numbers tied to a model or animation (`MODEL_H`, stride, `GRIP`, the `FARM` beats and `dur`s, camera, render) stay in code.
- **Box models:** a file has `defaults`, named `materials`, `boxes` (`size`, `material`, `at`, optional `turn` in degrees, optional `shape: "sphere"`), named `parts` that hold more boxes and parts, optional `variants` (colour sets: the hens, the seed bags) and `stages` (growth looks, the crops). The code moves parts by name: the hen needs `body`, `head`, `tail`, `legL`, `legR`; the trough needs `grain`; the props in her hand are lit at night. A new box model file must also be added to the `loadBoxModels([...])` list in `boot()`. The hotbar and panel pictures are drawn from the models at boot (`makeIcons`), so a model change shows there too.
- **Anything a tap can pick** carries `userData.pick = { kind, ref }` on its meshes (`pickTarget()`); a new kind of thing needs that and a case in `planFor()`.
- **Looks in files, shapes in code:** the black box, the bugs and the hut are drawn in code, but their colours and sizes come from `box/box.json`, `enemies/*.json` and `environment/house.json`. A new colour key in one of those files does nothing until the code reads it. A new kind of ground block needs its file in `assets/world/blocks/` and a place in `BLOCKS` in `terrain.js`.
- **A typo in a JSON file** shows "could not load her game files" on screen and names the file and line in the console.
- **Load every file through `loading.js`** (`getJSON`, `loadGLB`), or the loading screen won't count it. Vercel compresses files and sends no size, so each `.glb` gets a rough size in MB at its `loadGLB` call in `boot()`; if a model changes size a lot, update that number (it only steers the bar).
- **After exporting a model from Blender,** run `tools/shrink_textures.py` on it: exports come out with 4096 px textures, which made her file 16.8 MB and cost a phone about 600 MB of graphics memory. 1024 px looks the same even at the closest zoom. Then update its rough size at its `loadGLB` call in `boot()`.
- **Her model is preloaded** by a `<link rel="preload" … as="fetch" crossorigin>` line at the top of `index.html`, so its download starts before the code has arrived. If the file moves, change that line together with the path in `boot()`, or the browser downloads it twice.
- **Don't wait on `requestAnimationFrame` during loading.** It can stall in an embedded or hidden frame while the page still reports itself as visible. `loading.js` uses timers, and the screen fades out from `frame()`, which the game also runs from a timer.
- **To test the loading screen,** serve the game slowly: a local server that sends files at about 1.5 MB/s without `Content-Length`, like a phone on Vercel. On a normal local server everything loads too fast to see.
