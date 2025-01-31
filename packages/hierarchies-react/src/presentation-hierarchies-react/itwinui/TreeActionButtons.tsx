/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IconButton } from "@itwin/itwinui-react/bricks";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { useLocalizationContext } from "./LocalizationContext.js";

const filterIcon = new URL("@itwin/itwinui-icons/filter.svg", import.meta.url).href;
const activeFilterIcon = new URL("@itwin/itwinui-icons/placeholder.svg", import.meta.url).href; // Placeholder

/** @internal */
export type ActionButtonProps = {
  /** Node on which action is going to be performed */
  node: PresentationHierarchyNode;
  /** Action to perform when the filter button is clicked for this node. */
  onClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
} & Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">>;

/** @internal */
export function FilterActionButton({ node, onClick, getHierarchyLevelDetails }: ActionButtonProps) {
  const { localizedStrings } = useLocalizationContext();

  return onClick && node.isFilterable ? (
    <IconButton
      variant={"ghost"}
      className="filtering-action-button"
      label={localizedStrings.filterHierarchyLevel}
      onClick={(e) => {
        e.stopPropagation();
        const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
        hierarchyLevelDetails && onClick(hierarchyLevelDetails);
      }}
      icon={node.isFiltered ? activeFilterIcon : filterIcon}
    />
  ) : undefined;
}
