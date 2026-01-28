/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as ECSql from "./shared/ecsql-snippets/index.js";

export { ECSql };

export { ConcatenatedValue, ConcatenatedValuePart } from "./shared/ConcatenatedValue.js";
export type { ECSqlBinding, ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryReaderOptions, ECSqlQueryRow } from "./shared/ECSqlCore.js";
export type { IPrimitiveValueFormatter } from "./shared/Formatting.js";
export { createDefaultValueFormatter, formatConcatenatedValue } from "./shared/Formatting.js";
export type { IInstanceLabelSelectClauseFactory } from "./shared/InstanceLabelSelectClauseFactory.js";
export {
  createDefaultInstanceLabelSelectClauseFactory,
  createClassBasedInstanceLabelSelectClauseFactory,
  createBisInstanceLabelSelectClauseFactory,
  parseInstanceLabel,
} from "./shared/InstanceLabelSelectClauseFactory.js";
export type { ILogger, LogFunction, LogLevel } from "./shared/Logging.js";
export { NOOP_LOGGER } from "./shared/Logging.js";
export type { ArrayElement, EventArgs, EventListener, OmitOverUnion, Props } from "./shared/MappedTypes.js";
export type { EC, ECClassHierarchyInspector, ECSchemaProvider } from "./shared/Metadata.js";
export { createCachingECClassHierarchyInspector, getClass } from "./shared/Metadata.js";
export {
  createMainThreadReleaseOnTimePassedHandler,
  julianToDateTime,
  compareFullClassNames,
  normalizeFullClassName,
  parseFullClassName,
  releaseMainThread,
  trimWhitespace,
} from "./shared/Utils.js";
export { InstanceKey, PrimitiveValue, TypedPrimitiveValue } from "./shared/Values.js";
export type { Event } from "./shared/Event.js";
