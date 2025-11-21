/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./internal/DisposePolyfill.js";

import { EMPTY, filter, first, from, map, mergeMap, Observable, ObservableInput, of, reduce } from "rxjs";
import { assert, BeEvent, Dictionary, omit } from "@itwin/core-bentley";
import { HierarchyNode, NonGroupingHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";
import { HierarchyProvider } from "./HierarchyProvider.js";
import { safeDispose } from "./internal/Common.js";
import { eachValueFrom } from "./internal/EachValueFrom.js";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting.js";

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
          mergeSameInstanceNodes,
          sortNodesByLabelOperator,
        ),
      ),
    getNodeInstanceKeys: (props) => eachValueFrom(from(providers).pipe(mergeMap((p) => p.getNodeInstanceKeys(props)))),
    setFormatter: (formatter) => providers.forEach((p) => p.setFormatter(formatter)),
    setHierarchyFilter: (props) => providers.forEach((p) => p.setHierarchyFilter(props)),
    [Symbol.dispose]: dispose,
  };
}

function mergeSameInstanceNodes(source: ObservableInput<HierarchyNode>): Observable<HierarchyNode> {
  type NodesDictionary = Dictionary<HierarchyNodeKey, HierarchyNode[]>;
  return from(source).pipe(
    reduce<HierarchyNode, NodesDictionary>((acc, node): NodesDictionary => {
      const { value: nodesForThisKey } = acc.findOrInsert(node.key, []);
      nodesForThisKey.push(node);
      return acc;
    }, new Dictionary(compareHierarchyNodeKeysForMerge)),
    mergeMap((dict) => from(dict.values())),
    mergeMap((mergedNodes) => {
      if (mergedNodes.length === 0) {
        return EMPTY;
      }
      if (mergedNodes.length === 1) {
        return of(mergedNodes[0]);
      }
      const firstNode = mergedNodes[0];
      if (HierarchyNode.isInstancesNode(firstNode)) {
        return of({
          ...firstNode,
          key: {
            type: "instances",
            instanceKeys: mergedNodes.flatMap(({ key }) => {
              assert(HierarchyNodeKey.isInstances(key));
              return key.instanceKeys;
            }),
          },
          label: `${firstNode.label} (merged)`,
        } satisfies NonGroupingHierarchyNode & { key: InstancesNodeKey });
      }
      return EMPTY;
    }),
  );
}

function compareHierarchyNodeKeysForMerge(lhs: HierarchyNodeKey, rhs: HierarchyNodeKey) {
  if (HierarchyNodeKey.isInstances(lhs) && HierarchyNodeKey.isInstances(rhs)) {
    return HierarchyNodeKey.compare(
      { ...lhs, instanceKeys: lhs.instanceKeys.map((ik) => omit(ik, ["imodelKey"])) },
      { ...rhs, instanceKeys: rhs.instanceKeys.map((ik) => omit(ik, ["imodelKey"])) },
    );
  }
  return HierarchyNodeKey.compare(lhs, rhs);
}
