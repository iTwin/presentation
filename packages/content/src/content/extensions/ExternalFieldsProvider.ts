/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { EC, RelationshipPath, Value, ValueDescriptor } from "@itwin/presentation-shared";
import type { CardinalityHint } from "../ContentTarget.js";
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
 * The generic parameter `TInputs` constrains the input values received by `getValues` — see
 * `InputPropertyDeclaration.related` for how an input's declared cardinality narrows
 * its value type. The generic parameter `TOutputFieldIds` constrains the getValues function to return
 * values for exactly the declared field IDs — no more, no fewer.
 *
 * @public
 */
export interface ExternalFieldsProvider<
  TInputs extends Record<string, InputPropertyDeclaration> = Record<never, never>,
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
  categories?: Record<CategoryDefinition["id"], CategoryDefinition>;

  /**
   * Input property declarations. Declares iModel properties that this provider needs
   * as inputs for its `getValues` function. The keys become the property names
   * available in `items[].inputValues` within `getValues`.
   *
   * The system ensures each requested property is queried.
   */
  inputs?: TInputs;

  /**
   * Value population callback. Called during Stage 4 with a batch of items
   * after SQL-backed fields are populated.
   *
   * Each item contains pre-extracted `inputValues` keyed by the names declared in `inputs` — see
   * `InputPropertyDeclaration.related` for how an input's declared cardinality narrows
   * its value type. Must return an array parallel to `items`, where each element contains values for
   * exactly the declared field IDs.
   */
  getValues(props: {
    items: Array<{ inputValues: ExternalInputValues<TInputs> }>;
  }): Promise<Array<ExternalFieldValueRecord<TOutputFieldIds>>>;
}

/**
 * Maps an input declarations record to the `inputValues` shape `getValues` receives: `Value[]` for an
 * input declared `related.cardinalityHint: "many"`, `Value` otherwise.
 *
 * @public
 */
type ExternalInputValues<TInputs extends Record<string, InputPropertyDeclaration>> = {
  [K in keyof TInputs]: TInputs[K] extends { related: { cardinalityHint: "many" } } ? Value[] : Value;
};

/**
 * A request for an iModel property that the external fields provider needs as input.
 *
 * The system ensures a value selector (column) exists for the requested property so it can be fed
 * into `getValues`. The column is selected regardless of whether any output field references it, and
 * cannot be removed by descriptor transformers.
 *
 * @public
 */
export interface InputPropertyDeclaration {
  /** Full class name that owns the property. */
  propertyClassName: EC.FullClassNameDotNotation;
  /** The EC property name. */
  propertyName: string;
  /**
   * Relationship traversal to the property's class. Omit for properties directly on the target class,
   * whose values pass through unchanged, including native EC arrays.
   */
  related?: {
    /**
     * Relationship path from the content target to the property's class. Must contain at least one step;
     * source resolution and descriptor building reject empty paths.
     * Polymorphic paths include values from all concrete path variants found during source resolution.
     */
    path: RelationshipPath;
    /**
     * Hint about how many related instances `path` reaches per target instance, with the same semantics as
     * `PropertyField.pathCardinality`. Declaring `"many"` narrows this input's `getValues` value to
     * `Value[]`; without a hint the value stays typed as `Value`, even though the effective cardinality
     * may still resolve to many at runtime (schema multiplicity is consulted as a fallback), so an
     * unhinted input must be handled as either shape.
     *
     * An explicit hint overrides schema multiplicity only for this input. Other fields and inputs on
     * the same path keep their own shapes, even when a shared query loads multiple related instances.
     * A `"one"` hint applies across all concrete variants of the declared path, not to each variant
     * independently. Loading fails if their combined result reaches more than one instance.
     */
    cardinalityHint?: CardinalityHint;
  };
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
 *     { id: "currentFlow", label: "Current Flow", type: { kind: "primitive", type: "Double" } },
 *     { id: "sensorStatus", label: "Sensors' Status", type: { kind: "primitive", type: "String" } },
 *   ],
 *   inputs: {
 *     serialNo: { propertyClassName: "MySchema:Pump", propertyName: "SerialNumber" },
 *     // A pump reaches several sensors, so `inputValues.sensorIds` below is typed `Value[]`.
 *     sensorIds: {
 *       propertyClassName: "MySchema:Sensor",
 *       propertyName: "Id",
 *       related: {
 *         path: [{ sourceClassName: "MySchema:Pump", targetClassName: "MySchema:Sensor", relationshipName: "MySchema:PumpHasSensors" }],
 *         cardinalityHint: "many",
 *       },
 *     },
 *   },
 *   async getValues({ items }) {
 *     const liveData = await fetchFromIoTService({
 *       serials: items.map((item) => item.inputValues.serialNo),
 *       sensorIds: items.map((item) => item.inputValues.sensorIds),
 *     });
 *     return items.map((item, i) => ({
 *       "currentFlow": liveData[i].flow,
 *       "sensorStatus": liveData[i].status,
 *     }));
 *   },
 * });
 * ```
 *
 * @public
 */
/* v8 ignore next 6 */
export function defineExternalFieldsProvider<
  const TInputs extends Record<string, InputPropertyDeclaration>,
  const TOutputFieldIds extends readonly string[],
>(provider: ExternalFieldsProvider<TInputs, TOutputFieldIds>): ExternalFieldsProvider<TInputs, TOutputFieldIds> {
  return provider;
}
