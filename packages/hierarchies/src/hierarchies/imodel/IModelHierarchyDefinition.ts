/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { GenericInstanceFilter } from "@itwin/core-common";
import type { EC, ECSqlQueryDef } from "@itwin/presentation-shared";
import type { NonGroupingHierarchyNode, ParentHierarchyNode } from "../HierarchyNode.js";
import type {
  ProcessedGenericHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceGenericHierarchyNode,
  SourceInstanceHierarchyNode,
} from "./IModelHierarchyNode.js";
import type { NodesQueryClauseFactory } from "./NodeSelectQueryFactory.js";

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
  fullClassName: EC.FullClassNameDotNotation;
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
// oxlint-disable-next-line no-redeclare
export type HierarchyNodesDefinition = GenericHierarchyNodeDefinition | InstanceNodesQueryDefinition;
/** @public */
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
 *
 * The `TParentProps` type parameter specifies props that identify the parent of the node being parsed. By default
 * that's the `parentNode` attribute.
 *
 * @public
 */
export type NodeParser<
  TParentProps extends {} = {
    /** The parent node whose child node is being parsed. */
    parentNode?: HierarchyDefinitionParentNode;
  },
> = (
  props: {
    /** The ECSQL row object to parse. Keys & value types depend on the executed query. */
    row: { [columnName: string]: any };

    /** The key of iModel which is used to run the query. */
    imodelKey: string;
  } & TParentProps,
) => SourceInstanceHierarchyNode | Promise<SourceInstanceHierarchyNode>;

/**
 * A type for a function that pre-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one. Returning `undefined` omits the node
 * from the hierarchy.
 *
 * The `TParentProps` type parameter specifies props that identify the parent of the node being pre-processed. By default
 * that's the `parentNode` attribute.
 *
 * @public
 */
export type NodePreProcessor<
  TParentProps extends {} = {
    /** The parent node whose child node is being pre-processed. */
    parentNode?: ParentHierarchyNode;
  },
> = <TNode extends ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode>(
  props: {
    /** Node to be pre-processed. */
    node: TNode;
  } & TParentProps,
) => Promise<TNode | undefined>;

/**
 * A type for a function that post-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one.
 *
 * The `TParentProps` type parameter specifies props that identify the parent of the node being post-processed. By default
 * that's the `parentNode` attribute.
 *
 * @public
 */
export type NodePostProcessor<
  TParentProps extends {} = {
    /** The parent node whose child node is being post-processed. */
    parentNode?: ParentHierarchyNode;
  },
> = (
  props: {
    /** Node to be post-processed. */
    node: ProcessedHierarchyNode;
  } & TParentProps,
) => Promise<ProcessedHierarchyNode>;

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
 *
 * The `TParentProps` type parameter specifies props that identify the parent of the hierarchy level. By default
 * that's the `parentNode` attribute.
 *
 * @public
 */
export type DefineHierarchyLevelProps<
  TParentProps extends {} = {
    /** Parent node to get children for. Pass `undefined` to get root nodes. */
    parentNode: HierarchyDefinitionParentNode | undefined;
  },
> = Pick<NodesQueryClauseFactory, "createSelectClause" | "createFilterClauses"> & {
  /** Optional hierarchy level filter. */
  instanceFilter?: GenericInstanceFilter;
} & TParentProps;

/**
 * Resolves to `TDefault` if `T` is `undefined`, otherwise - to `T`.
 * @public
 */
type OrDefault<T, TDefault> = [T] extends [undefined] ? TDefault : NonNullable<T>;

/**
 * An interface for a factory that knows how define a hierarchy based on a given parent node.
 *
 * By default, the callbacks receive the parent as a `parentNode` attribute. The type parameters allow replacing that
 * with custom props:
 * - `TParentProps` - props that identify the parent for `parseNode` and `defineHierarchyLevel`, as well as for
 *   `preProcessNode` and `postProcessNode`, unless `TProcessingParentProps` is specified.
 * - `TProcessingParentProps` - props that identify the parent for `preProcessNode` and `postProcessNode`.
 *
 * @public
 */
export interface HierarchyDefinition<
  TParentProps extends {} | undefined = undefined,
  TProcessingParentProps extends {} | undefined = TParentProps,
> {
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
  parseNode?: NodeParser<OrDefault<TParentProps, { parentNode?: HierarchyDefinitionParentNode }>>;

  /**
   * An optional function for pre-processing nodes.
   *
   * Pre-processing happens immediately after the nodes are loaded based on `HierarchyLevelDefinition`
   * returned by this `HierarchyDefinition` and before their processing (hiding, grouping, sorting, etc.) starts.
   * The step allows assigning nodes additional data or excluding them from the hierarchy based on some attributes.
   */
  preProcessNode?: NodePreProcessor<OrDefault<TProcessingParentProps, { parentNode?: ParentHierarchyNode }>>;

  /**
   * An optional function for post-processing nodes.
   *
   * Post-processing happens after the loaded nodes go through all the merging, hiding and grouping
   * steps, but before sorting them. This step allows `HierarchyDefinition` implementations to assign additional data
   * to nodes after they're processed. This is especially true for grouping nodes as they're only created during
   * processing.
   */
  postProcessNode?: NodePostProcessor<OrDefault<TProcessingParentProps, { parentNode?: ParentHierarchyNode }>>;

  /** A function to create a hierarchy level definition for given parent node. */
  defineHierarchyLevel(
    props: DefineHierarchyLevelProps<
      OrDefault<TParentProps, { parentNode: HierarchyDefinitionParentNode | undefined }>
    >,
  ): Promise<HierarchyLevelDefinition>;
}
