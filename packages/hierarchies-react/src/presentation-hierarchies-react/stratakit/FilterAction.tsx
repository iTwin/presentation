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
} & Pick<TreeRendererProps, "getHierarchyLevelDetails">;

/**
 * React hook returning a getter for Filter action.
 * @alpha
 */
export function useFilterAction({ onFilter, getHierarchyLevelDetails }: FilterActionProps) {
  return {
    getFilterAction: useCallback(
      (node: PresentationHierarchyNode) => {
        if (!onFilter || !node.isFilterable) {
          return undefined;
        }
        return <FilterAction getHierarchyLevelDetails={getHierarchyLevelDetails} node={node} onFilter={onFilter} />;
      },
      [getHierarchyLevelDetails, onFilter],
    ),
  };
}

/**
 * React component that renders a filter action for a tree item.
 * @alpha
 */
const FilterAction = memo(function FilterAction({ node, onFilter, getHierarchyLevelDetails }: FilterActionProps & { node: PresentationHierarchyNode }) {
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
