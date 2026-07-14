/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass, normalizeFullClassName } from "@itwin/presentation-shared";
import { collectClassPropertyFields } from "./ClassPropertyFields.js";

import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { CategorizedField } from "./ClassPropertyFields.js";

/**
 * Enumerates the **direct** property fields of a content source — the properties of the source's
 * primary class (and, for a polymorphic target, its resolved concrete subclasses), reached with no
 * relationship path (`pathFromTarget: []`).
 *
 * A polymorphic target (e.g. `BisCore.Element`) resolves to concrete classes (e.g. `Pump`, `Valve`)
 * whose subclass-specific properties must surface as direct fields too. To convert each property
 * exactly once, the enumeration visits every class in the resolved concretes' declaring-class
 * closure (each concrete plus its ancestors, deduplicated) and reads only that class's **own**
 * properties. Each field's `valueClassNames` are the resolved concrete classes that derive from the
 * declaring class — so an inherited property is attributed to all concretes, while a subclass's own
 * property is attributed only to the concretes under it. When no concrete classes were resolved,
 * the enumeration falls back to the normalized `primaryClass` alone.
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
    source.resolvedPrimaryClasses.length > 0
      ? source.resolvedPrimaryClasses.map(normalizeFullClassName)
      : [normalizeFullClassName(source.target.primaryClass)];

  // The declaring classes that can contribute a direct property (every concrete class plus all of
  // its ancestors), each mapped to the concretes that derive from it. Reading each class's *own*
  // properties then converts every property exactly once, at its unique declaring class.
  const derivedConcretesByDeclaringClass = await collectDeclaringClassClosure(imodelAccess, concreteClassNames);

  const perClass = await Promise.all(
    [...derivedConcretesByDeclaringClass].map(async ([declaringClass, derivedConcretes]) =>
      collectClassPropertyFields({
        imodelAccess,
        className: declaringClass,
        pathFromTarget: [],
        // Preserve the resolved-class order (the walk populates the set in arbitrary order).
        valueClassNames: concreteClassNames.filter((concreteClassName) => derivedConcretes.has(concreteClassName)),
        spec: { select: "all" },
        anchor: "none",
        excludeInherited: true,
      }),
    ),
  );
  return perClass.flat();
}

/**
 * Maps each declaring class in the given concrete classes' closure — each concrete class plus every
 * ancestor reachable through its `baseClass` chain — to the concretes that derive from (or equal)
 * it. Because walking a concrete's `baseClass` chain visits exactly the classes it derives from, the
 * derivation relationship falls out of the same traversal, with no extra hierarchy lookups. Names
 * are normalized, which both deduplicates the closure and suits the consumer (`getClass` accepts
 * either notation).
 */
async function collectDeclaringClassClosure(
  imodelAccess: ECSchemaProvider,
  concreteClassNames: EC.FullClassNameDotNotation[],
): Promise<Map<EC.FullClassNameDotNotation, Set<EC.FullClassNameDotNotation>>> {
  const closure = new Map<EC.FullClassNameDotNotation, Set<EC.FullClassNameDotNotation>>();
  await Promise.all(
    concreteClassNames.map(async (concreteClassName) => {
      let ecClass: EC.Class | undefined = await getClass(imodelAccess, concreteClassName);
      while (ecClass) {
        const declaringClassName = normalizeFullClassName(ecClass.fullName);
        let derivedConcretes = closure.get(declaringClassName);
        if (!derivedConcretes) {
          derivedConcretes = new Set();
          closure.set(declaringClassName, derivedConcretes);
        }
        derivedConcretes.add(concreteClassName);
        ecClass = await ecClass.baseClass;
      }
    }),
  );
  return closure;
}
