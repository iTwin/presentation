/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { filter, first, from, map, mergeMap, of } from "rxjs";
import { BeEvent, isIDisposable } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { Event, InstanceKey, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import { HierarchyFilteringPath } from "./HierarchyFiltering.js";
import { HierarchyNode, ParentHierarchyNode } from "./HierarchyNode.js";
import { eachValueFrom } from "./internal/EachValueFrom.js";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting.js";

/**
 * Props for the `HierarchyProvider.getNodes` call.
 * @public
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

  /** When set to `true` ignores the cache and fetches the nodes again. */
  ignoreCache?: boolean;
}

/**
 * An interface for a hierarchy provider that knows how to create child nodes for a given parent node.
 * @public
 */
export interface HierarchyProvider {
  /**
   * An event that provider raises when the internal data source changes, resulting in a
   * hierarchy change.
   *
   * Consumers are expected to subscribe to this event and reload the hierarchy when it's raised.
   */
  readonly hierarchyChanged: Event<() => void>;

  /**
   * Gets nodes for the specified parent node. This is **the method to implement**, otherwise
   * the provider doesn't return any nodes.
   */
  getNodes(props: GetHierarchyNodesProps): AsyncIterableIterator<HierarchyNode>;

  /**
   * Gets instance keys for the specified parent node.
   *
   * The result of this method may be used to determine instances whose nodes would be displayed as children
   * of the specified parent node. For such use cases calling this method should be more efficient compared
   * to calling `getNodes`.
   */
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

/**
 * Props for `mergeProviders` function.
 * @public
 */
interface MergeHierarchyProvidersProps {
  /** List of providers to merge. */
  providers: HierarchyProvider[];
}

/**
 * Creates a single, merged, hierarchy provider from multiple given providers.
 * @public
 */
export function mergeProviders({ providers }: MergeHierarchyProvidersProps): HierarchyProvider & { dispose: () => void } {
  const hierarchyChanged = new BeEvent<() => void>();
  providers.forEach((p) => {
    p.hierarchyChanged.addListener(() => hierarchyChanged.raiseEvent());
  });

  return {
    hierarchyChanged,
    getNodes: (props) =>
      eachValueFrom(
        from(providers).pipe(
          mergeMap((provider) =>
            from(provider.getNodes(props)).pipe(
              mergeMap((node) => {
                if (node.children) {
                  return of(node);
                }
                // each provider only considers its own data when determining node's children - in case it says
                // the node has no children, we have to check against the other providers too
                return from(providers).pipe(
                  filter((p) => p !== provider),
                  mergeMap((p) => p.getNodes({ parentNode: node })),
                  map(() => true),
                  first(undefined, false),
                  map((hasChildren) => ({ ...node, children: hasChildren })),
                );
              }),
            ),
          ),
          sortNodesByLabelOperator,
          // TODO: consider merging similar nodes
        ),
      ),
    getNodeInstanceKeys: (props) => eachValueFrom(from(providers).pipe(mergeMap((p) => p.getNodeInstanceKeys(props)))),
    setFormatter: (formatter) => providers.forEach((p) => p.setFormatter(formatter)),
    setHierarchyFilter: (props) => providers.forEach((p) => p.setHierarchyFilter(props)),
    dispose: () => {
      hierarchyChanged.clear();
      providers.forEach((p) => {
        isIDisposable(p) && p.dispose();
      });
    },
  };
}
