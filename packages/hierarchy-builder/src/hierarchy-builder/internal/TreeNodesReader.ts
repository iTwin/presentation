/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { INodeParser } from "../HierarchyDefinition";
import { RowsLimitExceededError } from "../HierarchyErrors";
import { InstanceHierarchyNodeProcessingParams, ParsedHierarchyNode, ParsedInstanceHierarchyNode } from "../HierarchyNode";
import { getLogger } from "../Logging";
import { ECSqlQueryDef, IECSqlQueryExecutor } from "../queries/ECSqlCore";
import { NodeSelectClauseColumnNames } from "../queries/NodeSelectQueryFactory";
import { ConcatenatedValue } from "../values/ConcatenatedValue";
import { Id64String } from "../values/Values";
import { LOGGING_NAMESPACE } from "./Common";

/** @internal */
export interface TreeQueryResultsReaderProps {
  parser?: INodeParser;
}

/** @internal */
export class TreeQueryResultsReader {
  private _props: Required<TreeQueryResultsReaderProps>;

  public constructor(props?: TreeQueryResultsReaderProps) {
    // istanbul ignore next
    this._props = {
      parser: props?.parser ?? defaultNodesParser,
    };
  }

  public async read(executor: IECSqlQueryExecutor, query: ECSqlQueryDef, limit?: number | "unbounded"): Promise<ParsedHierarchyNode[]> {
    const nodeLimit = limit ?? DEFAULT_ROWS_LIMIT;
    getLogger().logInfo(`${LOGGING_NAMESPACE}.TreeQueryResultsReader`, `Executing query: ${query.ecsql}`);
    const ctesPrefix = query.ctes && query.ctes.length ? `WITH RECURSIVE ${query.ctes.join(", ")} ` : "";
    const ecsql = `${ctesPrefix}${applyLimit({ ecsql: query.ecsql, limit: nodeLimit })}`;
    const reader = executor.createQueryReader(ecsql, query.bindings, { rowFormat: "ECSqlPropertyNames" });
    const nodes = new Array<ParsedHierarchyNode>();
    for await (const row of reader) {
      if (nodeLimit !== "unbounded" && nodes.length >= nodeLimit) {
        throw new RowsLimitExceededError(nodeLimit);
      }
      nodes.push(this._props.parser(row.toRow()));
    }
    return nodes;
  }
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
export function defaultNodesParser(row: { [columnName: string]: any }): ParsedInstanceHierarchyNode {
  const typedRow = row as RowDef;
  const processingParams: InstanceHierarchyNodeProcessingParams = {
    ...(typedRow.HideIfNoChildren ? { hideIfNoChildren: true } : undefined),
    ...(typedRow.HideNodeInHierarchy ? { hideInHierarchy: true } : undefined),
    ...(typedRow.Grouping ? { grouping: JSON.parse(typedRow.Grouping) } : undefined),
  };
  return {
    // don't format the label here - we're going to do that at node pre-processing step to handle both - instance and custom nodes
    label: parseLabel(typedRow.DisplayLabel),
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

function parseLabel(value: string | undefined): ConcatenatedValue | string {
  if (!value) {
    return "";
  }
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      return JSON.parse(value);
    } catch {
      // fall through
    }
  }
  // not a JSON object/array
  return value;
}

const DEFAULT_ROWS_LIMIT = 1000;

/** @internal */
export interface ApplyLimitProps {
  ecsql: string;
  limit?: number | "unbounded";
}

/** @internal */
export function applyLimit(props: ApplyLimitProps) {
  return props.limit === "unbounded"
    ? props.ecsql
    : `
    SELECT *
    FROM (${props.ecsql})
    LIMIT ${(props.limit ?? DEFAULT_ROWS_LIMIT) + 1}
  `;
}
