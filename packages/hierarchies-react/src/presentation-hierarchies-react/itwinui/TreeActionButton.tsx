/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IconButton, Tree } from "@itwin/itwinui-react/bricks";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { LocalizedStrings, useLocalizationContext } from "./LocalizationContext.js";

const filterIcon = new URL("@itwin/itwinui-icons/filter.svg", import.meta.url).href;

/** @alpha */
export interface TreeItemAction {
  label: string;
  action: () => void;
  icon: string;
  /**
   * Determines action items visibility:
   * - `False` - action item is hidden.
   * - `True` - action item is visible at all times.
   * - `Undefined` - action item is visible on hover/focus.
   */
  show?: boolean;
  /**
   * Provide a value when action button is in active state to display a dot above the button.
   * Provided text value is used to set accessible description it should descibe why the action is in active state.
   * If left undefined the action item will be rendered normally.
   */
  activeDescription?: string;
}

/** @alpha */
export type FilterActionProps = {
  /** Action to perform when the filter button is clicked for this node. */
  onFilter?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
} & Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">>;

/** @internal */
export function TreeActionButton({ show, label, action, icon, activeDescription }: TreeItemAction) {
  const { localizedStrings } = useLocalizationContext();
  const localizedLabel: string | undefined = localizedStrings[label as keyof typeof localizedStrings];
  const localizedDescription: string | undefined = localizedStrings[activeDescription as keyof typeof localizedStrings];
  return (
    <Tree.ItemAction
      render={<IconButton dot={localizedDescription ?? activeDescription} icon={icon} variant={"ghost"} label={localizedLabel ?? label} />}
      label={localizedLabel ?? label}
      icon={icon}
      visible={show}
      onClick={action}
    />
  );
}

/** @alpha */
export function createFilterAction({ onFilter, getHierarchyLevelDetails }: FilterActionProps): (node: PresentationHierarchyNode) => TreeItemAction {
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
      label: "filterHierarchyLevel" satisfies keyof LocalizedStrings,
      action: () => {
        const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
        hierarchyLevelDetails && onFilter?.(hierarchyLevelDetails);
      },
      show: handleVisibility(),
      isDropdownAction: false,
      activeDescription: node.isFiltered ? ("filterHierarchyLevelActiveDescription" satisfies keyof LocalizedStrings) : undefined,
      icon: filterIcon,
    };
  };
}
