/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { LegacyRef, MutableRefObject, Ref, useCallback, useInsertionEffect, useRef } from "react";

/** @internal */
export function useLatest<T>(value: T) {
  const ref = useRef(value);

  useInsertionEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

/* c8 ignore start */
/** @internal */
export function useEvent<TCallback extends (...args: any[]) => void>(callback: TCallback) {
  const latestCallback = useLatest(callback);

  return useCallback(
    (...args: Parameters<TCallback>) => {
      latestCallback.current(...args);
    },
    [latestCallback],
  );
}
/* c8 ignore end */

/* c8 ignore start */
/** @internal */
export function useMergedRefs<T>(...refs: ReadonlyArray<Ref<T> | LegacyRef<T> | undefined | null>) {
  return useCallback(
    (instance: T | null) => {
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(instance);
        } else if (ref) {
          (ref as MutableRefObject<T | null>).current = instance;
        }
      });
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [...refs],
  );
}
/* c8 ignore end */
