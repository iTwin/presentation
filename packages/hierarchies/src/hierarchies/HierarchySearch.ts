/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNodeIdentifier } from "./HierarchyNodeIdentifier.js";
import { HierarchyNodeKey } from "./HierarchyNodeKey.js";

import type { NonGroupingHierarchyNode } from "./HierarchyNode.js";
import type { HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import type { GenericNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface SearchPathRevealDepthInPath {
  /**
   * Index of the node in search path should be revealed in hierarchy by auto-expanding its ancestors.
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
   * **NOTE**: All nodes that are up to `depthInPath` will be expanded **except** search targets.
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
   * **NOTE**: All nodes that are up to `depthInHierarchy` will be expanded **except** search targets.
   */
  depthInHierarchy: number;
}

/** @public */
export interface HierarchySearchPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the searched hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the search target will have `autoExpand` flag.
   * - If it's an instance of `SearchPathRevealDepthInPath`, then all nodes up to `depthInPath` will have `autoExpand` flag.
   * - If it's an instance of `SearchPathRevealDepthInHierarchy`, then all nodes up to `depthInHierarchy` will have `autoExpand` flag.
   */
  reveal?: boolean | SearchPathRevealDepthInHierarchy | SearchPathRevealDepthInPath;
  /**
   * This option specifies whether or not search target should be expanded.
   * - If it's `false` or `undefined`, search target won't have 'autoExpand' flag.
   * - If it's `true`, search target will have `autoExpand` flag.
   *
   * **NOTE**: this attribute does not set `autoExpand` flag on nodes up to the search target. For that use `reveal`.
   */
  autoExpand?: boolean;
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

  export function mergeAutoExpandOption(
    lhs: HierarchySearchPathOptions["autoExpand"],
    rhs: HierarchySearchPathOptions["autoExpand"],
  ): HierarchySearchPathOptions["autoExpand"] {
    return lhs || rhs ? true : undefined;
  }
}

/**
 * A path of hierarchy node identifiers for search the hierarchy with additional options.
 * @public
 */
export type HierarchySearchPath = HierarchyNodeIdentifiersPath | { path: HierarchyNodeIdentifiersPath; options?: HierarchySearchPathOptions };
/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchySearchPath {
  /**
   * Normalizes the hierarchy search path to the object form.
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
    const reveal = HierarchySearchPathOptions.mergeRevealOptions(lhs?.reveal, rhs?.reveal);
    const autoExpand = HierarchySearchPathOptions.mergeAutoExpandOption(lhs?.autoExpand, rhs?.autoExpand);
    return reveal || autoExpand
      ? {
          ...(reveal !== undefined ? { reveal } : undefined),
          ...(autoExpand !== undefined ? { autoExpand } : undefined),
        }
      : undefined;
  }
}

function extractSearchPropsInternal(
  rootLevelSearchProps: HierarchySearchPath[] | undefined,
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
):
  | {
      childrenTargetPaths?: HierarchySearchPath[];
      hasSearchTargetAncestor: boolean;
    }
  | undefined {
  if (!parentNode) {
    return rootLevelSearchProps ? { childrenTargetPaths: rootLevelSearchProps, hasSearchTargetAncestor: false } : undefined;
  }
  const searchProps: {
    childrenTargetPaths?: HierarchySearchPath[];
    hasSearchTargetAncestor: boolean;
  } = {
    ...(parentNode.search?.childrenTargetPaths ? { childrenTargetPaths: parentNode.search.childrenTargetPaths } : undefined),
    hasSearchTargetAncestor: !!parentNode.search?.hasSearchTargetAncestor || !!parentNode.search?.isSearchTarget,
  };
  return searchProps.childrenTargetPaths || searchProps.hasSearchTargetAncestor ? searchProps : undefined;
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

  function saveSearchPropsFromPathsIntoReducer(
    extractionProps: {
      pathsReducer: MatchingSearchPathsReducer;
    } & (
      | {
          nodeKey: InstancesNodeKey | GenericNodeKey;
        }
      | { pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean }
    ),
  ): void;
  function saveSearchPropsFromPathsIntoReducer(extractionProps: {
    pathsReducer: MatchingSearchPathsReducer;
    asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
  }): void | Promise<void>;
  function saveSearchPropsFromPathsIntoReducer(
    extractionProps: {
      pathsReducer: MatchingSearchPathsReducer;
    } & (
      | {
          nodeKey: InstancesNodeKey | GenericNodeKey;
        }
      | { pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean }
      | { asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean> }
    ),
  ): void | Promise<void> {
    // Passes down matching normalized paths to the reducer.
    // It uses `nodeKey`, `pathMatcher` or `asyncPathMatcher` to check if `HierarchyNodeIdentifier` at the first position in search path matches the node
    // and if it does, the path is passed down to the reducer.
    // This function returns a promise only if asyncPathMatcher returns a promise.
    if (!searchProps?.childrenTargetPaths) {
      return;
    }
    const matchedPathPromises = new Array<Promise<NormalizedSearchPath | undefined>>();
    for (const childrenTargetPaths of searchProps.childrenTargetPaths) {
      const normalizedPath = HierarchySearchPath.normalize(childrenTargetPaths);
      /* c8 ignore next 3 */
      if (normalizedPath.path.length === 0) {
        continue;
      }
      if ("nodeKey" in extractionProps) {
        if (
          (HierarchyNodeKey.isGeneric(extractionProps.nodeKey) && HierarchyNodeIdentifier.equal(normalizedPath.path[0], extractionProps.nodeKey)) ||
          (HierarchyNodeKey.isInstances(extractionProps.nodeKey) &&
            extractionProps.nodeKey.instanceKeys.some((ik) => HierarchyNodeIdentifier.equal(normalizedPath.path[0], ik)))
        ) {
          extractionProps.pathsReducer.accept(normalizedPath);
        }
        continue;
      }

      const matchesPossiblyPromise =
        "pathMatcher" in extractionProps ? extractionProps.pathMatcher(normalizedPath.path[0]) : extractionProps.asyncPathMatcher(normalizedPath.path[0]);
      if (matchesPossiblyPromise instanceof Promise) {
        matchedPathPromises.push(matchesPossiblyPromise.then((matches) => (matches ? normalizedPath : undefined)));
        continue;
      }
      if (matchesPossiblyPromise) {
        extractionProps.pathsReducer.accept(normalizedPath);
      }
    }
    if (matchedPathPromises.length === 0) {
      return;
    }
    return Promise.all(matchedPathPromises).then((matchedPath) =>
      matchedPath.forEach((normalizedPath) => normalizedPath && extractionProps.pathsReducer.accept(normalizedPath)),
    );
  }

  function createChildNodeProps(props: {
    parentKeys?: undefined;
    nodeKey: InstancesNodeKey | GenericNodeKey;
  }): Pick<NonGroupingHierarchyNode, "search"> | undefined;
  function createChildNodeProps(props: {
    parentKeys?: undefined;
    pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
  }): Pick<NonGroupingHierarchyNode, "search"> | undefined;
  function createChildNodeProps(props: {
    parentKeys?: undefined;
    asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
  }): Promise<Pick<NonGroupingHierarchyNode, "search"> | undefined> | Pick<NonGroupingHierarchyNode, "search"> | undefined;
  function createChildNodeProps(props: {
    parentKeys: HierarchyNodeKey[];
    nodeKey: InstancesNodeKey | GenericNodeKey;
  }): Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined;
  function createChildNodeProps(props: {
    parentKeys: HierarchyNodeKey[];
    pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
  }): Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined;
  function createChildNodeProps(props: {
    parentKeys: HierarchyNodeKey[];
    asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
  }): Promise<Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined> | Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined;
  function createChildNodeProps(
    props: { parentKeys?: HierarchyNodeKey[] } & (
      | {
          asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
        }
      | {
          pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
        }
      | {
          nodeKey: InstancesNodeKey | GenericNodeKey;
        }
    ),
  ):
    | Promise<Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | Pick<NonGroupingHierarchyNode, "search"> | undefined>
    | Pick<NonGroupingHierarchyNode, "search" | "autoExpand">
    | Pick<NonGroupingHierarchyNode, "search">
    | undefined {
    if (!hasSearch) {
      return undefined;
    }
    const reducer = new MatchingSearchPathsReducer(searchProps.hasSearchTargetAncestor);
    if ("asyncPathMatcher" in props) {
      const extractResult = saveSearchPropsFromPathsIntoReducer({ pathsReducer: reducer, asyncPathMatcher: props.asyncPathMatcher });
      if (extractResult instanceof Promise) {
        return extractResult.then(() => reducer.getNodeProps(props.parentKeys));
      }
    } else {
      saveSearchPropsFromPathsIntoReducer({ ...props, pathsReducer: reducer });
    }
    return reducer.getNodeProps(props.parentKeys);
  }
  return {
    /** Returns a flag indicating if the hierarchy level is filtered. */
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
     * hierarchy level. Returns `undefined` if search is not applied to this level.
     */
    getChildNodeSearchIdentifiers: () => {
      if (!searchProps?.childrenTargetPaths) {
        return undefined;
      }
      return searchProps.childrenTargetPaths
        .map(HierarchySearchPath.normalize)
        .filter(({ path }) => path.length > 0)
        .map(({ path }) => path[0]);
    },
    /**
     * When a hierarchy node is created for a filtered hierarchy level, it needs some attributes (e.g. `search`
     * and `autoExpand`) to be set based on the search paths and search options. This function calculates
     * these props for a child node based on its key or path matcher.
     *
     * When using `pathMatcher` or `asyncPathMatcher` prop, callers have more flexibility to decide whether the given `HierarchyNodeIdentifier` applies
     * to their node. For example, only some parts of the identifier can be checked for improved performance. Otherwise, the
     * `nodeKey` prop can be used to check the whole identifier.
     *
     * There are multiple overloads of `createChildNodeProps`: depending on props type it returns different values:
     * - `parentKeys` is defined and `pathMatcher` or `nodeKey` is provided - returns undefined **or** `search` and `autoExpand` prop from `HierarchyNode`;
     * - `parentKeys` is undefined - does not return `HierarchyNode.autoExpand` option;
     * - props have `asyncPathMatcher` - returns either Promise or the regular return value based on whether or not `asyncPathMatcher` returns a promise.
     */
    createChildNodeProps,
  };
}

