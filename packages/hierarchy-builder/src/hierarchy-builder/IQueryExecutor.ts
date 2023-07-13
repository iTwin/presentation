/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSqlReader, QueryBinder, QueryOptions } from "@itwin/core-common";

export interface IQueryExecutor {
  createQueryReader(ecsql: string, params?: QueryBinder, config?: QueryOptions): ECSqlReader;
}
