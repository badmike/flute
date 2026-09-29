import { test, expect, type Page } from "@playwright/test";
import { cameraToCss, evaluateMotion, CameraSchema, type CaptureBridge } from "../../src/core";

// Browser parity: the Vue adapter must render the React adapter's DOM, styles, geometry and pixels
// for the same definition. Both pages are built from twin fixtures (tests/fixtures/focus*.{tsx,ts}).
const serialize = (page: Page) => page.evaluate(() => {
  const normalize = (value: string) => value.replace(/flute-focus-[A-Za-z0-9_-]+/g, "flute-focus-ID");
  const walk = (node: Node): unknown => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim() || undefined;
    if (!(node instanceof Element)) return undefined;
    const style = node instanceof HTMLElement || node instanceof SVGElement
      ? Object.fromEntries(Array.from(node.style).sort().map(key => [key, normalize(node.style.getPropertyValue(key))])) : {};
    const attributes = Object.fromEntries(Array.from(node.attributes).filter(a => a.name !== "style" && a.name !== "data-v-app").map(a => [a.name, normalize(a.value)]).sort());
    return { tag: node.tagName.toLowerCase(), attributes, style, children: Array.from(node.childNodes).map(walk).filter(child => child !== undefined) };
  };
  const scene = document.querySelector("[data-flute-scene]")!;
  return walk(scene.parentElement!.tagName === "BODY" ? scene : scene.parentElement!);
});
const boxes = (page: Page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll("[data-flute-id]")).map(el => {
  const r = el.getBoundingClientRect();
  return [el.getAttribute("data-flute-id"), [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10)];
})));
const contrasts = async (page: Page, xs: number[]) => {
  const shot = await page.screenshot();
  return page.evaluate(async ({ data, xs }) => {
    const img = new Image(); img.src = data; await img.decode();
    const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
    return xs.map(x => { const p = ctx.getImageData(x - 8, 190, 16, 20).data;
      const v = Array.from({ length: p.length / 4 }, (_, i) => p[i * 4]); return Math.max(...v) - Math.min(...v); });
  }, { data: "data:image/png;base64," + shot.toString("base64"), xs });
};
const gotoBoth = async (page: Page, query: string, action: (page: Page) => Promise<void>) => {
  await page.goto("/tests/fixtures/focus.html" + query);
  await action(page);
  const react = { dom: await serialize(page), boxes: await boxes(page) };
  await page.goto("/tests/fixtures/focus-vue.html" + query);
  await action(page);
  return { react, vue: { dom: await serialize(page), boxes: await boxes(page) } };
};

