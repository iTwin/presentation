/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import renameSvg from "@stratakit/icons/rename.svg";
import { Tree } from "@stratakit/structures";
import { useLocalizationContext } from "./LocalizationContext.js";

/**
 * React hook returning a getter for the Rename action.
 * @alpha
 */
export function useRenameAction() {
  const context = useRenameContext();
  if (!context?.onLabelChanged) {
    return { getRenameAction: () => undefined };
  }

  return { getRenameAction: () => <RenameAction /> };
}

/**
 * React component that renders a rename action for a tree item.
 * @alpha
 */
function RenameAction() {
  const { localizedStrings } = useLocalizationContext();
  const { rename } = localizedStrings;
  const context = useRenameContext();

  const setIsRenaming = context?.setIsRenaming;
  const handleClick = useCallback(() => {
    setIsRenaming?.(true);
  }, [setIsRenaming]);

  return <Tree.ItemAction label={rename} onClick={handleClick} icon={renameSvg} />;
}

interface RenameContext {
  isRenaming: boolean;
  setIsRenaming: (isRenaming: boolean) => void;
  onLabelChanged?: (newLabel: string) => void;
}

const renameContext = createContext<RenameContext | undefined>(undefined);

/** @internal */
export const useRenameContext = () => {
  return useContext(renameContext);
};

/** @alpha */
export function RenameContextProvider({ onLabelChanged, children }: PropsWithChildren<{ onLabelChanged?: (newLabel: string) => void }>) {
  const [isRenaming, setIsRenaming] = useState(false);
  const value = useMemo(() => ({ isRenaming, setIsRenaming, onLabelChanged }), [isRenaming, onLabelChanged]);

  return <renameContext.Provider value={value}>{children}</renameContext.Provider>;
}
