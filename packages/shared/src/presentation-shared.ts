/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

export * as ECSql from "./shared/ecsql-snippets/index.js";

export { ConcatenatedValue, ConcatenatedValuePart } from "./shared/ConcatenatedValue.js";
export { eachValueFrom } from "./shared/EachValueFrom.js";
export { ECSqlBinding } from "./shared/ECSqlCore.js";
export type { ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryReaderOptions, ECSqlQueryRow } from "./shared/ECSqlCore.js";
export type { IPrimitiveValueFormatter } from "./shared/Formatting.js";
export { createDefaultValueFormatter, formatConcatenatedValue } from "./shared/Formatting.js";
export type { IInstanceLabelSelectClauseFactory } from "./shared/InstanceLabelSelectClauseFactory.js";
export { parseInstanceLabel } from "./shared/InstanceLabelSelectClauseFactory.js";
export { createDefaultInstanceLabelSelectClauseFactory } from "./shared/instance-label-factory-impls/DefaultInstanceLabelSelectClauseFactory.js";
export { createClassBasedInstanceLabelSelectClauseFactory } from "./shared/instance-label-factory-impls/ClassBasedInstanceLabelSelectClauseFactory.js";
export { createBisInstanceLabelSelectClauseFactory } from "./shared/instance-label-factory-impls/BisInstanceLabelSelectClauseFactory.js";
export { createIModelInstanceLabelSelectClauseFactory } from "./shared/instance-label-factory-impls/IModelInstanceLabelSelectClauseFactory.js";
export type { ILogger, LogFunction, LogLevel } from "./shared/Logging.js";
export { NOOP_LOGGER } from "./shared/Logging.js";
export type { ArrayElement, OmitOverUnion, Props } from "./shared/MappedTypes.js";
export type {
  ArrayValueDescriptor,
  EC,
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  ECClassHierarchyInspector,
  ECSchemaProvider,
  NavigationValueDescriptor,
  PrimitiveValueDescriptor,
  PrimitiveValueType,
  RelationshipPath,
  StructValueDescriptor,
  ValueDescriptor,
} from "./shared/Metadata.js";
export {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  createCachingECClassHierarchyInspector,
  getClass,
} from "./shared/Metadata.js";
export {
  createMainThreadReleaseOnTimePassedHandler,
  julianToDateTime,
  normalizeFullClassName,
  parseFullClassName,
  releaseMainThread,
  trimWhitespace,
} from "./shared/Utils.js";
export { InstanceKey, PrimitiveValue, TypedPrimitiveValue } from "./shared/Values.js";
export type { ArrayValue, StructValue, Value, Point2dValue, Point3dValue } from "./shared/Values.js";
export type { Event, RaisableEvent, EventArgs, EventListener } from "./shared/Event.js";
