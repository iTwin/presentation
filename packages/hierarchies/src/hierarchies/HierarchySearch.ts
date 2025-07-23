/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode, NonGroupingHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import { GenericNodeKey, GroupingNodeKey, HierarchyNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface SearchTargetGroupingNodeInfo {
  /**
   * Key of the grouping node.
   * @deprecated in 1.6. This option is no longer needed.
   */
  key: GroupingNodeKey;

  /**
   * Depth up to which nodes in the hierarchy should be expanded.
   */
  depth: number;
}

/** @public */
export interface SearchPathAutoExpandOption {
  /**
   * Depth up to which nodes in the hierarchy should be expanded.
   */
  depth: number;
}

/** @public */
export interface HierarchySearchPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the filtered hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the filter target will have `autoExpand` flag.
   * - If it's an instance of `FilterTargetGroupingNodeInfo`, then all nodes up to the grouping node that matches this property,
   * will have `autoExpand` flag.
   * - If it's an instance of `FilteringPathAutoExpandOption`, then all nodes up to and including `depth` will have `autoExpand` flag.
   */
  autoExpand?: boolean | SearchTargetGroupingNodeInfo | SearchPathAutoExpandOption;
}

/**
 * A path of hierarchy node identifiers for filtering the hierarchy with additional options.
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
    lhs: HierarchySearchPathOptions | undefined,
    rhs: HierarchySearchPathOptions | undefined,
  ): HierarchySearchPathOptions | undefined {
    if (!lhs || !rhs) {
      return lhs ?? rhs;
    }

    return {
      autoExpand: ((): HierarchySearchPathOptions["autoExpand"] => {
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

function extractFilteringPropsInternal(
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
 * Creates a set of utilities for making it easier to filter the given hierarchy
 * level.
 *
 * @public
 */
export function createHierarchySearchHelper(
  rootLevelSearchProps: HierarchySearchPath[] | undefined,
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
) {
  const searchProps = extractFilteringPropsInternal(rootLevelSearchProps, parentNode);
  const hasFilter = !!searchProps;
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
    hasSearchTargetAncestor: searchProps?.hasSearchTargetAncestor ?? false,

    /**
     * Returns a list of hierarchy node identifiers that apply specifically for this
     * hierarchy level. Returns `undefined` if filtering is not applied to this level.
     */
    getChildNodeSearchIdentifiers: () => {
      if (!hasFilter) {
        return undefined;
      }
      return searchProps.searchedNodePaths
        .map(HierarchySearchPath.normalize)
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
    ): NodeProps | undefined => {
      if (!hasFilter) {
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
      if (!hasFilter) {
        return undefined;
      }
      const reducer = new MatchingSearchPathsReducer(searchProps?.hasSearchTargetAncestor);
      const matchedPathPromises = new Array<Promise<NormalizedSearchPath | undefined>>();
      for (const filteredChildrenNodeIdentifierPath of searchProps.searchedNodePaths) {
        const normalizedPath = HierarchySearchPath.normalize(filteredChildrenNodeIdentifierPath);
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
export type NodeProps = Pick<HierarchyNode, "autoExpand" | "search"> & { search?: { autoExpandDepth?: number } };

type NormalizedSearchPath = ReturnType<(typeof HierarchySearchPath)["normalize"]>;

class MatchingSearchPathsReducer {
  private _searchedChildrenIdentifierPaths = new Array<NormalizedSearchPath>();
  private _isSearchTarget = false;
  private _searchTargetOptions = undefined as HierarchySearchPathOptions | undefined;
  private _needsAutoExpand: boolean | { depth: number } = false;

  public constructor(private _hasSearchTargetAncestor: boolean) {}

  public accept({ path, options }: NormalizedSearchPath) {
    if (path.length === 1) {
      this._isSearchTarget = true;
      this._searchTargetOptions = HierarchySearchPath.mergeOptions(this._searchTargetOptions, options);
    } else if (path.length > 1) {
      this._searchedChildrenIdentifierPaths.push({ path: path.slice(1), options });
      if (options?.autoExpand) {
        if (
          !this._needsAutoExpand ||
          (this._needsAutoExpand !== true && (options.autoExpand === true || this._needsAutoExpand.depth < options.autoExpand.depth))
        ) {
          this._needsAutoExpand = options.autoExpand;
        }
      }
    }
  }
  public getNodeProps(): NodeProps {
    return {
      ...(this._hasSearchTargetAncestor || this._isSearchTarget || this._searchedChildrenIdentifierPaths.length > 0
        ? {
            search: {
              ...(this._hasSearchTargetAncestor ? { hasSearchTargetAncestor: true } : undefined),
              ...(this._isSearchTarget ? { isSearchTarget: true, searchTargetOptions: this._searchTargetOptions } : undefined),
              ...(this._searchedChildrenIdentifierPaths.length > 0 ? { searchedChildrenIdentifierPaths: this._searchedChildrenIdentifierPaths } : undefined),
              ...(this._needsAutoExpand && this._needsAutoExpand !== true ? { autoExpandDepth: this._needsAutoExpand.depth } : undefined),
            },
          }
        : undefined),
      ...(this._needsAutoExpand ? { autoExpand: !!this._needsAutoExpand } : undefined),
    };
  }
}
