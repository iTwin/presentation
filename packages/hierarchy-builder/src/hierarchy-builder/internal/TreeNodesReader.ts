/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";
import { QueryOptionsBuilder, QueryRowFormat } from "@itwin/core-common";
import { HierarchyNode } from "../HierarchyNode";
import { ECSqlQueryDef } from "../queries/ECSql";
import { IQueryExecutor } from "../queries/IQueryExecutor";
import { NodeSelectClauseColumnNames } from "../queries/NodeSelectClauseFactory";
import { bind } from "./Common";

/** @internal */
export interface ITreeQueryResultsReader {
  read(executor: IQueryExecutor, query: ECSqlQueryDef): Promise<HierarchyNode[]>;
}

/** @internal */
export class TreeQueryResultsReader implements ITreeQueryResultsReader {
  public async read(executor: IQueryExecutor, query: ECSqlQueryDef): Promise<HierarchyNode[]> {
    const nodes = new Array<HierarchyNode>();
    const reader = createECSqlReader(executor, query);
    while (await reader.step()) {
      if (nodes.length >= ROWS_LIMIT) {
        throw new Error("rows limit exceeded");
      }
      nodes.push(parseNode(reader.current.toRow()));
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

function createECSqlReader(executor: IQueryExecutor, query: ECSqlQueryDef) {
  const opts = new QueryOptionsBuilder();
  opts.setRowFormat(QueryRowFormat.UseECSqlPropertyNames);
  return executor.createQueryReader(query.ecsql, bind(query.bindings ?? []), opts.getOptions());
}
