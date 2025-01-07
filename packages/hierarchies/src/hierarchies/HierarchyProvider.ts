/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./internal/DisposePolyfill.js";
import { filter, first, from, map, mergeMap, of } from "rxjs";
import { BeEvent } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { Event, InstanceKey, IPrimitiveValueFormatter, Props } from "@itwin/presentation-shared";
import { HierarchyFilteringPath } from "./HierarchyFiltering.js";
import { HierarchyNode, ParentHierarchyNode } from "./HierarchyNode.js";
import { safeDispose } from "./internal/Common.js";
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
 * Event arguments for `HierarchyProvider.hierarchyChanged` event.
 * @public
 */
interface HierarchyChangedEventArgs {
  /** Set when the hierarchy change was caused by a formatter change. */
  formatterChange?: {
    newFormatter: IPrimitiveValueFormatter | undefined;
  };

  /** Set when the hierarchy change was caused by a hierarchy filter change. */
  filterChange?: {
    newFilter: Props<HierarchyProvider["setHierarchyFilter"]>;
  };
}

/**
 * An interface for a hierarchy provider that knows how to create child nodes for a given parent node.
 * @public
 */
export interface HierarchyProvider {
  /**
   * An event that provider raises due to a hierarchy change, that requires a reload. Provider may
   * set additional event arguments to provide extra information about what caused the change.
   *
   * Consumers are expected to subscribe to this event and reload the hierarchy when it's raised.
   * Implementations may provide additional details on what caused the change through the optional
   * event arguments.
   */
  readonly hierarchyChanged: Event<(args?: HierarchyChangedEventArgs) => void>;

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
   * resets the formatter, but what that means depends on the provider implementation - it could just
   * use unformatted values, or use some default formatter, e.g. the on created by `createDefaultValueFormatter`
   * from `@itwin/presentation-shared` package.
   *
   * @note Changing formatter is expected to trigger the `hierarchyChanged` event with `formatterChange` arg.
   */
  setFormatter(formatter: IPrimitiveValueFormatter | undefined): void;

  /**
   * Sets the hierarchy filter used by this hierarchy provider. Setting to `undefined`
   * removes the filter.
   *
   * @note There's a difference between `undefined` filter and filter with empty paths list. The
   * former means no filter is applied, while the latter means the filter is applied and it filters-out
   * all hierarchy.
   *
   * @note Changing filter is expected to trigger the `hierarchyChanged` event with `filterChange` arg.
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
export function mergeProviders({ providers }: MergeHierarchyProvidersProps): HierarchyProvider & {
  /** @deprecated in 1.4. Use `[Symbol.dispose]` instead. */
  dispose: () => void;
  [Symbol.dispose]: () => void;
} {
  const hierarchyChanged = new BeEvent<() => void>();
  providers.forEach((p) => {
    p.hierarchyChanged.addListener(() => hierarchyChanged.raiseEvent());
  });
  const dispose = () => {
    hierarchyChanged.clear();
    providers.forEach((p) => safeDispose(p));
  };

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
    [Symbol.dispose]: dispose,
    dispose,
  };
}
