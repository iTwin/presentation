/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/no-deprecated */

import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";

import type { IModelConnection } from "@itwin/core-frontend";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";

export type IModelAccess = ECSchemaProvider &
  LimitingECSqlQueryExecutor &
  ECClassHierarchyInspector & { imodelKey: string };

export function createIModelAccess(imodel: IModelConnection): IModelAccess {
  const schemaProvider = createECSchemaProvider(imodel);
  return {
    imodelKey: imodel.key,
    ...schemaProvider,
    ...createCachingECClassHierarchyInspector({ schemaProvider }),
    ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
  };
}

export async function collect<T>(items: AsyncIterableIterator<T>) {
  const result: T[] = [];
  for await (const item of items) {
    result.push(item);
  }
  return result;
}
