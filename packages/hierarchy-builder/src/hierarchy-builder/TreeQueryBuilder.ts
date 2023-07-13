/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSqlBinding } from "./ECSqlBinding";
import { TreeNode } from "./TreeNode";

export interface QueryDef {
  ctes?: string[];
  ecsql: string;
  bindings?: ECSqlBinding[];
}

export interface ITreeQueryBuilder {
  createQueries(parentNode: TreeNode | undefined): Promise<QueryDef[]>;
}
