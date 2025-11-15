import { useEffect } from "react";

import { useStableCallback } from "./use-stable-callback";

export function useInterval(callback: () => void, delay: number | null) {
  const stableCallback = useStableCallback(callback);

  useEffect(() => {
    /**
     * Don't schedule if no delay is specified.
     * Note: 0 is a valid value for delay.
     */
    if (delay === null) {
      return;
    }

    const id = setInterval(() => {
      stableCallback();
    }, delay);

    return () => {
      clearInterval(id);
    };
  }, [delay]);
}
