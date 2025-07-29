/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback } from "react";
import { PresentationHierarchyNode, StrataKitTreeRenderer, useFilterAction, useRenameAction } from "@itwin/presentation-hierarchies-react";

type TreeRendererProps = ComponentPropsWithoutRef<typeof StrataKitTreeRenderer>;

export function TreeRendererWithFilterAction(props: TreeRendererProps) {
  const { getHierarchyLevelDetails, onFilterClick, getMenuActions, ...treeProps } = props;
  const { getRenameAction } = useRenameAction();
  const { getFilterAction } = useFilterAction({ onFilter: onFilterClick, getHierarchyLevelDetails });
  const getInlineActions = useCallback(
    () => [(node: PresentationHierarchyNode) => getFilterAction(node), () => getRenameAction()],
    [getFilterAction, getRenameAction],
  );
  const getEditingProps = useCallback<Required<TreeRendererProps>["getEditingProps"]>((node) => {
    return {
      onLabelChanged: (newLabel: string) => {
        // Handle label change
        // eslint-disable-next-line no-console
        console.log(`Node label changed from ${node.label} to ${newLabel}`);
      },
    };
  }, []);

  return (
    <StrataKitTreeRenderer
      {...treeProps}
      getInlineActions={getInlineActions}
      getMenuActions={getMenuActions}
      onFilterClick={onFilterClick}
      getHierarchyLevelDetails={getHierarchyLevelDetails}
      getEditingProps={getEditingProps}
    />
  );
}
