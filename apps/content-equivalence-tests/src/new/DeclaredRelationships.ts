/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createIModelContentConfiguration } from "@itwin/presentation-content";
import { getClass } from "@itwin/presentation-shared";
import { stableStringify } from "../Persistence.js";

import type { ContentConfiguration, ReadonlyPropertyField } from "@itwin/presentation-content";
import type { EC, ECSchemaProvider, ECSqlQueryExecutor, RelationshipPath } from "@itwin/presentation-shared";

type ConcretePath = ReadonlyPropertyField["pathFromTarget"];
type DeclaredStep = RelationshipPath[number];

async function getOrCreate<T>(cache: Map<string, Promise<T>>, key: string, create: () => Promise<T>): Promise<T> {
  let value = cache.get(key);
  if (!value) {
    value = create();
    cache.set(key, value);
  }
  return value;
}

/**
 * Creates a function that recovers the relationships selected by provider declarations for a field's concrete
 * `pathFromTarget`. The path is matched against declarations contributed for the field's primary classes; path
 * steps past a matching declaration are matched against nested contributions of `applyRecursively` providers,
 * applied on the concrete class the declaration ends at.
 */
export async function createDeclaredRelationshipsResolver(
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor,
): Promise<(field: ReadonlyPropertyField) => Promise<EC.FullClassNameDotNotation[]>> {
  const config: ContentConfiguration = await createIModelContentConfiguration({ imodelAccess });
  const providers = config.imodelFieldsProviders ?? [];

  const declaredPathsCache = new Map<string, Promise<RelationshipPath[]>>();
  const getDeclaredPaths = async (primaryClass: EC.FullClassNameDotNotation, nested: boolean) =>
    getOrCreate(declaredPathsCache, `${nested}#${primaryClass}`, async () => {
      const contributions = await Promise.all(
        providers
          .filter((provider) => !nested || provider.applyRecursively)
          .map(async (provider) => provider.getContribution({ imodelAccess, target: { primaryClass } })),
      );
      return contributions
        .flatMap((contribution) => contribution?.relatedProperties ?? [])
        .filter((declaration) => !nested || !declaration.resolve)
        .map((declaration) => declaration.path)
        .filter((path) => path.length > 0);
    });

  const derivesFromCache = new Map<string, Promise<boolean>>();
  const derivesFrom = async (
    derivedClassName: EC.FullClassNameDotNotation,
    baseClassName: EC.FullClassNameDotNotation,
  ) => {
    return getOrCreate(derivesFromCache, `${derivedClassName}->${baseClassName}`, async () => {
      const [derivedClass, baseClass] = await Promise.all([
        getClass(imodelAccess, derivedClassName),
        getClass(imodelAccess, baseClassName),
      ]);
      return derivedClass.is(baseClass);
    });
  };

  const stepMatches = async (concrete: ConcretePath[number], declared: DeclaredStep) =>
    (concrete.relationshipReverse ?? false) === (declared.relationshipReverse ?? false) &&
    stableStringify(concrete.instanceFilter) === stableStringify(declared.instanceFilter) &&
    (await derivesFrom(concrete.relationshipName, declared.relationshipName)) &&
    (await derivesFrom(concrete.targetClassName, declared.targetClassName));

  const matchFrom = async (
    path: ConcretePath,
    start: number,
    primaryClass: EC.FullClassNameDotNotation,
    nested: boolean,
  ): Promise<EC.FullClassNameDotNotation[][]> => {
    const matches = await Promise.all(
      (await getDeclaredPaths(primaryClass, nested)).map(async (declared) => {
        const matchedLength = Math.min(declared.length, path.length - start);
        for (let i = 0; i < matchedLength; ++i) {
          if (!(await stepMatches(path[start + i], declared[i]))) {
            return [];
          }
        }
        const names = declared.slice(0, matchedLength).map((step) => step.relationshipName);
        if (start + matchedLength === path.length) {
          return [names];
        }
        const anchorClassName = path[start + matchedLength - 1].targetClassName;
        const suffixes = await matchFrom(path, start + matchedLength, anchorClassName, true);
        return suffixes.map((suffix) => [...names, ...suffix]);
      }),
    );
    return matches.flat();
  };

  return async (field) => {
    const candidates = (
      await Promise.all(
        field.primaryClassNames.map(async (primaryClass) => matchFrom(field.pathFromTarget, 0, primaryClass, false)),
      )
    ).flat();
    const distinct = [...new Map(candidates.map((names) => [stableStringify(names), names])).values()];
    if (distinct.length !== 1) {
      throw new Error(
        `Expected one declaration matching the path of field '${field.id}', found ${distinct.length}: ${stableStringify(distinct)}.`,
      );
    }
    return distinct[0];
  };
}
