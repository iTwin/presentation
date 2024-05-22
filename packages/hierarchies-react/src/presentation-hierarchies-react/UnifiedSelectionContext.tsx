/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, PropsWithChildren, useContext } from "react";
import { SelectionStorage } from "@itwin/unified-selection";

const unifiedSelectionContext = createContext<SelectionStorage | undefined>(undefined);

interface Props {
  storage: SelectionStorage;
}

/**
 * A React context provider that makes given selection storage available to all child components. This
 * is a requirement for `useUnifiedSelectionTree` to work with unified selection.
 *
 * See `README.md` for a usage example.
 *
 * @beta
 */
export function UnifiedSelectionProvider({ storage, children }: PropsWithChildren<Props>) {
  return <unifiedSelectionContext.Provider value={storage}>{children}</unifiedSelectionContext.Provider>;
}

/** @internal */
export function useUnifiedSelectionContext() {
  return useContext(unifiedSelectionContext);
}
