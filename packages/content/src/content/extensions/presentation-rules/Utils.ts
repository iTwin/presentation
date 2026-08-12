/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { EC, ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import type { CategoryDefinition } from "../../model/Category.js";
import type * as PresentationRules from "./PresentationRules.js";

/**
 * Returns `true` if `version` is at or above `minVersion` (inclusive).
 * Comparison order: write > read > minor.
 *
 * @internal
 */
export function isVersionAtLeast(version: EC.SchemaVersion, minVersion: string): boolean {
  const [minRead, minWrite, minMinor] = minVersion.split(".").map(Number);
  if (version.write !== minWrite) {
    return version.write > minWrite;
  }
  if (version.read !== minRead) {
    return version.read > minRead;
  }
  return version.minor >= minMinor;
}

/**
 * Returns `true` if `version` is strictly below `maxVersion` (exclusive).
 * Comparison order: write > read > minor.
 *
 * @internal
 */
export function isVersionBelow(version: EC.SchemaVersion, maxVersion: string): boolean {
  const [maxRead, maxWrite, maxMinor] = maxVersion.split(".").map(Number);
  if (version.write !== maxWrite) {
    return version.write < maxWrite;
  }
  if (version.read !== maxRead) {
    return version.read < maxRead;
  }
  return version.minor < maxMinor;
}

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
    if (req.minVersion && !isVersionAtLeast(schema.version, req.minVersion)) {
      return false;
    }
    if (req.maxVersion && !isVersionBelow(schema.version, req.maxVersion)) {
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
  imodelAccess: ECClassHierarchyInspector,
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
