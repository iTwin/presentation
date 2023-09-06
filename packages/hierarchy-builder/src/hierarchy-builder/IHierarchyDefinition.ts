/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSqlQueryDef } from "./ECSql";
import { HierarchyNode } from "./HierarchyNode";

/** @beta */
export interface HierarchyLevelDefinition {
  fullClassName: string;
  query: ECSqlQueryDef;
}

/** @beta */
export interface IHierarchyDefinition {
  defineHierarchyLevel(parentNode: HierarchyNode | undefined): Promise<HierarchyLevelDefinition[]>;
}
