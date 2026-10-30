# Yaga's farm: how the game plays

## What was wrong (diagnosis, before the rework)

Found by playing the old build headless through `window.yaga` (`advance()`, real clicks on the canvas) and reading `code/app.js`.

1. **Days meant nothing.** The clock ran on the wall clock (`Date.now()`), the same for everyone. `advance()` could not move it, sleeping could not end a day, and the only thing a new day did was bring lost hens back.
2. **Crops ignored the player.** A crop was ripe 300 real seconds after planting, watered or not, tab open or not. `advance(400)` left a fresh crop a sprout, because growth did not follow game time either.
3. **With the shovel in hand she could not walk.** Every tap on the ground was a dig. A tap on the road or stone gave only "can't dig that": no dig and no walk.
4. **The Grow spell fired by accident.** A tap on a growing crop cast it at once (−0.3 mana) and ripened the crop. Mana refilled in 150 s, so waiting for crops was pointless.
5. **No choices and no rewards.** The code picked the crop (whichever there were fewer of), seeds were free, and a harvest vanished into +0.05 health, usually already full. It also "fed" the hens, but hens were switched off (`flock: 0`). There was no inventory, no money and nothing to work towards.
6. **The brain overrode the player.** With the broom in hand and an angry monster near, she attacked on her own. Below 4% stamina she lay down for 22 s by herself. After an interruption she went back on her own for a bug she had been sent after.
7. **Stamina did not matter.** Standing still refilled it from empty in 90 s, so digging (0.1 a dig) never ran it out.
8. **Bugs were pointless.** Tapping one in the tray sent her across the map (17 m in the test) to eat a bug that "does nothing for now".
9. **Monsters had nothing to do with the farm.** They wandered calmly until hit, then bit her. Bites were the only use of health, and kills fed only the accidental spell.
10. **The hut was decoration.** Tapping it played a line. There was no bed and no end of day.

## The new loop

A classic farm day. The player steers her; she never acts on her own (idle animations and chatter are only for show).

**Day.** A day runs from 6:00 to 2:00, at 12.5 s per game hour (`day.length` 300 s is 24 hours). The clock runs only while the game does, and stops while a panel is open. Night falls at 20:00: the stall closes and pests come. The day ends when she **sleeps in the hut** (tap the hut, then "Sleep") or **passes out at 2:00**: the Box drags her home and she wakes with half stamina. Every morning a summary shows what the night did.

**Field.**
1. *Dig* grass, dirt or field blocks with the shovel: they become farmland.
2. *Plant* seeds in dug soil: pumpkin (4 days) or cabbage (3 days).
3. *Water* each crop once a day with the can. Watered soil is darker. The can holds 12 waterings; fill it at the well (or the pond).
4. *Overnight:* a watered crop grows one day; a dry one doesn't. Then all soil dries. Dug soil left bare for more than 2 mornings turns back into plain ground.
5. *Harvest* a ripe crop with your hand (or any tool that has nothing else to do there). It goes into her bag.

**Grow spell (key 7).** It costs 0.34 mana and gives a *watered* crop one day of growth at once. Mana comes back with a night's sleep and with every pest swatted.

**Stamina.** Only actions cost stamina: digging 5%, watering 2%, a broom swing 3%, the rest 1–2%. Nothing else drains it, and only sleep refills it. When it runs out she has to sit for 15 s and gets 25% back.

**Money.** At the **market stall** (open 6:00–20:00) she sells crops, eggs and caught bugs, and buys seeds, hen feed, more hens and two upgrades: the big watering can (30 waterings) and the steel shovel (half-stamina digging). The game starts with 40 coins, 6 cabbage seeds, 2 pumpkin seeds and 4 scoops of feed, so the loop starts at once.

**Hens.** She starts with 2. Fill the trough (one scoop per hen); each fed hen lays an egg the next morning. Pick eggs up and sell them for 18 coins. Feed costs 4.

**Bugs and pests.**
- *Friendly bugs* (ladybug, snail, caterpillar, jewel beetle; fireflies after dark) wander about. Catch them with your hand and sell them for 4–16 coins. Catching three kinds is a goal.
- *Pests* (the big red beetles and ants) come only at night, and only for crops **at risk**: dry (not watered today) or ripe. A watered, growing crop is safe. A night brings 1 pest, plus 1 for every 6 crops at risk, 3 at most. A pest crawls to a crop and eats it in 12 s unless she swats it: broom, two hits, +0.15 mana. Pests never hurt her. If she sleeps, the pests still due each eat one crop at risk, and the summary says so. The worst case is losing a few unwatered or unharvested crops; the soil, the money and the other crops are never touched.

**Goals.** A list of 13 milestones points the way, shown as "Next: …" top left (tap for the list). They run: dig, plant, water, harvest, sell, earn 100, collect an egg, swat a pest, catch 3 bug kinds, big can, 12 crops at once, 4 hens, earn 1,000. Some pay coins.

## Controls

| | Phone / mouse | Keyboard |
|---|---|---|
| Walk | tap the ground (double tap: run) | WASD or arrows (Shift: run) |
| Use the tool | tap the block or thing; she walks there and does it | E or Space: on what is in front of her |
| More work | tap more blocks while she works: they queue up (outlined squares) | |
| Pick a tool | the hotbar | 1–7 |
| Stall, bed, trough, well | tap it | walk up to it and press E |
| Zoom | | mouse wheel |

Taps follow one rule: **if the tool in her hand can do something there, she does it; if not, she just walks there.** Hand actions (harvest, eggs, bugs, hens) work with any tool that has nothing else to do there. If she can't do the job (no seeds, empty can, stall closed) she says why and stays put. On a desktop the block under the cursor is highlighted (gold: the tool works there, red: it can't, faint: she walks) with a label saying what a click does. On a phone the same highlight sits on the job she is walking to.

## Where the numbers are

Every balance number is in `settings.js`, with a note beside it:

| Section | What it sets |
|---|---|
| `day` | day length, wake hour, nightfall, pass-out hour |
| `her` | walk/run pace, the forced rest, stamina after passing out |
| `stamina` | what each action costs |
| `mana` | Grow spell cost, mana per swat, mana from sleep |
| `crops` | days to ripen, seed price, sell price, per crop |
| `soil` | mornings before bare soil reverts |
| `can`, `shovel` | can sizes and upgrade prices |
| `start` | starting coins and items |
| `shop` | opening hours, feed price, what eggs and bugs sell for |
| `bugs` | friendly bug kinds, numbers, speeds |
| `pests` | kinds, how many per night, how long they take to eat, hits to swat |
| `broom` | swing reach and damage |
| `hens` | starting and most hens, price, the yard |
| `goals` | coin reward per goal |

The words are all in `words/en.json` (run `tools/check_words.py` after editing it).

## Code map

- `code/day.js`: the game clock (`S.hour`), night, how many pests come, and `endDay()`, which resolves the night.
- `code/farm.js`: plot rules (`ripe`, `atRisk`, `overnight`) and the action timings (`FARM`).
- `code/inventory.js`: bag, coins, sell prices, the stall's offers.
- `code/goals.js`: the goal list.
- `code/hud.js`: the panels (stall, bag, goals, bed, morning summary), toasts and the hint line.
- `code/app.js`: everything in the world. `planFor()` turns a tap into a plan. `command()` / `startOrder()` / `beginWork()` / `finish()` carry it out. `tickHer()` runs her modes. The pests, the hens, the input and the HUD are here too.
