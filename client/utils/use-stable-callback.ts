/** biome-ignore-all lint/suspicious/noExplicitAny: no need */
import { useCallback, useLayoutEffect, useRef } from "react";

export function useStableCallback<T extends (...args: any[]) => any>(
  handler: T
) {
  const handlerRef = useRef<T>(undefined);

  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  return useCallback((...args: any[]) => {
    const fn = handlerRef.current;
    return fn?.(...args);
  }, []);
}
