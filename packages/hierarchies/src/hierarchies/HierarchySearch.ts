/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode, NonGroupingHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import { GenericNodeKey, HierarchyNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface SearchPathAutoExpandOption {
  /**
   * Depth up to which nodes in the hierarchy should be expanded.
   *
   * If `includeGroupingNodes` is set to true, then depth should take into account the number of grouping nodes in hierarchy.
   */
  depth: number;
  /**
   * Whether or not `depth` includes grouping nodes.
   *
   * Use when you want to autoExpand only some of the grouping nodes.
   *
   * **Use case example:**
   *
   * You want to `autoExpand` only `Node1` and `GroupingNode1` in the following hierarchy:
   * - Node1
   *   - GroupingNode1
   *     - GroupingNode2
   *       - Element1
   *       - Element2
   * Then you provide `autoExpand: { depth: 2, includeGroupingNodes: true }`
   */
  includeGroupingNodes?: boolean;
}

/** @public */
export interface HierarchySearchPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the searched hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the search target will have `autoExpand` flag.
   * - If it's an instance of `SearchPathAutoExpandOption`, then all nodes up to and including `depth` will have `autoExpand` flag.
   */
  autoExpand?: boolean | SearchPathAutoExpandOption;
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

    if (!lhs.includeGroupingNodes) {
      if (!rhs.includeGroupingNodes) {
        return lhs.depth > rhs.depth ? lhs : rhs;
      }
      return lhs;
    }
    if (!rhs.includeGroupingNodes) {
      return rhs;
    }
    return lhs.depth > rhs.depth ? lhs : rhs;
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
   *    - if only one of the inputs has `includeGroupingNodes` set to `true` or `key` defined, return the one that has only `depth` set,
   *    - else return the one with greater `depth`.
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
  return parentNode.search?.searchedChildrenIdentifierPaths
    ? {
        searchedNodePaths: parentNode.search.searchedChildrenIdentifierPaths,
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
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
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
    ): NodeProps | undefined => {
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
      return reducer.getNodeProps();
    },

    /**
     * Similar to `createChildNodeProps`, but takes an async `pathMatcher` prop.
     */
    createChildNodePropsAsync: (props: {
      pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
    }): Promise<NodeProps | undefined> | NodeProps | undefined => {
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
        return reducer.getNodeProps();
      }
      return Promise.all(matchedPathPromises)
        .then((matchedPath) => matchedPath.forEach((normalizedPath) => normalizedPath && reducer.accept(normalizedPath)))
        .then(() => reducer.getNodeProps());
    },
  };
}

/** @public */
export type NodeProps = Pick<HierarchyNode, "autoExpand" | "search"> & { search?: { autoExpandDepth?: number; includeGroupingNodes?: boolean } };

type NormalizedSearchPath = ReturnType<(typeof HierarchySearchPath)["normalize"]>;

class MatchingSearchPathsReducer {
  private _searchedChildrenIdentifierPaths = new Array<NormalizedSearchPath>();
  private _issearchTarget = false;
  private _searchTargetOptions = undefined as HierarchySearchPathOptions | undefined;
  private _needsAutoExpand: HierarchySearchPathOptions["autoExpand"] = false;

  public constructor(private _hassearchTargetAncestor: boolean) {}

  public accept({ path, options }: NormalizedSearchPath) {
    if (path.length === 1) {
      this._issearchTarget = true;
      this._searchTargetOptions = HierarchySearchPath.mergeOptions(this._searchTargetOptions, options);
    } else if (path.length > 1) {
      this._searchedChildrenIdentifierPaths.push({ path: path.slice(1), options });
      this._needsAutoExpand = HierarchySearchPathOptions.mergeAutoExpandOptions(options?.autoExpand, this._needsAutoExpand);
    }
  }
  public getNodeProps(): NodeProps {
    return {
      ...(this._hassearchTargetAncestor || this._issearchTarget || this._searchedChildrenIdentifierPaths.length > 0
        ? {
            search: {
              ...(this._hassearchTargetAncestor ? { hassearchTargetAncestor: true } : undefined),
              ...(this._issearchTarget ? { issearchTarget: true, searchTargetOptions: this._searchTargetOptions } : undefined),
              ...(this._searchedChildrenIdentifierPaths.length > 0 ? { searchedChildrenIdentifierPaths: this._searchedChildrenIdentifierPaths } : undefined),
              ...(this._needsAutoExpand && this._needsAutoExpand !== true
                ? {
                    autoExpandDepth: this._needsAutoExpand.depth,
                    includeGroupingNodes: this._needsAutoExpand.includeGroupingNodes ? true : false,
                  }
                : undefined),
            },
          }
        : undefined),
      ...(this._needsAutoExpand ? { autoExpand: !!this._needsAutoExpand } : undefined),
    };
  }
}
