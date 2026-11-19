# forest-world-builder

![A misty stand of trees with ferns in the foreground and sun shafts through the canopy](preview.jpeg)

A procedurally generated wood that runs in the browser. Five Blender primitives, four verbs and a handful of
field rules grow everything; nothing is placed by hand.

**How it works, with live illustrations: [How the wood grows](docs/how-the-wood-grows.html).** GitHub shows that
file as source, so open it from a checkout, or at `http://localhost:5199/docs/how-the-wood-grows.html` while the
dev server runs.

## Run

    npm install
    npx vite --host --port 5199 --strictPort   # dev server, reachable on the local network
    npm run build                              # production build into dist/ (about 2.0 MB)
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

## Where the frame goes

Measured on a Mac at 1792 x 1350, a frame is about 14 ms. Triangles are not the limit (the trees are 14 million a
frame and cutting most of them saves under 1 ms); filling pixels is. So the fog is marched at half size and laid
over the scene by depth, the bloom runs at half size, and the sun's shadow map is redrawn every other frame.
Before those three the same frame took 24 ms.

## Not yet checked

- Frame rate on a real phone. On a Mac it is about 70 fps at 1195 x 900; Chrome's phone emulation (390 x 844, touch, CPU slowed 4x)
  holds that at the 1.25 pixel ratio, which clears the script side but says nothing about a phone's GPU.
- The moon's disc itself: the canopy hid it wherever it was looked for. Moonlight, stars and dusk are checked.
