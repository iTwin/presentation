/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { memo, useCallback } from "react";
import filterSvg from "@stratakit/icons/filter.svg";
import { HierarchyLevelDetails, TreeRendererProps } from "../Renderers.js";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import { TreeActionBase, TreeActionBaseAttributes } from "./TreeAction.js";

/** @alpha */
export type FilterActionProps = {
  /** Action to perform when the filter button is clicked for this node. */
  onFilter?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
} & TreeActionBaseAttributes &
  Pick<TreeRendererProps, "getHierarchyLevelDetails">;

/**
 * React component that renders a filter action for a tree item.
 * @alpha
 */
export const FilterAction = memo(function FilterAction({
  node,
  onFilter,
  getHierarchyLevelDetails,
  ...actionAttributes
}: FilterActionProps & { node: PresentationHierarchyNode }) {
  const { localizedStrings } = useLocalizationContext();
  const { filterHierarchyLevel, filterHierarchyLevelActiveDescription } = localizedStrings;

  const handleClick = useCallback(() => {
    const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
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
