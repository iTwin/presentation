/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, PropsWithChildren, useContext } from "react";
import { ViewportSelectionHandler } from "../viewport/ViewportSelectionHandler";

const ViewportSelectionHandlerContext = createContext<ViewportSelectionHandler | undefined>(undefined);

/** @internal */
export function ViewportSelectionHandlerContextProvider({ selectionHandler, children }: PropsWithChildren<{ selectionHandler: ViewportSelectionHandler }>) {
  return <ViewportSelectionHandlerContext.Provider value={selectionHandler}>{children}</ViewportSelectionHandlerContext.Provider>;
}

/** @internal */
export function useViewportSelectionHandlerContext() {
  return useContext(ViewportSelectionHandlerContext);
}
