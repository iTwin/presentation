/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";
import { ECSqlQueryDef, parseInstanceLabel } from "@itwin/presentation-shared";
import { INodeParser } from "../HierarchyDefinition";
import { InstanceHierarchyNodeProcessingParams, ParsedHierarchyNode, ParsedInstanceHierarchyNode } from "../HierarchyNode";
import { ILimitingECSqlQueryExecutor } from "../LimitingECSqlQueryExecutor";
import { NodeSelectClauseColumnNames } from "../NodeSelectQueryFactory";

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

  public async *read(queryExecutor: ILimitingECSqlQueryExecutor, query: ECSqlQueryDef, limit?: number | "unbounded"): AsyncGenerator<ParsedHierarchyNode> {
    for await (const row of queryExecutor.createQueryReader(query, { rowFormat: "ECSqlPropertyNames", ...(limit !== undefined ? { limit } : undefined) })) {
      yield this._props.parser(row);
    }
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
}
