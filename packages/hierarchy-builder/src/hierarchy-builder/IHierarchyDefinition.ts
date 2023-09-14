/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "./HierarchyNode";
import { ECSqlQueryDef } from "./queries/ECSql";

/** @beta */
export interface CustomHierarchyNodeDefinition {
  node: HierarchyNode;
}

/** @beta */
export interface ECSqlQueryHierarchyLevelDefinition {
  fullClassName: string;
  query: ECSqlQueryDef;
}

/** @beta */
export type HierarchyLevelDefinition = CustomHierarchyNodeDefinition | ECSqlQueryHierarchyLevelDefinition;
/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyLevelDefinition {
  export function isCustomNode(def: HierarchyLevelDefinition): def is CustomHierarchyNodeDefinition {
    return !!(def as CustomHierarchyNodeDefinition).node;
  }
  export function isECSqlQuery(def: HierarchyLevelDefinition): def is ECSqlQueryHierarchyLevelDefinition {
    return !!(def as ECSqlQueryHierarchyLevelDefinition).query;
  }
}

/** @beta */
export interface IHierarchyDefinition {
  defineHierarchyLevel(parentNode: HierarchyNode | undefined): Promise<HierarchyLevelDefinition[]>;
}
