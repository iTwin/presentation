/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode, NonGroupingHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import { GenericNodeKey, HierarchyNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface SearchPathAutoExpandDepthInPath {
  /**
   * Depth that tells which nodes in the filtering path should be expanded.
   *
   * Use when you want to expand up to specific instance node and don't care about grouping nodes.
   *
   * **NOTE**: All nodes that are up to `depthInPath` will be expanded. Node at the `depthInPath` position won't be expanded.
   */
  depthInPath: number;
}

/** @public */
export interface SearchPathAutoExpandDepthInHierarchy {
  /**
   * Depth that tells which nodes in the hierarchy should be expanded.
   *
   * This should take into account the number of grouping nodes in hierarchy.
   *
   * * **Use case example:**
   *
   * You want to `autoExpand` only `Node1` and `GroupingNode1` in the following hierarchy:
   * - Node1
   *   - GroupingNode1
   *     - GroupingNode2
   *       - Element1
   *       - Element2
   * Then you provide `autoExpand: { depthInHierarchy: 2 }`
   *
   * To get the correct depth use `HierarchyNode.parentKeys.length`.
   *
   * **NOTE**: All nodes that are up to and including `depthInHierarchy` will be expanded.
   */
  depthInHierarchy: number;
}

/** @public */
export interface HierarchySearchPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the searched hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the filter target will have `autoExpand` flag.
   * - If it's an instance of `SearchPathAutoExpandDepthInPath`, then all nodes up to `depthInPath` will have `autoExpand` flag.
   * - If it's an instance of `SearchPathAutoExpandDepthInHierarchy`, then all nodes up to and including `depthInHierarchy` will have `autoExpand` flag.
   */
  autoExpand?: boolean | SearchPathAutoExpandDepthInHierarchy | SearchPathAutoExpandDepthInPath;
}

namespace HierarchySearchPathOptions {
  export function mergeAutoExpandOptions(
    lhs: HierarchySearchPathOptions["autoExpand"],
    rhs: HierarchySearchPathOptions["autoExpand"],
  ): HierarchySearchPathOptions["autoExpand"] {
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
 * A path of hierarchy node identifiers for Search the hierarchy with additional options.
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
   * For the `autoExpand` attribute, the merge chooses to auto-expand as deep as the deepest input:
   * - if any one of the inputs is `true`, return `true`,
   * - else if only one of the inputs is an object, return it,
   * - else if both inputs are falsy, return `false` or `undefined`,
   * - else:
   *    - if only one of the inputs has `includeGroupingNodes` set to `true` or `key` defined or `depthInHierarchy` set, return the other one,
   *    - else return the one with greater `depth`, `depthInPath` or `depthInHierarchy`.
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
      autoExpand: HierarchySearchPathOptions.mergeAutoExpandOptions(lhs.autoExpand, rhs.autoExpand),
    };
  }
}

/**
 * An utility that extracts Search properties from given root level Search props or
 * the parent node. Returns `undefined` if Search props are not present.
 * @public
 * @deprecated in 1.3. Use `createHierarchySearchHelper` instead.
 */
/* c8 ignore start */
export function extractSearchProps(
  rootLevelSearchProps: HierarchySearchPath[],
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
):
  | {
      searchedNodePaths: HierarchySearchPath[];
      hasSearchTargetAncestor: boolean;
    }
  | undefined {
  return extractSearchPropsInternal(rootLevelSearchProps, parentNode);
}
/* c8 ignore end */

function extractSearchPropsInternal(
  rootLevelSearchProps: HierarchySearchPath[] | undefined,
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
):
  | {
      searchedNodePaths: HierarchySearchPath[];
      hasSearchTargetAncestor: boolean;
    }
  | undefined {
  if (!parentNode) {
    return rootLevelSearchProps ? { searchedNodePaths: rootLevelSearchProps, hasSearchTargetAncestor: false } : undefined;
  }
  return parentNode.search?.childrenTargetPaths
    ? {
        searchedNodePaths: parentNode.search.childrenTargetPaths,
        hasSearchTargetAncestor: !!parentNode.search.hasSearchTargetAncestor || !!parentNode.search.isSearchTarget,
      }
    : undefined;
}

/**
 * Creates a set of utilities for making it easier to search the given hierarchy
 * level.
 *
 * @public
 */
