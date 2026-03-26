/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { firstValueFrom, from, map, reduce } from "rxjs";
import { Dictionary } from "@itwin/core-bentley";
import { HierarchyNodeIdentifier } from "./HierarchyNodeIdentifier.js";
import { HierarchyNodeKey } from "./HierarchyNodeKey.js";
import { releaseMainThreadOnItemsCount } from "./internal/operators/ReleaseMainThread.js";

import type { NonGroupingHierarchyNode } from "./HierarchyNode.js";
import type { HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import type { GenericNodeKey, InstancesNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface HierarchySearchPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the searched hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the search target will have `autoExpand` flag.
   * - If it's a object with `groupingLevel` then `groupingLevel` determines the number of grouping levels to expand for
   * the search target.
   */
  reveal?:
    | boolean
    | {
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
    | {
        /**
         * The number of grouping levels to expand for the search target. For example, if `groupingLevel` is set to `2`, then all grouping nodes up to the second level
         * will have the `autoExpand` flag.
         *
         * **Note:** if search target has less grouping levels than specified by this attribute, then all grouping nodes up to the search target will have
         * the `autoExpand` flag, but the search target itself won't have the `autoExpand` flag.
         */
        groupingLevel: number;
      };
  /**
   * This option specifies whether or not search target should be expanded.
   * - If it's `false` or `undefined`, search target won't have 'autoExpand' flag.
   * - If it's `true`, search target will have `autoExpand` flag.
   *
   * **Note:** this attribute does not set `autoExpand` flag on nodes up to the search target. For that use `reveal`.
   */
  autoExpand?: boolean;
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
   *    - if only one of the inputs has `groupingLevel` set, return that one,
   *    - else compare by matching reveal type (`groupingLevel` or `depthInPath`) and return the deeper one.
   *
   * @public
   */
  export function mergeOptions(
    lhs: HierarchySearchPathOptions | undefined,
    rhs: HierarchySearchPathOptions | undefined,
  ): HierarchySearchPathOptions | undefined {
    const reveal = mergeRevealOptions(lhs?.reveal, rhs?.reveal);
    const autoExpand = mergeAutoExpandOption(lhs?.autoExpand, rhs?.autoExpand);
    return reveal || autoExpand
      ? {
          ...(reveal !== undefined ? { reveal } : undefined),
          ...(autoExpand !== undefined ? { autoExpand } : undefined),
        }
      : undefined;
  }
  function mergeRevealOptions(lhs: HierarchySearchPathOptions["reveal"], rhs: HierarchySearchPathOptions["reveal"]): HierarchySearchPathOptions["reveal"] {
    if (rhs === true || lhs === true) {
      return true;
    }
    if (!rhs || !lhs) {
      return !!rhs ? rhs : lhs;
    }

    if ("groupingLevel" in lhs) {
      if ("groupingLevel" in rhs) {
        return lhs.groupingLevel > rhs.groupingLevel ? lhs : rhs;
      }
      return lhs;
    } else if ("groupingLevel" in rhs) {
      return rhs;
    }

    return lhs.depthInPath > rhs.depthInPath ? lhs : rhs;
  }

  function mergeAutoExpandOption(
    lhs: HierarchySearchPathOptions["autoExpand"],
    rhs: HierarchySearchPathOptions["autoExpand"],
  ): HierarchySearchPathOptions["autoExpand"] {
    return lhs || rhs ? true : undefined;
  }
}

/**
 * A tree structure representing hierarchy search paths. Each node in the tree corresponds
 * to a hierarchy node identifier and may have children that represent deeper levels in the
 * hierarchy.
 *
 * The `HierarchySearchTree.createBuilder` or `HierarchySearchTree.createFromPathsList` are
 * typically used create this tree from a flat list of search paths.
 *
 * @public
 */
export interface HierarchySearchTree {
  /** Identifier of the hierarchy node this tree entry represents. */
  identifier: HierarchyNodeIdentifier;

  /**
   * When `true`, indicates that this node is a search target.
   *
   * Note: A `HierarchySearchTree` node is considered a search target if it has no children, even if `isTarget` is not explicitly set to `true`. This
   * is because a node with no children represents the end of a search path.
   */
  isTarget?: boolean;

  /** Provides options for handling this search tree entry, such as auto-expansion behavior. */
  options?: {
    /**
     * - `true` to expand the node and its grouping nodes,
     * - `{ groupingLevel: number }` to expand ancestor grouping nodes, e.g. for the following hierarchy:
     *   ```
     *   - Grouping node A
     *     - Instance node A
     *       - Grouping node B1
     *         - Grouping node B2
     *           - ...
     *             - Grouping node Bn
     *               - Instance node B
     *   ```
     *
     *   For "Instance node B" search tree entry:
     *   - `{ groupingLevel: 1 }` expands its first grouping node "Grouping node B1",
     *   - `{ groupingLevel: 2 }` expands two levels to "Grouping node B2".
     *   - `{ groupingLevel: Number.MAX_SAFE_INTEGER }` expands all grouping nodes of that instance node.
     *
     *   Note that there's a slight difference between `HierarchySearchTree.options.autoExpand` and
     *   `HierarchySearchPath.options.reveal`. The latter option reveals the search target node by expanding its ancestors,
     *   while the `HierarchySearchTree.options.autoExpand` also expands the target node itself.
     */
    autoExpand?: boolean | { groupingLevel: number };
  };

  /** Child search tree entries representing the next level(s) in the hierarchy search paths. */
  children?: HierarchySearchTree[];
}

/** @public */
export namespace HierarchySearchTree {
  /** @public */
  type HierarchySearchTreeBuilderAcceptHandlerTreeEntry<TExtras extends Record<string, unknown>> = Readonly<
    Pick<HierarchySearchTree, "identifier" | "options"> & {
      extras: TExtras;
    }
  > &
    Pick<HierarchySearchTree, "isTarget">;
  /** @public */
  type HierarchySearchTreeBuilderAcceptHandlerTreeInput = Readonly<Pick<HierarchySearchTree, "identifier" | "isTarget" | "options"> & { hasChildren: boolean }>;
  /** @public */
  interface HierarchySearchTreeBuilderAcceptHandler<TExtras extends Record<string, unknown>> {
    /**
     * Called when a new entry is added to the tree. Return `true` to accept the entry, `false` to reject it and all its children, if any.
     */
    onNewEntry?: (props: {
      /** The parent entries of the new entry being added, from root to immediate parent. It's allowed to mutate these entries. */
      parentEntries: Array<HierarchySearchTreeBuilderAcceptHandlerTreeEntry<TExtras>>;
      /** The new entry being added to the tree. */
      inputEntry: HierarchySearchTreeBuilderAcceptHandlerTreeInput;
    }) => boolean;
    /**
     * Called when a new entry is added to the tree and accepted (either it's a new entry or it merges with an existing entry). This can be used to perform
     * side effects such as assigning extra information to the tree entry.
     */
    onEntryHandled?: (props: {
      /** The parent entries of the new entry being added, from root to immediate parent. It's allowed to mutate these entries. */
      parentEntries: Array<HierarchySearchTreeBuilderAcceptHandlerTreeEntry<TExtras>>;
      /** The tree entry that has been handled. It's allowed to mutate this entry. */
      treeEntry: HierarchySearchTreeBuilderAcceptHandlerTreeEntry<TExtras>;
      /** The input entry being added to the tree. */
      inputEntry: HierarchySearchTreeBuilderAcceptHandlerTreeInput;
    }) => void;
  }
  /**
   * Props supplied to HierarchySearchTreeBuilder.accept() method for accepting a hierarchy search path or tree with an optional handler for customizing
   * the behavior of the builder when accepting new entries.
   * @public
   */
  type HierarchySearchTreeBuilderAcceptProps<TAcceptHandlerExtras extends Record<string, unknown>> = (
    | { path: HierarchySearchPath }
    | { tree: HierarchySearchTree }
  ) & {
    /** An optional handler for customizing the behavior of the builder when accepting new entries. */
    handler?: HierarchySearchTreeBuilderAcceptHandler<TAcceptHandlerExtras>;
  };
  /**
   * Props supplied to HierarchySearchTreeBuilder.getTree() method for customizing the resulting tree entries, e.g. by omitting some of them or
   * assigning extra information to them.
   * @public
   */
  interface HierarchySearchTreeBuilderFinalizeTreeProps<TAcceptHandlerExtras extends Record<string, unknown>> {
    /**
     * A function that can be used to process each tree entry before it's added to the final tree.
     *
     * Return `undefined` to omit the entry and its entire branch from the resulting tree.
     */
    processEntry?: (props: {
      treeEntry: HierarchySearchTreeBuilderAcceptHandlerTreeEntry<TAcceptHandlerExtras>;
      parentEntries: Array<HierarchySearchTreeBuilderAcceptHandlerTreeEntry<TAcceptHandlerExtras>>;
    }) => (Omit<HierarchySearchTree, "children"> & { extras: TAcceptHandlerExtras }) | undefined;
  }
  /**
   * An utility that accepts hierarchy search paths or search trees one by one and builds a `HierarchySearchTree` structure based on them.
   * @public
   */
  interface HierarchySearchTreeBuilder<TAcceptHandlerExtras extends Record<string, unknown>> {
    /**
     * Accepts a hierarchy search path or paths' tree and adds it to the builder's internal tree structure. Use `getTree()` to create
     * a `HierarchySearchTree[]` from the added paths.
     */
    accept(props: HierarchySearchTreeBuilderAcceptProps<TAcceptHandlerExtras>): HierarchySearchTreeBuilder<TAcceptHandlerExtras>;
    /**
     * Create `HierarchySearchTree[]` from currently added search paths.
     */
    getTree(props?: HierarchySearchTreeBuilderFinalizeTreeProps<TAcceptHandlerExtras>): HierarchySearchTree[];
  }

  /**
   * Create a `HierarchySearchTree` builder utility that accepts hierarchy search paths or search trees one by one and builds
   * a `HierarchySearchTree` structure based on them.
   *
   * Usage example:
   *
   * ```ts
   * const builder = HierarchySearchTree.createBuilder();
   * for (const path of searchPaths) {
   *   builder.accept({ path });
   * }
   * const searchTree = builder.getTree();
   * ```
   *
   * @public
   */
  export function createBuilder<
    TAcceptHandlerExtras extends Record<string, unknown> = Record<string, unknown>,
  >(): HierarchySearchTreeBuilder<TAcceptHandlerExtras> {
    type HierarchySearchTreeDictionaryEntry = Omit<HierarchySearchTree, "children"> & {
      children?: HierarchySearchTreeDictionary;
      extras: TAcceptHandlerExtras;
    };
    type HierarchySearchTreeDictionary = Dictionary<HierarchyNodeIdentifier, HierarchySearchTreeDictionaryEntry>;
    type AcceptHandler = HierarchySearchTreeBuilderAcceptHandler<TAcceptHandlerExtras>;
    return new (class Impl implements HierarchySearchTreeBuilder<TAcceptHandlerExtras> {
      #rootsDictionary: HierarchySearchTreeDictionary = new Dictionary(HierarchyNodeIdentifier.compare);

      static #mapDictionaryToTree(
        dictionary: HierarchySearchTreeDictionary,
        parentEntries: Array<HierarchySearchTreeBuilderAcceptHandlerTreeEntry<TAcceptHandlerExtras>>,
        props?: HierarchySearchTreeBuilderFinalizeTreeProps<TAcceptHandlerExtras>,
      ): HierarchySearchTree[] {
        const list: HierarchySearchTree[] = [];
        for (const { children, ...entry } of dictionary.values()) {
          let processedEntry: (Omit<HierarchySearchTree, "children"> & { extras: TAcceptHandlerExtras }) | undefined = entry;
          if (props?.processEntry) {
            processedEntry = props.processEntry({ treeEntry: entry, parentEntries });
          }
          if (!processedEntry) {
            continue;
          }
          const { extras: _, ...entryWithoutExtras } = processedEntry;
          parentEntries.push(processedEntry);
          list.push({ ...entryWithoutExtras, ...(children ? { children: Impl.#mapDictionaryToTree(children, parentEntries, props) } : undefined) });
          parentEntries.pop();
        }
        return list;
      }

      static #assignAutoExpandOptionsBasedOnReveal(
        treePath: Pick<HierarchySearchTree, "options">[],
        revealOption: HierarchySearchPathOptions["reveal"] | undefined,
      ) {
        if (revealOption === true) {
          Impl.#assignOptionsOnTreePath({
            treePath,
            targetEntryIndex: treePath.length - 1,
            getEntryOptions: (index, targetEntryIndex) => {
              if (index === targetEntryIndex) {
                // auto-expand all grouping nodes of the revealed node
                return { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } };
              }
              // auto-expand all parent nodes
              return { autoExpand: true };
            },
          });
        } else if (revealOption && "groupingLevel" in revealOption) {
          Impl.#assignOptionsOnTreePath({
            treePath,
            targetEntryIndex: treePath.length - 1,
            getEntryOptions: (index, targetEntryIndex) => {
              if (index === targetEntryIndex) {
                // the last entry should have `autoExpand` with `groupingLevel` set to the value based on `reveal.groupingLevel`
                return { autoExpand: { groupingLevel: Math.max(revealOption.groupingLevel - 1, 0) } };
              }
              // auto-expand all parent nodes
              return { autoExpand: true };
            },
          });
        } else if (revealOption && "depthInPath" in revealOption) {
          Impl.#assignOptionsOnTreePath({
            treePath,
            targetEntryIndex: Math.min(revealOption.depthInPath, treePath.length - 1),
            getEntryOptions: (index, targetEntryIndex) => {
              if (index === targetEntryIndex) {
                // auto-expand all grouping nodes of the revealed node
                return { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } };
              }
              // auto-expand all parent nodes
              return { autoExpand: true };
            },
          });
        }
      }

      static #assignOptionsOnTreePath({
        treePath,
        targetEntryIndex,
        getEntryOptions,
      }: {
        treePath: Array<Pick<HierarchySearchTree, "options">>;
        targetEntryIndex: number;
        getEntryOptions: (index: number, targetEntryIndex: number) => HierarchySearchTree["options"] | undefined;
      }) {
        // set all parent entries to auto-expand
        for (let i = 0; i <= targetEntryIndex; i++) {
          const options = mergeOptions(treePath[i].options, getEntryOptions(i, targetEntryIndex));
          if (options) {
            treePath[i].options = options;
          }
        }
      }

      #acceptNode({
        parentEntries,
        level,
        node,
        handler,
      }: {
        parentEntries: HierarchySearchTreeDictionaryEntry[];
        level: HierarchySearchTreeDictionary;
        node: Pick<HierarchySearchTree, "identifier" | "isTarget"> & { hasChildren: boolean };
        handler?: AcceptHandler;
      }): HierarchySearchTreeDictionaryEntry | undefined {
        let entry = level.get(node.identifier);
        if (!entry) {
          if (handler?.onNewEntry && !handler.onNewEntry({ parentEntries, inputEntry: node })) {
            return undefined;
          }
          entry = {
            identifier: node.identifier,
            children: node.hasChildren ? new Dictionary(HierarchyNodeIdentifier.compare) : undefined,
            extras: {} as TAcceptHandlerExtras,
          };
          level.set(node.identifier, entry);
        }

        const isNodeSearchTarget = node.isTarget || !node.hasChildren;
        if (isNodeSearchTarget && entry.children) {
          entry.isTarget = true;
        }
        if (!entry.children && node.hasChildren) {
          // Existing leaf nodes are implied targets. Preserve that status when adding children.
          entry.isTarget = true;
          entry.children = new Dictionary(HierarchyNodeIdentifier.compare);
        }
        handler?.onEntryHandled?.({ parentEntries, treeEntry: entry, inputEntry: node });
        return entry;
      }

      #acceptPath({ path, handler }: { path: HierarchySearchPath; handler?: AcceptHandler }) {
        const normalized = HierarchySearchPath.normalize(path);
        const treePath: Array<HierarchySearchTreeDictionaryEntry> = [];
        let currentLevel: HierarchySearchTreeDictionary = this.#rootsDictionary;
        for (let i = 0; i < normalized.path.length; i++) {
          const identifier = normalized.path[i];
          const acceptedNode = this.#acceptNode({
            parentEntries: treePath,
            node: { identifier, hasChildren: i < normalized.path.length - 1 },
            level: currentLevel,
            handler,
          });
          if (!acceptedNode) {
            break;
          }
          treePath.push(acceptedNode);
          if (!acceptedNode.children) {
            break;
          }
          currentLevel = acceptedNode.children;
        }

        if (treePath.length === 0) {
          return;
        }

        // handle auto-expand
        const lastNode = treePath[treePath.length - 1];
        if (normalized.options?.autoExpand) {
          (lastNode.options ??= {}).autoExpand = true;
        }

        // handle auto-reveal
        Impl.#assignAutoExpandOptionsBasedOnReveal(treePath, normalized.options?.reveal);
      }

      #acceptTree({ tree, handler }: { tree: HierarchySearchTree; handler?: AcceptHandler }) {
        const acceptTreeNode = (
          parentEntries: HierarchySearchTreeDictionaryEntry[],
          parentInputs: HierarchySearchTree[],
          level: HierarchySearchTreeDictionary,
          node: HierarchySearchTree,
        ) => {
          const acceptedNode = this.#acceptNode({
            parentEntries,
            node: { ...node, hasChildren: node.children !== undefined },
            level,
            handler,
          });
          if (!acceptedNode) {
            // It was decided to reject this node and its children, if any
            return;
          }
          const treePath = [...parentEntries, acceptedNode];
          const inputsPath = [...parentInputs, node];
          if (!node.children || node.isTarget) {
            // Found an effective search target - merge options from its path
            Impl.#assignOptionsOnTreePath({
              treePath,
              targetEntryIndex: treePath.length - 1,
              getEntryOptions: (index) => inputsPath[index].options,
            });
          }
          const currentLevel = acceptedNode.children;
          if (currentLevel) {
            node.children?.forEach((child) => acceptTreeNode(treePath, inputsPath, currentLevel, child));
          }
        };
        acceptTreeNode([], [], this.#rootsDictionary, tree);
      }

      public accept(
        props: ({ path: HierarchySearchPath } | { tree: HierarchySearchTree }) & { handler?: AcceptHandler },
      ): HierarchySearchTreeBuilder<TAcceptHandlerExtras> {
        if ("path" in props) {
          this.#acceptPath(props);
        } else {
          this.#acceptTree(props);
        }
        return this;
      }

      public getTree(props?: HierarchySearchTreeBuilderFinalizeTreeProps<TAcceptHandlerExtras>) {
        return Impl.#mapDictionaryToTree(this.#rootsDictionary, [], props);
      }
    })();
  }

  /**
   * Builds a list of `HierarchySearchTree` nodes from an iterable of search paths. Shared
   * path prefixes are merged so that each unique hierarchy node identifier appears only once
   * per level. The resulting trees carry `isTarget`, `options`, and `children` attributes
   * derived from the paths and their options (`autoExpand`, `reveal`).
   *
   * @public
   */
  export async function createFromPathsList(paths: Iterable<HierarchySearchPath>): Promise<HierarchySearchTree[]> {
    return firstValueFrom(
      from(paths).pipe(
        releaseMainThreadOnItemsCount(1000),
        reduce((builder, path) => builder.accept({ path }), createBuilder()),
        map((builder) => builder.getTree()),
      ),
    );
  }

  /**
   * Merges two `HierarchySearchTree` option objects. For the `autoExpand` attribute,
   * `true` takes precedence over `{ groupingLevel }`, and when both sides are
   * `{ groupingLevel }` objects the larger value wins.
   * @public
   */
  export function mergeOptions(
    lhs: HierarchySearchTree["options"] | undefined,
    rhs: HierarchySearchTree["options"] | undefined,
  ): HierarchySearchTree["options"] | undefined {
    if (!lhs) {
      return rhs;
    }
    if (!rhs) {
      return lhs;
    }
    const autoExpand = mergeSearchTreeAutoExpandOption(lhs.autoExpand, rhs.autoExpand);
    const options: NonNullable<HierarchySearchTree["options"]> = {
      ...(autoExpand ? { autoExpand } : undefined),
    };
    return Object.keys(options).length > 0 ? options : undefined;
  }

  function mergeSearchTreeAutoExpandOption(
    lhs: NonNullable<HierarchySearchTree["options"]>["autoExpand"] | undefined,
    rhs: NonNullable<HierarchySearchTree["options"]>["autoExpand"] | undefined,
  ): NonNullable<HierarchySearchTree["options"]>["autoExpand"] | undefined {
    if (!lhs) {
      return rhs;
    }
    if (!rhs) {
      return lhs;
    }
    return lhs === true || rhs === true ? true : { groupingLevel: Math.max(lhs.groupingLevel, rhs.groupingLevel) };
  }
}

