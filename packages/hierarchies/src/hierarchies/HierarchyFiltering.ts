/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Props } from "@itwin/presentation-shared";
import { HierarchyNode, NonGroupingHierarchyNode, ParentHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import { GenericNodeKey, HierarchyNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface FilteringPathAutoExpandDepthInPath {
  /**
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
   * Provide `{ path: [Node1, Element1], autoExpand: { depthInPath: 2 } }`
   *
   * **NOTE**: All nodes that are up to `depthInPath` will be expanded **except** filter targets.
   */
  depthInPath: number;
}

/** @public */
export interface FilteringPathAutoExpandDepthInHierarchy {
  /**
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
   * Provide `{ path: [Node1, Element1], autoExpand: { depthInHierarchy: 2 } }`
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
  const prepareReducer = (
    props: { pathsReducer: MatchingFilteringPathsReducer } & (
      | { nodeKey: InstancesNodeKey | GenericNodeKey }
      | { pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean> }
    ),
  ): void | Promise<void> => {
    if (!hasFilter) {
      return undefined;
    }
    const matchedPathPromises = new Array<Promise<NormalizedFilteringPath | undefined>>();
    for (const filteredChildrenNodeIdentifierPath of filteringProps.filteredNodePaths) {
      const normalizedPath = HierarchyFilteringPath.normalize(filteredChildrenNodeIdentifierPath);
      /* c8 ignore next 3 */
      if (normalizedPath.path.length === 0) {
        continue;
      }
      if ("nodeKey" in props) {
        if (
          (HierarchyNodeKey.isGeneric(props.nodeKey) && HierarchyNodeIdentifier.equal(normalizedPath.path[0], props.nodeKey)) ||
          (HierarchyNodeKey.isInstances(props.nodeKey) && props.nodeKey.instanceKeys.some((ik) => HierarchyNodeIdentifier.equal(normalizedPath.path[0], ik)))
        ) {
          props.pathsReducer.accept(normalizedPath);
        }
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

      props.pathsReducer.accept(normalizedPath);
    }

    if (matchedPathPromises.length === 0) {
      return;
    }
    return Promise.all(matchedPathPromises).then((matchedPath) =>
      matchedPath.forEach((normalizedPath) => normalizedPath && props.pathsReducer.accept(normalizedPath)),
    );
  };

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
     * When a hierarchy node is created for a filtered hierarchy level, it might need `autoExpand` attribute to be set based on the filter paths and filtering options.
     * This function calculates this prop for a child node based on its key or path matcher.
     *
     * When using `pathMatcher` prop, callers have more flexibility to decide whether the given `HierarchyNodeIdentifier` applies
     * to their node. For example, only some parts of the identifier can be checked for improved performance. Otherwise, the
     * `nodeKey` prop can be used to check the whole identifier.
     */
    createChildNodeAutoExpandProp: (
      props: {
        parentKeys: HierarchyNodeKey[];
      } & (
        | {
            nodeKey: InstancesNodeKey | GenericNodeKey;
          }
        | {
            pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
          }
      ),
    ): Pick<HierarchyNode, "autoExpand"> | undefined => {
      if (!hasFilter) {
        return undefined;
      }
      const reducer = new MatchingFilteringPathsReducer(filteringProps?.hasFilterTargetAncestor);
      const prepareReducerProps: Props<typeof prepareReducer> = {
        pathsReducer: reducer,
        ...("nodeKey" in props ? { nodeKey: props.nodeKey } : { pathMatcher: props.pathMatcher }),
      };
      // PrepareReducer returns a promise only if pathMatcher can return a promise
      // In this case it can't happen
      void prepareReducer(prepareReducerProps);
      return reducer.getNodeAutoExpandProp(props.parentKeys);
    },

    /**
     * Similar to `createChildNodeAutoExpandProp`, but takes an async `pathMatcher` prop.
     */
    createChildNodeAutoExpandPropAsync: (props: {
      parentKeys: HierarchyNodeKey[];
      pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
    }): Promise<Pick<HierarchyNode, "autoExpand"> | undefined> | Pick<HierarchyNode, "autoExpand"> | undefined => {
      if (!hasFilter) {
        return undefined;
      }
      const reducer = new MatchingFilteringPathsReducer(filteringProps?.hasFilterTargetAncestor);
      const prepareReducerResult = prepareReducer({ pathMatcher: props.pathMatcher, pathsReducer: reducer });
      if (prepareReducerResult instanceof Promise) {
        return prepareReducerResult.then(() => reducer.getNodeAutoExpandProp(props.parentKeys));
      }
      return reducer.getNodeAutoExpandProp(props.parentKeys);
    },

    /**
     * When a hierarchy node is created for a filtered hierarchy level, it might need `filtering` attribute to be set based on the filter paths and filtering options.
     * This function calculates this prop for a child node based on its key or path matcher.
     *
     * When using `pathMatcher` prop, callers have more flexibility to decide whether the given `HierarchyNodeIdentifier` applies
     * to their node. For example, only some parts of the identifier can be checked for improved performance. Otherwise, the
     * `nodeKey` prop can be used to check the whole identifier.
     */
    createChildNodeFilteringProp: (
      props:
        | {
            nodeKey: InstancesNodeKey | GenericNodeKey;
          }
        | {
            pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
          },
    ): Pick<HierarchyNode, "filtering"> | undefined => {
      if (!hasFilter) {
        return undefined;
      }
      const reducer = new MatchingFilteringPathsReducer(filteringProps?.hasFilterTargetAncestor);
      const prepareReducerProps: Props<typeof prepareReducer> = {
        pathsReducer: reducer,
        ...("nodeKey" in props ? { nodeKey: props.nodeKey } : { pathMatcher: props.pathMatcher }),
      };
      // PrepareReducer returns a promise only if pathMatcher can return a promise
      // In this case it can't happen
      void prepareReducer(prepareReducerProps);
      return reducer.getNodeFilteringProp();
    },

    /**
     * Similar to `createChildNodeFilteringProp`, but takes an async `pathMatcher` prop.
     */
    createChildNodeFilteringPropAsync: (props: {
      pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
    }): Promise<Pick<HierarchyNode, "filtering"> | undefined> | Pick<HierarchyNode, "filtering"> | undefined => {
      if (!hasFilter) {
        return undefined;
      }
      const reducer = new MatchingFilteringPathsReducer(filteringProps?.hasFilterTargetAncestor);
      const prepareReducerResult = prepareReducer({ pathMatcher: props.pathMatcher, pathsReducer: reducer });
      if (prepareReducerResult instanceof Promise) {
        return prepareReducerResult.then(() => reducer.getNodeFilteringProp());
      }
      return reducer.getNodeFilteringProp();
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
      props: {
        parentKeys: HierarchyNodeKey[];
      } & (
        | {
            nodeKey: InstancesNodeKey | GenericNodeKey;
          }
        | {
            pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
          }
      ),
    ): Pick<HierarchyNode, "autoExpand" | "filtering"> | undefined => {
      if (!hasFilter) {
        return undefined;
      }
      const reducer = new MatchingFilteringPathsReducer(filteringProps?.hasFilterTargetAncestor);
      const prepareReducerProps: Props<typeof prepareReducer> = {
        pathsReducer: reducer,
        ...("nodeKey" in props ? { nodeKey: props.nodeKey } : { pathMatcher: props.pathMatcher }),
      };
      // PrepareReducer returns a promise only if pathMatcher can return a promise
      // In this case it can't happen
      void prepareReducer(prepareReducerProps);
      return reducer.getNodeProps(props.parentKeys);
    },

    /**
     * Similar to `createChildNodeProps`, but takes an async `pathMatcher` prop.
     */
    createChildNodePropsAsync: (props: {
      parentKeys: HierarchyNodeKey[];
      pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
    }): Promise<Pick<HierarchyNode, "autoExpand" | "filtering"> | undefined> | Pick<HierarchyNode, "autoExpand" | "filtering"> | undefined => {
      if (!hasFilter) {
        return undefined;
      }
      const reducer = new MatchingFilteringPathsReducer(filteringProps?.hasFilterTargetAncestor);
      const prepareReducerResult = prepareReducer({ pathMatcher: props.pathMatcher, pathsReducer: reducer });
      if (prepareReducerResult instanceof Promise) {
        return prepareReducerResult.then(() => reducer.getNodeProps(props.parentKeys));
      }
      return reducer.getNodeProps(props.parentKeys);
    },
  };
}

