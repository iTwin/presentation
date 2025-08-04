/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { memo, useCallback } from "react";
import filterSvg from "@stratakit/icons/filter.svg";
import { Tree } from "@stratakit/structures";
import { HierarchyLevelDetails, TreeRendererProps } from "../Renderers.js";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";

/** @alpha */
export type FilterActionProps = {
  /** Action to perform when the filter button is clicked for this node. */
  onFilter?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
  /**
   * Indicates that space for this action button should be reserved, even when the action is not available.
   * For nodes that don't support filtering, `<FilterAction reserveSpace />` renders:
   *
   * - Blank space when the action is used as an inline action. It's recommended to set this prop to keep all action buttons of the same kind vertically aligned.
   * - Disabled menu item when the action is used as a menu action.
   */
  reserveSpace: true | undefined;
} & Pick<TreeRendererProps, "getHierarchyLevelDetails">;

/**
 * React component that renders a filter action for a tree item.
 * @alpha
 */
export const FilterAction = memo(function FilterAction({
  node,
  onFilter,
  getHierarchyLevelDetails,
  reserveSpace,
}: FilterActionProps & { node: PresentationHierarchyNode }) {
  const { localizedStrings } = useLocalizationContext();
  const { filterHierarchyLevel, filterHierarchyLevelActiveDescription } = localizedStrings;

  const handleClick = useCallback(() => {
    const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
    hierarchyLevelDetails && onFilter?.(hierarchyLevelDetails);
  }, [node, getHierarchyLevelDetails, onFilter]);

  if (!onFilter || !node.isFilterable) {
    return reserveSpace ? <Tree.ItemAction label={filterHierarchyLevel} icon={filterSvg} visible={false} disabled /> : undefined;
  }

  return (
    <Tree.ItemAction
      label={filterHierarchyLevel}
      onClick={handleClick}
      icon={filterSvg}
      visible={node.isFiltered ? true : undefined}
      dot={node.isFiltered ? filterHierarchyLevelActiveDescription : undefined}
    />
  );
});
