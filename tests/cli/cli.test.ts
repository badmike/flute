import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/project/commands", () => ({executeProjectCommand: vi.fn()}));
import { runCli } from "../../src/cli";
import type { ProjectResult } from "../../src/core";
import { FLUTE_BRAND } from "../../src/core/branding";
import { RESOURCES } from "../../src/core/resources";
const ready: ProjectResult = {success:true,data:{project:{version:1,projectId:"00000000-0000-4000-8000-000000000000",entry:"src/main.tsx",packageManager:"npm"}}};
const context = {root:"/project"};
describe("CLI adapter", () => {
  it("has side-effect-free help", async () => {
    const execute = vi.fn();
    const help = (await runCli(["--help"], context, execute)).stdout;
    for (const text of ["npx flute init", FLUTE_BRAND.title, FLUTE_BRAND.url, "--package is optional", "FLUTE.md"])
      expect(help).toContain(text);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([["wat"],["init","--wat"],["init","--project"],["init","--url","--json"],["init","--json","--json"],["init","--no-open"],["validate","--package","x"],["load","--url","x"]])("rejects malformed args %j before executing", async (...args) => {
    const execute=vi.fn();
    expect((await runCli(args,context,execute)).code).toBe(2);
    expect(execute).not.toHaveBeenCalled();
  });
  it("initializes then opens through the same command boundary", async () => {
    const execute=vi.fn().mockResolvedValueOnce(ready).mockResolvedValueOnce({success:true,data:{url:"http://127.0.0.1:6199/?flute-preview=1"}});
    const r=await runCli(["init","--project","/host","--package","/tmp/pkg.tgz","--url","http://127.0.0.1:6199","--no-open","--json"],context,execute);
    expect(execute.mock.calls).toEqual([
      ["init-project",{packageSource:"/tmp/pkg.tgz"},{root:"/host"}],
      ["open-preview",{url:"http://127.0.0.1:6199",launch:false},{root:"/host"}],
    ]);
    expect(r.code).toBe(0);expect(JSON.parse(r.stdout).data.url).toContain("flute-preview");
  });
  it("does not open after failed init", async () => {
    const execute=vi.fn().mockResolvedValue({success:false,issues:[{code:"unsupported",message:"Use a Vite React project."}]});
    const r=await runCli(["init","--url","http://127.0.0.1:1234"],context,execute);
    expect(execute).toHaveBeenCalledTimes(1);expect(r.code).toBe(1);expect(r.stderr).toContain("Use a Vite");
  });
  it("uses configured port and passes validation to trusted operation", async () => {
    const execute=vi.fn().mockResolvedValue(ready);
    await runCli(["open","--no-open"],{...context,port:"62123"},execute);
    expect(execute).toHaveBeenCalledWith("open-preview",{url:"http://127.0.0.1:62123",launch:false},context);
  });
  it("loads without starting a preview", async () => {
    const execute=vi.fn().mockResolvedValue(ready);
    expect((await runCli(["load"],context,execute)).code).toBe(0);
    expect(execute).toHaveBeenCalledWith("load-project",{},context);
  });
  it("reports an unexpected failure without dumping credentials", async () => {
    const execute=vi.fn().mockRejectedValue(new Error("secret value"));
    const r=await runCli(["init"],context,execute);
    expect(r.code).toBe(1);expect(r.stderr).not.toContain("secret value");
  });
});

describe("agent onboarding CLI", () => {
  const handoff = { path: "FLUTE.md" as const, guideCommand: "npx flute guide --json" as const,
    guideVersion: RESOURCES["authoring-guide"]().version,
    prompt: "Read FLUTE.md and run npx flute guide --json. Animate this host page: <page route or component path>." };
  const initialized: ProjectResult = { success: true, data: { ...ready.success && ready.data, changed: true, handoff } };
  it("prints the exact command-owned prompt for a locally installed package", async () => {
    const execute = vi.fn().mockResolvedValue(initialized);
    const result = await runCli(["init"], context, execute);
    expect(execute).toHaveBeenCalledExactlyOnceWith("init-project", {}, context);
    expect(result.code).toBe(0);
    for (const text of [handoff.prompt, FLUTE_BRAND.title, FLUTE_BRAND.url, "npm run dev", "npx flute open", "replace <page route or component path>"])
      expect(result.stdout).toContain(text);
  });
  it("preserves handoff metadata when init also opens the preview", async () => {
    const execute = vi.fn().mockResolvedValueOnce(initialized).mockResolvedValueOnce({ success: true, data: { url: "http://localhost:5173/?flute-preview=1" } });
    const result = await runCli(["init", "--url", "http://localhost:5173", "--no-open", "--json"], context, execute);
    expect(JSON.parse(result.stdout).data).toMatchObject({ handoff, changed: true, url: "http://localhost:5173/?flute-preview=1" });
    expect(result.stdout).not.toContain(FLUTE_BRAND.title);
  });
  it("keeps completed onboarding visible when the existing server is unavailable", async () => {
    const execute = vi.fn().mockResolvedValueOnce(initialized).mockResolvedValueOnce({ success: false, issues: [{ code: "missing-dev-server", message: "Run npm run dev and retry." }] });
    const result = await runCli(["init", "--url", "http://localhost:5173"], context, execute);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(handoff.prompt);
    expect(result.stderr).toContain("Run npm run dev");
  });
  it("prints file conflicts with their actionable path and keeps JSON canonical", async () => {
    const failure = { success: false, issues: [{ code: "conflict", path: "FLUTE.md", message: "Move or rename the document and retry." }] };
    const execute = vi.fn().mockResolvedValue(failure);
    const human = await runCli(["init"], context, execute);
    expect(human.stderr).toContain("conflict (FLUTE.md): Move or rename");
    expect(human.stdout).toBe("");
    const json = await runCli(["init", "--json"], context, execute);
    expect(JSON.parse(json.stderr)).toEqual(failure);
  });
  it("prints brand on the human guide while returning the canonical guide as JSON", async () => {
    const human = await runCli(["guide"], context);
    expect(human.stdout).toContain(FLUTE_BRAND.title);
    expect(human.stdout).toContain(FLUTE_BRAND.url);
    const json = await runCli(["guide", "--json"], context);
    expect(JSON.parse(json.stdout)).toEqual(RESOURCES["authoring-guide"]());
  });
});

describe("video CLI", () => {
  it("routes video options to the trusted exporter", async () => {
    const execute = vi.fn();
    const exporter = vi.fn().mockResolvedValue({success:true,data:{output:"clip.mp4",fps:120,frames:12,durationMs:100}});
    const result = await runCli(["export","--url","http://localhost:1234/scene?capture=1","--output","clip.mp4","--fps","120","--width","640","--height","480","--json"],context,execute,exporter);
    expect(exporter).toHaveBeenCalledWith({url:"http://localhost:1234/scene?capture=1",output:"clip.mp4",fps:120,width:640,height:480},context);
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(result.stdout).data.fps).toBe(120);
  });
  it("reports canonical export failures and rejects incomplete arguments", async () => {
    const exporter = vi.fn().mockResolvedValue({success:false,issues:[{code:"missing-ffmpeg",message:"Install FFmpeg."}]});
    expect((await runCli(["export","--url","http://localhost","--output","clip.mp4"],context,vi.fn(),exporter)).stderr).toContain("Install FFmpeg");
    exporter.mockClear();
    expect((await runCli(["export","--url","http://localhost"],context,vi.fn(),exporter)).code).toBe(2);
    expect(exporter).not.toHaveBeenCalled();
  });
});

it('routes snapshot arguments through the shared operation and preserves validation failures',async()=>{
 const snapshotter=vi.fn().mockResolvedValue({success:true,data:{sceneId:'demo',source:'src/flute/scenes/demo.scene.json',timeMs:100}});
 const result=await runCli(['snapshot','--scene','demo','--url','http://localhost:5173','--time','100','--json'],{root:'/project'},undefined,undefined,undefined,snapshotter);
 expect(result.code).toBe(0);expect(snapshotter).toHaveBeenCalledWith({sceneId:'demo',url:'http://localhost:5173',timeMs:100},{root:'/project'});
 expect((await runCli(['snapshot','--scene','demo'],{root:'/project'})).code).toBe(2);
 snapshotter.mockResolvedValue({success:false,issues:[{code:'source-changed',message:'Retry after editing.'}]});
 expect((await runCli(['snapshot','--scene','demo','--url','http://localhost:5173'],{root:'/project'},undefined,undefined,undefined,snapshotter)).stderr).toContain('Retry after editing.');
});

it("routes portable init and registry sync through canonical commands",async()=>{
 const execute=vi.fn().mockResolvedValue(ready);
 await runCli(["init","--adapter","react"],context,execute);
 await runCli(["sync"],context,execute);
 expect(execute.mock.calls).toEqual([["init-project",{adapter:"react"},context],["sync-project",{},context]]);
 expect((await runCli(["sync","--adapter","react"],context,execute)).code).toBe(2);
});

it("routes the Vue adapter and validates it only for init",async()=>{
 const execute=vi.fn().mockResolvedValue(ready);
 await runCli(["init","--adapter","vue"],context,execute);
 expect(execute.mock.calls).toEqual([["init-project",{adapter:"vue"},context]]);
 expect((await runCli(["open","--adapter","vue"],context,execute)).code).toBe(2);
 expect((await runCli(["--help"],context,execute)).stdout).toContain("[--adapter auto|react|vue]");
});
it("presents the Vue connection instructions without React wording",async()=>{
 const vue:ProjectResult={success:true,data:{
  project:{version:1,projectId:"00000000-0000-4000-8000-000000000000",entry:"src/flute/ProjectPreview.vue",packageManager:"npm",adapter:"vue"},changed:true,
  integration:{kind:"vue",component:"src/flute/ProjectPreview.vue",instructions:"Wrap the root in <FluteProjectPreview>."},
 }};
 const human=await runCli(["init","--adapter","vue"],context,vi.fn().mockResolvedValue(vue));
 expect(human.stdout).toContain("Detected Vue · Vite");
 expect(human.stdout).toContain("src/flute/ProjectPreview.vue");
 expect(human.stdout).toContain("Wrap the root in <FluteProjectPreview>.");
 expect(human.stdout).not.toContain("Detected React");
 const json=await runCli(["init","--adapter","vue","--json"],context,vi.fn().mockResolvedValue(vue));
 expect(JSON.parse(json.stdout).data.project.adapter).toBe("vue");
});

describe("runtime mount check after open", () => {
  const opened: ProjectResult = { success: true, data: { url: "http://127.0.0.1:5173/?flute-preview=1" } };
  const noRecipes = vi.fn(), noExport = vi.fn(), noSnapshot = vi.fn();
  it("fails open with an actionable message when the wrap loads but the studio never mounts", async () => {
    const prober = vi.fn().mockResolvedValue("not-mounted");
    const r = await runCli(["open", "--no-open"], context, vi.fn().mockResolvedValue(opened), noExport, noRecipes, noSnapshot, prober);
    expect(prober).toHaveBeenCalledWith({ url: "http://127.0.0.1:5173/?flute-preview=1" }, context);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("The wrap is present but not enabled");
    expect(r.stderr).toContain("import.meta.env.DEV");
  });
  it.each(["mounted", "unavailable"])("keeps a verified open successful when the probe reports %s", async state => {
    const r = await runCli(["open", "--no-open"], context, vi.fn().mockResolvedValue(opened), noExport, noRecipes, noSnapshot, vi.fn().mockResolvedValue(state));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("flute-preview=1");
  });
  it("keeps open successful when the probe itself throws", async () => {
    const r = await runCli(["open", "--no-open"], context, vi.fn().mockResolvedValue(opened), noExport, noRecipes, noSnapshot, vi.fn().mockRejectedValue(new Error("boom")));
    expect(r.code).toBe(0);
  });
  it("probes the library, not the selected scene, for open --scene", async () => {
    const prober = vi.fn().mockResolvedValue("not-mounted");
    const recipes = vi.fn().mockResolvedValue({ success: true, data: { scenes: [], issues: [], url: "http://127.0.0.1:5173/?flute-preview=1&flute-scene=demo" } });
    const r = await runCli(["open", "--scene", "demo", "--no-open"], context, vi.fn(), noExport, recipes, noSnapshot, prober);
    expect(prober).toHaveBeenCalledWith({ url: "http://127.0.0.1:5173/?flute-preview=1" }, context);
    expect(r.code).toBe(1);
  });
  it("checks after init --url opens the preview, and never after a failed open", async () => {
    const prober = vi.fn().mockResolvedValue("not-mounted");
    const execute = vi.fn().mockResolvedValueOnce(ready).mockResolvedValueOnce(opened);
    expect((await runCli(["init", "--url", "http://127.0.0.1:5173", "--no-open"], context, execute, noExport, noRecipes, noSnapshot, prober)).code).toBe(1);
    const failing = vi.fn().mockResolvedValue({ success: false, issues: [{ code: "missing-connection", message: "wrap it" }] });
    const skipped = vi.fn();
    const r = await runCli(["open", "--no-open"], context, failing, noExport, noRecipes, noSnapshot, skipped);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("missing-connection");
    expect(skipped).not.toHaveBeenCalled();
  });
});
