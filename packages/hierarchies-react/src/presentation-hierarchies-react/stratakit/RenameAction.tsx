/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, memo, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import renameSvg from "@stratakit/icons/rename.svg";
import { useLocalizationContext } from "./LocalizationContext.js";
import { TreeActionBase, TreeActionBaseAttributes } from "./TreeAction.js";

/**
 * React component that renders a rename action for a tree item.
 * The tree component must have `getEditingProps.onLabelChanged` prop set to enable renaming functionality. When the rename is completed, the `onLabelChanged` function is called to make the actual data update.
 * @alpha
 */
export const RenameAction = memo(function RenameAction(actionAttributes: TreeActionBaseAttributes) {
  const { localizedStrings } = useLocalizationContext();
  const context = useRenameContext();
  const { rename } = localizedStrings;

  const setIsRenaming = context?.setIsRenaming;
  const handleClick = useCallback(() => {
    setIsRenaming?.(true);
  }, [setIsRenaming]);

  return <TreeActionBase {...actionAttributes} label={rename} onClick={handleClick} icon={renameSvg} hide={!context?.onLabelChanged} />;
});

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
