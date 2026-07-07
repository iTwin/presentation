/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { checkRequiredSchemas, classMatchesSpec, mapPropertyCategories, resolveCategoryId } from "./Utils.js";

import type { EC, ECClassHierarchyInspector, ECSchemaProvider, Props } from "@itwin/presentation-shared";
import type { PropertyField } from "../../model/Field.js";
import type { DescriptorTransformer } from "../DescriptorTransformer.js";
import type * as PresentationRules from "./PresentationRules.js";

/**
 * Props for `createDescriptorTransformerFromContentModifierRule`.
 */
interface CreateDescriptorTransformerFromContentModifierRuleProps {
  /** The content modifier rule whose `propertyOverrides` drive the transformation. */
  rule: PresentationRules.ContentModifierRule;
}

/**
 * Creates a `DescriptorTransformer` from a `ContentModifier`-like rule's `propertyOverrides`.
 *
 * This handles the **modifying** half of a `ContentModifier` — adjusting metadata (label, category,
 * visibility, read-only) of fields that already exist in the descriptor. It is the counterpart of
 * `createFieldsProviderFromContentModifierRule`, which handles the **additive** half
 * (`relatedProperties`, `calculatedProperties`, `propertyCategories`).
 *
 * The returned transformer:
 * - Is a no-op when the rule declares no `propertyOverrides` or its `requiredSchemas` are not satisfied.
 * - Matches `rule.class` **polymorphically** against each candidate field's `valueClassNames` (the
 *   concrete value-supplier classes a field represents). Overrides are scoped to exactly the matched
 *   subset via `descriptor.forkField`, so a rule targeting one class of a shared base-class property
 *   affects only that class and leaves the others untouched.
 * - Considers direct fields by default and also related (nested-content) fields when
 *   `rule.applyOnNestedContent` is `true`.
 */
export function createDescriptorTransformerFromContentModifierRule({
  rule,
}: CreateDescriptorTransformerFromContentModifierRuleProps): DescriptorTransformer {
  return {
    priority: rule.priority,
    async transform({ descriptor, imodelAccess }) {
      const overrides = rule.propertyOverrides;
      if (!overrides || overrides.length === 0) {
        return;
      }
      if (!(await checkRequiredSchemas(imodelAccess, rule.requiredSchemas))) {
        return;
      }

      // Defensively merge referenced categories so the transformer works standalone.
      if (rule.propertyCategories && rule.propertyCategories.length > 0) {
        Object.assign(descriptor.categories, mapPropertyCategories(rule.propertyCategories));
      }

      // Snapshot the candidate property fields: direct fields always, related fields only when
      // `applyOnNestedContent` is set. Snapshotting up front means forks added during the pass are
      // not themselves re-processed.
      const candidates: PropertyField[] = [];
      for (const field of Object.values(descriptor.fields)) {
        if (field.kind !== "property") {
          continue;
        }
        if (rule.applyOnNestedContent !== true && field.pathFromTarget.length > 0) {
          continue;
        }
        candidates.push(field);
      }
      if (candidates.length === 0) {
        return;
      }

      // Precompute the matched value-class subset per candidate (before any forking shrinks the
      // originals), so repeat specs and the cross-field "hide others" rule re-resolve the same forks.
      const matchedByCandidate = new Map<PropertyField, EC.FullClassName[]>();
      for (const candidate of candidates) {
        matchedByCandidate.set(candidate, await computeMatchedValueClasses(imodelAccess, candidate, rule.class));
      }

      // Properties explicitly shown by an `isDisplayed: true` override must not be force-hidden by
      // another property's display override — otherwise the last such override would win and hide
      // the earlier explicitly-displayed properties.
      const displayedPropertyNames = new Set<string>();
      let displaysAllProperties = false;
      for (const spec of overrides) {
        if (spec.isDisplayed === true) {
          if (spec.name === "*") {
            displaysAllProperties = true;
          } else {
            displayedPropertyNames.add(spec.name);
          }
        }
      }

      for (const spec of overrides) {
        for (const candidate of candidates) {
          if (spec.name !== "*" && spec.name !== candidate.propertyName) {
            continue;
          }
          const matched = matchedByCandidate.get(candidate)!;
          if (matched.length === 0) {
            continue;
          }
          const working = descriptor.forkField(candidate.id, matched);
          applyPropertySpecification(working, spec);

          // Making a property visible hides all other properties of the same class, unless opted out.
          if (spec.isDisplayed === true && !spec.doNotHideOtherPropertiesOnDisplayOverride) {
            for (const other of candidates) {
              if (other === candidate) {
                continue;
              }
              // Don't hide a property that is itself explicitly displayed.
              if (displaysAllProperties || displayedPropertyNames.has(other.propertyName)) {
                continue;
              }
              const otherMatched = matchedByCandidate.get(other)!;
              if (otherMatched.length === 0) {
                continue;
              }
              descriptor.forkField(other.id, otherMatched).hidden = true;
            }
          }
        }
      }
    },
  };
}

/**
 * Returns the subset of a field's `valueClassNames` that polymorphically match `classSpec`.
 * When `classSpec` is undefined the whole set matches.
 */
async function computeMatchedValueClasses(
  imodelAccess: ECClassHierarchyInspector & ECSchemaProvider,
  field: PropertyField,
  classSpec: PresentationRules.SingleSchemaClassSpecification | undefined,
): Promise<EC.FullClassName[]> {
  if (!classSpec) {
    return [...field.valueClassNames];
  }
  const matched: EC.FullClassName[] = [];
  for (const valueClassName of field.valueClassNames) {
    if (await classMatchesSpec(imodelAccess, valueClassName, classSpec)) {
      matched.push(valueClassName);
    }
  }
  return matched;
}

/** The constrained descriptor view handed to a transformer. */
type TransformableDescriptor = Props<DescriptorTransformer["transform"]>["descriptor"];
/** A property field carved out for mutation by `forkField`. */
type WorkingField = ReturnType<TransformableDescriptor["forkField"]>;

/** Applies a single `PropertySpecification`'s supported overrides to a working field. */
function applyPropertySpecification(field: WorkingField, spec: PresentationRules.PropertySpecification): void {
  if (spec.labelOverride !== undefined) {
    field.label = spec.labelOverride;
  }
  const categoryId = resolveCategoryId(spec.categoryId);
  if (categoryId !== undefined) {
    field.categoryId = categoryId;
  }
  if (spec.isDisplayed === false) {
    field.hidden = true;
  } else if (spec.isDisplayed === true) {
    field.hidden = false;
  }
  if (spec.isReadOnly !== undefined) {
    field.readOnly = spec.isReadOnly;
  }
}
