/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap } from "rxjs";
import { isIDisposable } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { InstanceKey, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import { HierarchyFilteringPath } from "./HierarchyFiltering";
import { HierarchyNode, ParentHierarchyNode } from "./HierarchyNode";
import { eachValueFrom } from "./internal/EachValueFrom";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting";

/**
 * Props for the `HierarchyProvider.getNodes` call.
 * @beta
 */
export interface GetHierarchyNodesProps {
  /** Parent node to get children for. Pass `undefined` to get root nodes. */
  parentNode: ParentHierarchyNode | undefined;

  /** Optional hierarchy level filter. Has no effect if `parentNode` is a `GroupingNode`. */
  instanceFilter?: GenericInstanceFilter;

  /**
   * Optional hierarchy level size limit override. This value is passed to `LimitingECSqlQueryExecutor` used
   * by this provider to override query rows limit per hierarchy level. If not provided, defaults to whatever
   * is used by the limiting query executor.
   *
   * Has no effect if `parentNode` is a `GroupingNode`.
   */
  hierarchyLevelSizeLimit?: number | "unbounded";

  /** When set to true ignores the cache and fetches the nodes again. */
  ignoreCache?: boolean;
}

/**
 * An interface for a hierarchy provider that knows how to create child nodes for a given parent node.
 * @beta
 */
export interface HierarchyProvider {
  /** Gets nodes for the specified parent node. */
  getNodes(props: GetHierarchyNodesProps): AsyncIterableIterator<HierarchyNode>;

  /** Gets instance keys for the specified parent node. */
  getNodeInstanceKeys(props: Omit<GetHierarchyNodesProps, "ignoreCache">): AsyncIterableIterator<InstanceKey>;

  /**
   * Overrides the property value formatter used by the hierarchy provider. Setting to `undefined`
   * resets the formatter to the result of `createDefaultValueFormatter` called with default parameters.
   */
  setFormatter(formatter: IPrimitiveValueFormatter | undefined): void;

  /**
   * Sets the hierarchy filter used by this hierarchy provider. Setting to `undefined`
   * removes the filter.
   */
  setHierarchyFilter(
    props:
      | {
          /** A list of node identifiers from root to target node. */
          paths: HierarchyFilteringPath[];
        }
      | undefined,
  ): void;
}

/** @beta */
interface MergeHierarchyProvidersProps {
  providers: HierarchyProvider[];
}

/** @beta */
export function mergeProviders({ providers }: MergeHierarchyProvidersProps): HierarchyProvider & { dispose: () => void } {
  return {
    getNodes: (props) =>
      eachValueFrom(
        from(providers).pipe(
          mergeMap((p) => p.getNodes(props)),
          sortNodesByLabelOperator,
          // TODO: consider merging similar nodes
        ),
      ),
    getNodeInstanceKeys: (props) => eachValueFrom(from(providers).pipe(mergeMap((p) => p.getNodeInstanceKeys(props)))),
    setFormatter: (formatter) => providers.forEach((p) => p.setFormatter(formatter)),
    setHierarchyFilter: (props) => providers.forEach((p) => p.setHierarchyFilter(props)),
    dispose: () =>
      providers.forEach((p) => {
        isIDisposable(p) && p.dispose();
      }),
  };
}
