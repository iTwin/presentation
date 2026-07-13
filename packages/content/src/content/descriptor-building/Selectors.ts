/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { computePropertySelectorId } from "../model/ValueSelector.js";

import type { EC, ECSqlBinding, RelationshipPath } from "@itwin/presentation-shared";
import type { Field } from "../model/Field.js";
import type { CalculatedValueSelector, PropertyValueSelector, ValueSelector } from "../model/ValueSelector.js";
import type { ExternalInput } from "./ExternalFields.js";

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
export function collectSelectors(props: {
  fields: Iterable<Field>;
  externalInputs: Iterable<ExternalInput>;
}): Record<ValueSelector["id"], ValueSelector> {
  const { fields, externalInputs } = props;
  const result: Record<ValueSelector["id"], ValueSelector> = {};
  for (const field of fields) {
    switch (field.kind) {
      case "property": {
        result[field.selectorId] = createPropertySelector({ ...field, id: field.selectorId });
        break;
      }
      case "calculated": {
        const selector = createCalculatedSelector({ ...field, id: field.selectorId });
        result[selector.id] = selector;
        break;
      }
      // external fields have no selector — populated out-of-band, not via SQL.
    }
  }
  for (const input of externalInputs) {
    const selector = createPropertySelector({ ...input, id: computePropertySelectorId(input) });
    result[selector.id] ??= selector;
  }
  return result;
}

/** Creates a {@link PropertyValueSelector} with its id derived from the property's identity. */
function createPropertySelector(props: {
  id: string;
  propertyClassName: EC.FullClassName;
  propertyName: string;
  pathFromTarget?: RelationshipPath;
}): PropertyValueSelector {
  return {
    kind: "property",
    id: props.id,
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
  };
}

/**
 * Creates a {@link CalculatedValueSelector}. Its id equals the calculated field id and must be
 * supplied by the caller (it is not derivable from the expression).
 */
function createCalculatedSelector(props: {
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
