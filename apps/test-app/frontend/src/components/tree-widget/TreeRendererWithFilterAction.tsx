/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback } from "react";
import { FilterAction, PresentationHierarchyNode, RenameAction, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react";

type TreeRendererProps = ComponentPropsWithoutRef<typeof StrataKitTreeRenderer>;

export function TreeRendererWithFilterAction(props: TreeRendererProps) {
  const { getHierarchyLevelDetails, onFilterClick, getActions, ...treeProps } = props;
  const getAllActions = useCallback(
    (node: PresentationHierarchyNode) => [
      ...(getActions ? getActions(node) : []),
      <FilterAction key="filter" node={node} onFilter={onFilterClick} getHierarchyLevelDetails={getHierarchyLevelDetails} />,
      <RenameAction key="rename" />,
    ],
    [getActions, onFilterClick, getHierarchyLevelDetails],
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
      getActions={getAllActions}
      onFilterClick={onFilterClick}
      getHierarchyLevelDetails={getHierarchyLevelDetails}
      getEditingProps={getEditingProps}
    />
  );
}
