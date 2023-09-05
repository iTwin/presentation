/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSqlBinding } from "./ECSqlBinding";
import { TreeNode } from "./TreeNode";

/** @beta */
export interface QueryDef {
  fullClassName: string;
  ctes?: string[];
  ecsql: string;
  bindings?: ECSqlBinding[];
}

/** @beta */
export interface ITreeQueryBuilder {
  createQueries(parentNode: TreeNode | undefined): Promise<QueryDef[]>;
}
