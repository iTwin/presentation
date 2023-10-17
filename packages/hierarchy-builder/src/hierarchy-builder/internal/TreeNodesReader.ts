/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { INodeParser } from "../HierarchyDefinition";
import { ParsedHierarchyNode } from "../HierarchyNode";
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
        throw new Error("rows limit exceeded");
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
  const parsedExtendedData = typedRow.ExtendedData ? JSON.parse(typedRow.ExtendedData) : undefined;
  return {
    // don't format the label here - we're going to do that at node pre-processing step to handle both - instance and custom nodes
    label: parseLabel(typedRow.DisplayLabel),
    extendedData: parsedExtendedData,
    key: {
      type: "instances",
      instanceKeys: [{ className: typedRow.FullClassName.replace(":", "."), id: typedRow.ECInstanceId }],
    },
    children: typedRow.HasChildren === undefined ? undefined : !!typedRow.HasChildren,
    autoExpand: typedRow.AutoExpand ? true : undefined,
    processingParams: {
      hideIfNoChildren: typedRow.HideIfNoChildren ? true : undefined,
      hideInHierarchy: typedRow.HideNodeInHierarchy ? true : undefined,
      groupByClass: typedRow.GroupByClass ? true : undefined,
      groupByLabel: typedRow.GroupByLabel ? true : undefined,
      mergeByLabelId: typedRow.MergeByLabelId,
    },
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
