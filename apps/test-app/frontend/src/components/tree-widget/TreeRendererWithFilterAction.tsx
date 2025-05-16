/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback } from "react";
import { FilterAction, PresentationHierarchyNode, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react";

export function TreeRendererWithFilterAction(props: ComponentPropsWithoutRef<typeof StrataKitTreeRenderer>) {
  const { getHierarchyLevelDetails, onFilterClick, getActions, ...treeProps } = props;
  const getAllActions = useCallback(
    (node: PresentationHierarchyNode) => [
      ...(getActions ? getActions(node) : []),
      <FilterAction key="filter" node={node} onFilter={onFilterClick} getHierarchyLevelDetails={getHierarchyLevelDetails} />,
    ],
    [getActions, onFilterClick, getHierarchyLevelDetails],
  );

  return <StrataKitTreeRenderer {...treeProps} getActions={getAllActions} onFilterClick={onFilterClick} getHierarchyLevelDetails={getHierarchyLevelDetails} />;
}
