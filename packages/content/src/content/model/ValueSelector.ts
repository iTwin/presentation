/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyField } from "./Field.js";

import type { EC, ECSqlBinding, RelationshipPath } from "@itwin/presentation-shared";
import type { CalculatedField, Field } from "./Field.js";

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
 * (`sourceClassName`, `propertyName`, `pathFromTarget`) via `Pick`, so the field stays the single
 * source of truth. Unlike a field, a selector is deduplicated and may exist with no backing field
 * (an external fields provider input column).
 *
 * @public
 */
export interface PropertyValueSelector extends Pick<
  PropertyField,
  "sourceClassName" | "propertyName" | "pathFromTarget"
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
  propertyClassName: EC.FullClassName;
  propertyName: string;
  pathFromTarget?: RelationshipPath;
}): ValueSelector["id"] {
  return PropertyField.computeId({
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget,
  });
}

/**
 * Creates a {@link PropertyValueSelector} with its id derived from the property's identity.
 *
 * @internal
 */
export function createPropertySelector(props: {
  sourceClassName: EC.FullClassName;
  propertyName: string;
  pathFromTarget?: RelationshipPath;
}): PropertyValueSelector {
  return {
    kind: "property",
    id: computePropertySelectorId({
      propertyClassName: props.sourceClassName,
      propertyName: props.propertyName,
      pathFromTarget: props.pathFromTarget,
    }),
    sourceClassName: props.sourceClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
  };
}

/**
 * Creates a {@link CalculatedValueSelector}. Its id equals the calculated field id and must be
 * supplied by the caller (it is not derivable from the expression).
 *
 * @internal
 */
export function createCalculatedSelector(props: {
  id: string;
  expression: string;
  targetAlias?: string;
  bindings?: Record<string, ECSqlBinding>;
}): CalculatedValueSelector {
  const selector: CalculatedValueSelector = { kind: "calculated", id: props.id, expression: props.expression };
  if (props.targetAlias !== undefined) {
    selector.targetAlias = props.targetAlias;
  }
  if (props.bindings !== undefined) {
    selector.bindings = props.bindings;
  }
  return selector;
}

/**
 * Collects the deduplicated set of {@link ValueSelector}s to SELECT, keyed by selector id.
 *
 * The result is the union of:
 * - one selector per SQL-backed field (`property`/`calculated`), and
 * - one property selector per external fields provider input.
 *
 * External-input selectors are added unconditionally, so removing an output field can never remove
 * an input column. When a field-backed selector and an input selector share an id, the field-backed
 * one is kept (they are otherwise identical).
 *
 * @internal
 */
export function collectSelectors(
  fields: Iterable<Field>,
  externalInputs: Iterable<{ className: EC.FullClassName; propertyName: string; path?: RelationshipPath }>,
): Record<ValueSelector["id"], ValueSelector> {
  const result: Record<ValueSelector["id"], ValueSelector> = {};
  for (const field of fields) {
    switch (field.kind) {
      case "property": {
        const selector = createPropertySelector({
          sourceClassName: field.sourceClassName,
          propertyName: field.propertyName,
          pathFromTarget: field.pathFromTarget,
        });
        result[selector.id] = selector;
        break;
      }
      case "calculated": {
        const selector = createCalculatedSelector({
          id: field.selectorId,
          expression: field.expression,
          targetAlias: field.targetAlias,
          bindings: field.bindings,
        });
        result[selector.id] = selector;
        break;
      }
      // external fields have no selector — populated out-of-band, not via SQL.
    }
  }
  for (const input of externalInputs) {
    const selector = createPropertySelector({
      sourceClassName: input.className,
      propertyName: input.propertyName,
      pathFromTarget: input.path,
    });
    result[selector.id] ??= selector;
  }
  return result;
}
