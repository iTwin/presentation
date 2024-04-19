/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelConnection } from "@itwin/core-frontend";
import { createECSqlQueryExecutor as interopExecutorFactory } from "@itwin/presentation-core-interop";
import { ECSqlBinding, ECSqlQueryReaderOptions } from "@itwin/unified-selection/lib/cjs/unified-selection/queries/ECSqlCore";

/** This is temporarily required until `unified-selection` starts using `ECSql` type definitions from `presentation-shared` */
export function createECSqlQueryExecutor(imodel: IModelConnection) {
  const interopExecutor = interopExecutorFactory(imodel);
  return {
    createQueryReader(ecsql: string, bindings?: ECSqlBinding[], config?: ECSqlQueryReaderOptions) {
      return interopExecutor.createQueryReader({ ecsql, bindings }, config);
    },
  };
}