test.describe("Vue adapter parity with React", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 800, height: 400 }); });

  test("Scene and Surface DOM, inline styles, blur classification and geometry match for a tilted focus probe", async ({ page }) => {
    const { react, vue } = await gotoBoth(page, "", async p => { await expect(p.locator("[data-flute-content]")).toHaveCSS("filter", /url/); });
    expect(vue.dom).toEqual(react.dom);
    expect(vue.boxes).toEqual(react.boxes);
  });

  test("the same interactions (surface move, camera pan, focus rack, tilt) keep both DOMs identical", async ({ page }) => {
    const states: Record<string, unknown>[] = [];
    for (const path of ["/tests/fixtures/focus.html", "/tests/fixtures/focus-vue.html"]) {
      await page.goto(path);
      const trail: unknown[] = [];
      for (const name of ["Move surface", "Pan camera", "Move focus", "Tilt surface"]) {
        await page.getByRole("button", { name }).click();
        await expect.poll(() => page.locator("[data-flute-content]").first().evaluate(e => (e as HTMLElement).style.filter)).toBeTruthy();
        await page.waitForTimeout(80);
        trail.push({ dom: await serialize(page), boxes: await boxes(page) });
      }
      states.push({ trail });
    }
    expect(states[1]).toEqual(states[0]);
  });

  test("independent planes classify uniform, non-uniform and out-of-focus layers identically", async ({ page }) => {
    const { react, vue } = await gotoBoth(page, "?planes", async p => { await expect(p.getByTestId("left")).toBeVisible(); await p.waitForTimeout(150); });
    expect(vue.dom).toEqual(react.dom);
    expect(vue.boxes).toEqual(react.boxes);
  });

  test("numeric styles (pixels, unitless properties, negatives, zero) serialize identically", async ({ page }) => {
    const { react, vue } = await gotoBoth(page, "?units", async p => { await expect(p.locator("[data-flute-id=unit]")).toBeVisible(); await p.waitForTimeout(100); });
    expect(vue.dom).toEqual(react.dom);
    expect(vue.boxes).toEqual(react.boxes);
    const styles = await page.evaluate(() => {
      const scene = document.querySelector<HTMLElement>("[data-flute-scene]")!;
      const unit = document.querySelector<HTMLElement>("[data-flute-id=unit]")!;
      return { scene: [scene.style.width, scene.style.opacity, scene.style.zIndex], unit: [unit.style.width, unit.style.left, unit.style.marginLeft, unit.style.zIndex, unit.style.lineHeight, unit.style.paddingTop] };
    });
    expect(styles).toEqual({ scene: ["800px", "0.75", "3"], unit: ["200px", "40px", "-8px", "2", "1.5", "0px"] });
  });

  test("rendered pixels show the same progressive focus transition", async ({ page }) => {
    await page.goto("/tests/fixtures/focus.html");
    await expect(page.locator("[data-flute-content]")).toHaveCSS("filter", /url/);
    const react = await contrasts(page, [400, 480, 570]);
    await page.goto("/tests/fixtures/focus-vue.html");
    await expect(page.locator("[data-flute-content]")).toHaveCSS("filter", /url/);
    const vue = await contrasts(page, [400, 480, 570]);
    expect(vue[0]).toBeGreaterThan(220);
    expect(vue[1]).toBeLessThan(vue[0] - 50);
    expect(vue[1]).toBeGreaterThan(vue[2] + 5);
    expect(vue[2]).toBeLessThan(10);
    for (const [index, value] of vue.entries()) expect(Math.abs(value - react[index]), `x sample ${index}`).toBeLessThanOrEqual(3);
  });

  test("the capture bridge seeks the studio and settles the DOM before its promise resolves, matching React", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const poses: string[] = [];
    for (const path of ["/tests/preview/fixture.html", "/tests/preview/fixture-vue.html"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
      // One evaluate: seek, then read the stage in the same task. Playwright awaits the returned promise.
      poses.push(await page.evaluate(async () => {
        const bridge = (window as unknown as { __FLUTE_CAPTURE__: CaptureBridge }).__FLUTE_CAPTURE__;
        await bridge.seek(2000);
        return document.querySelector<HTMLElement>("[data-flute-stage]")!.style.transform;
      }));
    }
    expect(poses[1]).toBe(poses[0]);
    const pose = evaluateMotion({ durationMs: 4000, tracks: [{ target: { kind: "camera" }, property: "x", keyframes: [{ timeMs: 0, value: -100 }, { timeMs: 4000, value: 100 }] }] }, 2000).camera;
    // The browser rounds serialized style numbers; compare at 3 decimals.
    const round = (css: string) => css.replace(/-?\d+\.\d+/g, n => Number(n).toFixed(3));
    expect(round(poses[1])).toBe(round(cameraToCss(CameraSchema.parse({ perspective: 1800, rotateX: 12, rotateY: -18, ...pose }))));
    // Frame-exact: consecutive seeks always land on their own frame, never one behind.
    const trail = await page.evaluate(async () => {
      const bridge = (window as unknown as { __FLUTE_CAPTURE__: CaptureBridge }).__FLUTE_CAPTURE__;
      const stage = document.querySelector<HTMLElement>("[data-flute-stage]")!;
      const seen: string[] = [];
      for (const t of [0, 500, 1000, 1500, 500, 0, 4000]) { await bridge.seek(t); seen.push(stage.style.transform); }
      return seen;
    });
    expect(new Set(trail).size).toBe(5);
    expect(trail[0]).toBe(trail[5]);
    expect(trail[1]).toBe(trail[4]);
  });
});

