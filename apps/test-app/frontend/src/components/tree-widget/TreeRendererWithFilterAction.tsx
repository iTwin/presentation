/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, memo, useCallback, useMemo } from "react";
import {
  ErrorItemRenderer,
  FilterAction,
  PresentationHierarchyNode,
  RenameAction,
  StrataKitTreeRenderer,
  TreeActionBase,
  TreeActionBaseAttributes,
  TreeErrorRenderer,
} from "@itwin/presentation-hierarchies-react";
import addSvg from "@stratakit/icons/add.svg";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";

/* eslint-disable no-console */

type TreeRendererProps = ComponentPropsWithoutRef<typeof StrataKitTreeRenderer>;

export function TreeRendererWithFilterAction(props: TreeRendererProps) {
  const { getHierarchyLevelDetails, onFilterClick, ...treeProps } = props;
  const nodesWithError = useMemo(() => {
    return mapNodesHierarchy(treeProps.rootNodes, (node) => {
      if (node.label.includes("[0-1M]") || node.label.includes("[0-1U]") || node.label.includes("[0-29]")) {
        return {
          ...node,
          error: {
            id: `${node.id}-object-error`,
            type: "Unknown",
            message: "Object {{node}} is not available",
            additionalData: {
              code: "404",
            },
          },
        };
      }
      return node;
    });
  }, [treeProps.rootNodes]);

  const getInlineActions = useCallback<Required<TreeRendererProps>["getInlineActions"]>(
    ({ targetNode, selectedNodes }) => [
      <CustomAction key="custom" node={targetNode} selectedNodes={selectedNodes} />,
      <FilterAction key="filter" node={targetNode} onFilter={onFilterClick} getHierarchyLevelDetails={getHierarchyLevelDetails} />,
      <RenameAction key="rename" />,
    ],
    [onFilterClick, getHierarchyLevelDetails],
  );
  const getMenuActions = useCallback<Required<TreeRendererProps>["getMenuActions"]>(() => [<RenameAction key="rename" />], []);
  const getContextMenuActions = useCallback<Required<TreeRendererProps>["getContextMenuActions"]>(
    ({ targetNode, selectedNodes }) => [
      <CustomAction key="custom" node={targetNode} selectedNodes={selectedNodes} />,
      <FilterAction key="filter" node={targetNode} onFilter={onFilterClick} getHierarchyLevelDetails={getHierarchyLevelDetails} />,
      <RenameAction key="rename" />,
    ],
    [onFilterClick, getHierarchyLevelDetails],
  );

  const getEditingProps = useCallback<Required<TreeRendererProps>["getEditingProps"]>((node) => {
    return {
      onLabelChanged: (newLabel: string) => {
        // Handle label change
        console.log(`Node label changed from ${node.label} to ${newLabel}`);
      },
    };
  }, []);

  return (
    <StrataKitTreeRenderer
      {...treeProps}
      rootNodes={nodesWithError}
      getInlineActions={getInlineActions}
      getMenuActions={getMenuActions}
      getContextMenuActions={getContextMenuActions}
      onFilterClick={onFilterClick}
      getHierarchyLevelDetails={getHierarchyLevelDetails}
      getEditingProps={getEditingProps}
      errorRenderer={(errorProps) => {
        return (
          <TreeErrorRenderer
            {...errorProps}
            renderError={(errorItemProps) => {
              if (errorItemProps.errorItem.errorNode.error.type === "Unknown") {
                return <ErrorRegion.Item message="Custom error" messageId={errorItemProps.errorItem.errorNode.id} />;
              }

              return <ErrorItemRenderer {...errorItemProps} />;
            }}
          />
        );
      }}
    />
  );
}

function mapNodesHierarchy(
  nodes: PresentationHierarchyNode[],
  callback: (node: PresentationHierarchyNode) => PresentationHierarchyNode,
): PresentationHierarchyNode[] {
  return nodes.map((node) => {
    return {
      ...callback(node),
      children: node.children === true ? true : mapNodesHierarchy(node.children, callback),
    };
  });
}

const CustomAction = memo(function CustomAction({
  node,
  selectedNodes,
  ...actionAttributes
}: { node: PresentationHierarchyNode; selectedNodes: PresentationHierarchyNode[] } & TreeActionBaseAttributes) {
  const handleClick = useCallback(() => {
    console.log("Custom action clicked for node:", node);
    console.log("Currently selected nodes:", selectedNodes);
  }, [node, selectedNodes]);

  return <TreeActionBase {...actionAttributes} label={"Custom action"} onClick={handleClick} icon={addSvg} />;
});
