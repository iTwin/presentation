/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { isDeepStrictEqual } from "util";
import { formatRelationshipPath, getVisiblePropertyFieldsByPath } from "./Utils.js";

import type { Field, PropertyField } from "@itwin/presentation-content";
import type { RelationshipPath } from "@itwin/presentation-shared";
import type { Descriptor } from "./Utils.js";

/**
 * Returns a field's category hierarchy as labels ordered root-to-leaf. Fields without a resolvable
 * category yield an empty array.
 */
export function getCategoryLabelChain(descriptor: Descriptor, field: Field): string[] {
  const labelsLeafToRoot: string[] = [];
  let id: string | undefined = field.categoryId;
  const seen = new Set<string>();
  while (id !== undefined && !seen.has(id) && id in descriptor.categories) {
    seen.add(id);
    const category: Descriptor["categories"][string] = descriptor.categories[id];
    labelsLeafToRoot.push(category.label);
    id = category.parentId;
  }
  return labelsLeafToRoot.reverse();
}

/** Validates a field's root-to-leaf category label chain. */
export function validateCategoryChain(descriptor: Descriptor, field: Field, expectedLabelsRootToField: string[]): void {
  const actualLabels = getCategoryLabelChain(descriptor, field);
  if (!isDeepStrictEqual(actualLabels, expectedLabelsRootToField)) {
    throw new Error(
      `Expected category label chain to be ${JSON.stringify(expectedLabelsRootToField)}, got ${JSON.stringify(actualLabels)}`,
    );
  }
}

function describeField(descriptor: Descriptor, field: PropertyField): string {
  return JSON.stringify({
    propertyClassName: field.propertyClassName,
    propertyName: field.propertyName,
    label: field.label,
    readOnly: !!field.readOnly,
    category: getCategoryLabelChain(descriptor, field),
  });
}

/**
 * Declarative expectations for a single *visible* property field, matched structurally (never by
 * generated field/category IDs). `propertyClassName` and `propertyName` are always checked;
 * `label`, `readOnly` and `category` are only checked when provided. There is no `hidden`
 * expectation: schema-hidden fields are intentionally excluded from this validation entirely (see
 * `getVisiblePropertyFieldsByPath`), so every field matched against these expectations is, by
 * construction, visible.
 */
export interface PropertyFieldExpectations {
  /** Full name of the class that *declares* the property (`PropertyField.propertyClassName`). */
  propertyClassName: string;
  /** The EC property name (`PropertyField.propertyName`). */
  propertyName: string;
  /** Expected display label. */
  label?: string;
  /** Expected `readOnly` flag (checked against `!!field.readOnly`), when provided. */
  readOnly?: boolean;
  /** Expected category label chain, root-to-leaf (see `getCategoryLabelChain`), when provided. */
  category?: string[];
}

/** A single property field expectation, matched against one actual field by `validateVisibleFieldsAtPath`. */
export interface PropertyFieldValidator {
  /** Throws when `field` doesn't match this validator's expectations. */
  validate: (descriptor: Descriptor, field: PropertyField) => void;
  /** Human-readable description of the expectations, for use in "no match found" error messages. */
  describe: () => string;
}

export namespace PropertyFieldValidators {
  /** Creates a `PropertyFieldValidator` matching a property field structurally, per `expectations`. */
  export function create(expectations: PropertyFieldExpectations): PropertyFieldValidator {
    return {
      validate: (descriptor, field) => {
        if (field.propertyClassName !== expectations.propertyClassName) {
          throw new Error(
            `Expected \`propertyClassName\` to be "${expectations.propertyClassName}", got "${field.propertyClassName}"`,
          );
        }
        if (field.propertyName !== expectations.propertyName) {
          throw new Error(
            `Expected \`propertyName\` to be "${expectations.propertyName}", got "${field.propertyName}"`,
          );
        }
        if (expectations.label !== undefined && field.label !== expectations.label) {
          throw new Error(`Expected \`label\` to be "${expectations.label}", got "${field.label}"`);
        }
        if (expectations.readOnly !== undefined && !!field.readOnly !== expectations.readOnly) {
          throw new Error(`Expected \`readOnly\` to be ${expectations.readOnly}, got ${!!field.readOnly}`);
        }
        if (expectations.category !== undefined) {
          const actualCategory = getCategoryLabelChain(descriptor, field);
          if (!isDeepStrictEqual(actualCategory, expectations.category)) {
            throw new Error(
              `Expected category label chain to be ${JSON.stringify(expectations.category)}, got ${JSON.stringify(actualCategory)}`,
            );
          }
        }
      },
      describe: () =>
        JSON.stringify({
          propertyClassName: expectations.propertyClassName,
          propertyName: expectations.propertyName,
          ...(expectations.label !== undefined ? { label: expectations.label } : undefined),
          ...(expectations.readOnly !== undefined ? { readOnly: expectations.readOnly } : undefined),
          ...(expectations.category !== undefined ? { category: expectations.category } : undefined),
        }),
    };
  }
}

/**
 * Asserts that the complete, unordered set of *visible* property fields at `path` (an empty path,
 * the default, means the direct/target-class fields) matches `expect` exactly: the same number of
 * fields, each structurally matched to exactly one validator. Fields are matched greedily and out
 * of order — descriptor field iteration order is not part of the expected shape.
 *
 * Schema-hidden fields (see `getVisiblePropertyFieldsByPath`) are intentionally excluded from both
 * the actual and expected sides of this comparison: `expect` should list only the fields a consumer
 * would actually see, and a field becoming hidden (or a hidden field becoming visible) is expected
 * to surface as a fields-count/missing-or-unexpected-field mismatch here, not as a separate
 * hidden-state assertion.
 *
 * This is intentionally not a "contains" check: unexpected visible sibling fields, missing visible
 * fields, and label/category changes on visible fields are all reported as failures.
 */
export function validateVisibleFieldsAtPath(props: {
  descriptor: Descriptor;
  path?: RelationshipPath;
  expect: PropertyFieldValidator[];
}): void {
  const { descriptor, path = [], expect: expectedValidators } = props;
  const pathDescription = formatRelationshipPath(path);
  const actualFields = getVisiblePropertyFieldsByPath(descriptor, path);

  if (actualFields.length !== expectedValidators.length) {
    throw new Error(
      `[${pathDescription}] Expected ${expectedValidators.length} property field(s), got ${actualFields.length}: [${actualFields
        .map((f) => describeField(descriptor, f))
        .join(", ")}]`,
    );
  }

  const remainingValidators = [...expectedValidators];
  for (const field of actualFields) {
    const matchIndex = remainingValidators.findIndex((validator) => {
      try {
        validator.validate(descriptor, field);
        return true;
      } catch {
        return false;
      }
    });
    if (matchIndex === -1) {
      throw new Error(
        `[${pathDescription}] None of the remaining expectations matched actual field ${describeField(descriptor, field)}. Remaining expectations: [${remainingValidators
          .map((v) => v.describe())
          .join(
            ", ",
          )}]. Actual fields: [${actualFields.map((actual) => describeField(descriptor, actual)).join(", ")}]`,
      );
    }
    remainingValidators.splice(matchIndex, 1);
  }
}
