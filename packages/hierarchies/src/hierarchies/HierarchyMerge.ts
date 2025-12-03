/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./internal/DisposePolyfill.js";

import { filter, first, from, map, mergeMap, of } from "rxjs";
import { BeEvent } from "@itwin/core-bentley";
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
          sortNodesByLabelOperator,
        ),
      ),
    getNodeInstanceKeys: (props) => eachValueFrom(from(providers).pipe(mergeMap((p) => p.getNodeInstanceKeys(props)))),
    setFormatter: (formatter) => providers.forEach((p) => p.setFormatter(formatter)),
    setHierarchyFilter: (props) => providers.forEach((p) => p.setHierarchyFilter(props)),
    [Symbol.dispose]: dispose,
  };
}
