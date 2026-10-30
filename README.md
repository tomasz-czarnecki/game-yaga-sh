# Yaga game

A small 3D farm game at game.yaga.sh: Yaga, a witch whose hut stands on chicken legs, digs, plants, waters and harvests pumpkins and cabbages, keeps hens, sells at her market stall and swats the pests that come for her crops at night. You steer her; each day ends in bed. How it plays is in [docs/mechanics.md](docs/mechanics.md). A static site with no build step; Vercel deploys it from `main`.

## Where to change what

Edit the file, save, reload the page.

| To change… | Edit |
|---|---|
| what she or the Box says, the labels on screen | `words/en.json` |
| how the game plays: day length, stamina costs, crop days and prices, the stall, pests, hens, goal rewards | `settings.js` |
| how a hen or an egg looks | `assets/models/animals/` |
| how the pumpkin and cabbage look at each growth stage | `assets/models/plants/` |
| the shovel, the watering can, the seed bags; the broom (Blender) | `assets/models/tools/` |
| the market stall, the well, the hens' trough | `assets/models/farm/` |
| the colours and size of the black box | `assets/models/box/box.json` |
| the colours and size of each bug (and so of the night pests) | `assets/models/enemies/` |
| the hut's colours, size and wall height; the trees and rocks (Blender) | `assets/models/environment/` |
| Yaga (Blender) | `assets/models/yaga/` |
| the map | `assets/world/home.json` |
| how each ground block looks: dirt, grass, field, road, sand, stone, farmland (dry and watered), water | `assets/world/blocks/` |
| her portrait | `assets/images/` |
| how things behave | `code/` |

After changing `words/en.json`, run `uv run --no-project python tools/check_words.py` to make sure no line the game asks for is missing.

After exporting a model from Blender, run `uv run --no-project --with pillow python tools/shrink_textures.py <file.glb>`: it shrinks the textures to 1024 px so the game stays quick to load on a phone.

## Run it

```
uv run --no-project python -m http.server 8000
```

Then open <http://localhost:8000>.
