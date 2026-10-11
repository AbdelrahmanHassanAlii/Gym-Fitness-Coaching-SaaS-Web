"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

/**
 * Captures whether protected async work still belongs to the mounted authority
 * identity that started it. Cleanup invalidates every outstanding capture.
 */
export function useProtectedAsyncEpoch(identityToken: string) {
  const current = useRef({ active: false, epoch: 0 });

  useLayoutEffect(() => {
    const epoch = current.current.epoch + 1;
    current.current = { active: true, epoch };
    return () => {
      if (current.current.epoch === epoch)
        current.current = { active: false, epoch: epoch + 1 };
    };
  }, [identityToken]);

  const capture = useCallback(
    () => (current.current.active ? current.current.epoch : undefined),
    [],
  );
  const isCurrent = useCallback(
    (epoch: number | undefined) =>
      epoch !== undefined &&
      current.current.active &&
      current.current.epoch === epoch,
    [],
  );
  const invalidate = useCallback(() => {
    current.current = {
      active: false,
      epoch: current.current.epoch + 1,
    };
  }, []);

  return useMemo(
    () => ({ capture, invalidate, isCurrent }),
    [capture, invalidate, isCurrent],
  );
}
