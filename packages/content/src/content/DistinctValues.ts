/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ECSqlQueryExecutor, Value } from "@itwin/presentation-shared";
import type { ContentValueFilter } from "./Content.js";
import type { ContentTarget } from "./ContentTarget.js";
import type { CalculatedField, PropertyField } from "./model/Field.js";

/**
 * Props for `getDistinctFieldValues`.
 *
 * @public
 */
interface GetDistinctFieldValuesProps {
  /** Access to the iModel for running ECSQL queries. */
  imodelAccess: ECSqlQueryExecutor;

  /** The content targets to query against. */
  targets: ContentTarget[];

  /** The field to get distinct values for. */
  field: PropertyField | CalculatedField;

  /** Optional filters (restricts which rows contribute distinct values). */
  filters?: ContentValueFilter[];
}

/**
 * Get distinct raw values for a single field across the given content targets.
 *
 * The field itself carries the join path from the content target to the property,
 * so resolved sources are not needed.
 *
 * @public
 */
export function getDistinctFieldValues(_props: GetDistinctFieldValuesProps): AsyncIterable<Value> {
  throw new Error("Not implemented");
}
