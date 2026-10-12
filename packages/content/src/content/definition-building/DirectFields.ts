/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { getOrCreate } from "../InternalUtils.js";
import { createPropertyFields } from "./ClassPropertyFields.js";

import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { CategorizedField } from "./ClassPropertyFields.js";

/**
 * Enumerates the **direct** property fields of a content source — the properties of the source's
 * primary class (and, for a polymorphic target, its resolved concrete subclasses), reached with no
 * relationship path (`pathFromTarget: []`).
 *
 * A polymorphic target (e.g. `BisCore.Element`) resolves to concrete classes (e.g. `Pump`, `Valve`)
 * whose subclass-specific properties must surface as direct fields too. The enumeration reads each
 * concrete class's **effective** properties (own, inherited and mixin), where a property redeclared
 * on a subclass replaces the base declaration. Each property is thus attributed to the topmost
 * declaration that is in effect for that concrete, never to the declarations it overrides. The
 * concretes sharing a declaration are collected first and the declaration is converted to a field
 * once, so an inherited property carries all the concretes it applies to, while an overriding
 * declaration carries only the concretes under it. When no concrete classes were resolved, the
 * enumeration falls back to the normalized `primaryClass` alone.
 *
 * Direct fields have no class-based category (`anchor: "none"`) and, being schema-derived, carry no
 * contributing provider.
 *
 * @internal
 */
export async function collectDirectPropertyFields(props: {
  imodelAccess: ECSchemaProvider;
  source: ContentSource;
}): Promise<CategorizedField[]> {
  const { imodelAccess, source } = props;
  const concreteClassNames =
    source.resolvedPrimaryClasses.length > 0 ? source.resolvedPrimaryClasses : [source.target.primaryClass];

  const concreteClasses = await Promise.all(
    concreteClassNames.map(async (concreteClassName) => getClass(imodelAccess, concreteClassName)),
  );

  const declarations = new Map<string, { property: EC.Property; valueClassNames: EC.FullClassNameDotNotation[] }>();
  for (const concreteClass of concreteClasses) {
    for (const property of concreteClass.getProperties()) {
      getOrCreate({
        map: declarations,
        key: `${property.class.fullName}:${property.name}`,
        createFunc: () => ({ property, valueClassNames: [] }),
      }).valueClassNames.push(concreteClass.fullName);
    }
  }

  return [...declarations.values()].flatMap(({ property, valueClassNames }) =>
    createPropertyFields({
      properties: [property],
      relationshipInfo: undefined,
      valueClassNames,
      spec: { select: "all" },
      anchor: "none",
    }),
  );
}
