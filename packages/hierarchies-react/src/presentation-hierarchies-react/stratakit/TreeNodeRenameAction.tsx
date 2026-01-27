/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, memo, useCallback, useContext, useMemo, useState } from "react";
import renameSvg from "@stratakit/icons/rename.svg";
import { useLocalizationContext } from "./LocalizationContext.js";
import { TreeActionBase } from "./TreeAction.js";

import type { PropsWithChildren } from "react";
import type { TreeNode } from "../TreeNode.js";
import type { TreeActionBaseAttributes } from "./TreeAction.js";

/**
 * React component that renders a rename action for a tree item.
 *
 * The tree component must have `getEditingProps.onLabelChanged` prop set to enable renaming functionality. When
 * rename is completed, the `onLabelChanged` function is called to make the actual data update.
 *
 * @see `getMenuActions`, `getInlineActions`, `getContextMenuActions` props of `TreeRenderer` to add this action
 * to tree items.
 *
 * @alpha
 */
export const TreeNodeRenameAction = memo(function TreeNodeRenameAction({ node, ...actionAttributes }: TreeActionBaseAttributes & { node: TreeNode }) {
  const { localizedStrings } = useLocalizationContext();
  const context = useTreeNodeRenameContext();
  const { rename } = localizedStrings;

  const canRename = context?.canRename(node) ?? false;
  const startRename = context?.startRename;
  const handleClick = useCallback(() => {
    startRename?.(node);
  }, [startRename, node]);

  return <TreeActionBase {...actionAttributes} label={rename} onClick={handleClick} icon={renameSvg} hide={!canRename} />;
});

/** @alpha */
export interface TreeNodeEditingProps {
  /**
   * A callback that is invoked when node label is changed. Should be used together
   * with `<TreeNodeRenameAction />` to enter label editing mode.
   */
  onLabelChanged: (newLabel: string) => void;
  labelValidationHint?: string;
  validate?: (newLabel: string) => boolean;
}

/** @internal */
export interface RenameParameters {
  nodeId: string;
  commit: (newLabel: string) => void;
  labelValidationHint?: string;
  validate?: (newLabel: string) => boolean;
}

interface TreeNodeRenameContext {
  renameParameters?: RenameParameters;
  startRename: (node: TreeNode) => void;
  canRename: (node: TreeNode) => boolean;
  cancelRename: () => void;
}

const treeNodeRenameContext = createContext<TreeNodeRenameContext | undefined>(undefined);

/** @internal */
export const useTreeNodeRenameContext = () => {
  return useContext(treeNodeRenameContext);
};

/** @internal */
export function TreeNodeRenameContextProvider({ value, children }: PropsWithChildren<{ value: TreeNodeRenameContext }>) {
  return <treeNodeRenameContext.Provider value={value}>{children}</treeNodeRenameContext.Provider>;
}

/** @internal */
export function useTreeNodeRenameContextValue({ getEditingProps }: { getEditingProps?: (node: TreeNode) => TreeNodeEditingProps | undefined }) {
  const [renameParameters, setRenameParameters] = useState<RenameParameters | undefined>(undefined);

  const startRename = useCallback(
    (node: TreeNode) => {
      const { onLabelChanged, labelValidationHint, validate } = getEditingProps?.(node) ?? {};
      if (onLabelChanged) {
        setRenameParameters({
          nodeId: node.id,
          commit: (newLabel) => {
            onLabelChanged(newLabel);
            setRenameParameters(undefined);
          },
          labelValidationHint,
          validate,
        });
      }
    },
    [getEditingProps],
  );

  const cancelRename = useCallback(() => {
    setRenameParameters(undefined);
  }, []);

  const canRename = useCallback(
    (node: TreeNode) => {
      return getEditingProps?.(node)?.onLabelChanged !== undefined;
    },
    [getEditingProps],
  );

  return useMemo(
    () => ({
      renameParameters,
      cancelRename,
      startRename,
      canRename,
    }),
    [renameParameters, canRename, startRename, cancelRename],
  );
}
