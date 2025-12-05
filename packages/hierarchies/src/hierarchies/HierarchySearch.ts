/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { NonGroupingHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import { GenericNodeKey, HierarchyNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface SearchPathAutoExpandDepthInPath {
  /**
   * Index of the node in filtering path should be revealed in hierarchy by auto-expanding its ancestors.
   *
   * Use when you want to expand up to specific instance node and don't care about grouping nodes.
   *
   * **Use case example:**
   *
   * All nodes up to `Element1` should be expanded in the following hierarchy:
   * - Node1
   *   - GroupingNode1
   *     - GroupingNode2
   *       - Element1
   *       - Element2
   *
   * Provide `{ path: [Node1, Element1], reveal: { depthInPath: 1 } }`
   *
   * **NOTE**: All nodes that are up to `depthInPath` will be expanded **except** filter targets.
   */
  depthInPath: number;
}

/** @public */
export interface SearchPathRevealDepthInHierarchy {
  /**
   * Considering the list of nodes from root to the target node, this is an index in that list, identifying the node that should be revealed in hierarchy by auto-expanding its ancestors.
   *
   * This should take into account the number of grouping nodes in hierarchy.
   *
   * **Use case example:**
   *
   * Only `Node1` and `GroupingNode1` should have `autoExpand` flag in the following hierarchy:
   * - Node1
   *   - GroupingNode1
   *     - GroupingNode2
   *       - Element1
   *       - Element2
   *
   * Provide `{ path: [Node1, Element1], reveal: { depthInHierarchy: 2 } }`
   *
   * To get the correct depth use `HierarchyNode.parentKeys.length`.
   *
   * **NOTE**: All nodes that are up to `depthInHierarchy` will be expanded **except** filter targets.
   */
  depthInHierarchy: number;
}

/** @public */
export interface HierarchySearchPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the searched hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the filter target will have `autoExpand` flag.
   * - If it's an instance of `SearchPathRevealDepthInPath`, then all nodes up to `depthInPath` will have `autoExpand` flag.
   * - If it's an instance of `SearchPathRevealDepthInHierarchy`, then all nodes up to `depthInHierarchy` will have `autoExpand` flag.
   */
  reveal?: boolean | FilteringPathRevealDepthInHierarchy | FilteringPathRevealDepthInPath;
}

namespace HierarchySearchPathOptions {
  export function mergeRevealOptions(
    lhs: HierarchySearchPathOptions["reveal"],
    rhs: HierarchySearchPathOptions["reveal"],
  ): HierarchySearchPathOptions["reveal"] {
    if (rhs === true || lhs === true) {
      return true;
    }
    if (!rhs || !lhs) {
      return !!rhs ? rhs : lhs;
    }

    const lhsDepth = "depthInPath" in lhs ? lhs.depthInPath : lhs.depthInHierarchy;
    const rhsDepth = "depthInPath" in rhs ? rhs.depthInPath : rhs.depthInHierarchy;
    const isLhsDepthBasedOnPath = "depthInPath" in lhs;
    const isRhsDepthBasedOnPath = "depthInPath" in rhs;

    if (isLhsDepthBasedOnPath) {
      if (isRhsDepthBasedOnPath) {
        return lhsDepth > rhsDepth ? lhs : rhs;
      }
      return lhs;
    }
    if (isRhsDepthBasedOnPath) {
      return rhs;
    }
    return lhsDepth > rhsDepth ? lhs : rhs;
  }
}

/**
 * A path of hierarchy node identifiers for searching the hierarchy with additional options.
 * @public
 */
export type HierarchySearchPath = HierarchyNodeIdentifiersPath | { path: HierarchyNodeIdentifiersPath; options?: HierarchySearchPathOptions };
/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchySearchPath {
  /**
   * Normalizes the hierarchy Search path to the object form.
   * @public
   */
  export function normalize(source: HierarchySearchPath): Exclude<HierarchySearchPath, HierarchyNodeIdentifiersPath> {
    if (Array.isArray(source)) {
      return { path: source };
    }
    return source;
  }

  /**
   * Merges two given `HierarchySearchPathOptions` objects.
   * - if both inputs are `undefined`, `undefined` is returned,
   * - else if one of the inputs is `undefined`, the other one is returned.
   * - else, merge each option individually.
   *
   * For the `reveal` attribute, the merge chooses to `reveal` as deep as the deepest input:
   * - if any one of the inputs is `true`, return `true`,
   * - else if only one of the inputs is an object, return it,
   * - else if both inputs are falsy, return `false` or `undefined`,
   * - else:
   *    - if only one of the inputs has `depthInHierarchy` set, return the other one,
   *    - else return the one with greater `depthInPath` or `depthInHierarchy`.
   *
   * @public
   */
  export function mergeOptions(
    lhs: HierarchySearchPathOptions | undefined,
    rhs: HierarchySearchPathOptions | undefined,
  ): HierarchySearchPathOptions | undefined {
    if (!lhs || !rhs) {
      return lhs ?? rhs;
    }

    return {
      reveal: HierarchySearchPathOptions.mergeRevealOptions(lhs.reveal, rhs.reveal),
    };
  }
}

/**
 * An utility that extracts filtering properties from given root level filtering props or
 * the parent node. Returns `undefined` if filtering props are not present.
 * @public
 * @deprecated in 1.3. Use `createHierarchyFilteringHelper` instead.
 */
/* c8 ignore start */
export function extractFilteringProps(
  rootLevelFilteringProps: HierarchySearchPath[],
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
):
  | {
      filteredNodePaths: HierarchySearchPath[];
      hasFilterTargetAncestor: boolean;
    }
  | undefined {
  return extractSearchPropsInternal(rootLevelFilteringProps, parentNode);
}
/* c8 ignore end */

function extractSearchPropsInternal(
  rootLevelSearchProps: HierarchySearchPath[] | undefined,
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
):
  | {
      hierarchySearchPaths?: HierarchySearchPath[];
      hasSearchTargetAncestor: boolean;
    }
  | undefined {
  if (!parentNode) {
    return rootLevelSearchProps ? { hierarchySearchPaths: rootLevelSearchProps, hasSearchTargetAncestor: false } : undefined;
  }
  const searchProps: {
    searchNodePaths?: HierarchySearchPath[];
    hasSearchTargetAncestor: boolean;
  } = {
    ...(parentNode.search?.childrenTargetPaths ? { filteredNodePaths: parentNode.search.childrenTargetPaths } : undefined),
    hasSearchTargetAncestor: !!parentNode.search?.hasSearchTargetAncestor || !!parentNode.search?.isSearchTarget,
  };
  return searchProps.searchNodePaths || searchProps.hasSearchTargetAncestor ? searchProps : undefined;
}

/**
 * Creates a set of utilities for making it easier to implement hierarchy search for the given hierarchy
 * level.
 *
 * @public
 */
export function createHierarchyFilteringHelper(
  rootLevelFilteringProps: HierarchySearchPath[] | undefined,
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
) {
  const searchProps = extractSearchPropsInternal(rootLevelFilteringProps, parentNode);
  const hasFilter = !!searchProps;
  return {
    /** Returns a flag indicating if the hierarchy level is filtered. */
    hasFilter,
    /**
     * Returns a flag indicating whether this hierarchy level has an ancestor node
     * that is a search target. That generally means that this and all downstream hierarchy
     * levels should be displayed without search being applied to them, even if search paths
     * say otherwise.
     */
    hasFilterTargetAncestor: searchProps?.hasSearchTargetAncestor ?? false,

    /**
     * Returns a list of hierarchy node identifiers that apply specifically for this
     * hierarchy level. Returns `undefined` if search is not applied to this level.
     */
    getChildNodeFilteringIdentifiers: () => {
      if (!searchProps?.hierarchySearchPaths) {
        return undefined;
      }
      return searchProps.hierarchySearchPaths
        .map(HierarchySearchPath.normalize)
        .filter(({ path }) => path.length > 0)
        .map(({ path }) => path[0]);
    },
    /**
     * When a hierarchy node is created for a hierarchy level that's affected by hierarchy search, it
     * needs some attributes (e.g. `search` and `autoExpand`) to be set based on the search paths and
     * search options. This function calculates these props for a child node based on its key or path matcher.
     *
     * When using `pathMatcher` or `asyncPathMatcher` prop, callers have more flexibility to decide whether the given `HierarchyNodeIdentifier` applies
     * to their node. For example, only some parts of the identifier can be checked for improved performance. Otherwise, the
     * `nodeKey` prop can be used to check the whole identifier.
     */
    createChildNodeProps: (
      props:
        | {
            nodeKey: InstancesNodeKey | GenericNodeKey;
          }
        | {
            pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
          },
    ): Pick<HierarchyNode, "autoExpand" | "search"> | undefined => {
      if (!hasFilter) {
        return undefined;
      }
      const reducer = new MatchingFilteringPathsReducer(filteringProps?.hasFilterTargetAncestor);
      filteringProps.filteredNodePaths.forEach((filteredPath) => {
        const normalizedPath = HierarchyFilteringPath.normalize(filteredPath);
        if (
          "nodeKey" in props &&
          ((HierarchyNodeKey.isGeneric(props.nodeKey) && HierarchyNodeIdentifier.equal(normalizedPath.path[0], props.nodeKey)) ||
            (HierarchyNodeKey.isInstances(props.nodeKey) && props.nodeKey.instanceKeys.some((ik) => HierarchyNodeIdentifier.equal(normalizedPath.path[0], ik))))
        ) {
          reducer.accept(normalizedPath);
        } else if ("pathMatcher" in props && props.pathMatcher(normalizedPath.path[0])) {
          reducer.accept(normalizedPath);
        }
      });
      return reducer.getNodeProps(parentNode);
    },

    /**
     * Similar to `createChildNodeProps`, but takes an async `pathMatcher` prop.
     */
    createChildNodePropsAsync: (props: {
      pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
    }): Promise<Pick<HierarchyNode, "autoExpand" | "filtering"> | undefined> | Pick<HierarchyNode, "autoExpand" | "filtering"> | undefined => {
      if (!hasFilter) {
        return undefined;
      }
      const reducer = new MatchingFilteringPathsReducer(filteringProps?.hasFilterTargetAncestor);
      const matchedPathPromises = new Array<Promise<NormalizedFilteringPath | undefined>>();
      for (const filteredChildrenNodeIdentifierPath of filteringProps.filteredNodePaths) {
        const normalizedPath = HierarchyFilteringPath.normalize(filteredChildrenNodeIdentifierPath);
        /* c8 ignore next 3 */
        if (normalizedPath.path.length === 0) {
          continue;
        }

        const matchesPossiblyPromise = props.pathMatcher(normalizedPath.path[0]);
        if (matchesPossiblyPromise instanceof Promise) {
          matchedPathPromises.push(matchesPossiblyPromise.then((matches) => (matches ? normalizedPath : undefined)));
          continue;
        }
        if (!matchesPossiblyPromise) {
          continue;
        }

        reducer.accept(normalizedPath);
      }
      if (matchedPathPromises.length === 0) {
        return reducer.getNodeProps(parentNode);
      }
      return Promise.all(matchedPathPromises)
        .then((matchedPath) => matchedPath.forEach((normalizedPath) => normalizedPath && reducer.accept(normalizedPath)))
        .then(() => reducer.getNodeProps(parentNode));
    },
  };
}

type NormalizedSearchPath = ReturnType<(typeof HierarchySearchPath)["normalize"]>;

/**
 * Extracts information from filtering paths and later returns `filtering` and `autoExpand` values from `HierarchyNode`.
 *
 * Saved values can be applied to a single `HierarchyNode` - this means that a new reducer should be created every time these props are requested for a `HierarchyNode`.
 *
 * Extracts information using `accept` function:
 * - Determines if node is filter target, and if it is saves the options as `filterTargetOptions`
 * - Saves `HierarchyFilteringPathOptions` and `filteredChildrenIdentifierPaths`
 */
class MatchingFilteringPathsReducer {
  private _filteredChildrenIdentifierPaths = new Array<NormalizedFilteringPath>();
  private _isFilterTarget = false;
  private _filterTargetOptions = undefined as HierarchyFilteringPathOptions | undefined;
  private _revealOption: HierarchyFilteringPathOptions["reveal"] = false;

  public constructor(private _hasSearchTargetAncestor: boolean) {}

  public accept(normalizedPath: NormalizedSearchPath): void {
    const { path, options } = normalizedPath;
    if (path.length === 1) {
      this._isSearchTarget = true;
      this._searchTargetOptions = HierarchySearchPath.mergeOptions(this._searchTargetOptions, options);
    } else if (path.length > 1) {
      this._filteredChildrenIdentifierPaths.push({ path: path.slice(1), options });
      this._revealOption = HierarchyFilteringPathOptions.mergeRevealOptions(options?.reveal, this._revealOption);
    }
  }

  public getNodeProps<T extends HierarchyNodeKey[] | undefined = undefined>(
    parentKeys?: T,
  ): T extends undefined ? Pick<NonGroupingHierarchyNode, "filtering"> : Pick<NonGroupingHierarchyNode, "filtering" | "autoExpand"> {
    return {
      ...(this._hasSearchTargetAncestor || this._isSearchTarget || this._childrenTargetPaths.length > 0
        ? {
            search: {
              ...(this._hasSearchTargetAncestor ? { hasSearchTargetAncestor: true } : undefined),
              ...(this._isSearchTarget ? { isSearchTarget: true, searchTargetOptions: this._searchTargetOptions } : undefined),
              ...(this._childrenTargetPaths.length > 0 ? { childrenTargetPaths: this._childrenTargetPaths } : undefined),
            },
          }
        : undefined),
      ...(parentKeys &&
      shouldRevealNode({
        reveal: this._revealOption,
        nodePositionInHierarchy: parentKeys.length,
        nodePositionInPath: parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length,
      })
        ? { autoExpand: true }
        : undefined),
    };
  }
}

/** @internal */
export function shouldRevealNode({
  reveal,
  nodePositionInPath,
  nodePositionInHierarchy,
}: {
  reveal: HierarchyFilteringPathOptions["reveal"];
  nodePositionInPath: number;
  nodePositionInHierarchy: number;
}): boolean {
  if (!reveal) {
    return false;
  }
  if (reveal === true) {
    return true;
  }
  if ("depthInHierarchy" in reveal) {
    return nodePositionInHierarchy < reveal.depthInHierarchy;
  }
  return nodePositionInPath < reveal.depthInPath;
}
