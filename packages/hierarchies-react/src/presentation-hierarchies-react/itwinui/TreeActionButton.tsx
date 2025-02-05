/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeActionButton.css";
import { IconButton } from "@itwin/itwinui-react/bricks";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { TreeItemAction } from "./TreeNodeRenderer.js";

const filterIcon = new URL("@itwin/itwinui-icons/filter.svg", import.meta.url).href;
const placeholderIcon = new URL("@itwin/itwinui-icons/placeholder.svg", import.meta.url).href; // TODO: active filter icon/placeholder icon if button was not given an icon

/** @internal */
export type ActionProps = {
  /** Action to perform when the filter button is clicked for this node. */
  onClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;

  label?: string;
} & Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">>;

/** @internal */
export function TreeActionButton({ show, label, action, icon }: TreeItemAction) {
  return (
    <IconButton
      className={`tree-action-item${!show ? "-invisible" : ""}`}
      variant={"ghost"}
      onClick={() => action()}
      label={label}
      icon={icon ?? placeholderIcon}
    />
  );
}

/** @internal */
export function getFilterAction({ onClick, getHierarchyLevelDetails, label }: ActionProps): (node: PresentationHierarchyNode) => TreeItemAction {
  return (node) => {
    return {
      label: label ?? "Filter action", //TODO: fix naming
      action: () => {
        const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
        hierarchyLevelDetails && onClick?.(hierarchyLevelDetails);
      },
      show: !!onClick && node.isFilterable,
      isDropdownAction: false,
      icon: node.isFiltered ? placeholderIcon : filterIcon,
    };
  };
}
