/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode, NonGroupingHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import { GenericNodeKey, GroupingNodeKey, HierarchyNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface FilterTargetGroupingNodeInfo {
  /** Key of the grouping node. */
  key: GroupingNodeKey;

  /**
   * Depth of the grouping node in the hierarchy.
   * Generally, it can be retrieved from `parentKeys.length`.
   */
  depth: number;
}

/** @public */
export interface HierarchyFilteringPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the filtered hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the filter target will have `autoExpand` flag.
   * - If it's an instance of `FilterTargetGroupingNodeInfo`, then all nodes up to the grouping node that matches this property,
   * will have `autoExpand` flag.
   */
  autoExpand?: boolean | FilterTargetGroupingNodeInfo;
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
   * - else if both inputs are objects, return the one with the greater `depth` attribute.
   * - else if one input is an object, return it.
   * - else, return `false` or `undefined`.
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
      autoExpand: ((): HierarchyFilteringPathOptions["autoExpand"] => {
        if (rhs.autoExpand === true || lhs.autoExpand === true) {
          return true;
        }
        if (typeof lhs.autoExpand === "object") {
          if (typeof rhs.autoExpand === "object" && rhs.autoExpand.depth > lhs.autoExpand.depth) {
            return rhs.autoExpand;
          }
          return lhs.autoExpand;
        }
        return rhs.autoExpand;
      })(),
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
  parentNode: Pick<NonGroupingHierarchyNode, "filtering"> | undefined,
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
    ): Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined => {
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
      return reducer.getNodeProps();
    },

    /**
     * Similar to `createChildNodeProps`, but takes an async `pathMatcher` prop.
     */
    createChildNodePropsAsync: (props: {
      pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
    }): Promise<Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined> | Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined => {
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
        return reducer.getNodeProps();
      }
      return Promise.all(matchedPathPromises)
        .then((matchedPath) => matchedPath.forEach((normalizedPath) => normalizedPath && reducer.accept(normalizedPath)))
        .then(() => reducer.getNodeProps());
    },
  };
}

type NormalizedFilteringPath = ReturnType<(typeof HierarchyFilteringPath)["normalize"]>;

class MatchingFilteringPathsReducer {
  private _filteredChildrenIdentifierPaths = new Array<NormalizedFilteringPath>();
  private _isFilterTarget = false;
  private _filterTargetOptions = undefined as HierarchyFilteringPathOptions | undefined;
  private _needsAutoExpand = false;

  public constructor(private _hasFilterTargetAncestor: boolean) {}

  public accept({ path, options }: NormalizedFilteringPath) {
    if (path.length === 1) {
      this._isFilterTarget = true;
      this._filterTargetOptions = HierarchyFilteringPath.mergeOptions(this._filterTargetOptions, options);
    } else if (path.length > 1) {
      this._filteredChildrenIdentifierPaths.push({ path: path.slice(1), options });
      if (options?.autoExpand) {
        this._needsAutoExpand = true;
      }
    }
  }
  public getNodeProps(): Pick<HierarchyNode, "filtering" | "autoExpand"> {
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
      ...(this._needsAutoExpand ? { autoExpand: true } : undefined),
    };
  }
}
