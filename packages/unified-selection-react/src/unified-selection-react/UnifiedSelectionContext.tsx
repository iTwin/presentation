/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext } from "react";

import type { PropsWithChildren } from "react";
import type { SelectionStorage } from "@itwin/unified-selection";

/** @public */
interface UnifiedSelectionContext {
  /** Unified selection storage */
  storage: SelectionStorage;
}

const unifiedSelectionContext = createContext<UnifiedSelectionContext | undefined>(undefined);

/**
 * A React context provider that makes given unified selection context available to all child components. This
 * is a requirement for `useUnifiedSelectionContext` to return valid context.
 *
 * See `README.md` for a usage example.
 *
 * @public
 */
export function UnifiedSelectionContextProvider(props: PropsWithChildren<UnifiedSelectionContext>) {
  const { children, ...context } = props;
  return <unifiedSelectionContext.Provider value={context}>{children}</unifiedSelectionContext.Provider>;
}

/**
 * A React hook for accessing unified selection context. The context must be provided by `UnifiedSelectionContextProvider`,
 * otherwise the hook will return `undefined`.
 *
 * See `README.md` for a usage example.
 *
 * @public
 */
export function useUnifiedSelectionContext() {
  return useContext(unifiedSelectionContext);
}
