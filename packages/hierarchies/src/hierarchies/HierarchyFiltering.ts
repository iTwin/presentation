/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode, NonGroupingHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import { GenericNodeKey, HierarchyNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface FilteringPathAutoExpandDepthInPath {
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
export interface FilteringPathAutoExpandDepthInHierarchy {
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
   * **NOTE**: All nodes that are up to and including `depthInHierarchy` will be expanded *EXCEPT* filter targets.
   */
  depthInHierarchy: number;
}

/** @public */
export interface HierarchyFilteringPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the filtered hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the filter target will have `autoExpand` flag.
   * - If it's an instance of `FilteringPathAutoExpandDepthInPath`, then all nodes up to `depthInPath` will have `autoExpand` flag.
   * - If it's an instance of `FilteringPathAutoExpandDepthInHierarchy`, then all nodes up to and including `depthInHierarchy` will have `autoExpand` flag.
   */
  autoExpand?: boolean | FilteringPathAutoExpandDepthInHierarchy | FilteringPathAutoExpandDepthInPath;
}

namespace HierarchyFilteringPathOptions {
  export function mergeAutoExpandOptions(
    lhs: HierarchyFilteringPathOptions["autoExpand"],
    rhs: HierarchyFilteringPathOptions["autoExpand"],
  ): HierarchyFilteringPathOptions["autoExpand"] {
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
    lhs: HierarchyFilteringPathOptions | undefined,
    rhs: HierarchyFilteringPathOptions | undefined,
  ): HierarchyFilteringPathOptions | undefined {
    if (!lhs || !rhs) {
      return lhs ?? rhs;
    }

    return {
      autoExpand: HierarchyFilteringPathOptions.mergeAutoExpandOptions(lhs.autoExpand, rhs.autoExpand),
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
  parentNode: Pick<NonGroupingHierarchyNode, "filtering"> | undefined,
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
  parentNode: Pick<NonGroupingHierarchyNode, "filtering" | "parentKeys"> | undefined,
) {
  const filteringProps = extractFilteringPropsInternal(rootLevelFilteringProps, parentNode);
  const hasFilter = !!filteringProps;
  return {
    /**
     * Returns a flag indicating if the hierarchy level is filtered.
     */
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
     * When a hierarchy node is created for a filtered hierarchy level, it needs some attributes (e.g. `filtering`
     * and `autoExpand`) to be set based on the filter paths and filtering options. This function calculates
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
    ): Pick<HierarchyNode, "autoExpand" | "filtering"> | undefined => {
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

type NormalizedFilteringPath = ReturnType<(typeof HierarchyFilteringPath)["normalize"]>;

class MatchingFilteringPathsReducer {
  #filteredChildrenIdentifierPaths = new Array<NormalizedFilteringPath>();
  #isFilterTarget = false;
  #filterTargetOptions = undefined as HierarchyFilteringPathOptions | undefined;
  #autoExpandOption: HierarchyFilteringPathOptions["autoExpand"] = undefined;
  #hasFilterTargetAncestor: boolean;

  public constructor(hasFilterTargetAncestor: boolean) {
    this.#hasFilterTargetAncestor = hasFilterTargetAncestor;
  }

  public accept(normalizedPath: NormalizedFilteringPath): void {
    const { path, options } = normalizedPath;
    if (path.length === 1) {
      this.#isFilterTarget = true;
      this.#filterTargetOptions = HierarchyFilteringPath.mergeOptions(this.#filterTargetOptions, options);
    } else if (path.length > 1) {
      this.#filteredChildrenIdentifierPaths.push({ path: path.slice(1), options });
      this.#autoExpandOption = HierarchyFilteringPathOptions.mergeAutoExpandOptions(options?.autoExpand, this.#autoExpandOption);
    }
  }

  private getNeedsAutoExpand(parentNode: Pick<NonGroupingHierarchyNode, "parentKeys"> | undefined): boolean {
    if (this.#autoExpandOption === true) {
      return true;
    }
    // Auto expand filter targets only when they have depthInPath set
    const autoExpandOption =
      this.#autoExpandOption !== undefined
        ? this.#autoExpandOption
        : typeof this.#filterTargetOptions?.autoExpand === "object" && "depthInPath" in this.#filterTargetOptions?.autoExpand
          ? this.#filterTargetOptions?.autoExpand
          : undefined;
    if (typeof autoExpandOption === "object") {
      const parentLength = !parentNode
        ? 0
        : "depthInHierarchy" in autoExpandOption
          ? 1 + parentNode.parentKeys.length
          : 1 + parentNode.parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length;
      const depth =
        "depthInHierarchy" in autoExpandOption
          ? autoExpandOption.depthInHierarchy
          : // With `depthInPath` option we don't want to expand node that is at the `depthInPath` position
            autoExpandOption.depthInPath - 1;
      return parentLength < depth;
    }
    return false;
  }

  public getNodeProps(parentNode: Pick<NonGroupingHierarchyNode, "parentKeys"> | undefined): Pick<HierarchyNode, "autoExpand" | "filtering"> {
    return {
      ...(this.#hasFilterTargetAncestor || this.#isFilterTarget || this.#filteredChildrenIdentifierPaths.length > 0
        ? {
            filtering: {
              ...(this.#hasFilterTargetAncestor ? { hasFilterTargetAncestor: true } : undefined),
              ...(this.#isFilterTarget ? { isFilterTarget: true, filterTargetOptions: this.#filterTargetOptions } : undefined),
              ...(this.#filteredChildrenIdentifierPaths.length > 0 ? { filteredChildrenIdentifierPaths: this.#filteredChildrenIdentifierPaths } : undefined),
            },
          }
        : undefined),
      ...(this.getNeedsAutoExpand(parentNode) ? { autoExpand: true } : undefined),
    };
  }
}
