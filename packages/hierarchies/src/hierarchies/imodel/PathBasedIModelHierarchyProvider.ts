/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ProcessedHierarchyNode } from "./IModelHierarchyNode.js";
import { IModelHierarchyProviderImpl } from "./IModelHierarchyProvider.js";

import type { Observable } from "rxjs";
import type { GenericInstanceFilter } from "@itwin/core-common";
import type { DeepReadonly, Props } from "@itwin/presentation-shared";
import type { GroupingHierarchyNode, HierarchyNode, ParentHierarchyNode } from "../HierarchyNode.js";
import type { IModelInstanceKey, InstancesNodeKey } from "../HierarchyNodeKey.js";
import type { GetHierarchyNodesProps } from "../HierarchyProvider.js";
import type { HierarchyDefinition } from "./IModelHierarchyDefinition.js";
import type { createIModelHierarchyProvider, HierarchyLevelParentPropsHandler } from "./IModelHierarchyProvider.js";

/**
 * Props that identify the parent of a hierarchy level by a path of instance keys from a root node to the parent node.
 * Hierarchy definitions that use these props are called path-based.
 */
export interface HierarchyLevelPathProps {
  path: DeepReadonly<IModelInstanceKey[]>;
}

/**
 * Props that identify the parent of a hierarchy level in `PathBasedIModelHierarchyProvider` requests - a path to the
 * non-grouping parent node, and a grouping node, when requesting children of a grouping node.
 */
type PathBasedParentProps = HierarchyLevelPathProps & { groupingNode?: ParentHierarchyNode<GroupingHierarchyNode> };

/** Props for `PathBasedIModelHierarchyProvider`. */
export type PathBasedIModelHierarchyProviderProps = Pick<
  Props<typeof createIModelHierarchyProvider>,
  "imodelAccess" | "instanceLabelSelectClauseFactory" | "queryConcurrency" | "localizedStrings" | "formatter"
> & {
  /** A hierarchy definition that identifies parents of hierarchy levels by paths of instance keys. */
  hierarchyDefinition: HierarchyDefinition<HierarchyLevelPathProps>;
};

/** A node returned by `PathBasedIModelHierarchyProvider`. Nodes hidden in the hierarchy have the `isHidden` flag. */
export type PathBasedHierarchyNode = HierarchyNode & { isHidden?: boolean };

interface RequestProps extends HierarchyLevelPathProps {
  instanceFilter?: GenericInstanceFilter;
  hierarchyLevelSizeLimit?: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];
}

/**
 * A hierarchy provider for a single iModel that identifies parents of hierarchy levels by paths of instance keys from
 * a root node, rather than by parent nodes - hierarchy definition callbacks receive a `path` instead of `parentNode`.
 * Paths of child hierarchy levels, requested while processing nodes (e.g. to determine whether nodes have children), end
 * with an instance key of the node. Generic node keys can't be put into paths, so generic nodes have no children.
 *
 * Differences from `HierarchyProvider.getNodes`:
 * - nodes hidden in the hierarchy are returned with `isHidden` flag, instead of their children,
 * - hierarchy levels are cached for the lifetime of the provider.
 */
export class PathBasedIModelHierarchyProvider {
  readonly #impl: IModelHierarchyProviderImpl<PathBasedParentProps>;

  public constructor(props: PathBasedIModelHierarchyProviderProps) {
    const { imodelAccess, instanceLabelSelectClauseFactory, hierarchyDefinition, ...restProps } = props;
    this.#impl = new IModelHierarchyProviderImpl({
      ...restProps,
      imodels: [{ imodelAccess, instanceLabelSelectClauseFactory }],
      getHierarchyDefinition: () => hierarchyDefinition,
      parentPropsHandler: pathBasedParentPropsHandler,
      // the provider is short-lived and grouping nodes' children are retrieved from cache, so don't limit it
      queryCacheSize: Number.MAX_SAFE_INTEGER,
    });
  }

  /** Loads the hierarchy level whose parent is identified by the given path. Pass an empty path for root nodes. */
  public getNodes(props: RequestProps): Observable<PathBasedHierarchyNode> {
    return this.#impl.getNodesObservable({ ...props, returnHiddenNodes: true });
  }

  /**
   * Loads children of a grouping node returned by this provider. Pass the same props, including the `path`, as were used
   * to get the grouping node.
   */
  public getGroupingNodeChildren({
    groupingNode,
    ...props
  }: RequestProps & { groupingNode: GroupingHierarchyNode }): Observable<PathBasedHierarchyNode> {
    return this.#impl.getNodesObservable({ ...props, groupingNode });
  }
}

/** Handles hierarchy levels identified by paths of instance keys. */
export const pathBasedParentPropsHandler: HierarchyLevelParentPropsHandler<PathBasedParentProps> = {
  getGroupingParentNode: ({ groupingNode }) => groupingNode,
  // paths don't have non-grouping parent nodes to assign to grouping nodes as their non-grouping ancestors
  getGroupingNodeAttributes: () => ({}),
  getParentKeys: ({ path, groupingNode }) =>
    groupingNode ? [...groupingNode.parentKeys, groupingNode.key] : path.map(createInstancesNodeKey),
  // grouping nodes group nodes of the hierarchy level of the path
  getGroupedHierarchyLevelParentProps: ({ path }) => ({ path }),
  createGroupingNodeChildrenParentProps: ({ node, parentProps: { path } }) => ({ path, groupingNode: node }),
  createChildrenParentProps: ({ node, parentProps }) => {
    if (ProcessedHierarchyNode.isGroupingNode(node)) {
      return [pathBasedParentPropsHandler.createGroupingNodeChildrenParentProps({ node, parentProps })];
    }
    // generic node keys can't be put into paths, so children of generic nodes can't be requested
    if (!ProcessedHierarchyNode.isInstancesNode(node)) {
      return [];
    }
    // children of a node with multiple instance keys are children of all its instances
    return node.key.instanceKeys.map((key) => ({ path: [...parentProps.path, key] }));
  },
  getIModelParentProps: ({ parentProps }) => parentProps,
  createIdentifierForLogging: ({ path, groupingNode }) =>
    `<path: ${path.map(({ className, id }) => `${className}:${id}`).join(" / ")}${groupingNode ? `, grouping node: ${JSON.stringify(groupingNode.key)}` : ""}>`,
};

function createInstancesNodeKey(instanceKey: DeepReadonly<IModelInstanceKey>): InstancesNodeKey {
  return { type: "instances", instanceKeys: [{ ...instanceKey }] };
}
