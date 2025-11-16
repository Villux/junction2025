import { useEffect } from "react";
import { VolumeManager } from "react-native-volume-manager";
import { useAppState } from "./use-app-state";
import { useStableCallback } from "./use-stable-callback";

export function useVolumeChange(callback: () => void) {
  const appState = useAppState();
  const stableCallback = useStableCallback(callback);

  useEffect(() => {
    async function handleVolume(newVolume: { volume: number } | null = null) {
      const { volume } = newVolume ?? (await VolumeManager.getVolume());
      if (volume !== 0.70) {
        await VolumeManager.setVolume(0.70);
      }
    }

    handleVolume();

    const volumeListener = VolumeManager.addVolumeListener(() => {
      if (appState !== "active") return;
      handleVolume();
      stableCallback();
    });

    return () => {
      volumeListener.remove();
    };
  }, [appState, callback]);
}
