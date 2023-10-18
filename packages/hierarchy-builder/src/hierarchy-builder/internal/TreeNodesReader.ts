/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { INodeParser } from "../HierarchyDefinition";
import { HierarchyNodeProcessingParams, ParsedHierarchyNode } from "../HierarchyNode";
import { ECSqlQueryDef, IECSqlQueryExecutor } from "../queries/ECSql";
import { NodeSelectClauseColumnNames } from "../queries/NodeSelectClauseFactory";
import { ConcatenatedValue } from "../values/ConcatenatedValue";
import { Id64String } from "../values/Values";

/** @internal */
export interface TreeQueryResultsReaderProps {
  parser?: INodeParser;
  limit?: number;
}

/** @internal */
export class TreeQueryResultsReader {
  private _props: Required<TreeQueryResultsReaderProps>;

  public constructor(props?: TreeQueryResultsReaderProps) {
    // istanbul ignore next
    this._props = {
      parser: props?.parser ?? defaultNodesParser,
      limit: props?.limit ?? DEFAULT_ROWS_LIMIT,
    };
  }

  public async read(executor: IECSqlQueryExecutor, query: ECSqlQueryDef): Promise<ParsedHierarchyNode[]> {
    const reader = executor.createQueryReader(query.ecsql, query.bindings, { rowFormat: "ECSqlPropertyNames" });
    const nodes = new Array<ParsedHierarchyNode>();
    for await (const row of reader) {
      if (nodes.length >= this._props.limit) {
        throw new RowsLimitExceededError(this._props.limit);
      }
      nodes.push(this._props.parser(row.toRow()));
    }
    return nodes;
  }
}

/** @internal */
export class RowsLimitExceededError extends Error {
  public constructor(public readonly limit: number) {
    super(`Query rows limit of ${limit} exceeded`);
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
  [NodeSelectClauseColumnNames.GroupByClass]?: boolean;
  [NodeSelectClauseColumnNames.GroupByLabel]?: boolean;
  [NodeSelectClauseColumnNames.MergeByLabelId]?: string;
  [NodeSelectClauseColumnNames.ExtendedData]?: string;
  [NodeSelectClauseColumnNames.AutoExpand]?: boolean;
}
/* eslint-enable @typescript-eslint/naming-convention */

/** @internal */
export function defaultNodesParser(row: { [columnName: string]: any }): ParsedHierarchyNode {
  const typedRow = row as RowDef;
  const processingParams: HierarchyNodeProcessingParams = {
    ...(typedRow.HideIfNoChildren ? { hideIfNoChildren: true } : undefined),
    ...(typedRow.HideNodeInHierarchy ? { hideInHierarchy: true } : undefined),
    ...(typedRow.GroupByClass ? { groupByClass: true } : undefined),
    ...(typedRow.GroupByLabel ? { groupByLabel: true } : undefined),
    ...(typedRow.MergeByLabelId ? { mergeByLabelId: typedRow.MergeByLabelId } : undefined),
  };
  return {
    // don't format the label here - we're going to do that at node pre-processing step to handle both - instance and custom nodes
    label: parseLabel(typedRow.DisplayLabel),
    key: {
      type: "instances",
      instanceKeys: [{ className: typedRow.FullClassName.replace(":", "."), id: typedRow.ECInstanceId }],
    },
    ...(typedRow.HasChildren ? { children: true } : undefined),
    ...(typedRow.AutoExpand ? { autoExpand: true } : undefined),
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
  ctes?: string[];
  limit?: number;
}

/** @internal */
export function applyLimit(props: ApplyLimitProps) {
  const ctesPrefix = props.ctes && props.ctes.length ? `WITH RECURSIVE ${props.ctes.join(", ")}` : ``;
  return `
    ${ctesPrefix}
    SELECT *
    FROM (${props.ecsql})
    LIMIT ${(props.limit ?? DEFAULT_ROWS_LIMIT) + 1}
  `;
}