type NormalizedSearchPath = ReturnType<(typeof HierarchySearchPath)["normalize"]>;

/**
 * Extracts information from search paths and later returns `search` and `autoExpand` values from `HierarchyNode`.
 *
 * Saved values can be applied to a single `HierarchyNode` - this means that a new reducer should be created every time these props are requested for a `HierarchyNode`.
 *
 * Extracts information using `accept` function:
 * - Determines if node is search target, and if it is saves the options as `searchTargetOptions`
 * - Saves `HierarchySearchPathOptions` and `childrenTargetPaths`
 */
class MatchingSearchPathsReducer {
  private _childrenTargetPaths = new Array<NormalizedSearchPath>();
  private _isSearchTarget = false;
  private _searchTargetOptions: HierarchySearchPathOptions | undefined = undefined;
  private _revealOption: HierarchySearchPathOptions["reveal"] = false;

  public constructor(private _hasSearchTargetAncestor: boolean) {}

  public accept(normalizedPath: NormalizedSearchPath): void {
    const { path, options } = normalizedPath;
    if (path.length === 1) {
      this._isSearchTarget = true;
      this._searchTargetOptions = HierarchySearchPath.mergeOptions(this._searchTargetOptions, options);
    } else if (path.length > 1) {
      this._childrenTargetPaths.push({ path: path.slice(1), options });
      this._revealOption = HierarchySearchPathOptions.mergeRevealOptions(options?.reveal, this._revealOption);
    }
  }

  public getNodeProps<T extends HierarchyNodeKey[] | undefined = undefined>(
    parentKeys?: T,
  ): T extends undefined ? Pick<NonGroupingHierarchyNode, "search"> : Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> {
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
      (shouldAutoExpandBasedOnReveal({
        reveal: this._revealOption,
        nodePositionInHierarchy: parentKeys.length,
        nodePositionInPath: parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length,
      }) ||
        !!this._searchTargetOptions?.autoExpand)
        ? { autoExpand: true }
        : undefined),
    };
  }
}

/** @internal */
export function shouldAutoExpandBasedOnReveal({
  reveal,
  nodePositionInPath,
  nodePositionInHierarchy,
}: {
  reveal: HierarchySearchPathOptions["reveal"];
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
