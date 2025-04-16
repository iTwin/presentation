/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { memo, useCallback } from "react";
import { Tree } from "@itwin/itwinui-react/bricks";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { useLocalizationContext } from "./LocalizationContext.js";

const filterSvg = new URL("@itwin/itwinui-icons/filter.svg", import.meta.url).href;

/** @alpha */
export interface TreeActionButtonProps {
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

/** @alpha */
export function TreeActionButton({ show, label, action, icon, activeDescription }: TreeActionButtonProps) {
  return <Tree.ItemAction label={label} dot={activeDescription} icon={icon} visible={show} onClick={action} />;
}

/** @alpha */
export const TreeFilterActionButton = memo(function TreeFilterActionButton({
  node,
  onFilter,
  getHierarchyLevelDetails,
}: FilterActionProps & { node: PresentationHierarchyNode }) {
  const { localizedStrings } = useLocalizationContext();
  const { filterHierarchyLevel, filterHierarchyLevelActiveDescription } = localizedStrings;
  const shouldShow = () => {
    if (!onFilter || !node.isFilterable) {
      return false;
    }
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
    <TreeActionButton
      label={filterHierarchyLevel}
      action={handleClick}
      icon={filterSvg}
      show={shouldShow()}
      activeDescription={node.isFiltered ? filterHierarchyLevelActiveDescription : undefined}
    />
  );
});
