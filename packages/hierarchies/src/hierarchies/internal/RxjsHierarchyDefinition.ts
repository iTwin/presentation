/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { filter, from, Observable, of } from "rxjs";
import {
  DefineHierarchyLevelProps,
  HierarchyDefinition,
  HierarchyDefinitionParentNode,
  HierarchyLevelDefinition,
} from "../imodel/IModelHierarchyDefinition.js";
import {
  ProcessedGenericHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceInstanceHierarchyNode,
} from "../imodel/IModelHierarchyNode.js";

/**
 * A type for a function that parses a `SourceInstanceHierarchyNode` from provided ECSQL `row` object.
 * @internal
 */
export type RxjsNodeParser = (row: { [columnName: string]: any }, parentNode?: HierarchyDefinitionParentNode) => Observable<SourceInstanceHierarchyNode>;

/**
 * A type for a function that pre-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one. Returning `undefined` omits the node
 * from the hierarchy.
 *
 * @internal
 */
export type RxjsNodePreProcessor = <TNode extends ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode>(node: TNode) => Observable<TNode>;

/**
 * A type for a function that post-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one.
 *
 * @internal
 */
export type RxjsNodePostProcessor = (node: ProcessedHierarchyNode) => Observable<ProcessedHierarchyNode>;

/**
 * An interface for a factory that knows how define a hierarchy based on a given parent node.
 * @internal
 */
export interface RxjsHierarchyDefinition {
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
  parseNode?: RxjsNodeParser;

  /**
   * An optional function for pre-processing nodes.
   *
   * Pre-processing happens immediately after the nodes are loaded based on `HierarchyLevelDefinition`
   * returned by this `HierarchyDefinition` and before their processing (hiding, grouping, sorting, etc.) starts.
   * The step allows assigning nodes additional data or excluding them from the hierarchy based on some attributes.
   */
  preProcessNode?: RxjsNodePreProcessor;

  /**
   * An optional function for post-processing nodes.
   *
   * Post-processing happens after the loaded nodes go through all the merging, hiding and grouping
   * steps, but before sorting them. This step allows `HierarchyDefinition` implementations to assign additional data
   * to nodes after they're processed. This is especially true for grouping nodes as they're only created during
   * processing.
   */
  postProcessNode?: RxjsNodePostProcessor;

  /** A function to create a hierarchy level definition for given parent node. */
  defineHierarchyLevel(props: DefineHierarchyLevelProps): Observable<HierarchyLevelDefinition>;
}

/** @internal */
export function getRxjsHierarchyDefinition(hierarchyDefinition: HierarchyDefinition): RxjsHierarchyDefinition {
  return {
    parseNode: hierarchyDefinition.parseNode
      ? (row, parentNode) => {
          const parsedNode = hierarchyDefinition.parseNode!(row, parentNode);
          return parsedNode instanceof Promise ? from(parsedNode) : of(parsedNode);
        }
      : undefined,
    preProcessNode: hierarchyDefinition.preProcessNode
      ? (node) => from(hierarchyDefinition.preProcessNode!(node)).pipe(filter((preprocessedNode) => !!preprocessedNode))
      : undefined,
    postProcessNode: hierarchyDefinition.postProcessNode ? (node) => from(hierarchyDefinition.postProcessNode!(node)) : undefined,
    defineHierarchyLevel: (props) => from(hierarchyDefinition.defineHierarchyLevel(props)),
  };
}
