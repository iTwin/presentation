/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback, useMemo } from "react";
import {
  ErrorItemRenderer,
  FilterAction,
  PresentationHierarchyNode,
  RenameAction,
  StrataKitTreeRenderer,
  TreeErrorRenderer,
} from "@itwin/presentation-hierarchies-react";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";

type TreeRendererProps = ComponentPropsWithoutRef<typeof StrataKitTreeRenderer>;

export function TreeRendererWithFilterAction(props: TreeRendererProps) {
  const { getHierarchyLevelDetails, onFilterClick, getMenuActions: getActions, ...treeProps } = props;
  const getInlineActions = useCallback(
    (node: PresentationHierarchyNode) => [
      <FilterAction key="filter" node={node} onFilter={onFilterClick} getHierarchyLevelDetails={getHierarchyLevelDetails} reserveSpace />,
      <RenameAction key="rename" reserveSpace />,
    ],
    [onFilterClick, getHierarchyLevelDetails],
  );

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

  const getMenuActions = useCallback((node: PresentationHierarchyNode) => (getActions ? getActions(node) : []), [getActions]);
  const getEditingProps = useCallback<Required<TreeRendererProps>["getEditingProps"]>((node) => {
    return {
      onLabelChanged: (newLabel: string) => {
        // Handle label change
        // eslint-disable-next-line no-console
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
