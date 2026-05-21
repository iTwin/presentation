/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { EC, RelationshipPath, Value, ValueDescriptor } from "@itwin/presentation-shared";
import type { CategoryDefinition } from "../model/Category.js";
import type { BaseFieldsProvider } from "./BaseFieldsProvider.js";

/**
 * A self-contained extension that both declares new fields and populates them
 * with data from outside the iModel.
 *
 * **Pipeline stages: 2 (descriptor building) and 4 (value population)**
 *
 * During descriptor building, `fields` declarations are added to the descriptor.
 * During value population (`getItems`), `getValues` is called with a batch of
 * items to fill in the external field values.
 *
 * The generic parameter `TInputKeys` constrains the input values received by `getValues`.
 * The generic parameter `TOutputFieldIds` constrains the getValues function to return
 * values for exactly the declared field IDs — no more, no fewer.
 *
 * @public
 */
export interface ExternalFieldsProvider<
  TInputKeys extends string = never,
  TOutputFieldIds extends readonly string[] = readonly string[],
> extends BaseFieldsProvider {
  /**
   * Field declarations — the fields this provider will populate.
   * Each field ID must appear exactly once.
   */
  fields: { [K in keyof TOutputFieldIds]: ExternalFieldDeclaration<TOutputFieldIds[K]> };

  /**
   * Category definitions used by this provider's fields, keyed by category ID.
   */
  categories?: Record<string, CategoryDefinition>;

  /**
   * Input property declarations. Declares iModel properties that this provider needs
   * as inputs for its `getValues` function. The keys become the property names
   * available in `items[].inputValues` within `getValues`.
   *
   * The system ensures each requested property is queried.
   */
  inputs?: { [K in TInputKeys]: InputPropertyDeclaration };

  /**
   * Value population callback. Called during Stage 4 with a batch of items
   * after SQL-backed fields are populated.
   *
   * Each item contains pre-extracted `inputValues` keyed by the names declared in `inputs`.
   * Must return an array parallel to `items`, where each element contains
   * values for exactly the declared field IDs.
   */
  getValues(props: {
    items: Array<{ inputValues: { [K in TInputKeys]: Value } }>;
  }): Promise<Array<ExternalFieldValueRecord<TOutputFieldIds>>>;
}

/**
 * A request for an iModel property that the external fields provider needs as input.
 *
 * The system checks whether the property already exists in the descriptor:
 * - If yes, it pins the field (prevents removal by transformers).
 * - If no, it adds the property as a hidden field (queried but not displayed).
 *
 * @public
 */
interface InputPropertyDeclaration {
  /** Full class name that owns the property. */
  className: EC.FullClassName;
  /** The EC property name. */
  propertyName: string;
  /**
   * Relationship path from the content target to the property's class.
   * Omit for properties directly on the target class.
   */
  path?: RelationshipPath;
}

/**
 * Declaration of a single field that an external fields provider will populate.
 * Parameterized on the field ID for type-safe resolve contracts.
 *
 * @public
 */
interface ExternalFieldDeclaration<TId extends string = string> {
  /**
   * Local identity for this field. Must be unique within the owning provider.
   * The system derives the global field identity as `${providerId}:${id}`.
   */
  id: TId;
  /** Display label. */
  label: string;
  /** The value type for this field. */
  type: ValueDescriptor;
  /** Category to assign this field to (references a `CategoryDefinition.id`). */
  categoryId?: string;
}

/**
 * Maps field IDs tuple to a record requiring values for each declared field.
 * This ensures the `getValues` function must return values for all declared fields.
 *
 * @public
 */
type ExternalFieldValueRecord<TFieldIds extends readonly string[]> = {
  [K in TFieldIds[number]]: Value;
};

/**
 * Helper to define an external fields provider with full type inference.
 * The input keys are inferred from the `inputs` record, and field IDs from the `fields` array,
 * constraining both `getValues` input access and return type.
 *
 * @example
 * ```ts
 * const iotProvider = defineExternalFieldsProvider({
 *   id: "iot-sensors_v1",
 *   fields: [
 *     { id: "currentFlow", label: "Current Flow", type: { kind: "primitive", primitiveType: "double" } },
 *     { id: "lastMaintenance", label: "Last Maintenance", type: { kind: "primitive", primitiveType: "dateTime" } },
 *   ],
 *   inputs: {
 *     serialNo: { className: "MySchema:Pump", propertyName: "SerialNumber" },
 *     deviceId: { className: "MySchema:Device", propertyName: "DeviceId", path: [{ relationship: "MySchema:PumpHasDevice", direction: "forward", target: "MySchema:Device" }] },
 *   },
 *   async getValues({ items }) {
 *     const serials = items.map((item) => item.inputValues.serialNo);
 *     const data = await fetchFromIoTService(serials);
 *     return items.map((_, i) => ({
 *       "currentFlow": data[i].flow,
 *       "lastMaintenance": data[i].lastMaintenance,
 *     }));
 *   },
 * });
 * ```
 *
 * @public
 */
export function defineExternalFieldsProvider<
  const TInputKeys extends string,
  const TOutputFieldIds extends readonly string[],
>(provider: ExternalFieldsProvider<TInputKeys, TOutputFieldIds>): ExternalFieldsProvider<TInputKeys, TOutputFieldIds> {
  return provider;
}