export function createHierarchySearchHelper(
  rootLevelSearchProps: HierarchySearchPath[] | undefined,
  parentNode: Pick<NonGroupingHierarchyNode, "search" | "parentKeys"> | undefined,
) {
  const searchProps = extractSearchPropsInternal(rootLevelSearchProps, parentNode);
  const hasSearch = !!searchProps;
  return {
    /**
     * Returns a flag indicating if the hierarchy level is searched.
     */
    hasSearch,

    /**
     * Returns a flag indicating whether this hierarchy level has an ancestor node
     * that is a search target. That generally means that this and all downstream hierarchy
     * levels should be displayed without search being applied to them, even if search paths
     * say otherwise.
     */
    hasSearchTargetAncestor: searchProps?.hasSearchTargetAncestor ?? false,

    /**
     * Returns a list of hierarchy node identifiers that apply specifically for this
     * hierarchy level. Returns `undefined` if Search is not applied to this level.
     */
    getChildNodeSearchIdentifiers: () => {
      if (!hasSearch) {
        return undefined;
      }
      return searchProps.searchedNodePaths
        .map(HierarchySearchPath.normalize)
        .filter(({ path }) => path.length > 0)
        .map(({ path }) => path[0]);
    },

    /**
     * When a hierarchy node is created for a searched hierarchy level, it needs some attributes (e.g. `Search`
     * and `autoExpand`) to be set based on the search paths and Search options. This function calculates
     * these props for a child node based on its key or path matcher.
     *
     * When using `pathMatcher` prop, callers have more flexibility to decide whether the given `HierarchyNodeIdentifier` applies
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
      if (!hasSearch) {
        return undefined;
      }
      const reducer = new MatchingSearchPathsReducer(searchProps?.hasSearchTargetAncestor);
      searchProps.searchedNodePaths.forEach((searchedPath) => {
        const normalizedPath = HierarchySearchPath.normalize(searchedPath);
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
    }): Promise<Pick<HierarchyNode, "autoExpand" | "search"> | undefined> | Pick<HierarchyNode, "autoExpand" | "search"> | undefined => {
      if (!hasSearch) {
        return undefined;
      }
      const reducer = new MatchingSearchPathsReducer(searchProps?.hasSearchTargetAncestor);
      const matchedPathPromises = new Array<Promise<NormalizedSearchPath | undefined>>();
      for (const searchedChildrenNodeIdentifierPath of searchProps.searchedNodePaths) {
        const normalizedPath = HierarchySearchPath.normalize(searchedChildrenNodeIdentifierPath);
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

class MatchingSearchPathsReducer {
  private _childrenTargetPaths = new Array<NormalizedSearchPath>();
  private _isSearchTarget = false;
  private _searchTargetOptions = undefined as HierarchySearchPathOptions | undefined;
  private _autoExpandOption: HierarchySearchPathOptions["autoExpand"] = false;

  public constructor(private _hasSearchTargetAncestor: boolean) {}

  public accept(normalizedPath: NormalizedSearchPath): void {
    const { path, options } = normalizedPath;
    if (path.length === 1) {
      this._isSearchTarget = true;
      this._searchTargetOptions = HierarchySearchPath.mergeOptions(this._searchTargetOptions, options);
    } else if (path.length > 1) {
      this._childrenTargetPaths.push({ path: path.slice(1), options });
      this._autoExpandOption = HierarchySearchPathOptions.mergeAutoExpandOptions(options?.autoExpand, this._autoExpandOption);
    }
  }

  private getNeedsAutoExpand(parentNode: Pick<NonGroupingHierarchyNode, "parentKeys"> | undefined): boolean {
    if (this._autoExpandOption === true) {
      return true;
    }
    if (typeof this._autoExpandOption === "object") {
      const parentLength = !parentNode
        ? 0
        : "depthInHierarchy" in this._autoExpandOption
          ? 1 + parentNode.parentKeys.length
          : 1 + parentNode.parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length;
      const depth =
        "depthInHierarchy" in this._autoExpandOption
          ? this._autoExpandOption.depthInHierarchy
          : // With `depthInPath` option we don't want to expand node that is at the `depthInPath` position
            this._autoExpandOption.depthInPath - 1;

      return parentLength < depth;
    }
    return false;
  }

  public getNodeProps(parentNode: Pick<NonGroupingHierarchyNode, "parentKeys"> | undefined): Pick<HierarchyNode, "autoExpand" | "search"> {
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
      ...(this.getNeedsAutoExpand(parentNode) ? { autoExpand: true } : undefined),
    };
  }
}
