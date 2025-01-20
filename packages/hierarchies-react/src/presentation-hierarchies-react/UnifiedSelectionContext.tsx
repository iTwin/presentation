/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, PropsWithChildren, useContext } from "react";
import { SelectionStorage } from "@itwin/unified-selection";

const deprecatedUnifiedSelectionContext = createContext<SelectionStorage | undefined>(undefined);

/**
 * A React context provider that makes given selection storage available to all child components. This
 * is a requirement for `useUnifiedSelectionTree` to work with unified selection.
 *
 * @public
 * @deprecated in 1.5.0. Use `UnifiedSelectionContextProvider` from `@itwin/unified-selection-react` instead.
 */
export function UnifiedSelectionProvider({ storage, children }: PropsWithChildren<{ storage: SelectionStorage }>) {
  return <deprecatedUnifiedSelectionContext.Provider value={storage}>{children}</deprecatedUnifiedSelectionContext.Provider>;
}

/** @internal */
export function useUnifiedSelectionStorage() {
  return useContext(deprecatedUnifiedSelectionContext);
}
