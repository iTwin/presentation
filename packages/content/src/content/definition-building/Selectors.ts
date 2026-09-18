/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { computePropertySelectorId } from "./ValueSelector.js";

import type { EC, ECSqlBinding, RelationshipPath } from "@itwin/presentation-shared";
import type { Field } from "../model/Field.js";
import type { ExternalInput } from "./ExternalFields.js";
import type { CalculatedValueSelector, PropertyValueSelector, ValueSelector } from "./ValueSelector.js";

export interface ValueRequirements {
  selectors: Record<ValueSelector["id"], ValueSelector>;
  fieldSelectorIds: Partial<Record<Field["id"], ValueSelector["id"]>>;
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
 */
export function collectValueRequirements(props: {
  fields: Iterable<Field>;
  externalInputs: Iterable<ExternalInput>;
}): ValueRequirements {
  const { fields, externalInputs } = props;
  const selectors: Record<ValueSelector["id"], ValueSelector> = {};
  const fieldSelectorIds: ValueRequirements["fieldSelectorIds"] = {};
  for (const field of fields) {
    switch (field.kind) {
      case "property": {
        const selector = createPropertySelector({ ...field, id: computePropertySelectorId(field) });
        selectors[selector.id] = selector;
        fieldSelectorIds[field.id] = selector.id;
        break;
      }
      case "calculated": {
        const selector = createCalculatedSelector({ ...field, id: field.id });
        selectors[selector.id] = selector;
        fieldSelectorIds[field.id] = selector.id;
        break;
      }
      // external fields have no selector — populated out-of-band, not via SQL.
    }
  }
  for (const input of externalInputs) {
    const selector = createPropertySelector({ ...input, id: computePropertySelectorId(input) });
    selectors[selector.id] ??= selector;
  }
  return { selectors, fieldSelectorIds };
}

/** Creates a {@link PropertyValueSelector} with its id derived from the property's identity. */
function createPropertySelector(props: {
  id: string;
  propertyClassName: EC.FullClassNameDotNotation;
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
