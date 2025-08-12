/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, memo, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import renameSvg from "@stratakit/icons/rename.svg";
import { Tree } from "@stratakit/structures";
import { useLocalizationContext } from "./LocalizationContext.js";

/**
 * @alpha
 */
interface RenameActionProps {
  /**
   * Indicates that space for this action button should be reserved, even when the action is not available.
   * For nodes that don't support renaming, `<RenameAction reserveSpace />` renders:
   *
   * - Blank space when the action is used as an inline action. It's recommended to set this prop to keep all action buttons of the same kind vertically aligned.
   * - Disabled menu item when the action is used as a menu action.
   */
  reserveSpace?: true;
}

/**
 * React component that renders a rename action for a tree item.
 * The tree component must have `getEditingProps.onLabelChanged` prop set to enable renaming functionality. When the rename is completed, the `onLabelChanged` function is called to make the actual data update.
 * @alpha
 */
export const RenameAction = memo(function RenameAction({ reserveSpace }: RenameActionProps) {
  const { localizedStrings } = useLocalizationContext();
  const context = useRenameContext();
  const { rename } = localizedStrings;

  const setIsRenaming = context?.setIsRenaming;
  const handleClick = useCallback(() => {
    setIsRenaming?.(true);
  }, [setIsRenaming]);

  if (!context?.onLabelChanged) {
    return reserveSpace ? <Tree.ItemAction label={rename} icon={renameSvg} visible={false} disabled /> : undefined;
  }

  return <Tree.ItemAction label={rename} onClick={handleClick} icon={renameSvg} />;
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
