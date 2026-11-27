/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass, normalizeFullClassName } from "@itwin/presentation-shared";

import type { DescriptorJSON, FieldJSON } from "@itwin/presentation-common";
import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";

/** Properties of legacy descriptors that the new pipeline doesn't show. */
export interface LegacyHiddenProperties {
  /** Accepts class names in both `Schema.Class` and `Schema:Class` formats. */
  has(className: string, propertyName: string): boolean;
}

/**
 * Finds properties in legacy descriptors that are declared on hidden classes (`HiddenClass`, inherited
 * from the nearest base class that sets it). Legacy includes them, while the new pipeline doesn't.
 * `ExternalSourceAspect.Identifier` is excluded, because both implementations show it.
 */
export async function getLegacyHiddenProperties(
  descriptors: DescriptorJSON[],
  schemaProvider: ECSchemaProvider,
): Promise<LegacyHiddenProperties> {
  const propertiesByClass = new Map<EC.FullClassNameDotNotation, Set<string>>();
  for (const descriptor of descriptors) {
    const visit = (field: FieldJSON<string>) => {
      if ("nestedFields" in field) {
        field.nestedFields.forEach(visit);
      } else if ("properties" in field) {
        for (const { property } of field.properties) {
          const className = normalizeFullClassName(descriptor.classesMap[property.classInfo].name);
          let properties = propertiesByClass.get(className);
          if (!properties) {
            properties = new Set();
            propertiesByClass.set(className, properties);
          }
          properties.add(property.name);
        }
      }
    };
    descriptor.fields.forEach(visit);
  }
  const hiddenProperties = new Set<string>();
  for (const [className, propertyNames] of propertiesByClass) {
    const propertyClass = await getClass(schemaProvider, className);
    for (const propertyName of propertyNames) {
      if (className === "BisCore.ExternalSourceAspect" && propertyName === "Identifier") {
        continue;
      }
      let declaringClass: EC.Class | undefined = propertyClass.getProperty(propertyName)!.class;
      while (declaringClass) {
        if (declaringClass.isHidden !== undefined) {
          if (declaringClass.isHidden) {
            hiddenProperties.add(`${className}.${propertyName}`);
          }
          break;
        }
        declaringClass = declaringClass.baseClass;
      }
    }
  }
  return {
    has: (className, propertyName) => hiddenProperties.has(`${normalizeFullClassName(className)}.${propertyName}`),
  };
}
