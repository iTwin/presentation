/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "../EC";
import { INodeParser } from "../HierarchyDefinition";
import { HierarchyNode } from "../HierarchyNode";
import { ECSqlQueryDef, IECSqlQueryExecutor } from "../queries/ECSql";
import { NodeSelectClauseColumnNames } from "../queries/NodeSelectClauseFactory";

/** @internal */
export interface ITreeQueryResultsReader<TNode extends HierarchyNode> {
  read(executor: IECSqlQueryExecutor, query: ECSqlQueryDef): Promise<TNode[]>;
}

/** @internal */
export class TreeQueryResultsReader<TNode extends HierarchyNode> implements ITreeQueryResultsReader<TNode> {
  private constructor(private _parser: INodeParser<TNode>) {}

  public static create(): TreeQueryResultsReader<HierarchyNode>;
  public static create<TNode extends HierarchyNode>(nodeParser: INodeParser<TNode>): TreeQueryResultsReader<TNode>;
  public static create<TNode extends HierarchyNode>(nodeParser?: INodeParser<TNode>) {
    if (nodeParser) {
      return new TreeQueryResultsReader<TNode>(nodeParser);
    }
    return new TreeQueryResultsReader<HierarchyNode>(defaultNodesParser);
  }

  public async read(executor: IECSqlQueryExecutor, query: ECSqlQueryDef): Promise<TNode[]> {
    const reader = executor.createQueryReader(query.ecsql, query.bindings, { rowFormat: "ECSqlPropertyNames" });
    const nodes = new Array<TNode>();
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
  [NodeSelectClauseColumnNames.Grouping]?: string;
  [NodeSelectClauseColumnNames.MergeByLabelId]?: string;
  [NodeSelectClauseColumnNames.ExtendedData]?: string;
  [NodeSelectClauseColumnNames.AutoExpand]?: boolean;
}
/* eslint-enable @typescript-eslint/naming-convention */

/** @internal */
export function defaultNodesParser(row: { [columnName: string]: any }): HierarchyNode {
  const typedRow = row as RowDef;
  const parsedExtendedData = typedRow.ExtendedData ? JSON.parse(typedRow.ExtendedData) : undefined;
  const parsedGrouping = typedRow.Grouping ? JSON.parse(typedRow.Grouping) : undefined;
  return {
    label: typedRow.DisplayLabel ?? "",
    extendedData: parsedExtendedData,
    key: {
      type: "instances",
      instanceKeys: [{ className: typedRow.FullClassName.replace(":", "."), id: typedRow.ECInstanceId }],
    },
    children: typedRow.HasChildren === undefined ? undefined : !!typedRow.HasChildren,
    params: {
      hideIfNoChildren: !!typedRow.HideIfNoChildren,
      hideInHierarchy: !!typedRow.HideNodeInHierarchy,
      grouping: parsedGrouping,
      mergeByLabelId: typedRow.MergeByLabelId,
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
