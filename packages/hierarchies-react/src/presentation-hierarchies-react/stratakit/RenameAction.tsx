/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, memo, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import placeholderSvg from "@stratakit/icons/placeholder.svg";
import renameSvg from "@stratakit/icons/rename.svg";
import { Tree } from "@stratakit/structures";
import { useLocalizationContext } from "./LocalizationContext.js";

interface RenameActionProps {
  /**
   * Indicates if the action is inline.
   * Set to `true` to reserve space when not displayed.
   * Leave `undefined` for menu items.
   */
  inline?: true | undefined;
}

/**
 * React component that renders a rename action for a tree item.
 * @alpha
 */
export const RenameAction = memo(function RenameAction({ inline }: RenameActionProps) {
  const { localizedStrings } = useLocalizationContext();
  const context = useRenameContext();
  const { rename } = localizedStrings;

  const setIsRenaming = context?.setIsRenaming;
  const handleClick = useCallback(() => {
    setIsRenaming?.(true);
  }, [setIsRenaming]);

  if (!context?.onLabelChanged) {
    return inline ? <Tree.ItemAction label="hidden-action" visible={false} icon={placeholderSvg} /> : undefined;
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
