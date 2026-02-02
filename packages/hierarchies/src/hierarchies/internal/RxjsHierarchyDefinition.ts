/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { Observable } from "rxjs";
import { filter, from } from "rxjs";
import type { ParentHierarchyNode } from "../HierarchyNode.js";
import type {
  DefineHierarchyLevelProps,
  HierarchyDefinition,
  HierarchyDefinitionParentNode,
  HierarchyLevelDefinition,
} from "../imodel/IModelHierarchyDefinition.js";
import type {
  ProcessedGenericHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceInstanceHierarchyNode,
} from "../imodel/IModelHierarchyNode.js";
import { fromPossiblyPromise } from "./Common.js";

/**
 * A type for a function that parses a `SourceInstanceHierarchyNode` from provided ECSQL `row` object.
 * @internal
 */
export type RxjsNodeParser = (props: {
  row: { [columnName: string]: any };
  parentNode?: HierarchyDefinitionParentNode;
  imodelKey: string;
}) => Observable<SourceInstanceHierarchyNode>;

/**
 * A type for a function that pre-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one. Returning `undefined` omits the node
 * from the hierarchy.
 *
 * @internal
 */
export type RxjsNodePreProcessor = <TNode extends ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode>(props: {
  node: TNode;
  parentNode?: ParentHierarchyNode;
}) => Observable<TNode>;

/**
 * A type for a function that post-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one.
 *
 * @internal
 */
export type RxjsNodePostProcessor = (props: { node: ProcessedHierarchyNode; parentNode?: ParentHierarchyNode }) => Observable<ProcessedHierarchyNode>;

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
      ? (props) => {
          const parsedNode = hierarchyDefinition.parseNode!(props);
          return fromPossiblyPromise(parsedNode);
        }
      : undefined,
    preProcessNode: hierarchyDefinition.preProcessNode
      ? (props) => from(hierarchyDefinition.preProcessNode!(props)).pipe(filter((preprocessedNode) => !!preprocessedNode))
      : undefined,
    postProcessNode: hierarchyDefinition.postProcessNode ? (props) => from(hierarchyDefinition.postProcessNode!(props)) : undefined,
    defineHierarchyLevel: (props) => from(hierarchyDefinition.defineHierarchyLevel(props)),
  };
}
