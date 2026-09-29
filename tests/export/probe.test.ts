import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { probeSelector } from "../../src/export/services";
import { executePreviewProbe } from "../../src/export/commands";

// Real headless Chromium against a loopback fixture: the mount probe behind `flute open` for Vue-family hosts.
let server: Server;
let origin: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    if (req.url?.startsWith("/late")) res.end(`<div id="root"></div><script>setTimeout(()=>{document.getElementById("root").innerHTML='<div data-flute-project="p1"></div>'},400)</script>`);
    else if (req.url?.startsWith("/mounted")) res.end(`<div data-flute-project="p1"></div>`);
    else res.end(`<main>plain app without the studio</main>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe("preview mount probe", () => {
  it("finds a marker that is present or renders after load", async () => {
    expect(await probeSelector(`${origin}/mounted`, '[data-flute-project="p1"]', 3000)).toBe("present");
    expect(await probeSelector(`${origin}/late`, '[data-flute-project="p1"]', 5000)).toBe("present");
  }, 30_000);
  it("reports a plain app, or a different project, as absent within the budget", async () => {
    expect(await probeSelector(`${origin}/plain`, '[data-flute-project="p1"]', 600)).toBe("absent");
    expect(await probeSelector(`${origin}/mounted`, '[data-flute-project="other"]', 600)).toBe("absent");
  }, 30_000);
  it("never probes a non-loopback origin and is unavailable outside a Vue-family project", async () => {
    expect(await probeSelector("https://example.com/", "body", 500)).toBe("unavailable");
    expect(await probeSelector("http://192.0.2.1/", "body", 500)).toBe("unavailable");
    expect(await executePreviewProbe({ url: `${origin}/plain` }, { root: "/definitely/not/a/project" })).toBe("unavailable");
  });
});
