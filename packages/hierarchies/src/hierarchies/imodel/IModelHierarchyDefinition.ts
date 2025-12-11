/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { GenericInstanceFilter } from "@itwin/core-common";
import { ECSqlQueryDef } from "@itwin/presentation-shared";
import { NonGroupingHierarchyNode } from "../HierarchyNode.js";
import {
  ProcessedGenericHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceGenericHierarchyNode,
  SourceInstanceHierarchyNode,
} from "./IModelHierarchyNode.js";

/**
 * A nodes definition that returns a single generic node.
 * @public
 */
export interface GenericHierarchyNodeDefinition {
  /** The node to be created in the hierarchy level */
  node: SourceGenericHierarchyNode;
}

/**
 * A nodes definition that returns an ECSQL query for selecting nodes from an iModel.
 * @public
 */
export interface InstanceNodesQueryDefinition {
  /**
   * Full name of the class whose instances are going to be returned. It's okay if the attribute
   * points to a base class of multiple different classes of instances returned by the query, however
   * the more specific this class is, the more efficient hierarchy building process is.
   */
  fullClassName: string;
  /**
   * An ECSQL query that selects nodes from an iModel. `SELECT` clause of the query is expected
   * to be built using `NodeSelectQueryFactory.createSelectClause`.
   */
  query: ECSqlQueryDef;
}

/**
 * A definition of nodes included in a hierarchy level.
 * @public
 */
export type HierarchyNodesDefinition = GenericHierarchyNodeDefinition | InstanceNodesQueryDefinition;
/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNodesDefinition {
  export function isGenericNode(def: HierarchyNodesDefinition): def is GenericHierarchyNodeDefinition {
    return !!(def as GenericHierarchyNodeDefinition).node;
  }
  export function isInstanceNodesQuery(def: HierarchyNodesDefinition): def is InstanceNodesQueryDefinition {
    return !!(def as InstanceNodesQueryDefinition).query;
  }
}

/**
 * A definition of a hierarchy level, which may consist of multiple node definitions.
 * @public
 */
export type HierarchyLevelDefinition = HierarchyNodesDefinition[];

/**
 * A type for a function that parses a `SourceInstanceHierarchyNode` from provided ECSQL `row` object.
 * @public
 */
export type NodeParser = (
  /** The ECSQL row object to parse. Keys & value types depend on the executed query. */
  row: { [columnName: string]: any },
  /** The parent node whose child node is being parsed. */
  parentNode: HierarchyDefinitionParentNode | undefined,
  /** The key of iModel which is used to run the query. */
  imodelKey: string,
) => SourceInstanceHierarchyNode | Promise<SourceInstanceHierarchyNode>;

/**
 * A type for a function that pre-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one. Returning `undefined` omits the node
 * from the hierarchy.
 *
 * @public
 */
export type NodePreProcessor = <TNode extends ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode>(node: TNode) => Promise<TNode | undefined>;

/**
 * A type for a function that post-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one.
 *
 * @public
 */
export type NodePostProcessor = (node: ProcessedHierarchyNode) => Promise<ProcessedHierarchyNode>;

/**
 * A type of node that can be passed to `HierarchyDefinition.defineHierarchyLevel`. This basically means
 * a `HierarchyNode` that:
 * - knows nothing about its children,
 * - is either an instances node (key is of `InstancesNodeKey` type) or a generic node (key is of `GenericNodeKey` type).
 * @public
 */
export type HierarchyDefinitionParentNode = Omit<NonGroupingHierarchyNode, "children">;

/**
 * Props for `HierarchyDefinition.defineHierarchyLevel`.
 * @public
 */
export interface DefineHierarchyLevelProps {
  /** The key of iModel for which the hierarchy definition is being requested for. */
  imodelKey: string;

  /** Parent node to get children for. Pass `undefined` to get root nodes. */
  parentNode: HierarchyDefinitionParentNode | undefined;

  /** Optional hierarchy level filter. */
  instanceFilter?: GenericInstanceFilter;
}

/**
 * An interface for a factory that knows how define a hierarchy based on a given parent node.
 * @public
 */
export interface HierarchyDefinition {
  /**
   * An optional function for parsing ECInstance node from ECSQL row.
   *
   * Should be used in situations when the `HierarchyDefinition` implementation
   * introduces additional ECSQL columns into the select clause and wants to assign additional
   * data to the nodes it produces.
   *
   * Defaults to a function that parses all `HierarchyNode` attributes from a query, whose SELECT
   * clause is created using `NodeSelectQueryFactory.createSelectClause`.
   */
  parseNode?: NodeParser;

  /**
   * An optional function for pre-processing nodes.
   *
   * Pre-processing happens immediately after the nodes are loaded based on `HierarchyLevelDefinition`
   * returned by this `HierarchyDefinition` and before their processing (hiding, grouping, sorting, etc.) starts.
   * The step allows assigning nodes additional data or excluding them from the hierarchy based on some attributes.
   */
  preProcessNode?: NodePreProcessor;

  /**
   * An optional function for post-processing nodes.
   *
   * Post-processing happens after the loaded nodes go through all the merging, hiding and grouping
   * steps, but before sorting them. This step allows `HierarchyDefinition` implementations to assign additional data
   * to nodes after they're processed. This is especially true for grouping nodes as they're only created during
   * processing.
   */
  postProcessNode?: NodePostProcessor;

  /** A function to create a hierarchy level definition for given parent node. */
  defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition>;
}
