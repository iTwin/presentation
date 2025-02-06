/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeActionButton.css";
import { IconButton } from "@itwin/itwinui-react/bricks";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";

const filterIcon = new URL("@itwin/itwinui-icons/filter.svg", import.meta.url).href;
const placeholderIcon = new URL("@itwin/itwinui-icons/placeholder.svg", import.meta.url).href; // TODO: active filter icon/placeholder icon if button was not given an icon

/** @alpha */
export interface TreeItemAction {
  label: string;
  action: () => void;
  show: boolean;
  icon?: string;
}

/** @alpha */
export type FilterActionProps = {
  /** Action to perform when the filter button is clicked for this node. */
  onFilter?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;

  label: string;
} & Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">>;

/** @internal */
export function TreeActionButton({ show, label, action, icon }: TreeItemAction) {
  return (
    <IconButton className={`tree-action-item${!show ? "-invisible" : ""}`} variant={"ghost"} onClick={action} label={label} icon={icon ?? placeholderIcon} />
  );
}

/** @alpha */
export function createFilterAction({ onFilter, getHierarchyLevelDetails, label }: FilterActionProps): (node: PresentationHierarchyNode) => TreeItemAction {
  return (node) => {
    return {
      label,
      action: () => {
        const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
        hierarchyLevelDetails && onFilter?.(hierarchyLevelDetails);
      },
      show: !!onFilter && node.isFilterable,
      isDropdownAction: false,
      icon: node.isFiltered ? placeholderIcon : filterIcon,
    };
  };
}
