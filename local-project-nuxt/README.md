# Nuxt local project

The Nuxt 4 counterpart of `local-project-vue/`: an explicitly separate host for reviewing Flute's Nuxt setup with real interactive UI. It is not bundled with the package. The Orbit dashboard is plain Vue single-file components (in `app/components/`) whose data comes from `public/metrics.json` through `provide`/`inject`.

From the repository root run `npm run build && npm run setup:local:nuxt`, then `npm run dev --prefix local-project-nuxt` (or `cd local-project-nuxt && npm run dev`). Setup packs the library, installs it here and runs `flute init`, which generated `app/pages/flute.vue`, `FLUTE.md` and `.flute/`. Nothing else in the app changes: there is no wrap step.

Open `/flute` for the scene library. That page exists only in development (`nuxt build` + `nuxt preview` answers 404) and renders only the scene library, like the Next.js studio; `/` is the original dashboard.

Each scene is a versioned `.scene.json` recipe plus a matching `.vue` component in `src/flute/scenes/` (at the project root, not under `app/`): `overview`, `customer-focus` (both wrap the whole dashboard through `~/components/WholeScene.vue`) and `plating` (`~/components/PlatingScene.vue`: the dashboard backdrop in the named `content` slot and five live regions as separate depth layers). Scenes import app components through the `~` alias. Change the JSON to adjust camera, focus and motion; add another file pair to add a scene. The page's Vite glob discovers pairs, so nothing else registers them.

Try the CLI from this directory once the dev server runs (default `http://127.0.0.1:3000`):

```sh
npx flute scenes
npx flute validate
npx flute open --scene plating --url http://127.0.0.1:3000 --no-open
npx flute export --url "http://127.0.0.1:3000/flute?flute-preview=1&flute-scene=plating" --output plating.mp4 --fps 30
```

Export needs Playwright Chromium and FFmpeg on your PATH, and a new output filename. Generated `.mp4` files are not committed.
