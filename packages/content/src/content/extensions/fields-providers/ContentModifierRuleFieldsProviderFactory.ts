/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentModifierRule } from "./ContentModifierRuleFieldsProviderFactory.PresentationRules.js";
import type { IModelFieldsProvider } from "./IModelFieldsProvider.js";

/**
 * Props for `createFieldsProviderFromContentModifierRule`.
 * @public
 */
interface CreateFieldsProviderFromContentModifierRuleProps {
  /** iModel access used for schema version checks and polymorphic class matching. */
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector;

  /** The content modifier rule. */
  rule: ContentModifierRule;
}

/**
 * Creates an `IModelFieldsProvider` from a `ContentModifier`-like specification.
 *
 * The returned provider:
 * - Checks `requiredSchemas` (with full version comparison) on every `getContribution` call.
 * - Matches the target class **polymorphically** against `spec.class`.
 * - Maps `relatedProperties`, `calculatedProperties`, and `propertyCategories` into a
 *   `FieldsProviderContribution`.
 *
 * @public
 */
// Implementation will be added in subsequent tasks.
/* v8 ignore next 3 */
export function createFieldsProviderFromContentModifierRule(
  _props: CreateFieldsProviderFromContentModifierRuleProps,
): IModelFieldsProvider {
  throw new Error("Not implemented");
}
