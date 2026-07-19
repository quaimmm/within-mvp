import { createCleanDemoState, DEMO_STORAGE_KEY } from "../../data/demo-state.ts";
import type { DemoState } from "../../data/demo-state.ts";

export type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function resetDemoState(storage?: SessionStorageLike): DemoState {
  const state = createCleanDemoState();
  storage?.removeItem(DEMO_STORAGE_KEY);
  storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  return state;
}
