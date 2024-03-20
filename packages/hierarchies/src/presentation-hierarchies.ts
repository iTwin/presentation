/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as ECSqlJoinSnippets from "./hierarchies/queries/ecsql-snippets/ECSqlJoinSnippets";
import * as ECSqlValueSnippets from "./hierarchies/queries/ecsql-snippets/ECSqlValueSelectorSnippets";

/**
 * Provides a set of helper functions to create ECSQL snippets.
 *
 * Note: In the long term these functions are likely to be moved into a separate package
 *
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSqlSnippets = { ...ECSqlJoinSnippets, ...ECSqlValueSnippets };

export {
  GenericInstanceFilter,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
  GenericInstanceFilterRuleValue,
  GenericInstanceFilterRuleOperator,
  GenericInstanceFilterRuleGroupOperator,
  GenericInstanceFilterRelatedInstanceDescription,
  GenericInstanceFilterRelationshipStep,
} from "@itwin/core-common";

export * from "./hierarchies/ECMetadata";
export * from "./hierarchies/HierarchyDefinition";
export * from "./hierarchies/HierarchyErrors";
export * from "./hierarchies/HierarchyNode";
export * from "./hierarchies/HierarchyProvider";
export * from "./hierarchies/Logging";
export * from "./hierarchies/Metadata";
export { OmitOverUnion } from "./hierarchies/Utils";
export * from "./hierarchies/queries/ECSqlCore";
export * from "./hierarchies/queries/InstanceLabelSelectClauseFactory";
export { createLimitingECSqlQueryExecutor, ILimitingECSqlQueryExecutor } from "./hierarchies/queries/LimitingECSqlQueryExecutor";
export * from "./hierarchies/queries/NodeSelectQueryFactory";
export * from "./hierarchies/values/ConcatenatedValue";
export * from "./hierarchies/values/Formatting";
export * from "./hierarchies/values/Values";
