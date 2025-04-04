/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useInsertionEffect, useRef } from "react";

/** @internal */
export function useLatest<T>(value: T) {
  const ref = useRef(value);

  useInsertionEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

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
