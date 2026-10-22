# Yaga game

A small 3D farm game at game.yaga.sh: Yaga, a witch whose hut stands on chicken legs, hunts bugs, digs farmland, grows pumpkins and cabbages, and protects her hens. A static site with no build step; Vercel deploys it from `main`.

## Where to change what

Edit the file, save, reload the page.

| To change… | Edit |
|---|---|
| what she or the Box says, the labels on screen | `words/en.json` |
| how the game plays: speeds, how fast her bars come back, damage, growth times, how many hens | `settings.js` |
| how a hen or an egg looks | `assets/models/animals/` |
| how the pumpkin and cabbage look at each growth stage | `assets/models/plants/` |
| the shovel; the broom (Blender) | `assets/models/tools/` |
| the colours and size of the black box | `assets/models/box/box.json` |
| the colours and size of each bug (and so of the monsters) | `assets/models/enemies/` |
| the hut's colours, size and wall height; the trees and rocks (Blender) | `assets/models/environment/` |
| Yaga (Blender) | `assets/models/yaga/` |
| the map | `assets/world/home.json` |
| how each ground block looks: dirt, grass, field, road, sand, stone, farmland, water | `assets/world/blocks/` |
| her portrait | `assets/images/` |
| how things behave | `code/` |

After changing `words/en.json`, run `uv run --no-project python tools/check_words.py` to make sure no line the game asks for is missing.

After exporting a model from Blender, run `uv run --no-project --with pillow python tools/shrink_textures.py <file.glb>`: it shrinks the textures to 1024 px so the game stays quick to load on a phone.

## Run it

```
uv run --no-project python -m http.server 8000
```

Then open <http://localhost:8000>.
