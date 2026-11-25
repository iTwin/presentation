/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, from, identity, map, mergeMap, of } from "rxjs";
import { createIModelInstanceLabelSelectClauseFactory, formatConcatenatedValue } from "@itwin/presentation-shared";
import { HierarchyNodeKey } from "../HierarchyNodeKey.js";
import { hasChildren } from "../internal/Common.js";
import { createNodesQueryClauseFactory } from "./NodeSelectQueryFactory.js";
import { defaultNodesParser } from "./TreeNodesReader.js";

import type { Observable } from "rxjs";
import type {
  ECSchemaProvider,
  ECSqlQueryRow,
  IInstanceLabelSelectClauseFactory,
  IPrimitiveValueFormatter,
  Props,
} from "@itwin/presentation-shared";
import type { HierarchyNode, ParentHierarchyNode } from "../HierarchyNode.js";
import type { GenericNodeKey } from "../HierarchyNodeKey.js";
import type { RxjsHierarchyDefinition, RxjsNodePreProcessor } from "../internal/RxjsHierarchyDefinition.js";
import type {
  DefineHierarchyLevelProps,
  HierarchyDefinitionParentNode,
  GenericHierarchyNodeDefinition,
  HierarchyLevelDefinition,
} from "./IModelHierarchyDefinition.js";
import type {
  ProcessedGenericHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceGenericHierarchyNode,
  SourceInstanceHierarchyNode,
} from "./IModelHierarchyNode.js";
import type { NodesQueryClauseFactory } from "./NodeSelectQueryFactory.js";

/** A source node, created from a hierarchy level definition, with a fully specified generic node key. */
export type ProviderSourceNode =
  | SourceInstanceHierarchyNode
  | (Omit<SourceGenericHierarchyNode, "key"> & { key: GenericNodeKey });

/** Creates a nodes query clause factory, using the default instance label select clause factory if none is given. */
export function createIModelNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory,
}: {
  imodelAccess: Props<typeof createIModelInstanceLabelSelectClauseFactory>["imodelAccess"] & ECSchemaProvider;
  instanceLabelSelectClauseFactory: IInstanceLabelSelectClauseFactory | undefined;
}): NodesQueryClauseFactory {
  return createNodesQueryClauseFactory({
    imodelAccess,
    instanceLabelSelectClauseFactory:
      instanceLabelSelectClauseFactory ?? createIModelInstanceLabelSelectClauseFactory({ imodelAccess }),
  });
}

/** Requests hierarchy level definitions from the hierarchy definition, using the given factory to create query clauses. */
export function defineHierarchyLevel({
  hierarchyDefinition,
  nodesQueryClauseFactory,
  ...props
}: Omit<DefineHierarchyLevelProps, "createSelectClause" | "createFilterClauses"> & {
  hierarchyDefinition: RxjsHierarchyDefinition;
  nodesQueryClauseFactory: NodesQueryClauseFactory;
}): Observable<HierarchyLevelDefinition> {
  return defer(() =>
    hierarchyDefinition.defineHierarchyLevel({
      ...props,
      createSelectClause: async (selectClauseProps) => nodesQueryClauseFactory.createSelectClause(selectClauseProps),
      createFilterClauses: async (filterClausesProps) =>
        nodesQueryClauseFactory.createFilterClauses(filterClausesProps),
    }),
  );
}

/**
 * Returns the given parent node without the parts that don't belong to the provider with given `sourceName` and
 * iModel with given `imodelKey`, or `undefined` if no part of the node belongs to them.
 */
export function getOwnParentNode<TNode extends HierarchyDefinitionParentNode>(
  parentNode: TNode,
  { sourceName, imodelKey }: { sourceName: string; imodelKey: string },
): TNode | undefined {
  const { key } = parentNode;
  if (HierarchyNodeKey.isGeneric(key)) {
    return !key.source || key.source === sourceName ? parentNode : undefined;
  }
  // The node may represent instances from multiple iModels. Instance ids are only unique within an iModel, so
  // querying children of other iModels' instances could return children of unrelated instances of this iModel.
  const instanceKeys = key.instanceKeys.filter(
    (instanceKey) => !instanceKey.imodelKey || instanceKey.imodelKey === imodelKey,
  );
  return instanceKeys.length > 0 ? { ...parentNode, key: { ...key, instanceKeys } } : undefined;
}

/** Creates a key for a generic node, defined by the provider with given `sourceName`. */
export function createGenericNodeKey(id: string, sourceName: string): GenericNodeKey {
  return { type: "generic", id, source: sourceName };
}

/** Creates a source node from the given generic node definition. */
export function createGenericSourceNode(
  definition: GenericHierarchyNodeDefinition,
  sourceName: string,
): Extract<ProviderSourceNode, { key: GenericNodeKey }> {
  return { ...definition.node, key: createGenericNodeKey(definition.node.key, sourceName) };
}

/**
 * Parses a nodes query row into a source node, using the hierarchy definition's `parseNode` or, if it's not provided,
 * `defaultNodesParser`. Assigns the given `imodelKey` to the node's instance keys.
 */
export function parseSourceInstanceNode({
  row,
  parentNode,
  imodelKey,
  parseNode,
}: {
  row: ECSqlQueryRow;
  parentNode: HierarchyDefinitionParentNode | undefined;
  imodelKey: string;
  parseNode: RxjsHierarchyDefinition["parseNode"];
}): Observable<SourceInstanceHierarchyNode> {
  const parse = parseNode ?? ((props) => of(defaultNodesParser(props)));
  return parse({ row, parentNode, imodelKey }).pipe(map((node) => assignIModelKey(node, imodelKey)));
}

function assignIModelKey(node: SourceInstanceHierarchyNode, imodelKey: string): SourceInstanceHierarchyNode {
  return { ...node, key: { ...node.key, instanceKeys: node.key.instanceKeys.map((key) => ({ ...key, imodelKey })) } };
}

/**
 * Pre-processes a source node: sets its `parentKeys`, formats its label and lets the hierarchy definition's
 * `preProcessNode` step in. Completes without a value if the node is omitted by `preProcessNode`.
 */
export function preProcessSourceNode({
  node,
  parentNode,
  valueFormatter,
  preProcessNode,
}: {
  node: ProviderSourceNode;
  parentNode: ParentHierarchyNode | undefined;
  valueFormatter: IPrimitiveValueFormatter;
  preProcessNode: RxjsNodePreProcessor | undefined;
}): Observable<ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode> {
  return from(formatConcatenatedValue({ value: node.label, valueFormatter })).pipe(
    map((label) => ({ ...node, label, parentKeys: parentNode ? [...parentNode.parentKeys, parentNode.key] : [] })),
    preProcessNode ? mergeMap((processedNode) => preProcessNode({ node: processedNode, parentNode })) : identity,
  );
}

type FinalNode<TNode> = TNode extends unknown
  ? Omit<TNode, "processingParams" | "children"> & Pick<HierarchyNode, "children">
  : never;

/** Converts a processed node into the form it's returned by hierarchy providers. */
export function toFinalNode<TNode extends { processingParams?: unknown; children?: boolean | Array<unknown> }>(
  node: TNode,
): FinalNode<TNode> {
  const { processingParams: _, ...finalNode } = node;
  return { ...finalNode, children: hasChildren(finalNode) } as FinalNode<TNode>;
}
