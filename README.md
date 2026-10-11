# Factorio Ratios

An easy ratio calculator for **Factorio 2.0 + Space Age**, made for people who build spaghetti rather than perfect megabases.

Pick what you want per minute (or per second). It tells you how many of each machine to build, which belts and modules to use, and how it all connects, from ore to final product.

**Live site:** https://mattgartman.github.io/factorio-ratios/

## Features

- **Simple setup**: pick a planet (Nauvis, Vulcanus, Fulgora, Gleba, Aquilo or a space platform) and a preset (Early, Mid, Late or Space Age). Then tick the machines you actually have.
- **Item picker** laid out like the in-game crafting menu, with search. "Fill a belt" buttons set the rate to exactly one full belt.
- **Flow chart** of the production line, raw materials on the left and your product on the right:
  - Lines run from each box's output to the exact ingredient row of the next box.
  - Hover or click a box to highlight everything that feeds it and everything it feeds.
  - Drag boxes around, zoom in and out, and pan.
- **Per-group modules and beacons**: set modules slot by slot for one group of machines and see how many machines it saves.
- **Per-group belts**, with a load meter. Anything over 100% tells you how many rows of machines to build, and offers a one-click upgrade to a belt that fits.
- **Chain view**: a "made from…" tree for each product.
- **Layout (blueprint) view**: each step drawn to scale on a tile grid, showing belts and what's on each lane, inserters, modules, power poles and fluid pipes. The **full map** shows the whole factory as a main bus with every row of machines connected to it.
- **Build guide**: a card per step where you can swap recipes and machines, or mark an item as "I'll supply this" when it's already on your bus.

Settings and layouts are saved in your browser. Everything runs client-side; there's no server or account.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

## Game data

`src/data/game.json` and `public/icons/` are generated from a local Factorio install (2.0 with Space Age, vanilla mods only). To refresh them after a game update:

```bash
npm run extract    # runs `factorio --dump-data`, then extracts recipes and icons
```

The script defaults to the macOS install at `/Applications/factorio.app`. Set `FACTORIO_APP` and `FACTORIO_WRITE_DIR` for other locations, or pass an existing `data-raw-dump.json` as an argument.

**Assumptions:** normal quality, 100% pumpjack yield, burner fuel isn't counted, and pipe and power-pole positions in the layout views are schematic.

## Deploying

Pushes to `main` are built and published to GitHub Pages by `.github/workflows/deploy.yml`. The build reads `BASE_PATH` so it can be served from `/<repo>/`.

## License and credits

The code is MIT licensed (see [LICENSE](LICENSE)).

Factorio, its icons and its game data are © [Wube Software](https://factorio.com). The icons and recipe data in this repo come from the game and are **not** covered by the MIT license. This is an unofficial fan tool, not affiliated with or endorsed by Wube Software.
