/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { memo, useCallback } from "react";
import filterSvg from "@stratakit/icons/filter.svg";
import { useLocalizationContext } from "./LocalizationContext.js";
import { TreeActionBase } from "./TreeAction.js";

import type { HierarchyLevelDetails, TreeRendererProps } from "../Renderers.js";
import type { TreeNode } from "../TreeNode.js";
import type { TreeActionBaseAttributes } from "./TreeAction.js";

/** @alpha */
type TreeNodeFilterActionProps = {
  /**
   * Action to perform when the filter button is clicked for this node.
   */
  onFilter?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
} & TreeActionBaseAttributes &
  Pick<TreeRendererProps, "getHierarchyLevelDetails">;

/**
 * React component that renders a filter action for a tree item.
 *
 * The action calls the `onFilter` callback prop when clicked.
 *
 * @see `getMenuActions`, `getInlineActions`, `getContextMenuActions` props of `TreeRenderer` to add this action
 * to tree items.
 *
 * @alpha
 */
export const TreeNodeFilterAction = memo(function TreeNodeFilterAction({
  node,
  onFilter,
  getHierarchyLevelDetails,
  ...actionAttributes
}: TreeNodeFilterActionProps & { node: TreeNode }) {
  const { localizedStrings } = useLocalizationContext();
  const { filterHierarchyLevel, filterHierarchyLevelActiveDescription } = localizedStrings;

  const handleClick = useCallback(() => {
    const hierarchyLevelDetails = getHierarchyLevelDetails(node.id);
    hierarchyLevelDetails && onFilter?.(hierarchyLevelDetails);
  }, [node, getHierarchyLevelDetails, onFilter]);

  return (
    <TreeActionBase
      {...actionAttributes}
      label={filterHierarchyLevel}
      onClick={handleClick}
      icon={filterSvg}
      visible={node.isFiltered ? true : undefined}
      dot={node.isFiltered ? filterHierarchyLevelActiveDescription : undefined}
      hide={!onFilter || !node.isFilterable}
    />
  );
});
