# Yaga game

A small 3D farm game at game.yaga.sh: Yaga, a witch whose hut stands on chicken legs, hunts bugs, digs farmland, grows pumpkins and cabbages, and protects her hens. A static site with no build step; Vercel deploys it from `main`.

## Where to change what

Edit the file, save, reload the page.

| To change… | Edit |
|---|---|
| what she or the Box says, the labels on screen | `words/en.json` |
| how the game plays: speeds, how fast bars move, damage, growth times, how many hens | `settings.js` |
| how a hen, an egg, a pumpkin, a cabbage or the shovel looks | `assets/boxes/*.json` |
| the map | `assets/worlds/home.json` |
| 3D models (Yaga, the scenery, the poo) and her portrait | `assets/models/`, `assets/images/` |
| how things behave | `code/` |

After changing `words/en.json`, run `uv run --no-project python tools/check_words.py` to make sure no line the game asks for is missing.

## Run it

```
uv run --no-project python -m http.server 8000
```

Then open <http://localhost:8000>.
