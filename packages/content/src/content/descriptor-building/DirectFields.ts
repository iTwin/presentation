/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass, normalizeFullClassName } from "@itwin/presentation-shared";
import { getOrCreate } from "../InternalUtils.js";
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
 * base class and applied mixin reachable from it — to the concretes that derive from (or equal) it.
 * Names are normalized, which both deduplicates the closure and suits the consumer (`getClass`
 * accepts either notation).
 */
async function collectDeclaringClassClosure(
  imodelAccess: ECSchemaProvider,
  concreteClassNames: EC.FullClassNameDotNotation[],
): Promise<Map<EC.FullClassNameDotNotation, Set<EC.FullClassNameDotNotation>>> {
  const closure = new Map<EC.FullClassNameDotNotation, Set<EC.FullClassNameDotNotation>>();
  await Promise.all(
    concreteClassNames.map(async (concreteClassName) => {
      const pending: EC.Class[] = [await getClass(imodelAccess, concreteClassName)];
      const visited = new Set<EC.FullClassNameDotNotation>();
      while (pending.length > 0) {
        const ecClass = pending.pop()!;
        const declaringClassName = normalizeFullClassName(ecClass.fullName);
        if (visited.has(declaringClassName)) {
          continue;
        }
        visited.add(declaringClassName);
        getOrCreate({
          map: closure,
          key: declaringClassName,
          createFunc: () => new Set<EC.FullClassNameDotNotation>(),
        }).add(concreteClassName);
        const baseClass = await ecClass.baseClass;
        if (baseClass) {
          pending.push(baseClass);
        }
        if (ecClass.isEntityClass()) {
          pending.push(...(await ecClass.getMixins()));
        }
      }
    }),
  );
  return closure;
}
