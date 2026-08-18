import { createCleanDemoState, DEMO_STORAGE_KEY } from "../../data/demo-state.ts";
import { ASK_WITHIN_HISTORY_KEY } from "../intelligence/ask-within.ts";
import type { DemoState } from "../../data/demo-state.ts";

export type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function resetDemoState(storage?: SessionStorageLike): DemoState {
  const state = createCleanDemoState();
  storage?.removeItem(DEMO_STORAGE_KEY);
  storage?.removeItem(ASK_WITHIN_HISTORY_KEY);
  storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  return state;
}
