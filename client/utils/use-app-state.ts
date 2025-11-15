import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useStableCallback } from "./use-stable-callback";

export function useAppState(callbacks?: {
  onActive?: () => void;
  onInactive?: () => void;
}) {
  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);

  const onAppStateChange = useStableCallback((nextAppState: AppStateStatus) => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === "active"
    ) {
      callbacks?.onActive?.();
    } else if (
      appState.current === "active" &&
      nextAppState.match(/inactive|background/)
    ) {
      callbacks?.onInactive?.();
    }

    appState.current = nextAppState;
    setAppStateVisible(appState.current);
  });

  useEffect(() => {
    callbacks?.onActive?.();
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return appStateVisible;
}
