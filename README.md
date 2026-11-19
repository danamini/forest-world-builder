# forest-world-builder

A procedurally generated wood that runs in the browser. Five Blender primitives, four verbs and a handful of
field rules grow everything; nothing is placed by hand. How it works, with live illustrations:
`docs/how-the-wood-grows.html`.

## Run

    npm install
    npx vite --host --port 5199 --strictPort   # dev server, reachable on the local network
    npm run build                              # production build into dist/ (about 2.2 MB)
    npm run assets                             # rebuild public/ from blender/build.py (Blender 5.2, ~40 s)

## Address parameters

| Parameter | Effect |
|---|---|
| `seed=7` | which wood (default 1; R or a three-finger tap picks another) |
| `hour=22` | hold the clock at this hour; without it a day lasts six minutes from a random start |
| `rain=1` | force rain (`0` keeps it dry); without it showers come and go |

## Layout

| File | Holds |
|---|---|
| `src/noise.js` | seeded hash, noise, fbm |
| `src/world.js` | fields, height, the layer table, scatter and refill |
| `src/forms.js` | sweep, lump, card, paint; the tree recursion; flora and insects |
| `src/look.js` | materials, sun and moon clock, mist and shafts, rain, lens |
| `src/main.js` | boot, walking (mouse, keys, touch), the frame loop |
| `blender/build.py` | primitives, sprig atlas, bark, rock and ground maps |

## Not yet checked by eye

- Insects in motion (butterflies, dragonflies, moths): wing beat and flight paths.
- A shower arriving and clearing on its own; the sun and moon handing over at the horizon.
- Frame rate on a phone. On a Mac it is about 50 fps.
