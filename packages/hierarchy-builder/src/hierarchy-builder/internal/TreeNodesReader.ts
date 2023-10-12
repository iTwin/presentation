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
export interface ITreeQueryResultsReader {
  read(executor: IECSqlQueryExecutor, query: ECSqlQueryDef): Promise<ParsedHierarchyNode[]>;
}

/** @internal */
export class TreeQueryResultsReader implements ITreeQueryResultsReader {
  private constructor(private _parser: INodeParser) {}

  public static create(nodeParser?: INodeParser) {
    return new TreeQueryResultsReader(nodeParser ?? defaultNodesParser);
  }

  public async read(executor: IECSqlQueryExecutor, query: ECSqlQueryDef): Promise<ParsedHierarchyNode[]> {
    const reader = executor.createQueryReader(query.ecsql, query.bindings, { rowFormat: "ECSqlPropertyNames" });
    const nodes = new Array<ParsedHierarchyNode>();
    for await (const row of reader) {
      if (nodes.length >= ROWS_LIMIT) {
        throw new Error("rows limit exceeded");
      }
      nodes.push(this._parser(row.toRow()));
    }
    return nodes;
  }
}

/** The interface should contain a member for each `NodeSelectClauseColumnNames` value. */
/* eslint-disable @typescript-eslint/naming-convention */
interface RowDef {
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
    params: {
      hideIfNoChildren: !!typedRow.HideIfNoChildren,
      hideInHierarchy: !!typedRow.HideNodeInHierarchy,
      groupByClass: !!typedRow.GroupByClass,
      groupByLabel: !!typedRow.GroupByLabel,
      mergeByLabelId: typedRow.MergeByLabelId,
    },
  };
}

function parseLabel(value: string | undefined): ConcatenatedValue {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [{ type: "String", value }];
  }
}

const ROWS_LIMIT = 1000;

/** @internal */
export function applyLimit(ecsql: string, ctes?: string[]) {
  const ctesPrefix = ctes && ctes.length ? `WITH RECURSIVE ${ctes.join(", ")}` : ``;
  return `
    ${ctesPrefix}
    SELECT *
    FROM (${ecsql})
    LIMIT ${ROWS_LIMIT + 1}
  `;
}
