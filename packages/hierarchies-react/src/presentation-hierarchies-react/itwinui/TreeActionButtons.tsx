/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useRef } from "react";
import { IconButton } from "@itwin/itwinui-react/bricks";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { useLocalizationContext } from "./LocalizationContext.js";

const filterIcon = new URL("@itwin/itwinui-icons/filter.svg", import.meta.url).href;
const SvgRemove = new URL("@itwin/itwinui-icons/dismiss.svg", import.meta.url).href;

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
  const applyFilterButtonRef = useRef<HTMLButtonElement>(null);

  return onClick && node.isFilterable ? (
    <IconButton
      style={{ position: "relative" }} // for icons to be visible, should be fixed by kiwi
      ref={applyFilterButtonRef}
      className="filtering-action-button"
      label={localizedStrings.filterHierarchyLevel}
      onClick={(e) => {
        e.stopPropagation();
        const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
        hierarchyLevelDetails && onClick(hierarchyLevelDetails);
      }}
      icon={node.isFiltered ? filterIcon : filterIcon} // currently base filter icon is hollow
    />
  ) : undefined;
}

/** @internal */
export function RemoveFilterActionButton({ node, getHierarchyLevelDetails }: ActionButtonProps) {
  const { localizedStrings } = useLocalizationContext();
  const applyFilterButtonRef = useRef<HTMLButtonElement>(null);

  return getHierarchyLevelDetails && node.isFiltered ? (
    <IconButton
      style={{ position: "relative" }} // for button to work, should be fixed by kiwi
      className="filtering-action-button"
      label={localizedStrings.clearHierarchyLevelFilter}
      onClick={(e) => {
        e.stopPropagation();
        getHierarchyLevelDetails(node.id)?.setInstanceFilter(undefined);
        applyFilterButtonRef.current?.focus();
      }}
      icon={SvgRemove}
    />
  ) : null;
}
