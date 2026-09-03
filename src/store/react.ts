import { useSyncExternalStore } from "react";
import { appStore } from "./app-store";

export function useAppState() {
  return useSyncExternalStore(appStore.subscribe, appStore.getState, appStore.getState);
}
