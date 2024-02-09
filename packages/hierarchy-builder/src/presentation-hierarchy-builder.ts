/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as ECSqlJoinSnippets from "./hierarchy-builder/queries/ecsql-snippets/ECSqlJoinSnippets";
import * as ECSqlValueSnippets from "./hierarchy-builder/queries/ecsql-snippets/ECSqlValueSelectorSnippets";

/**
 * Provides a set of helper functions to create ECSQL snippets.
 *
 * Note: In the long term these functions are likely to be moved into a separate package
 *
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSqlSnippets = { ...ECSqlJoinSnippets, ...ECSqlValueSnippets };

export * from "./hierarchy-builder/ECMetadata";
export * from "./hierarchy-builder/GenericInstanceFilter";
export * from "./hierarchy-builder/HierarchyDefinition";
export * from "./hierarchy-builder/HierarchyErrors";
export * from "./hierarchy-builder/HierarchyNode";
export * from "./hierarchy-builder/HierarchyProvider";
export * from "./hierarchy-builder/Logging";
export * from "./hierarchy-builder/Metadata";
export * from "./hierarchy-builder/Utils";
export * from "./hierarchy-builder/queries/ECSqlCore";
export * from "./hierarchy-builder/queries/InstanceLabelSelectClauseFactory";
export { createLimitingECSqlQueryExecutor, ILimitingECSqlQueryExecutor } from "./hierarchy-builder/queries/LimitingECSqlQueryExecutor";
export * from "./hierarchy-builder/queries/NodeSelectQueryFactory";
export * from "./hierarchy-builder/values/ConcatenatedValue";
export * from "./hierarchy-builder/values/Formatting";
export * from "./hierarchy-builder/values/Values";
