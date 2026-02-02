/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, of } from "rxjs";
import { Guid } from "@itwin/core-bentley";
import { parseInstanceLabel } from "@itwin/presentation-shared";
import { LOGGING_NAMESPACE_INTERNAL as BASE_LOGGING_NAMESPACE } from "../internal/Common.js";
import { log } from "../internal/LoggingUtils.js";

import type { Observable, ObservedValueOf } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type { ECSqlQueryDef, Props } from "@itwin/presentation-shared";
import type { RxjsNodeParser } from "../internal/RxjsHierarchyDefinition.js";
import type { InstanceHierarchyNodeProcessingParams, SourceInstanceHierarchyNode } from "./IModelHierarchyNode.js";
import type { LimitingECSqlQueryExecutor } from "./LimitingECSqlQueryExecutor.js";
import type { NodeSelectClauseColumnNames } from "./NodeSelectQueryFactory.js";

const LOGGING_NAMESPACE = `${BASE_LOGGING_NAMESPACE}.QueryRows`;

interface ReadNodesProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  query: ECSqlQueryDef;
  limit?: number | "unbounded";
  parser?: (props: Pick<Props<RxjsNodeParser>, "row">) => ReturnType<RxjsNodeParser>;
}

/** @internal */
export function readNodes(props: ReadNodesProps): Observable<SourceInstanceHierarchyNode> {
  const { queryExecutor, query, limit } = props;
  const parser = props.parser ?? ((row) => of(defaultNodesParser(row)));
  const config: Parameters<LimitingECSqlQueryExecutor["createQueryReader"]>[1] = {
    rowFormat: "ECSqlPropertyNames",
    restartToken: `readNodes/${Guid.createValue()}`,
    ...(limit !== undefined ? { limit } : undefined),
  };

  return from(queryExecutor.createQueryReader(query, config)).pipe(
    log({
      category: LOGGING_NAMESPACE,
      severity: "trace",
      message: /* c8 ignore next */ (row) => JSON.stringify(row),
    }),
    mergeMap((row) => parser({ row })),
  );
}

/**
 * The interface should contain a member for each `NodeSelectClauseColumnNames` value.
 * @internal
 */
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

/** @internal */
export const defaultNodesParser: (props: Pick<Props<RxjsNodeParser>, "row">) => ObservedValueOf<ReturnType<RxjsNodeParser>> = ({ row }) => {
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
};
