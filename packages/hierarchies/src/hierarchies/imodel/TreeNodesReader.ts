/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, of } from "rxjs";
import { Id64String } from "@itwin/core-bentley";
import { ECSqlQueryDef, parseInstanceLabel } from "@itwin/presentation-shared";
import { NodeParser } from "./IModelHierarchyDefinition.js";
import { InstanceHierarchyNodeProcessingParams, SourceInstanceHierarchyNode } from "./IModelHierarchyNode.js";
import { LimitingECSqlQueryExecutor } from "./LimitingECSqlQueryExecutor.js";
import { NodeSelectClauseColumnNames } from "./NodeSelectQueryFactory.js";

interface ReadNodesProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  query: ECSqlQueryDef;
  limit?: number | "unbounded";
  parser?: NodeParser;
}

/** @internal */
export function readNodes(props: ReadNodesProps): Observable<SourceInstanceHierarchyNode> {
  const { queryExecutor, query, limit } = props;
  const parser = props?.parser ?? defaultNodesParser;
  const config: Parameters<LimitingECSqlQueryExecutor["createQueryReader"]>[1] = {
    rowFormat: "ECSqlPropertyNames",
    ...(limit !== undefined ? { limit } : undefined),
  };

  return from(queryExecutor.createQueryReader(query, config)).pipe(
    mergeMap((row) => {
      const node = parser(row);
      return node instanceof Promise ? from(node) : of(node);
    }),
  );
}

/**
 * The interface should contain a member for each `NodeSelectClauseColumnNames` value.
 * @internal
 */
/* eslint-disable @typescript-eslint/naming-convention */
export interface RowDef {
  [NodeSelectClauseColumnNames.FullClassName]: string;
  [NodeSelectClauseColumnNames.ECInstanceId]: Id64String;
  [NodeSelectClauseColumnNames.DisplayLabel]: string;
  [NodeSelectClauseColumnNames.HasChildren]?: boolean;
  [NodeSelectClauseColumnNames.HideIfNoChildren]?: boolean;
  [NodeSelectClauseColumnNames.HideNodeInHierarchy]?: boolean;
  [NodeSelectClauseColumnNames.Grouping]?: string;
  [NodeSelectClauseColumnNames.ExtendedData]?: string;
  [NodeSelectClauseColumnNames.AutoExpand]?: boolean;
  [NodeSelectClauseColumnNames.SupportsFiltering]?: boolean;
}
/* eslint-enable @typescript-eslint/naming-convention */

/** @internal */
export function defaultNodesParser(row: { [columnName: string]: any }): SourceInstanceHierarchyNode {
  const typedRow = row as RowDef;
  const processingParams: InstanceHierarchyNodeProcessingParams = {
    ...(typedRow.HideIfNoChildren ? { hideIfNoChildren: true } : undefined),
    ...(typedRow.HideNodeInHierarchy ? { hideInHierarchy: true } : undefined),
    ...(typedRow.Grouping ? { grouping: JSON.parse(typedRow.Grouping) } : undefined),
  };
  return {
    // don't format the label here - we're going to do that at node pre-processing step to handle both - instance and generic nodes
    label: parseInstanceLabel(typedRow.DisplayLabel),
    key: {
      type: "instances",
      instanceKeys: [{ className: typedRow.FullClassName.replace(":", "."), id: typedRow.ECInstanceId }],
    },
    ...(typedRow.HasChildren !== undefined ? { children: !!typedRow.HasChildren } : undefined),
    ...(typedRow.AutoExpand ? { autoExpand: true } : undefined),
    ...(typedRow.SupportsFiltering ? { supportsFiltering: true } : undefined),
    ...(typedRow.ExtendedData ? { extendedData: JSON.parse(typedRow.ExtendedData) } : undefined),
    ...(Object.keys(processingParams).length > 0 ? { processingParams } : undefined),
  };
}
