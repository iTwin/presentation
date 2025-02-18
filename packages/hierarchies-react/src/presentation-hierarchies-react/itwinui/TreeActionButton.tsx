/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Tree } from "@itwin/itwinui-react/bricks";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { defaultLocalizedStrings } from "./LocalizationContext.js";

const filterIcon = new URL("@itwin/itwinui-icons/filter.svg", import.meta.url).href;
const placeholderIcon = new URL("@itwin/itwinui-icons/placeholder.svg", import.meta.url).href; // TODO: active filter icon/placeholder icon if button was not given an icon

/** @alpha */
export interface TreeItemAction {
  label: string;
  action: () => void;
  /**
   * Determines action items visibility:
   * - `False` - action item is hidden.
   * - `True` - action item is visible at all times.
   * - `Undefined` - action item is visible on hover/focus.
   */
  show?: boolean;
  icon?: string;
}

/** @alpha */
export type FilterActionProps = {
  /** Action to perform when the filter button is clicked for this node. */
  onFilter?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;

  label?: string;
} & Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">>;

/** @internal */
export function TreeActionButton({ show, label, action, icon }: TreeItemAction) {
  return <Tree.ItemAction visible={show} onClick={action} label={label} icon={icon ?? placeholderIcon} />;
}

/** @alpha */
export function createFilterAction({ onFilter, getHierarchyLevelDetails, label }: FilterActionProps): (node: PresentationHierarchyNode) => TreeItemAction {
  return (node) => {
    const handleVisibility = () => {
      if (!onFilter || !node.isFilterable) {
        return false;
      }
      if (node.isFiltered) {
        return true;
      }
      return undefined;
    };

    return {
      label: label ?? defaultLocalizedStrings.filterHierarchyLevel,
      action: () => {
        const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
        hierarchyLevelDetails && onFilter?.(hierarchyLevelDetails);
      },
      show: handleVisibility(),
      isDropdownAction: false,
      icon: node.isFiltered ? placeholderIcon : filterIcon,
    };
  };
}
