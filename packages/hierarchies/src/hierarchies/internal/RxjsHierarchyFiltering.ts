/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EMPTY, from, map, mergeMap, Observable, of, toArray } from "rxjs";
import { createHierarchyFilteringHelper, extractFilteringPropsInternal, HierarchyFilteringPath, MatchingFilteringPathsReducer } from "../HierarchyFiltering.js";
import { HierarchyNode, NonGroupingHierarchyNode } from "../HierarchyNode.js";
import { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier.js";

/**
 * Creates a set of utilities for making it easier to filter the given hierarchy
 * level.
 *
 * @internal
 */
export function createHierarchyRxjsFilteringHelper(
  rootLevelFilteringProps: HierarchyFilteringPath[] | undefined,
  parentNode: Pick<NonGroupingHierarchyNode, "filtering"> | undefined,
) {
  const filteringProps = extractFilteringPropsInternal(rootLevelFilteringProps, parentNode);
  const hasFilter = !!filteringProps;
  return {
    ...createHierarchyFilteringHelper(rootLevelFilteringProps, parentNode),
    createChildNodePropsAsync: undefined,
    createChildNodePropsObs: (props: {
      pathMatcher: (identifier: HierarchyNodeIdentifier) => Observable<boolean>;
    }): Observable<Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined> => {
      if (!hasFilter) {
        return of(undefined);
      }
      const reducer = new MatchingFilteringPathsReducer(filteringProps?.hasFilterTargetAncestor);
      return from(filteringProps.filteredNodePaths).pipe(
        mergeMap((filteredChildrenNodeIdentifierPath) => {
          const normalizedPath = HierarchyFilteringPath.normalize(filteredChildrenNodeIdentifierPath);
          /* c8 ignore next 3 */
          if (normalizedPath.path.length === 0) {
            return EMPTY;
          }
          const matchesObs = props.pathMatcher(normalizedPath.path[0]);
          return from(matchesObs).pipe(
            map((matches) => {
              if (!matches) {
                return;
              }
              reducer.accept(normalizedPath);
              return;
            }),
          );
        }),
        toArray(),
        map(() => reducer.getNodeProps()),
      );
    },
  };
}