function extractSearchPropsInternal(
  rootLevelSearchProps: HierarchySearchTree[] | undefined,
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
):
  | {
      childrenTargetPaths?: HierarchySearchTree[];
      hasSearchTargetAncestor: boolean;
    }
  | undefined {
  if (!parentNode) {
    return rootLevelSearchProps ? { childrenTargetPaths: rootLevelSearchProps, hasSearchTargetAncestor: false } : undefined;
  }
  const searchProps: {
    childrenTargetPaths?: HierarchySearchTree[];
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
  rootLevelSearchProps: HierarchySearchTree[] | undefined,
  parentNode: Pick<NonGroupingHierarchyNode, "search"> | undefined,
) {
  const searchProps = extractSearchPropsInternal(rootLevelSearchProps, parentNode);
  const hasSearch = !!searchProps;

  function saveSearchPropsFromPathsIntoReducer(
    extractionProps: {
      pathsReducer: MatchingSearchPathsReducer;
      nodeKey: InstancesNodeKey | GenericNodeKey;
    } & (
      | {
          pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
        }
      | {}
    ),
  ): void;
  function saveSearchPropsFromPathsIntoReducer(extractionProps: {
    pathsReducer: MatchingSearchPathsReducer;
    nodeKey: InstancesNodeKey | GenericNodeKey;
    asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
  }): void | Promise<void>;
  function saveSearchPropsFromPathsIntoReducer(
    extractionProps: {
      pathsReducer: MatchingSearchPathsReducer;
      nodeKey: InstancesNodeKey | GenericNodeKey;
    } & (
      | { pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean }
      | { asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean> }
      | {}
    ),
  ): void | Promise<void> {
    // Passes down matching hierarchy search trees to the reducer.
    // It uses `nodeKey`, `pathMatcher` or `asyncPathMatcher` to check if `HierarchyNodeIdentifier` in the search tree item's identifier matches the node
    // and if it does, the path is passed down to the reducer.
    // This function returns a promise only if `asyncPathMatcher` returns a promise.
    if (!searchProps?.childrenTargetPaths) {
      return;
    }
    const matchedTreePromises = new Array<Promise<HierarchySearchTree | undefined>>();
    for (const childrenSearchTree of searchProps.childrenTargetPaths) {
      if ("asyncPathMatcher" in extractionProps) {
        const matchesPossiblyPromise = extractionProps.asyncPathMatcher(childrenSearchTree.identifier);
        if (matchesPossiblyPromise instanceof Promise) {
          matchedTreePromises.push(matchesPossiblyPromise.then((matches) => (matches ? childrenSearchTree : undefined)));
        } else if (matchesPossiblyPromise) {
          extractionProps.pathsReducer.accept(childrenSearchTree);
        }
      } else {
        const matches =
          "pathMatcher" in extractionProps
            ? extractionProps.pathMatcher(childrenSearchTree.identifier)
            : nodeKeyMatchesIdentifier(extractionProps.nodeKey, childrenSearchTree.identifier);
        if (matches) {
          extractionProps.pathsReducer.accept(childrenSearchTree);
        }
      }
    }
    if (matchedTreePromises.length === 0) {
      return;
    }
    return Promise.all(matchedTreePromises).then((matchedTrees) =>
      matchedTrees.forEach((matchedTree) => matchedTree && extractionProps.pathsReducer.accept(matchedTree)),
    );
  }

  function createChildNodeProps(props: { nodeKey: InstancesNodeKey | GenericNodeKey }): Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined;
  function createChildNodeProps(props: {
    nodeKey: InstancesNodeKey | GenericNodeKey;
    pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
  }): Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined;
  function createChildNodeProps(props: {
    nodeKey: InstancesNodeKey | GenericNodeKey;
    asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
  }): Promise<Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined> | Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined;
  function createChildNodeProps(
    props: { nodeKey: InstancesNodeKey | GenericNodeKey } & (
      | {
          asyncPathMatcher: (identifier: HierarchyNodeIdentifier) => boolean | Promise<boolean>;
        }
      | {
          pathMatcher: (identifier: HierarchyNodeIdentifier) => boolean;
        }
      | {}
    ),
  ): Promise<Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined> | Pick<NonGroupingHierarchyNode, "search" | "autoExpand"> | undefined {
    if (!hasSearch) {
      return undefined;
    }

    const reducer = new MatchingSearchPathsReducer(searchProps.hasSearchTargetAncestor);
    if ("asyncPathMatcher" in props) {
      const extractResult = saveSearchPropsFromPathsIntoReducer({ pathsReducer: reducer, nodeKey: props.nodeKey, asyncPathMatcher: props.asyncPathMatcher });
      if (extractResult instanceof Promise) {
        return extractResult.then(() => reducer.aggregatedOptions);
      }
    } else {
      saveSearchPropsFromPathsIntoReducer({ pathsReducer: reducer, ...props });
    }
    return reducer.aggregatedOptions;
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
      return searchProps.childrenTargetPaths.map(({ identifier }) => identifier);
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
     * - `asyncPathMatcher` is provided - returns either Promise or the regular return value based on whether or not `asyncPathMatcher` returns a `Promise`.
     * - `pathMatcher` or only `nodeKey` is provided - returns undefined **or** `search` and `autoExpand` prop from `HierarchyNode`;
     */
    createChildNodeProps,
  };
}

function nodeKeyMatchesIdentifier(nodeKey: InstancesNodeKey | GenericNodeKey, identifier: HierarchyNodeIdentifier): boolean {
  return (
    (HierarchyNodeKey.isGeneric(nodeKey) && HierarchyNodeIdentifier.equal(identifier, nodeKey)) ||
    (HierarchyNodeKey.isInstances(nodeKey) && nodeKey.instanceKeys.some((ik) => HierarchyNodeIdentifier.equal(identifier, ik)))
  );
}

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
  private _childrenTargetPaths = new Array<HierarchySearchTree>();
  private _isSearchTarget = false;
  private _options: HierarchySearchTree["options"] | undefined = undefined;

  public constructor(private _hasSearchTargetAncestor: boolean) {}

  public accept(tree: HierarchySearchTree): void {
    if (tree.isTarget || tree.children === undefined) {
      this._isSearchTarget = true;
    }
    if (tree.children && tree.children.length > 0) {
      this._childrenTargetPaths.push(...tree.children);
    }
    this._options = HierarchySearchTree.mergeOptions(this._options, tree.options);
  }

  public get aggregatedOptions() {
    const search =
      this._hasSearchTargetAncestor || this._isSearchTarget || this._childrenTargetPaths.length > 0 || this._options
        ? {
            ...(this._hasSearchTargetAncestor ? { hasSearchTargetAncestor: true } : undefined),
            ...(this._isSearchTarget ? { isSearchTarget: true } : undefined),
            ...(this._childrenTargetPaths.length > 0 ? { childrenTargetPaths: this._childrenTargetPaths } : undefined),
            ...(this._options ? { options: this._options } : undefined),
          }
        : undefined;
    const autoExpand = this._options?.autoExpand === true;
    return {
      ...(search ? { search } : undefined),
      ...(autoExpand ? { autoExpand } : undefined),
    };
  }
}