type NormalizedFilteringPath = ReturnType<(typeof HierarchyFilteringPath)["normalize"]>;

class MatchingFilteringPathsReducer {
  private _filteredChildrenIdentifierPaths = new Array<NormalizedFilteringPath>();
  private _isFilterTarget = false;
  private _filterTargetOptions = undefined as HierarchyFilteringPathOptions | undefined;
  private _autoExpandOption: HierarchyFilteringPathOptions["autoExpand"] = false;

  public constructor(private _hasFilterTargetAncestor: boolean) {}

  public accept(normalizedPath: NormalizedFilteringPath): void {
    const { path, options } = normalizedPath;
    if (path.length === 1) {
      this._isFilterTarget = true;
      this._filterTargetOptions = HierarchyFilteringPath.mergeOptions(this._filterTargetOptions, options);
    } else if (path.length > 1) {
      this._filteredChildrenIdentifierPaths.push({ path: path.slice(1), options });
      this._autoExpandOption = HierarchyFilteringPathOptions.mergeAutoExpandOptions(options?.autoExpand, this._autoExpandOption);
    }
  }

  private getNeedsAutoExpand(parentKeys: HierarchyNodeKey[] | undefined): boolean {
    if (this._autoExpandOption === true) {
      return true;
    }
    if (typeof this._autoExpandOption === "object") {
      const parentLength = !parentKeys
        ? 0
        : "depthInHierarchy" in this._autoExpandOption
          ? parentKeys.length
          : parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length;

      // We don't want to expand node that is at the `depth` index, thus subtract 1
      const depth = "depthInHierarchy" in this._autoExpandOption ? this._autoExpandOption.depthInHierarchy : this._autoExpandOption.depthInPath;

      return parentLength < depth;
    }
    return false;
  }

  public getNodeFilteringProp(): Pick<HierarchyNode, "filtering"> {
    return this._hasFilterTargetAncestor || this._isFilterTarget || this._filteredChildrenIdentifierPaths.length > 0
      ? {
          filtering: {
            ...(this._hasFilterTargetAncestor ? { hasFilterTargetAncestor: true } : undefined),
            ...(this._isFilterTarget ? { isFilterTarget: true, filterTargetOptions: this._filterTargetOptions } : undefined),
            ...(this._filteredChildrenIdentifierPaths.length > 0 ? { filteredChildrenIdentifierPaths: this._filteredChildrenIdentifierPaths } : undefined),
          },
        }
      : {};
  }

  public getNodeAutoExpandProp(parentKeys: HierarchyNodeKey[]): Pick<HierarchyNode, "autoExpand"> {
    return this.getNeedsAutoExpand(parentKeys) ? { autoExpand: true } : {};
  }

  public getNodeProps(parentKeys: HierarchyNodeKey[]) {
    return {
      ...this.getNodeFilteringProp(),
      ...this.getNodeAutoExpandProp(parentKeys),
    };
  }
}
