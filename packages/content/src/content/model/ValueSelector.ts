/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyField } from "./Field.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { CalculatedField } from "./Field.js";

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
   * Stable column identity — equals a property field's *base* id (its
   * {@link (PropertyField:namespace).computeId} result without a `forkKey`), so every fork/override
   * variant of the same underlying property collapses to one selector id.
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
 * Computes the stable id of a {@link PropertyValueSelector} — the *base* id of the property field(s)
 * that read this column. A thin wrapper over `PropertyField.computeId` with no `forkKey`.
 *
 * @internal
 */
export function computePropertySelectorId(props: {
  propertyClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  pathFromTarget?: RelationshipPath;
}): ValueSelector["id"] {
  return PropertyField.computeId(props);
}
