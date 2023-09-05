/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";
import { QueryOptionsBuilder, QueryRowFormat } from "@itwin/core-common";
import { IQueryExecutor } from "../IQueryExecutor";
import { QueryDef } from "../TreeQueryBuilder";
import { bind, InProgressTreeNode } from "./Common";

/** @internal */
export interface ITreeQueryResultsReader {
  read(executor: IQueryExecutor, query: QueryDef): Promise<InProgressTreeNode[]>;
}

/** @internal */
export class TreeQueryResultsReader implements ITreeQueryResultsReader {
  public async read(executor: IQueryExecutor, query: QueryDef): Promise<InProgressTreeNode[]> {
    const nodes = new Array<InProgressTreeNode>();
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

/* eslint-disable @typescript-eslint/naming-convention */
interface RowDef {
  FullClassName: string;
  ECInstanceId: Id64String;
  DisplayLabel: string;
  HasChildren?: boolean;
  HideIfNoChildren?: boolean;
  HideInHierarchy?: boolean;
  GroupByClass?: boolean;
  MergeByLabelId?: string;
  ExtendedData?: string;
  AutoExpand?: boolean;
}
/* eslint-enable @typescript-eslint/naming-convention */

function parseNode(row: RowDef): InProgressTreeNode {
  const parsedExtendedData = row.ExtendedData ? JSON.parse(row.ExtendedData) : undefined;
  return {
    label: row.DisplayLabel,
    extendedData: parsedExtendedData,
    key: {
      type: "instances",
      instanceKeys: [{ className: row.FullClassName, id: row.ECInstanceId }],
    },
    children: row.HasChildren === undefined ? undefined : !!row.HasChildren,
    hideIfNoChildren: !!row.HideIfNoChildren,
    hideInHierarchy: !!row.HideInHierarchy,
    groupByClass: !!row.GroupByClass,
    mergeByLabelId: row.MergeByLabelId,
    autoExpand: row.AutoExpand,
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

function createECSqlReader(executor: IQueryExecutor, query: QueryDef) {
  const opts = new QueryOptionsBuilder();
  opts.setRowFormat(QueryRowFormat.UseECSqlPropertyNames);
  return executor.createQueryReader(query.ecsql, bind(query.bindings ?? []), opts.getOptions());
}