test.describe("Vue studio in the browser", () => {
  test("one product shell preserves provided data, state and registration through seek and invalid-source recovery", async ({ page }) => {
    let requests = 0; page.on("request", request => { if (request.url().endsWith("/data.json")) requests++; });
    await page.goto("/tests/preview/fixture-vue.html");
    await expect(page.getByRole("heading", { name: "Provider content" })).toBeVisible();
    await page.getByRole("button", { name: "Count 0", exact: true }).click();
    await page.evaluate(() => { (window as any).originalHost = document.querySelector('[data-testid="host"]'); });
    const seek = page.getByRole("slider", { name: "Scene time" });
    await seek.fill("4000");
    await expect(page.getByTestId("scene-time")).toHaveText("0:04 / 0:08");
    const transform = await page.locator("[data-flute-stage]").getAttribute("style");
    await page.getByRole("button", { name: "Invalid source", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("last valid");
    expect(await page.locator("[data-flute-stage]").getAttribute("style")).toBe(transform);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
    await expect(page.evaluate(() => (window as any).__FLUTE_CAPTURE__.seek(1000))).rejects.toThrow();
    await page.getByRole("button", { name: "Correct source", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Count 1", exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).originalHost === document.querySelector('[data-testid="host"]'))).toBe(true);
    expect(requests).toBe(1);
    await page.evaluate(async () => { await (window as any).__FLUTE_CAPTURE__.seek(2000); });
    await expect(seek).toHaveValue("2000");
    await expect(page.locator('[data-flute-capture="scene"]')).toHaveAttribute("data-flute-valid", "true");
    await seek.fill("8000");
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Restart", exact: true }).click();
    await expect(seek).toHaveValue("0");
    await page.locator(".flute-export summary").click();
    await page.getByRole("combobox", { name: "Export frame rate" }).selectOption("30");
    await expect(page.locator(".flute-export-panel code")).toContainText("--fps 30");
    await page.keyboard.press("Escape");
    await expect(page.locator(".flute-export summary")).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test("the scene library lays out and scrolls like the React library, then opens and closes a Vue scene", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const layout = async (path: string) => {
      await page.goto(path);
      await expect(page.getByText("30 perspectives", { exact: true })).toBeVisible();
      const at = async (top: number) => {
        await page.locator(".flute-library-scroll").evaluate((e, value) => { e.scrollTop = value; }, top);
        await page.waitForTimeout(150);
        return page.evaluate(() => Array.from(document.querySelectorAll("[data-scene-id]")).map(e => {
          const r = e.getBoundingClientRect(); return [e.getAttribute("data-scene-id"), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
        }));
      };
      return [await at(0), await at(450), await at(1200)];
    };
    const react = await layout("/tests/preview/fixture.html?mode=library");
    const vue = await layout("/tests/preview/fixture-vue.html?mode=library");
    for (const [index, rows] of vue.entries()) {
      expect(rows.map(row => row[0]), `rows at scroll #${index}`).toEqual(react[index].map(row => row[0]));
      for (const [r, row] of rows.entries()) for (let axis = 1; axis < 5; axis++) expect(Math.abs((row[axis] as number) - (react[index][r][axis] as number)), `${row[0]} axis ${axis}`).toBeLessThanOrEqual(2);
    }
    await expect(page.getByTestId("host")).toHaveCount(0);
    await expect(page.locator('[data-scene-id="scene-01"] img')).toHaveAttribute("loading", "lazy");
    await expect.poll(() => page.locator('[data-scene-id="scene-01"] img').evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('[data-scene-id="scene-02"] img')).toHaveCount(0);
    await page.locator(".flute-library-scroll").evaluate(e => { e.scrollTop = 0; });
    await page.locator('[data-scene-id="scene-01"]').click();
    await expect(page.locator("[data-flute-preview]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Provider content" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
    expect(new URL(page.url()).searchParams.get("flute-scene")).toBe("scene-01");
    await page.getByRole("link", { name: "Back to scenes", exact: true }).click();
    await expect(page.locator("[data-flute-library]")).toBeVisible();
    await page.goBack();
    await expect(page.locator("[data-flute-preview]")).toBeVisible();
  });
});
