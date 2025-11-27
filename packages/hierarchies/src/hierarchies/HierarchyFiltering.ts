/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode, NonGroupingHierarchyNode, ParentHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import { GenericNodeKey, HierarchyNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface FilteringPathRevealDepthInPath {
  /**
   * Depth that tells which nodes in the filtering path should be expanded.
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
   * Provide `{ path: [Node1, Element1], reveal: { depthInPath: 2 } }`
   *
   * **NOTE**: All nodes that are up to `depthInPath` will be expanded **except** filter targets.
   */
  depthInPath: number;
}

/** @public */
export interface FilteringPathRevealDepthInHierarchy {
  /**
   * Depth that tells which nodes in the hierarchy should be expanded.
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
export interface HierarchyFilteringPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the filtered hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the filter target will have `autoExpand` flag.
   * - If it's an instance of `FilteringPathRevealDepthInPath`, then all nodes up to `depthInPath` will have `autoExpand` flag.
   * - If it's an instance of `FilteringPathRevealDepthInHierarchy`, then all nodes up to `depthInHierarchy` will have `autoExpand` flag.
   */
  reveal?: boolean | FilteringPathRevealDepthInHierarchy | FilteringPathRevealDepthInPath;
}

namespace HierarchyFilteringPathOptions {
  export function mergeRevealOptions(
    lhs: HierarchyFilteringPathOptions["reveal"],
    rhs: HierarchyFilteringPathOptions["reveal"],
  ): HierarchyFilteringPathOptions["reveal"] {
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
 * A path of hierarchy node identifiers for filtering the hierarchy with additional options.
 * @public
 */
export type HierarchyFilteringPath = HierarchyNodeIdentifiersPath | { path: HierarchyNodeIdentifiersPath; options?: HierarchyFilteringPathOptions };
/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyFilteringPath {
  /**
   * Normalizes the hierarchy filtering path to the object form.
   * @public
   */
  export function normalize(source: HierarchyFilteringPath): Exclude<HierarchyFilteringPath, HierarchyNodeIdentifiersPath> {
    if (Array.isArray(source)) {
      return { path: source };
    }
    return source;
  }

  /**
   * Merges two given `HierarchyFilteringPathOptions` objects.
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
    lhs: HierarchyFilteringPathOptions | undefined,
    rhs: HierarchyFilteringPathOptions | undefined,
  ): HierarchyFilteringPathOptions | undefined {
    if (!lhs || !rhs) {
      return lhs ?? rhs;
    }

    return {
      reveal: HierarchyFilteringPathOptions.mergeRevealOptions(lhs.reveal, rhs.reveal),
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
  rootLevelFilteringProps: HierarchyFilteringPath[],
  parentNode: Pick<NonGroupingHierarchyNode, "filtering"> | undefined,
):
  | {
      filteredNodePaths: HierarchyFilteringPath[];
      hasFilterTargetAncestor: boolean;
    }
  | undefined {
  return extractFilteringPropsInternal(rootLevelFilteringProps, parentNode);
}
/* c8 ignore end */

function extractFilteringPropsInternal(
  rootLevelFilteringProps: HierarchyFilteringPath[] | undefined,
  parentNode: Pick<ParentHierarchyNode, "filtering"> | undefined,
):
  | {
      filteredNodePaths: HierarchyFilteringPath[];
      hasFilterTargetAncestor: boolean;
    }
  | undefined {
  if (!parentNode) {
    return rootLevelFilteringProps ? { filteredNodePaths: rootLevelFilteringProps, hasFilterTargetAncestor: false } : undefined;
  }
  return parentNode.filtering?.filteredChildrenIdentifierPaths
    ? {
        filteredNodePaths: parentNode.filtering.filteredChildrenIdentifierPaths,
        hasFilterTargetAncestor: !!parentNode.filtering.hasFilterTargetAncestor || !!parentNode.filtering.isFilterTarget,
      }
    : undefined;
}

/**
 * Creates a set of utilities for making it easier to filter the given hierarchy
 * level.
 *
 * @public
 */
export function createHierarchyFilteringHelper(
  rootLevelFilteringProps: HierarchyFilteringPath[] | undefined,
  parentNode: Pick<ParentHierarchyNode, "filtering"> | undefined,
) {
  const filteringProps = extractFilteringPropsInternal(rootLevelFilteringProps, parentNode);
  const hasFilter = !!filteringProps;
  /**
   * Passes down matching normalized paths to the reducer.
   *
   * It uses `nodeKey` or `pathMatcher` to check if `HierarchyNodeIdentifier` at the first position in filtering path matches the node
   * and if it does, the path is passed down to the reducer.
   */
  const saveFilteringPropsFromPathsIntoReducer = (
    extractionProps: { pathsReducer: MatchingFilteringPathsReducer } & (
      | { nodeKey: InstancesNodeKey | GenericNodeKey }
      | { pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean }
    ),
  ): void => {
    if (!hasFilter) {
      return;
    }
    for (const filteredChildrenNodeIdentifierPath of filteringProps.filteredNodePaths) {
      const normalizedPath = HierarchyFilteringPath.normalize(filteredChildrenNodeIdentifierPath);
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

      if (extractionProps.pathMatcher(normalizedPath.path[0])) {
        extractionProps.pathsReducer.accept(normalizedPath);
      }
    }
  };
  /**
   * Does the same thing as `saveFilteringPropsFromPathsIntoReducer`, except uses `pathMatcher` that can return either Promise<boolean> or boolean.
   *
   * If pathMatcher returns a promise, then this function returns a promise, else it returns a boolean value.
   */
  const saveFilteringPropsFromPathsIntoReducerAsync = (extractionProps: {
    pathsReducer: MatchingFilteringPathsReducer;
    pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
  }): void | Promise<void> => {
    if (!hasFilter) {
      return;
    }
    const matchedPathPromises = new Array<Promise<NormalizedFilteringPath | undefined>>();
    for (const filteredChildrenNodeIdentifierPath of filteringProps.filteredNodePaths) {
      const normalizedPath = HierarchyFilteringPath.normalize(filteredChildrenNodeIdentifierPath);
      /* c8 ignore next 3 */
      if (normalizedPath.path.length === 0) {
        continue;
      }

      const matchesPossiblyPromise = extractionProps.pathMatcher(normalizedPath.path[0]);
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
  };
  function createChildNodeProps(props: { parentKeys?: undefined; nodeKey: InstancesNodeKey | GenericNodeKey }): Pick<HierarchyNode, "filtering"> | undefined;
  function createChildNodeProps(props: {
    parentKeys?: undefined;
    pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
  }): Pick<HierarchyNode, "filtering"> | undefined;
  function createChildNodeProps(props: {
    parentKeys?: undefined;
    asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
  }): Promise<Pick<HierarchyNode, "filtering"> | undefined> | Pick<HierarchyNode, "filtering"> | undefined;
  function createChildNodeProps(props: {
    parentKeys: HierarchyNodeKey[];
    nodeKey: InstancesNodeKey | GenericNodeKey;
  }): Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined;
  function createChildNodeProps(props: {
    parentKeys: HierarchyNodeKey[];
    pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
  }): Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined;
  function createChildNodeProps(props: {
    parentKeys: HierarchyNodeKey[];
    asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
  }): Promise<Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined> | Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined;
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
    | Promise<Pick<HierarchyNode, "filtering" | "autoExpand"> | Pick<HierarchyNode, "filtering"> | undefined>
    | Pick<HierarchyNode, "filtering" | "autoExpand">
    | Pick<HierarchyNode, "filtering">
    | undefined {
    if (!hasFilter) {
      return undefined;
    }
    const reducer = new MatchingFilteringPathsReducer(filteringProps.hasFilterTargetAncestor);
    if ("asyncPathMatcher" in props) {
      const extractResult = saveFilteringPropsFromPathsIntoReducerAsync({ pathsReducer: reducer, pathMatcher: props.asyncPathMatcher });
      if (extractResult instanceof Promise) {
        return extractResult.then(() => {
          return reducer.getNodeProps(props.parentKeys);
        });
      }
      return reducer.getNodeProps(props.parentKeys);
    }
    saveFilteringPropsFromPathsIntoReducer({ ...props, pathsReducer: reducer });
    return reducer.getNodeProps(props.parentKeys);
  }
  return {
    /** Returns a flag indicating if the hierarchy level is filtered. */
    hasFilter,
    /**
     * Returns a flag indicating whether this hierarchy level has an ancestor node
     * that is a filter target. That generally means that this and all downstream hierarchy
     * levels should be displayed without filter being applied to them, even if filter paths
     * say otherwise.
     */
    hasFilterTargetAncestor: filteringProps?.hasFilterTargetAncestor ?? false,
    /**
     * Returns a list of hierarchy node identifiers that apply specifically for this
     * hierarchy level. Returns `undefined` if filtering is not applied to this level.
     */
    getChildNodeFilteringIdentifiers: () => {
      if (!hasFilter) {
        return undefined;
      }
      return filteringProps.filteredNodePaths
        .map(HierarchyFilteringPath.normalize)
        .filter(({ path }) => path.length > 0)
        .map(({ path }) => path[0]);
    },
    /**
     *  When a hierarchy node is created for a filtered hierarchy level, it needs some attributes (e.g. `filtering`
     * and `autoExpand`) to be set based on the filter paths and filtering options. This function calculates
     * these props for a child node based on its key or path matcher.
     *
     * When using `pathMatcher` or `asyncPathMatcher` prop, callers have more flexibility to decide whether the given `HierarchyNodeIdentifier` applies
     * to their node. For example, only some parts of the identifier can be checked for improved performance. Otherwise, the
     * `nodeKey` prop can be used to check the whole identifier.
     *
     * There are multiple overloads of `createChildNodeProps`: depending on props type it returns different values:
     * - `parentKeys` is defined and `pathMatcher` or `nodeKey` is provided - returns undefined **or** `filtering` and `autoExpand` prop from `HierarchyNode`;
     * - `parentKeys` is undefined - does not return `HierarchyNode.autoExpand` option;
     * - props have `asyncPathMatcher` - returns either Promise or the regular return value based on whether or not `asyncPathMatcher` returns a promise.
     */
    createChildNodeProps,
  };
}

type NormalizedFilteringPath = ReturnType<(typeof HierarchyFilteringPath)["normalize"]>;

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

  public constructor(private _hasFilterTargetAncestor: boolean) {}

  public accept(normalizedPath: NormalizedFilteringPath): void {
    const { path, options } = normalizedPath;
    if (path.length === 1) {
      this._isFilterTarget = true;
      this._filterTargetOptions = HierarchyFilteringPath.mergeOptions(this._filterTargetOptions, options);
    } else if (path.length > 1) {
      this._filteredChildrenIdentifierPaths.push({ path: path.slice(1), options });
      this._revealOption = HierarchyFilteringPathOptions.mergeRevealOptions(options?.reveal, this._revealOption);
    }
  }

  private getNeedsAutoExpand(parentKeys: HierarchyNodeKey[] | undefined): boolean {
    if (this._revealOption === true) {
      return true;
    }
    if (typeof this._revealOption === "object") {
      if ("depthInHierarchy" in this._revealOption) {
        return !parentKeys ? 0 < this._revealOption.depthInHierarchy : parentKeys.length < this._revealOption.depthInHierarchy;
      }
      return parentKeys
        ? parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length < this._revealOption.depthInPath
        : 0 < this._revealOption.depthInPath;
    }
    return false;
  }

  public getNodeProps<T extends HierarchyNodeKey[] | undefined = undefined>(
    parentKeys?: T,
  ): T extends undefined ? Pick<HierarchyNode, "filtering"> : Pick<HierarchyNode, "filtering" | "autoExpand"> {
    return {
      ...(this._hasFilterTargetAncestor || this._isFilterTarget || this._filteredChildrenIdentifierPaths.length > 0
        ? {
            filtering: {
              ...(this._hasFilterTargetAncestor ? { hasFilterTargetAncestor: true } : undefined),
              ...(this._isFilterTarget ? { isFilterTarget: true, filterTargetOptions: this._filterTargetOptions } : undefined),
              ...(this._filteredChildrenIdentifierPaths.length > 0 ? { filteredChildrenIdentifierPaths: this._filteredChildrenIdentifierPaths } : undefined),
            },
          }
        : undefined),
      ...(parentKeys && this.getNeedsAutoExpand(parentKeys) ? { autoExpand: true } : undefined),
    };
  }
}
