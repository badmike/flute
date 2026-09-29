import { afterEach, describe, expect, it, vi } from "vitest";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeProjectCommand as command } from "../../src/project/commands";
import { executeRecipeCommand } from "../../src/project/recipes";
import * as services from "../../src/project/services";
import { runCli } from "../../src/cli";
import { getAuthoringGuide } from "../../src/core/authoring";

const fixture = fileURLToPath(new URL("../fixtures/vue-host", import.meta.url));
const roots: string[] = [];
async function put(root: string, file: string, text: string) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), text);
}
/** A Vue host with the installed dependency stubs `flute init` inspects (no network, no npm). */
async function host(options: { vue?: string; toolkit?: boolean; mutate?: (pkg: Record<string, any>) => void } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "flute-vue-"));
  roots.push(root);
  await cp(fixture, root, { recursive: true });
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (options.toolkit !== false) pkg.dependencies["@webprodigies/flute"] = "0.1.2";
  options.mutate?.(pkg);
  await writeFile(path.join(root, "package.json"), JSON.stringify(pkg, null, 2));
  await put(root, "node_modules/vue/package.json", JSON.stringify({ name: "vue", version: options.vue ?? "3.5.22" }));
  if (options.toolkit !== false) {
    await put(root, "node_modules/@webprodigies/flute/package.json", JSON.stringify({ name: "@webprodigies/flute", exports: { "./vue/preview": { import: "./vue-preview.js" } } }));
    await put(root, "node_modules/@webprodigies/flute/vue-preview.js", "export {}");
  }
  return root;
}
const run = (root: string, operation = "init-project", input: unknown = {}) => command(operation, input, { root });
function success(value: Awaited<ReturnType<typeof run>>) {
  expect(value, JSON.stringify(value)).toHaveProperty("success", true);
  if (!value.success) throw Error(JSON.stringify(value));
  return value.data;
}
async function scene(root: string, id = "one", extension = "vue") {
  await put(root, `src/flute/scenes/${id}.scene.json`, JSON.stringify({ version: 1, id, title: id, definition: { scene: { nodes: [{ id: "ui" }] } } }));
  await put(root, `src/flute/scenes/${id}.${extension}`, "<template><div/></template>");
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("Vue host connection", () => {
  it("detects a Vue + Vite host, writes only additive files and never rewrites host sources", async () => {
    const root = await host();
    const before = Object.fromEntries(await Promise.all(["package.json", "index.html", "vite.config.ts", "src/main.ts", "src/App.vue"].map(async file => [file, await readFile(path.join(root, file), "utf8")])));
    const first = success(await run(root));
    expect(first.changed).toBe(true);
    expect(first.project).toMatchObject({ adapter: "vue", entry: "src/flute/ProjectPreview.vue", packageManager: "npm" });
    expect(first.integration).toMatchObject({ kind: "vue", component: "src/flute/ProjectPreview.vue" });
    expect(first.integration!.instructions).toContain("<FluteProjectPreview");
    expect(first.integration!.instructions).toContain("<RouterView />");
    expect(first.handoff!.path).toBe("FLUTE.md");
    for (const [file, text] of Object.entries(before)) expect(await readFile(path.join(root, file), "utf8"), file).toBe(text);
    expect((await readdir(path.join(root, ".flute"))).sort()).toEqual(["integration.json", "project.json"]);
    // No generated catalog: Vite's glob discovers scene pairs.
    expect((await readdir(path.join(root, "src/flute"))).sort()).toEqual(["ProjectPreview.vue"]);
    const component = await readFile(path.join(root, "src/flute/ProjectPreview.vue"), "utf8");
    expect(component).toContain('from "@webprodigies/flute/vue/preview"');
    expect(component).toContain('import.meta.glob("/src/flute/scenes/*.{scene.json,vue}")');
    expect(component).toContain("import.meta.env.DEV");
    expect(component).toContain("import.meta.hot");
    expect(component).toContain(JSON.stringify(first.project!.projectId));
    expect(component).not.toContain("lang=\"ts\"");
    const handoff = await readFile(path.join(root, "FLUTE.md"), "utf8");
    expect(handoff).toContain("@webprodigies/flute/vue/preview");
    expect(handoff).toContain("<id>.vue");
    expect(handoff).not.toContain("`@webprodigies/flute/preview`");
    expect(success(await run(root)).changed).toBe(false);
    expect(success(await run(root, "validate-project")).project).toEqual(first.project);
  });

  it("supports --adapter vue and rejects an unknown adapter through the shared schema", async () => {
    const root = await host();
    expect(success(await run(root, "init-project", { adapter: "vue" })).project!.adapter).toBe("vue");
    expect(await run(await host(), "init-project", { adapter: "svelte" })).toMatchObject({ success: false, issues: [{ code: "invalid-input" }] });
  });

  it("prefers explicit --adapter vue over React signals, and react over Vue", async () => {
    const both = await host({ mutate: pkg => { pkg.dependencies.react = "19.1.0"; pkg.dependencies["react-dom"] = "19.1.0"; } });
    // Auto keeps React behavior when react-dom is present (fixture has no React setup, so it fails as React would).
    expect(await run(both)).toMatchObject({ success: false, issues: [{ code: expect.stringMatching(/unsupported-project|missing-installation/) }] });
    expect(success(await run(both, "init-project", { adapter: "vue" })).project!.adapter).toBe("vue");
    const explicitReact = await host();
    expect(await run(explicitReact, "init-project", { adapter: "react" })).toMatchObject({ success: false, issues: [{ code: "unsupported-project" }] });
  });

  it.each([
    ["without @vitejs/plugin-vue", (pkg: Record<string, any>) => { delete pkg.devDependencies["@vitejs/plugin-vue"]; }],
    ["without vite", (pkg: Record<string, any>) => { delete pkg.devDependencies.vite; }],
    ["with Nuxt", (pkg: Record<string, any>) => { pkg.dependencies.nuxt = "4.0.0"; }],
  ])("refuses a Vue host %s before any write", async (_name, mutate) => {
    const root = await host({ mutate });
    expect(await run(root, "init-project", { adapter: "vue" })).toMatchObject({ success: false, issues: [{ code: "unsupported-project" }] });
    expect(await readdir(root)).not.toContain(".flute");
    expect(await readdir(root)).not.toContain("FLUTE.md");
  });

  it.each(["3.4.38", "2.7.16"])("rejects an incompatible installed Vue %s before writes", async version => {
    const root = await host({ vue: version });
    expect(await run(root)).toMatchObject({ success: false, issues: [{ code: "missing-installation" }] });
    expect(await readdir(root)).not.toContain(".flute");
  });

  it("requires the installed toolkit to expose the Vue preview entry", async () => {
    const root = await host();
    await put(root, "node_modules/@webprodigies/flute/package.json", JSON.stringify({ name: "@webprodigies/flute", exports: { "./preview": { import: "./preview.js" } } }));
    expect(await run(root)).toMatchObject({ success: false, issues: [{ code: "missing-installation" }] });
  });

  it("refuses edited managed files and unrelated handoff documents", async () => {
    const root = await host();
    await put(root, "FLUTE.md", "mine");
    expect(await run(root)).toMatchObject({ success: false, issues: [{ code: "conflict" }] });
    await rm(path.join(root, "FLUTE.md"));
    success(await run(root));
    await put(root, "src/flute/ProjectPreview.vue", "edited");
    expect(await run(root, "validate-project")).toMatchObject({ success: false, issues: [{ code: "conflict" }] });
  });

  it("recovers an interrupted init without replacing existing files", async () => {
    const root = await host();
    const actual = services.atomicWrite;
    let failed = false;
    vi.spyOn(services, "atomicWrite").mockImplementation(async (...args) => {
      if (args[1] === "src/flute/ProjectPreview.vue" && !failed) { failed = true; throw Error("interrupted"); }
      return actual(...args);
    });
    expect((await run(root)).success).toBe(false);
    success(await run(root));
    success(await run(root, "validate-project"));
  });
});

describe("Vue scene bindings", () => {
  it("lists .scene.json + .vue pairs through discovery, load and CLI", async () => {
    const root = await host();
    success(await run(root));
    await scene(root, "one");
    await scene(root, "two", "vue");
    const list = await executeRecipeCommand("list-scenes", {}, { root });
    expect(list).toMatchObject({ success: true, data: { issues: [] } });
    if (!list.success) throw Error("unreachable");
    expect(list.data.scenes.map(item => [item.id, item.binding])).toEqual([["one", "src/flute/scenes/one.vue"], ["two", "src/flute/scenes/two.vue"]]);
    expect(await executeRecipeCommand("load-scene", { sceneId: "one" }, { root })).toMatchObject({ success: true, data: { selected: { id: "one", binding: "src/flute/scenes/one.vue" } } });
    const cli = await runCli(["scenes", "--project", root], { root });
    expect(cli.stdout).toContain("one\tone");
    expect(cli.stdout).toContain("two\ttwo");
  });

  it("syncs by validating the same catalog without writing one", async () => {
    const root = await host();
    success(await run(root));
    expect(success(await run(root, "sync-project")).changed).toBe(false);
    await scene(root);
    const before = await readdir(path.join(root, "src/flute"));
    expect(success(await run(root, "sync-project")).changed).toBe(false);
    expect(await readdir(path.join(root, "src/flute"))).toEqual(before);
    expect((await readdir(path.join(root, "src/flute"))).includes("catalog.js")).toBe(false);
    // An ambiguous .vue + .tsx pair and a missing binding both report invalid-scenes.
    await put(root, "src/flute/scenes/one.tsx", "export default () => null");
    expect(await run(root, "sync-project")).toMatchObject({ success: false, issues: [{ code: "invalid-scenes", message: expect.stringContaining("Keep only one JSX, TSX or Vue component") }] });
    await rm(path.join(root, "src/flute/scenes/one.tsx"));
    await rm(path.join(root, "src/flute/scenes/one.vue"));
    expect(await run(root, "sync-project")).toMatchObject({ success: false, issues: [{ code: "invalid-scenes", message: expect.stringContaining("Missing local component") }] });
  });

  it("does not execute or import binding source during discovery", async () => {
    const root = await host();
    success(await run(root));
    await scene(root);
    await put(root, "src/flute/scenes/one.vue", "<script setup>throw new Error('never executed')</script>");
    expect(success(await run(root, "sync-project")).changed).toBe(false);
  });
});

describe("Vue open and CLI", () => {
  it("verifies the dev server serves this project's generated component before opening", async () => {
    const root = await host();
    const { project } = success(await run(root));
    const fetched: string[] = [];
    vi.spyOn(services, "fetchText").mockImplementation(async url => {
      fetched.push(url);
      return `import { ProjectPreview } from "@webprodigies/flute/vue/preview"; const id = "${project!.projectId}";`;
    });
    const opened = success(await run(root, "open-preview", { url: "http://127.0.0.1:5173", launch: false }));
    expect(opened.url).toBe("http://127.0.0.1:5173/?flute-preview=1");
    expect(fetched).toEqual(["http://127.0.0.1:5173/src/flute/ProjectPreview.vue"]);
    vi.spyOn(services, "fetchText").mockResolvedValue("const other = 1;");
    vi.spyOn(services, "pause").mockResolvedValue(undefined);
    expect(await run(root, "open-preview", { url: "http://127.0.0.1:5173", launch: false })).toMatchObject({ success: false, issues: [{ code: "missing-dev-server" }] });
  });

  it("opens a selected scene with its deep link", async () => {
    const root = await host();
    const { project } = success(await run(root));
    await scene(root);
    vi.spyOn(services, "fetchText").mockResolvedValue(`ProjectPreview ${project!.projectId}`);
    const result = await executeRecipeCommand("open-scene", { sceneId: "one", url: "http://127.0.0.1:5173", launch: false }, { root });
    expect(result).toMatchObject({ success: true, data: { url: "http://127.0.0.1:5173/?flute-preview=1&flute-scene=one" } });
  });

  it("runs init end to end through the CLI with Vue onboarding", async () => {
    const root = await host();
    const result = await runCli(["init", "--adapter", "vue", "--project", root], { root, terminal: { interactive: false } });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("Detected Vue · Vite");
    expect(result.stdout).toContain("src/flute/ProjectPreview.vue");
    expect(result.stdout).toContain("FluteProjectPreview");
    expect(result.stdout).toContain("One connection left");
    const help = (await runCli(["--help"], { root })).stdout;
    expect(help).toContain("--adapter auto|react|vue");
    expect(help).toContain("Vue 3.5+");
  });

  it("teaches Vue in the installed authoring guide", () => {
    const guide = getAuthoringGuide();
    const vue = (guide.capabilities.api as { vue: Record<string, string> }).vue;
    expect(vue.contract).toContain("@webprodigies/flute/vue");
    expect(vue.components).toContain("#content");
    expect(vue.scenePair).toContain("<id>.vue");
  });
});
