/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useState } from "react";

export interface AsyncValueLoaderProps {
  /** Aborted when the load is superseded by a newer one or the component unmounts. */
  signal: AbortSignal;
}

export type AsyncValueLoader<T> = (props: AsyncValueLoaderProps) => Promise<T>;

export interface UseAsyncValueResult<T> {
  /** The loaded value. While reloading, holds the previous value of the same loader. */
  value: T | undefined;
  isLoading: boolean;
  /** The error that made the latest load fail, if any. */
  error?: unknown;
  /** Runs the current loader again, keeping the current value until the new one is ready. */
  reload: () => void;
}

interface UseAsyncValueOptions {
  /** Whether to keep the value of the previous loader while a new loader runs. Defaults to `false`. */
  keepPreviousValue?: boolean;
}

/**
 * Runs the given loader and tracks its result. A new loader reference starts a new load, and `undefined` means
 * there's nothing to load. Only the latest load affects the result - earlier ones are aborted.
 */
export function useAsyncValue<T>(
  load: AsyncValueLoader<T> | undefined,
  options?: UseAsyncValueOptions,
): UseAsyncValueResult<T> {
  const keepPreviousValue = options?.keepPreviousValue ?? false;
  const [reloadCount, setReloadCount] = useState(0);
  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const [state, setState] = useState<AsyncValueState<T>>();
  useEffect(() => {
    if (!load) {
      // oxlint-disable-next-line react/set-state-in-effect
      setState(undefined);
      return undefined;
    }
    setState((prev) => ({
      load,
      value: prev?.load === load || keepPreviousValue ? prev?.value : undefined,
      isLoading: true,
    }));
    const controller = new AbortController();
    void (async () => {
      let next: AsyncValueState<T>;
      try {
        next = { load, value: await load({ signal: controller.signal }), isLoading: false };
      } catch (error) {
        next = {
          load,
          value: undefined,
          isLoading: false,
          error: error === undefined ? new Error("Loading failed without a rejection reason.") : error,
        };
      }
      if (!controller.signal.aborted) {
        setState(next);
      }
    })();
    return () => controller.abort();
  }, [load, reloadCount, keepPreviousValue]);

  return useMemo((): UseAsyncValueResult<T> => {
    if (!load) {
      return { value: undefined, isLoading: false, reload };
    }
    // State of another loader is stale, e.g. right after the loader changes and before the effect runs.
    if (state?.load !== load) {
      return { value: keepPreviousValue ? state?.value : undefined, isLoading: true, reload };
    }
    return {
      value: state.value,
      isLoading: state.isLoading,
      ...(state.error !== undefined ? { error: state.error } : {}),
      reload,
    };
  }, [load, state, keepPreviousValue, reload]);
}

interface AsyncValueState<T> {
  load: AsyncValueLoader<T>;
  value: T | undefined;
  isLoading: boolean;
  error?: unknown;
}
