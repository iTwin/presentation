/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";

import type { IModelConnection } from "@itwin/core-frontend";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider } from "@itwin/presentation-shared";

export type IModelAccess = ECSchemaProvider & LimitingECSqlQueryExecutor & { imodelKey: string };

export function createIModelAccess(imodel: IModelConnection): IModelAccess {
  const schemaProvider = createECSchemaProvider(imodel);
  return {
    imodelKey: imodel.key,
    ...schemaProvider,
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
