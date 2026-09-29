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

const fixture = fileURLToPath(new URL("../fixtures/nuxt-host", import.meta.url));
const roots: string[] = [];
async function put(root: string, file: string, text: string) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), text);
}
type Options = {
  /** "nuxt4" is the on-disk fixture (app/); "nuxt3" is built in memory with app.vue and pages/ at the root. */
  layout?: "nuxt4" | "nuxt3" | "none"; nuxt?: string; installedNuxt?: string; vue?: string; toolkit?: boolean; config?: string;
  mutate?: (pkg: Record<string, any>) => void;
};
/** A Nuxt host with the installed dependency stubs `flute init` inspects (no network, no npm). */
async function host(options: Options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "flute-nuxt-"));
  roots.push(root);
  const layout = options.layout ?? "nuxt4";
  if (layout === "nuxt4") await cp(fixture, root, { recursive: true });
  else {
    await put(root, "package.json", "{}");
    await put(root, "nuxt.config.ts", "export default defineNuxtConfig({ devtools: { enabled: false } });\n");
    if (layout === "nuxt3") {
      await put(root, "app.vue", "<template><NuxtPage /></template>\n");
      await put(root, "pages/index.vue", "<template><main>Existing Nuxt 3 host</main></template>\n");
    } else await put(root, "app.vue", "<template><main>A single-page app with the router off</main></template>\n");
  }
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  pkg.name = "nuxt-host"; pkg.private = true;
  pkg.dependencies = { nuxt: options.nuxt ?? (layout === "nuxt3" ? "3.21.10" : "4.5.2"), vue: "3.5.22" };
  if (options.toolkit !== false) pkg.dependencies["@webprodigies/flute"] = "0.1.2";
  options.mutate?.(pkg);
  await writeFile(path.join(root, "package.json"), JSON.stringify(pkg, null, 2));
  if (options.config !== undefined) await put(root, "nuxt.config.ts", options.config);
  await put(root, "node_modules/vue/package.json", JSON.stringify({ name: "vue", version: options.vue ?? "3.5.22" }));
  if (options.installedNuxt) await put(root, "node_modules/nuxt/package.json", JSON.stringify({ name: "nuxt", version: options.installedNuxt }));
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
function failure(value: Awaited<ReturnType<typeof run>>, code: string) {
  expect(value).toMatchObject({ success: false, issues: [{ code }] });
  if (value.success) throw Error("unreachable");
  return value.issues[0];
}
async function scene(root: string, id = "one") {
  await put(root, `src/flute/scenes/${id}.scene.json`, JSON.stringify({ version: 1, id, title: id, definition: { scene: { nodes: [{ id: "ui" }] } } }));
  await put(root, `src/flute/scenes/${id}.vue`, "<template><div/></template>");
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("Nuxt host detection and setup", () => {
  it("detects Nuxt 4 (app/ srcDir), writes only the /flute page and FLUTE.md and touches no host source", async () => {
    const root = await host();
    const watched = ["package.json", "nuxt.config.ts", "app/app.vue", "app/pages/index.vue"];
    const before = Object.fromEntries(await Promise.all(watched.map(async file => [file, await readFile(path.join(root, file), "utf8")])));
    const first = success(await run(root));
    expect(first.changed).toBe(true);
    expect(first.project).toMatchObject({ adapter: "nuxt", entry: "app/pages/flute.vue", packageManager: "npm" });
    expect(first.integration).toMatchObject({ kind: "nuxt", component: "app/pages/flute.vue", route: "/flute" });
    expect(first.integration!.instructions).toContain("development only");
    expect(first.integration!.instructions).not.toContain("host step remains");
    expect(first.handoff!.path).toBe("FLUTE.md");
    for (const [file, text] of Object.entries(before)) expect(await readFile(path.join(root, file), "utf8"), file).toBe(text);
    expect((await readdir(path.join(root, ".flute"))).sort()).toEqual(["integration.json", "project.json"]);
    expect((await readdir(path.join(root, "app/pages"))).sort()).toEqual(["flute.vue", "index.vue"]);
    expect(await readdir(root)).not.toContain("src");
    const page = await readFile(path.join(root, "app/pages/flute.vue"), "utf8");
    expect(page).toContain("throw createError({ statusCode: 404");
    expect(page).toContain("if (!import.meta.dev)");
    expect(page).toContain("<ClientOnly>");
    expect(page).toContain("useHead");
    expect(page).toContain(`content: ${JSON.stringify(first.project!.projectId)}`);
    expect(page).toContain('import("@webprodigies/flute/vue/preview")');
    expect(page).toContain('import.meta.glob("../../src/flute/scenes/*.{scene.json,vue}")');
    expect(page).toContain("enabled active");
    // The generated key rewrite must survive template-literal escaping: run it on real glob keys.
    const rekey = /path\.replace\((\/.*\/), ""\)/.exec(page)![1];
    const pattern = new Function(`return ${rekey}`)() as RegExp;
    expect("../../src/flute/scenes/one.scene.json".replace(pattern, "")).toBe("src/flute/scenes/one.scene.json");
    expect("../src/flute/scenes/one.vue".replace(pattern, "")).toBe("src/flute/scenes/one.vue");
    // Production keeps the studio and every scene out of the bundle: both sit behind import.meta.dev.
    expect(page).toContain("import.meta.dev ? import.meta.glob(");
    expect(page).not.toMatch(/^import .*@webprodigies\/flute/m);
    const handoff = await readFile(path.join(root, "FLUTE.md"), "utf8");
    expect(handoff).toContain("Nuxt 3/4 project");
    expect(handoff).toContain("@webprodigies/flute/vue/preview");
    expect(success(await run(root)).changed).toBe(false);
    expect(success(await run(root, "validate-project")).project).toEqual(first.project);
    expect(success(await run(root, "load-project")).project).toEqual(first.project);
  });

  it("detects the Nuxt 3 layout (app.vue and pages/ at the root) and uses a one-level relative glob", async () => {
    const root = await host({ layout: "nuxt3" });
    const { project } = success(await run(root));
    expect(project).toMatchObject({ adapter: "nuxt", entry: "pages/flute.vue" });
    expect(await readFile(path.join(root, "pages/flute.vue"), "utf8")).toContain('import.meta.glob("../src/flute/scenes/*.{scene.json,vue}")');
    success(await run(root, "validate-project"));
  });

  it("honors a static srcDir in nuxt.config and falls back to existing directories for a dynamic one", async () => {
    const custom = await host({ layout: "none", config: 'export default defineNuxtConfig({ srcDir: "client/" });\n' });
    await put(custom, "client/pages/index.vue", "<template><main /></template>");
    expect(success(await run(custom)).project).toMatchObject({ entry: "client/pages/flute.vue" });
    expect(await readFile(path.join(custom, "client/pages/flute.vue"), "utf8")).toContain('import.meta.glob("../../src/flute/scenes/');
    const dynamic = await host({ layout: "nuxt3", config: 'export default defineNuxtConfig({ srcDir: process.env.SRC ?? "." });\n' });
    expect(success(await run(dynamic)).project).toMatchObject({ entry: "pages/flute.vue" });
    const dynamicApp = await host({ config: "const dir = 'app';\nexport default defineNuxtConfig({ srcDir: dir });\n" });
    expect(success(await run(dynamicApp)).project).toMatchObject({ entry: "app/pages/flute.vue" });
  });

  it("supports --adapter nuxt and rejects --adapter vue/react in a Nuxt app", async () => {
    const root = await host();
    expect(await run(root, "init-project", { adapter: "vue" })).toMatchObject({ success: false, issues: [{ code: "unsupported-project", message: expect.stringContaining("This is a Nuxt app") }] });
    expect(await run(root, "init-project", { adapter: "react" })).toMatchObject({ success: false, issues: [{ code: "unsupported-project" }] });
    expect(await readdir(root)).not.toContain(".flute");
    expect(success(await run(root, "init-project", { adapter: "nuxt" })).project!.adapter).toBe("nuxt");
    expect(await run(await host({ layout: "nuxt3", mutate: pkg => { delete pkg.dependencies.nuxt; } }), "init-project", { adapter: "nuxt" })).toMatchObject({ success: false, issues: [{ code: "unsupported-project" }] });
  });

  it.each([
    ["a declared ^2 range", { nuxt: "^2.18.1" }],
    ["a declared 2.x tag", { nuxt: "2.x" }],
    ["an installed nuxt 2", { nuxt: "latest", installedNuxt: "2.18.1" }],
  ])("refuses Nuxt 2 through %s before any write", async (_name, options) => {
    const root = await host(options);
    const issue = failure(await run(root), "unsupported-project");
    expect(issue.message).toContain("Nuxt 2 is not supported");
    expect(issue.message).toContain("Nuxt 3 and Nuxt 4");
    expect(await readdir(root)).not.toContain(".flute");
    expect(await readdir(root)).not.toContain("FLUTE.md");
    expect(await readdir(path.join(root, "app/pages"))).toEqual(["index.vue"]);
  });

  it.each(["^3.21.0", "~4.0.0", ">=3.14", "npm:nuxt-nightly@4.x", "latest"])("accepts a declared nuxt %s", async nuxt => {
    expect(success(await run(await host({ nuxt }))).project!.adapter).toBe("nuxt");
  });

  it("refuses an app with no pages directory instead of switching the router on", async () => {
    for (const root of [await host({ layout: "none" }), await host({ layout: "none", config: "export default defineNuxtConfig({ pages: false });\n" })]) {
      const issue = failure(await run(root), "unsupported-project");
      expect(issue.message).toContain("no pages/ directory");
      expect(issue.message).toContain("switch it on");
      expect(await readdir(root)).not.toContain(".flute");
      expect(await readdir(root)).not.toContain("pages");
    }
    // Nuxt 4 with app/app.vue only: the message names app/pages, and root pages/ is not silently used.
    const app4 = await host({ layout: "none" });
    await put(app4, "app/app.vue", "<template><main /></template>");
    await put(app4, "pages/index.vue", "<template><main /></template>");
    expect(failure(await run(app4), "unsupported-project").message).toContain("no app/pages/ directory");
    // An empty pages directory does not enable the router either.
    const empty = await host({ layout: "none" });
    await mkdir(path.join(empty, "pages"));
    failure(await run(empty), "unsupported-project");
    // pages: true opts the router in explicitly, so the page may create the directory.
    const explicit = await host({ layout: "none", config: "export default defineNuxtConfig({ pages: true });\n" });
    expect(success(await run(explicit)).project).toMatchObject({ entry: "pages/flute.vue" });
  });

  it.each([
    ["app/pages/flute.vue"], ["app/pages/flute/index.vue"], ["app/pages/flute.ts"], ["app/pages/flute.md"], ["app/pages/flute/index.tsx"],
  ])("refuses to overwrite or shadow an existing %s", async existing => {
    const root = await host();
    await put(root, existing, "<template><main>mine</main></template>");
    failure(await run(root), "conflict");
    expect(await readFile(path.join(root, existing), "utf8")).toContain("mine");
    expect(await readdir(root)).not.toContain("FLUTE.md");
  });

  it.each(["3.4.38", "2.7.16"])("rejects an incompatible installed Vue %s before writes", async vue => {
    const root = await host({ vue });
    failure(await run(root), "missing-installation");
    expect(await readdir(root)).not.toContain(".flute");
  });

  it("requires the installed toolkit to expose the Vue preview entry", async () => {
    const root = await host();
    await put(root, "node_modules/@webprodigies/flute/package.json", JSON.stringify({ name: "@webprodigies/flute", exports: { "./preview": { import: "./preview.js" } } }));
    failure(await run(root), "missing-installation");
  });

  it("refuses an edited generated page and an unrelated FLUTE.md", async () => {
    const root = await host();
    await put(root, "FLUTE.md", "mine");
    failure(await run(root), "conflict");
    await rm(path.join(root, "FLUTE.md"));
    success(await run(root));
    await put(root, "app/pages/flute.vue", "edited");
    failure(await run(root, "validate-project"), "conflict");
  });

  it("recovers an interrupted init without replacing existing files", async () => {
    const root = await host();
    const actual = services.atomicWrite;
    let failed = false;
    vi.spyOn(services, "atomicWrite").mockImplementation(async (...args) => {
      if (args[1] === "app/pages/flute.vue" && !failed) { failed = true; throw Error("interrupted"); }
      return actual(...args);
    });
    expect((await run(root)).success).toBe(false);
    success(await run(root));
    success(await run(root, "validate-project"));
  });

  it("keeps Nuxt setup independent of the Vue wrap check", async () => {
    const root = await host();
    success(await run(root));
    // No App.vue wrap exists or is needed: validate must not demand one.
    expect(success(await run(root, "validate-project")).project!.adapter).toBe("nuxt");
  });
});

describe("Nuxt scenes", () => {
  it("lists .scene.json + .vue pairs, loads them and syncs without writing a catalog", async () => {
    const root = await host();
    success(await run(root));
    await scene(root, "one");
    await scene(root, "two");
    const list = await executeRecipeCommand("list-scenes", {}, { root });
    expect(list).toMatchObject({ success: true, data: { issues: [] } });
    if (!list.success) throw Error("unreachable");
    expect(list.data.scenes.map(item => [item.id, item.binding])).toEqual([["one", "src/flute/scenes/one.vue"], ["two", "src/flute/scenes/two.vue"]]);
    const before = await readdir(path.join(root, "app/pages"));
    expect(success(await run(root, "sync-project")).changed).toBe(false);
    expect(await readdir(path.join(root, "app/pages"))).toEqual(before);
    expect((await runCli(["scenes", "--project", root], { root })).stdout).toContain("two\ttwo");
    await rm(path.join(root, "src/flute/scenes/one.vue"));
    expect(await run(root, "sync-project")).toMatchObject({ success: false, issues: [{ code: "invalid-scenes" }] });
  });
});

describe("Nuxt open and CLI", () => {
  const serverHtml = (id: string) => `<!DOCTYPE html><html><head><meta name="flute-project" content="${id}"></head><body><div id="__nuxt"></div></body></html>`;
  it("verifies the SSR meta of /flute?flute-preview=1 before opening and never accepts another project", async () => {
    const root = await host();
    const { project } = success(await run(root));
    const fetched: string[] = [];
    vi.spyOn(services, "fetchText").mockImplementation(async url => { fetched.push(url); return serverHtml(project!.projectId); });
    const opened = success(await run(root, "open-preview", { url: "http://127.0.0.1:3000", launch: false }));
    expect(opened.url).toBe("http://127.0.0.1:3000/flute?flute-preview=1");
    expect(fetched).toEqual(["http://127.0.0.1:3000/flute?flute-preview=1"]);
    vi.spyOn(services, "fetchText").mockResolvedValue(serverHtml("11111111-1111-4111-8111-111111111111"));
    failure(await run(root, "open-preview", { url: "http://127.0.0.1:3000", launch: false }), "wrong-dev-server");
    vi.spyOn(services, "fetchText").mockResolvedValue("<html>404</html>");
    failure(await run(root, "open-preview", { url: "http://127.0.0.1:3000", launch: false }), "wrong-dev-server");
  });

  it("explains a missing dev server and opens a selected scene with its deep link", async () => {
    const root = await host();
    const { project } = success(await run(root));
    await scene(root);
    vi.spyOn(services, "fetchText").mockRejectedValue(new Error("ECONNREFUSED"));
    const missing = failure(await run(root, "open-preview", { url: "http://127.0.0.1:3000", launch: false }), "missing-dev-server");
    expect(missing.message).toContain("npm run dev");
    vi.spyOn(services, "fetchText").mockResolvedValue(serverHtml(project!.projectId));
    const result = await executeRecipeCommand("open-scene", { sceneId: "one", url: "http://127.0.0.1:3000", launch: false }, { root });
    expect(result).toMatchObject({ success: true, data: { url: "http://127.0.0.1:3000/flute?flute-preview=1&flute-scene=one" } });
  });

  it("runs init end to end through the CLI with Nuxt onboarding and help", async () => {
    const root = await host();
    const result = await runCli(["init", "--project", root], { root, terminal: { interactive: false } });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("Detected Nuxt · Vue 3");
    expect(result.stdout).toContain("/flute");
    expect(result.stdout).toContain("Ready. Your first scene starts with a prompt.");
    const help = (await runCli(["--help"], { root })).stdout;
    expect(help).toContain("--adapter auto|react|vue|nuxt");
    expect(help).toContain("Nuxt 3/4");
    const refused = await runCli(["init", "--project", await host({ nuxt: "^2.18.1" })], { root });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("Nuxt 2 is not supported");
  });

  it("teaches Nuxt in the installed authoring guide", () => {
    const vue = (getAuthoringGuide().capabilities.api as { vue: Record<string, string> }).vue;
    expect(vue.nuxt).toContain("/flute");
    expect(vue.nuxt).toContain("Nuxt 2 is refused");
    expect(vue.contract).toContain("Nuxt 3/4");
    expect(vue.contract).not.toContain("not supported");
  });
});
