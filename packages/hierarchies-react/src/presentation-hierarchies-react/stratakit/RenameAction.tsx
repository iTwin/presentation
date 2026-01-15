/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, memo, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import renameSvg from "@stratakit/icons/rename.svg";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import { TreeActionBase, TreeActionBaseAttributes } from "./TreeAction.js";

/**
 * React component that renders a rename action for a tree item.
 * The tree component must have `getEditingProps.onLabelChanged` prop set to enable renaming functionality. When the rename is completed, the `onLabelChanged` function is called to make the actual data update.
 * @alpha
 */
export const RenameAction = memo(function RenameAction({ node, ...actionAttributes }: TreeActionBaseAttributes & { node: PresentationHierarchyNode }) {
  const { localizedStrings } = useLocalizationContext();
  const context = useRenameContext();
  const { rename } = localizedStrings;

  const canRename = context?.canRename(node) ?? false;
  const startRename = context?.startRename;
  const handleClick = useCallback(() => {
    startRename?.(node);
  }, [startRename, node]);

  return <TreeActionBase {...actionAttributes} label={rename} onClick={handleClick} icon={renameSvg} hide={!canRename} />;
});

interface RenameContext {
  renameParameters?: {
    nodeId: string;
    commit: (newLabel: string) => void;
  };
  startRename: (node: PresentationHierarchyNode) => void;
  canRename: (node: PresentationHierarchyNode) => boolean;
  cancelRename: () => void;
}

const renameContext = createContext<RenameContext | undefined>(undefined);

/** @internal */
export const useRenameContext = () => {
  return useContext(renameContext);
};

/** @alpha */
export function RenameContextProvider({ value, children }: PropsWithChildren<{ value: RenameContext }>) {
  return <renameContext.Provider value={value}>{children}</renameContext.Provider>;
}

/** @alpha */
export function useNodeRenameContextValue({
  getEditingProps,
}: {
  getEditingProps?: (node: PresentationHierarchyNode) => { onLabelChanged?: (newLabel: string) => void };
}) {
  const [renameParameters, setRenameParameters] = useState<{ nodeId: string; commit: (newLabel: string) => void } | undefined>(undefined);

  const startRename = useCallback(
    (node: PresentationHierarchyNode) => {
      const { onLabelChanged } = getEditingProps?.(node) ?? {};
      if (onLabelChanged) {
        setRenameParameters({
          nodeId: node.id,
          commit: (newLabel) => {
            onLabelChanged(newLabel);
            setRenameParameters(undefined);
          },
        });
      }
    },
    [getEditingProps],
  );

  const cancelRename = useCallback(() => {
    setRenameParameters(undefined);
  }, []);

  const canRename = useCallback(
    (node: PresentationHierarchyNode) => {
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
