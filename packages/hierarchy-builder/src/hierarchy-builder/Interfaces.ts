/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSqlReader, QueryBinder, QueryOptions } from "@itwin/core-common";
import { ClassInfo, InstanceKey } from "@itwin/presentation-common";

export type TreeNodeKey =
  | {
      type: "instances";
      instanceKeys: InstanceKey[];
    }
  | {
      type: "class-grouping";
      class: ClassInfo;
    };

export interface TreeNode {
  key: TreeNodeKey;
  label: string;
  extendedData?: { [key: string]: any };
  children: undefined | boolean | Array<TreeNode>;
  autoExpand?: boolean;
  directChildren?: any;
}

export type InProgressTreeNode = TreeNode & TreeNodeHandlingParams;

export interface TreeNodeHandlingParams {
  hideIfNoChildren?: boolean;
  hideInHierarchy?: boolean;
  groupByClass?: boolean;
  mergeByLabelId?: string;
}

export interface QueryDef {
  ctes?: string[];
  ecsql: string;
  bindings?: ECSqlBinding[];
}

export interface ITreeQueryBuilder {
  createQueries(parentNode: TreeNode | undefined): Promise<QueryDef[]>;
}

export interface IQueryExecutor {
  createQueryReader(ecsql: string, params?: QueryBinder, config?: QueryOptions): ECSqlReader;
}

export interface ITreeQueryResultsReader {
  read(executor: IQueryExecutor, query: QueryDef): Promise<InProgressTreeNode[]>;
}

export type ECSqlBindingType = "boolean" | "double" | "id" | "idset" | "int" | "long" | "string" | "point2d" | "point3d";
export interface ECSqlBinding {
  type: ECSqlBindingType;
  value?: any;
}
