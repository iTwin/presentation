/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext, useEffect, useState } from "react";

import type { useUnifiedSelectionContext } from "@itwin/unified-selection-react";

/**
 * A hook that can be used to acquire the unified selection context, coming from the
 * optional `@itwin/unified-selection-react` peer dependency.
 *
 * @internal
 */
export function useOptionalUnifiedSelectionContext(): ReturnType<typeof useUnifiedSelectionContext> {
  const [contextGetter, setContextGetter] = useState<typeof useUnifiedSelectionContext | undefined>(undefined);
  useEffect(() => {
    void getUnifiedSelectionContextFn().then((fn) => setContextGetter(() => fn));
  }, []);
  // `contextGetter` internally calls `useContext`, so if we don't have it (yet), call `useContext` with a no-op
  // context to avoid React complaints about conditional hooks usage.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return contextGetter ? contextGetter() : useContext(noopContext);
}

const noopContext = createContext<ReturnType<typeof useUnifiedSelectionContext>>(undefined);

async function getUnifiedSelectionContextFn() {
  try {
    const optionalPkg = await import("@itwin/unified-selection-react");
    return optionalPkg.useUnifiedSelectionContext;
    /* c8 ignore next 3 */
  } catch {
    return undefined;
  }
}
