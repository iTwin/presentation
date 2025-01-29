/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";

export function useOptionalDisposable<TDisposable extends Disposable>(createDisposable: () => TDisposable | undefined): TDisposable | undefined {
  const [value, setValue] = useState<TDisposable | undefined>();

  useEffect(() => {
    const disposable = createDisposable();
    setValue(disposable);
    return () => {
      disposable && disposable[Symbol.dispose]();
    };
  }, [createDisposable]);

  return value;
}
