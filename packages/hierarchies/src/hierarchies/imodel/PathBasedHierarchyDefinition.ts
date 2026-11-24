/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNodeKey } from "../HierarchyNodeKey.js";
import { ProcessedHierarchyNode } from "./IModelHierarchyNode.js";

import type { ParentHierarchyNode } from "../HierarchyNode.js";
import type { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier.js";
import type {
  DefineHierarchyLevelProps,
  HierarchyDefinition,
  HierarchyLevelDefinition,
  NodeParser,
  NodePostProcessor,
  NodePreProcessor,
} from "./IModelHierarchyDefinition.js";
import type { NodeSelectClausePropsWithoutLabelMerging } from "./NodeSelectQueryFactory.js";

/**
 * Props that identify the parent of a hierarchy level by a path of node identifiers, instead of a parent node.
 * @beta
 */
export interface HierarchyLevelPathProps {
  /**
   * Identifiers of the parent node and its ancestors, starting from the root. The path is empty for the root
   * hierarchy level. Grouping nodes are not included in the path.
   */
  path: HierarchyNodeIdentifier[];
}

/**
 * Props for `PathBasedHierarchyDefinition.defineHierarchyLevel`. Same as `DefineHierarchyLevelProps`, except
 * the parent is identified by a `path` rather than `parentNode`, and the select clause can't request merging
 * nodes by label.
 *
 * @beta
 */
export interface PathBasedDefineHierarchyLevelProps
  extends Omit<DefineHierarchyLevelProps, "parentNode" | "createSelectClause">, HierarchyLevelPathProps {
  /**
   * Creates a SELECT clause in a format understood by the nodes query parser. Same as
   * `NodesQueryClauseFactory.createSelectClause`, except that nodes can't be merged by label.
   */
  createSelectClause(props: NodeSelectClausePropsWithoutLabelMerging): Promise<string>;
}

/**
 * A hierarchy definition that identifies the parent of a hierarchy level by a path of node identifiers, instead of
 * a parent node. This allows creating the hierarchy level without loading its ancestor nodes first.
 *
 * The callbacks receive a `path` and never receive the parent node, so the definition can't use any parent node data
 * (e.g. `extendedData`), and has to derive everything it needs from identifiers in the path.
 *
 * Nodes can't be merged by label, because a merged node gets all of its instance keys only after its whole hierarchy
 * level is loaded.
 *
 * @see `createIModelHierarchyNodePaths`
 * @beta
 */
export interface PathBasedHierarchyDefinition {
  /**
   * An optional function for parsing ECInstance node from ECSQL row.
   * @see `HierarchyDefinition.parseNode`
   */
  parseNode?: NodeParser<HierarchyLevelPathProps>;

  /**
   * An optional function for pre-processing nodes.
   * @see `HierarchyDefinition.preProcessNode`
   */
  preProcessNode?: NodePreProcessor<HierarchyLevelPathProps>;

  /**
   * An optional function for post-processing nodes.
   * @see `HierarchyDefinition.postProcessNode`
   */
  postProcessNode?: NodePostProcessor<HierarchyLevelPathProps>;

  /** A function to create a hierarchy level definition for the parent identified by the given path. */
  defineHierarchyLevel(props: PathBasedDefineHierarchyLevelProps): Promise<HierarchyLevelDefinition>;
}

/**
 * Creates a `HierarchyDefinition` that calls the given path-based definition. The path is created from keys of the
 * parent node and its ancestors, skipping grouping node keys. The path-based definition never gets the parent node.
 *
 * @throws An error if a node or a parent node has more than one instance key, e.g. because it's merged by label.
 */
export function createHierarchyDefinitionFromPathBased(source: PathBasedHierarchyDefinition): HierarchyDefinition {
  return {
    ...(source.parseNode
      ? { parseNode: async ({ parentNode, ...props }) => source.parseNode!({ ...props, path: createPath(parentNode) }) }
      : {}),
    ...(source.preProcessNode
      ? {
          preProcessNode: async ({ node, parentNode }) =>
            source.preProcessNode!({ node, path: createPath(parentNode) }),
        }
      : {}),
    postProcessNode: async ({ node, parentNode }) => {
      // nodes merged by label get all their instance keys when their hierarchy level is grouped, so they can only be
      // detected after pre-processing
      if (ProcessedHierarchyNode.isInstancesNode(node) && node.key.instanceKeys.length > 1) {
        throw new Error(MULTIPLE_INSTANCE_KEYS_ERROR);
      }
      return source.postProcessNode ? source.postProcessNode({ node, path: createPath(parentNode) }) : node;
    },
    defineHierarchyLevel: async ({ parentNode, ...props }) =>
      source.defineHierarchyLevel({ ...props, path: createPath(parentNode) }),
  };
}

const MULTIPLE_INSTANCE_KEYS_ERROR =
  "Path-based hierarchy definitions don't support nodes with multiple instance keys, e.g. nodes merged by label.";

function createPath(
  parentNode: Pick<ParentHierarchyNode, "key" | "parentKeys"> | undefined,
): HierarchyNodeIdentifier[] {
  if (!parentNode) {
    return [];
  }
  return [...parentNode.parentKeys, parentNode.key].flatMap((key): HierarchyNodeIdentifier[] => {
    if (HierarchyNodeKey.isGeneric(key)) {
      return [{ ...key }];
    }
    if (!HierarchyNodeKey.isInstances(key)) {
      return [];
    }
    if (key.instanceKeys.length !== 1) {
      throw new Error(MULTIPLE_INSTANCE_KEYS_ERROR);
    }
    return [{ ...key.instanceKeys[0] }];
  });
}
