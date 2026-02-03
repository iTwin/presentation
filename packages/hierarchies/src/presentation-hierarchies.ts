/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

export { GenericInstanceFilter } from "@itwin/core-common";

export type {
  DefineHierarchyLevelProps,
  HierarchyLevelDefinition,
  HierarchyDefinition,
  NodeParser,
  NodePostProcessor,
  NodePreProcessor,
} from "./hierarchies/imodel/IModelHierarchyDefinition.js";
export { HierarchyNodesDefinition } from "./hierarchies/imodel/IModelHierarchyDefinition.js";
export type {
  DefineGenericNodeChildHierarchyLevelProps,
  DefineInstanceNodeChildHierarchyLevelProps,
  DefineRootHierarchyLevelProps,
} from "./hierarchies/imodel/PredicateBasedHierarchyDefinition.js";
export { createPredicateBasedHierarchyDefinition } from "./hierarchies/imodel/PredicateBasedHierarchyDefinition.js";
export type { LimitingECSqlQueryExecutor } from "./hierarchies/imodel/LimitingECSqlQueryExecutor.js";
export { createLimitingECSqlQueryExecutor } from "./hierarchies/imodel/LimitingECSqlQueryExecutor.js";
export type { NodesQueryClauseFactory } from "./hierarchies/imodel/NodeSelectQueryFactory.js";
export { NodeSelectClauseColumnNames, createNodesQueryClauseFactory } from "./hierarchies/imodel/NodeSelectQueryFactory.js";
export { createIModelHierarchyProvider, createMergedIModelHierarchyProvider } from "./hierarchies/imodel/IModelHierarchyProvider.js";
export type { SourceHierarchyNode } from "./hierarchies/imodel/IModelHierarchyNode.js";
export { ProcessedHierarchyNode } from "./hierarchies/imodel/IModelHierarchyNode.js";

export { RowsLimitExceededError } from "./hierarchies/HierarchyErrors.js";
export type { GroupingHierarchyNode, NonGroupingHierarchyNode } from "./hierarchies/HierarchyNode.js";
export { HierarchyNode } from "./hierarchies/HierarchyNode.js";
export type { HierarchyNodeIdentifiersPath } from "./hierarchies/HierarchyNodeIdentifier.js";
export { HierarchyNodeIdentifier } from "./hierarchies/HierarchyNodeIdentifier.js";
export type {
  GenericNodeKey,
  GroupingNodeKey,
  IModelInstanceKey,
  InstancesNodeKey,
  ClassGroupingNodeKey,
  LabelGroupingNodeKey,
  PropertyGroupingNodeKey,
  PropertyOtherValuesGroupingNodeKey,
  PropertyValueGroupingNodeKey,
  PropertyValueRangeGroupingNodeKey,
  IModelHierarchyNodeKey,
} from "./hierarchies/HierarchyNodeKey.js";
export { HierarchyNodeKey } from "./hierarchies/HierarchyNodeKey.js";
export type { GetHierarchyNodesProps, HierarchyProvider } from "./hierarchies/HierarchyProvider.js";
export { createHierarchyProvider } from "./hierarchies/HierarchyProvider.js";
export { mergeProviders } from "./hierarchies/HierarchyMerge.js";
export type { HierarchySearchPathOptions } from "./hierarchies/HierarchySearch.js";
export { createHierarchySearchHelper, HierarchySearchPath } from "./hierarchies/HierarchySearch.js";
export { getLogger, setLogger } from "./hierarchies/Logging.js";
