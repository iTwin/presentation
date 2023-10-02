/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "../EC";
import { HierarchyNode } from "../HierarchyNode";
import { ECSqlQueryDef, IECSqlQueryExecutor } from "../queries/ECSql";
import { NodeSelectClauseColumnNames } from "../queries/NodeSelectClauseFactory";

/** @internal */
export interface ITreeQueryResultsReader {
  read(executor: IECSqlQueryExecutor, query: ECSqlQueryDef): Promise<HierarchyNode[]>;
}

/** @internal */
export class TreeQueryResultsReader implements ITreeQueryResultsReader {
  public async read(executor: IECSqlQueryExecutor, query: ECSqlQueryDef): Promise<HierarchyNode[]> {
    const reader = executor.createQueryReader(query.ecsql, query.bindings, { rowFormat: "ECSqlPropertyNames" });
    const nodes = new Array<HierarchyNode>();
    for await (const row of reader) {
      if (nodes.length >= ROWS_LIMIT) {
        throw new Error("rows limit exceeded");
      }
      nodes.push(parseNode(row.toRow()));
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

function parseNode(row: RowDef): HierarchyNode {
  const parsedExtendedData = row.ExtendedData ? JSON.parse(row.ExtendedData) : undefined;
  return {
    label: row.DisplayLabel,
    extendedData: parsedExtendedData,
    key: {
      type: "instances",
      instanceKeys: [{ className: row.FullClassName, id: row.ECInstanceId }],
    },
    children: row.HasChildren === undefined ? undefined : !!row.HasChildren,
    autoExpand: row.AutoExpand,
    params: {
      hideIfNoChildren: !!row.HideIfNoChildren,
      hideInHierarchy: !!row.HideNodeInHierarchy,
      groupByClass: !!row.GroupByClass,
      groupByLabel: !!row.GroupByLabel,
      mergeByLabelId: row.MergeByLabelId,
    },
  };
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
