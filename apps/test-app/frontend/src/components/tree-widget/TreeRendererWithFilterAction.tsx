/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback } from "react";
import { FilterAction, PresentationHierarchyNode, RenameAction, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react";

type TreeRendererProps = ComponentPropsWithoutRef<typeof StrataKitTreeRenderer>;

export function TreeRendererWithFilterAction(props: TreeRendererProps) {
  const { getHierarchyLevelDetails, onFilterClick, getMenuActions: getActions, ...treeProps } = props;
  const getInlineActions = useCallback(
    (node: PresentationHierarchyNode) => [
      <FilterAction key="filter" node={node} onFilter={onFilterClick} getHierarchyLevelDetails={getHierarchyLevelDetails} reserveSpace />,
      <RenameAction key="rename" reserveSpace />,
    ],
    [onFilterClick, getHierarchyLevelDetails],
  );

  const getMenuActions = useCallback((node: PresentationHierarchyNode) => (getActions ? getActions(node) : []), [getActions]);
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
