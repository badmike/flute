import type { ComputedRef, InjectionKey, ShallowRef } from "vue";
import type { EvaluatedNode, TransformInput } from "../core";
import type { Registry } from "../dom/registry";

/** SOURCE OF TRUTH: Vue scene/parent injection contract.
 * WHAT: Symbol keys and the value shape Scene provides to every nested Surface.
 * WHY: one typed contract keeps scene state, registry identity and parent tokens off host props.
 * WHERE: Scene.ts provides it; Surface.ts and useSceneTime consume it; dom/registry owns layout.
 */
export type SceneState = {
  nodes: Map<string, EvaluatedNode>;
  transforms: Map<string, TransformInput>;
  opacities: Map<string, number>;
  timeMs: number;
};
export type SceneContextValue = {
  registry: Registry;
  /** Bumped by registry.subscribe; readers depend on it like React's useSyncExternalStore. */
  revision: ShallowRef<number>;
  state: ComputedRef<SceneState>;
};
export const SCENE_KEY: InjectionKey<SceneContextValue> = Symbol("flute-scene");
export const PARENT_KEY: InjectionKey<symbol | undefined> = Symbol("flute-parent");
