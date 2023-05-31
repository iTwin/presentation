/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";
import { QueryBinder, QueryOptionsBuilder, QueryRowFormat } from "@itwin/core-common";
import { InProgressTreeNode, IQueryExecutor, ITreeQueryResultsReader, QueryDef } from "./Interfaces";

const ROWS_LIMIT = 1000;
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
  const bindings = new QueryBinder();
  (query.bindings ?? []).forEach((b, i) => {
    switch (b.type) {
      case "boolean":
        bindings.bindBoolean(i + 1, b.value);
        break;
      case "double":
        bindings.bindDouble(i + 1, b.value);
        break;
      case "id":
        bindings.bindId(i + 1, b.value);
        break;
      case "idset":
        bindings.bindIdSet(i + 1, b.value);
        break;
      case "int":
        bindings.bindInt(i + 1, b.value);
        break;
      case "long":
        bindings.bindLong(i + 1, b.value);
        break;
      case "point2d":
        bindings.bindPoint2d(i + 1, b.value);
        break;
      case "point3d":
        bindings.bindPoint3d(i + 1, b.value);
        break;
      case "string":
        bindings.bindString(i + 1, b.value);
        break;
    }
  });
  return executor.createQueryReader(query.ecsql, bindings, opts.getOptions());
}

export class TreeQueryResultsReader implements ITreeQueryResultsReader {
  public async read(executor: IQueryExecutor, query: QueryDef): Promise<InProgressTreeNode[]> {
    const nodes = new Array<InProgressTreeNode>();
    for await (const row of createECSqlReader(executor, query)) {
      if (nodes.length >= ROWS_LIMIT) {
        throw new Error("rows limit exceeded");
      }
      nodes.push(parseNode(row.toRow()));
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
