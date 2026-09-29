import { useEffect, useState } from "react";
import { bindPreviewConnection, type PreviewHot } from "../dom/connection";

/** SOURCE OF TRUTH: React preview connection adapter.
 * WHAT: expose the shared Vite HMR connection state machine as a React hook.
 * WHY: an installed production bundle cannot capture the host's import.meta.hot.
 * WHERE: callers explicitly pass their hot context; dom/connection owns the transitions.
 */
export type { PreviewHot };
export function usePreviewConnection(hot: PreviewHot | undefined, pause: () => void) {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState({connected: true, updating: false, error: ""});
  useEffect(() => {
    if (!hot) return;
    return bindPreviewConnection(hot, pause, setState, () => setGeneration(value => value + 1));
  }, [hot, pause]);
  return {...state, generation};
}
