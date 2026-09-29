# Vue local project

The Vue counterpart of `local-project/`: an explicitly separate host for reviewing Flute's native Vue 3 adapter with real interactive UI. It is not bundled with the package. The Orbit dashboard is plain Vue single-file components whose data comes from `public/metrics.json` through `provide`/`inject`.

From the repository root run `npm run build && npm run setup:local:vue`, then `npm run dev --prefix local-project-vue` (or `cd local-project-vue && npm run dev`). Setup packs the library, installs it here and runs `flute init`, which generated `src/flute/ProjectPreview.vue`, `FLUTE.md` and `.flute/`. `src/App.vue` contains the single wrap step. Open the app with `?flute-preview=1` for the scene library; without that query it is the original dashboard.

Each scene is a versioned `.scene.json` recipe plus a matching `.vue` component in `src/flute/scenes/`: `overview`, `customer-focus` (both wrap the whole dashboard through `components/WholeScene.vue`) and `plating` (`components/PlatingScene.vue`: the dashboard backdrop in the named `content` slot and five live regions as separate depth layers). Change the JSON to adjust camera, focus and motion; add another file pair to add a scene. Vite's glob discovers pairs, so nothing else registers them.

Try the CLI from this directory once the dev server runs (default `http://127.0.0.1:5173`):

```sh
npx flute scenes
npx flute validate
npx flute open --scene plating --url http://127.0.0.1:5173 --no-open
npx flute export --url "http://127.0.0.1:5173/?flute-preview=1&flute-scene=plating" --output plating.mp4 --fps 30
```

Export needs Playwright Chromium and FFmpeg on your PATH, and a new output filename. Generated `.mp4` files are not committed.
