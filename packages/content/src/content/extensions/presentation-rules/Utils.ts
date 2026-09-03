/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { isSchemaVersionAtLeast, isSchemaVersionBelow } from "../../InternalUtils.js";

import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { CategoryDefinition } from "../../model/Category.js";
import type * as PresentationRules from "./PresentationRules.js";

/**
 * Returns `true` if all required schemas are present in the iModel and satisfy the version constraints.
 *
 * @internal
 */
export async function checkRequiredSchemas(
  imodelAccess: ECSchemaProvider,
  requiredSchemas: PresentationRules.RequiredSchemaSpecification[] | undefined,
): Promise<boolean> {
  if (!requiredSchemas || requiredSchemas.length === 0) {
    return true;
  }
  for (const req of requiredSchemas) {
    const schema = await imodelAccess.getSchema(req.name);
    if (!schema) {
      return false;
    }
    if (req.minVersion && !isSchemaVersionAtLeast(schema.version, req.minVersion)) {
      return false;
    }
    if (req.maxVersion && !isSchemaVersionBelow(schema.version, req.maxVersion)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns `true` if `className` is or derives from the given class spec.
 * When `classSpec` is `undefined` the rule applies to all classes.
 *
 * @internal
 */
export async function classMatchesSpec(
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">,
  className: EC.FullClassNameDotNotation,
  classSpec: PresentationRules.SingleSchemaClassSpecification | undefined,
): Promise<boolean> {
  if (!classSpec) {
    return true;
  }
  return imodelAccess.classDerivesFrom(className, `${classSpec.schemaName}.${classSpec.className}`);
}

/**
 * Extracts a plain string category ID from a `CategoryIdentifier`.
 * Returns `undefined` for all non-`Id` forms (`None`, `DefaultParent`, `Root`), which are not
 * supported by these factories and fall back to the default category.
 *
 * @internal
 */
export function resolveCategoryId(id: PresentationRules.PropertySpecification["categoryId"]): string | undefined {
  if (id === undefined) {
    return undefined;
  }
  if (typeof id === "string") {
    return id;
  }
  if (id.type === "Id") {
    return id.categoryId;
  }
  return undefined;
}

/**
 * Maps an array of `PropertyCategorySpecification` into a `Record<id, CategoryDefinition>`.
 *
 * @internal
 */
export function mapPropertyCategories(
  specs: PresentationRules.PropertyCategorySpecification[],
): Record<CategoryDefinition["id"], CategoryDefinition> {
  const categories: Record<CategoryDefinition["id"], CategoryDefinition> = {};
  for (const spec of specs) {
    const cat: CategoryDefinition = {
      id: spec.id,
      label: spec.label,
      parentId: resolveCategoryId(spec.parentId),
      description: spec.description,
    };
    categories[cat.id] = cat;
  }
  return categories;
}
