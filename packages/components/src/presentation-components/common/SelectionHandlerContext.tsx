/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, PropsWithChildren, useContext } from "react";
import { SelectionHandler } from "@itwin/presentation-frontend";

const SelectionHandlerContext = createContext<SelectionHandler | undefined>(undefined);

/** @internal */
export function SelectionHandlerContextProvider({ selectionHandler, children }: PropsWithChildren<{ selectionHandler: SelectionHandler }>) {
  return <SelectionHandlerContext.Provider value={selectionHandler}>{children}</SelectionHandlerContext.Provider>;
}

/** @internal */
export function useSelectionHandlerContext() {
  return useContext(SelectionHandlerContext);
}
