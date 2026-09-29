/** SOURCE OF TRUTH: bindPreviewConnection, PreviewHot.
 * WHAT: translate Vite HMR events into connection/recovery state transitions.
 * WHY: an installed production bundle cannot capture the host's import.meta.hot.
 * WHERE: react/vue preview adapters pass their explicit hot context and state setters; no server or polling is created.
 */
export type PreviewHot = {
  on(event: string, listener: (payload: any) => void): void;
  off(event: string, listener: (payload: any) => void): void;
};
export type ConnectionState = { connected: boolean; updating: boolean; error: string };
export function bindPreviewConnection(hot: PreviewHot, pause: () => void, set: (state: ConnectionState) => void, updated: () => void) {
  const handlers: Record<string, (payload: any) => void> = {
    "vite:ws:disconnect": () => { pause(); set({connected: false, updating: false, error: ""}); },
    "vite:ws:connect": () => set({connected: true, updating: false, error: ""}),
    "vite:beforeUpdate": () => { pause(); set({connected: true, updating: true, error: ""}); },
    "vite:afterUpdate": () => { set({connected: true, updating: false, error: ""}); updated(); },
    "vite:error": payload => { pause(); set({connected: true, updating: false,
      error: typeof payload?.err?.message === "string" ? payload.err.message : "The source could not be updated."}); },
  };
  for (const [event, callback] of Object.entries(handlers)) hot.on(event, callback);
  return () => { for (const [event, callback] of Object.entries(handlers)) hot.off(event, callback); };
}
