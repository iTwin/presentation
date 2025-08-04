/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { memo, useCallback } from "react";
import filterSvg from "@stratakit/icons/filter.svg";
import placeholderSvg from "@stratakit/icons/placeholder.svg";
import { Tree } from "@stratakit/structures";
import { HierarchyLevelDetails, TreeRendererProps } from "../Renderers.js";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";

/** @alpha */
export type FilterActionProps = {
  /** Action to perform when the filter button is clicked for this node. */
  onFilter?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
  /**
   * Indicates if the action is inline.
   * Set to `true` to reserve space when not displayed.
   * Leave `undefined` for menu items.
   */
  inline: true | undefined;
} & Pick<TreeRendererProps, "getHierarchyLevelDetails">;

/**
 * React component that renders a filter action for a tree item.
 * @alpha
 */
export const FilterAction = memo(function FilterAction({
  node,
  onFilter,
  getHierarchyLevelDetails,
  inline,
}: FilterActionProps & { node: PresentationHierarchyNode }) {
  const { localizedStrings } = useLocalizationContext();
  const { filterHierarchyLevel, filterHierarchyLevelActiveDescription } = localizedStrings;

  const shouldShow = () => {
    if (node.isFiltered) {
      return true;
    }
    return undefined;
  };

  const handleClick = useCallback(() => {
    const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
    hierarchyLevelDetails && onFilter?.(hierarchyLevelDetails);
  }, [node, getHierarchyLevelDetails, onFilter]);

  if (!onFilter || !node.isFilterable) {
    return inline ? <Tree.ItemAction label="hidden-action" visible={false} icon={placeholderSvg} /> : undefined;
  }

  return (
    <Tree.ItemAction
      label={filterHierarchyLevel}
      onClick={handleClick}
      icon={filterSvg}
      visible={shouldShow()}
      dot={node.isFiltered ? filterHierarchyLevelActiveDescription : undefined}
    />
  );
});
