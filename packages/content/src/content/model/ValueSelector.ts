/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { serializeRelationshipPath } from "./Utils.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { CalculatedField, PropertyField } from "./Field.js";

/**
 * A deduplicated instruction for selecting one raw value (column) from the iModel.
 *
 * A selector represents *what column to SELECT*, distinct from a {@link Field}, which represents
 * *what to display*. Multiple fields (e.g. an override and its base, or several `forkField` carves)
 * can share a single selector, and an external fields provider input can require a selector with no
 * output field at all.
 *
 * @public
 */
export type ValueSelector = PropertyValueSelector | CalculatedValueSelector;

/**
 * A {@link ValueSelector} that selects a real EC property column.
 *
 * Reuses the column-locating coordinates of the {@link (PropertyField:interface)}(s) that read it
 * (`propertyClassName`, `propertyName`, `pathFromTarget`) via `Pick`, so the field stays the single
 * source of truth. Unlike a field, a selector is deduplicated and may exist with no backing field
 * (an external fields provider input column).
 *
 * @public
 */
export interface PropertyValueSelector extends Pick<
  PropertyField,
  "propertyClassName" | "propertyName" | "pathFromTarget"
> {
  kind: "property";
  /**
   * Stable column identity. For a direct property, this matches the base property-field id; for a
   * related property, it also includes the relationship path and any step instance filters/bindings so
   * distinct filtered paths do not collapse into one selector.
   */
  id: string;
}

/**
 * A {@link ValueSelector} that selects the result of an ECSQL expression.
 *
 * Reuses the expression-defining fields of the {@link (CalculatedField:interface)}(s) that read it
 * (`expression`, `targetAlias`, `bindings`) via `Pick`, so the field stays the single source of
 * truth. Unlike a field, a selector is deduplicated.
 *
 * @public
 */
export interface CalculatedValueSelector extends Pick<CalculatedField, "expression" | "targetAlias" | "bindings"> {
  kind: "calculated";
  /** Stable column identity — equals the calculated field id (`${providerId}:${localId}`). */
  id: string;
}

/**
 * Computes the stable id of a {@link PropertyValueSelector}. Unlike field IDs, selector IDs must also
 * distinguish property reads that follow the same relationship path but different step instance
 * filters or binding values, because those columns are not interchangeable for external-provider
 * inputs and other deduplicated value lookups.
 *
 * @internal
 */
export function computePropertySelectorId(props: {
  propertyClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  pathFromTarget?: RelationshipPath;
}): ValueSelector["id"] {
  let identity = `${props.propertyClassName}.${props.propertyName}`;
  if (props.pathFromTarget && props.pathFromTarget.length > 0) {
    identity += `(${serializeRelationshipPath({ path: props.pathFromTarget, includeInstanceFilters: true })})`;
  }
  return identity;
}
