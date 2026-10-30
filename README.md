# Yaga game

A small 3D farm game at game.yaga.sh: Yaga, a witch whose hut stands on chicken legs, digs, plants, waters and harvests pumpkins and cabbages, keeps hens, sells at her market stall and swats the pests that come for her crops at night. You steer her; each day ends in bed. How it plays is in [docs/mechanics.md](docs/mechanics.md). A static site with no build step; Vercel deploys it from `main`.

The site has two parts:

- `index.html` and `site/`: the homepage, at game.yaga.sh/
- `play/`: the game, at game.yaga.sh/play/

`tools/`, `docs/`, this file and `CLAUDE.md` are for developers. `.vercelignore` keeps them off the site.

## Where to change what

Edit the file, save, reload the page.

| To change… | Edit |
|---|---|
| the homepage's words | `index.html` |
| the homepage's look | `site/home.css` |
| the homepage's pictures (screenshots of the game, WebP) | `site/` |
| what she or the Box says, the labels on screen | `play/words/en.json` |
| how the game plays: day length, stamina costs, crop days and prices, the stall, pests, hens, goal rewards | `play/settings.js` |
| how a hen or an egg looks | `play/assets/models/animals/` |
| how the pumpkin and cabbage look at each growth stage | `play/assets/models/plants/` |
| the shovel, the watering can, the seed bags; the broom (Blender) | `play/assets/models/tools/` |
| the market stall, the well, the hens' trough | `play/assets/models/farm/` |
| the colours and size of the black box | `play/assets/models/box/box.json` |
| the colours and size of each bug (and so of the night pests) | `play/assets/models/enemies/` |
| the hut's colours, size and wall height; the trees and rocks (Blender) | `play/assets/models/environment/` |
| Yaga (Blender) | `play/assets/models/yaga/` |
| the map | `play/assets/world/home.json` |
| how each ground block looks: dirt, grass, field, road, sand, stone, farmland (dry and watered), water | `play/assets/world/blocks/` |
| her portrait in the game | `play/assets/images/` |
| how things behave | `play/code/` |

After changing `play/words/en.json`, run `uv run --no-project python tools/check_words.py` to make sure no line the game asks for is missing.

After exporting a model from Blender, run `uv run --no-project --with pillow python tools/shrink_textures.py play/assets/models/<folder>/<file>.glb`: it shrinks the textures to 1024 px so the game stays quick to load on a phone.

## Run it

From the repo root:

```
uv run --no-project python -m http.server 8000
```

Then open <http://localhost:8000> for the homepage and <http://localhost:8000/play/> for the game.
