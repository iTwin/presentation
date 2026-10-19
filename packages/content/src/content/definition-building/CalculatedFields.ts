/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collectInParallel, stableStringify } from "../InternalUtils.js";
import { toSortedUniqueClassNames } from "../model/Utils.js";

import type { ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";
import type { CalculatedField, Field } from "../model/Field.js";
import type { GetContributionFn } from "./ContributionMemoizer.js";

/**
 * Collects the `CalculatedField`s contributed by the configured providers.
 *
 * Each provider's contribution (re-fetched per source target) may declare calculated fields — ECSQL
 * expressions evaluated in the query. A field's global id is `${providerId}:${localId}` and privately
 * identifies the field's value requirement. A field applies to its declared `sourceClassName` and
 * subclasses: its `primaryClassNames` are the source's resolved classes within that scope, and a
 * declaration with none in a source is dropped for it. A provider may contribute the same local id for
 * several targets; the same calculated field must be one field/one selector across the descriptor.
 * Declarations that collapse to the same id are therefore deduplicated, but only after asserting they
 * are structurally identical (ignoring `primaryClassNames`, which is expected to differ per
 * contributing target and is unioned instead) — a divergence (different expression, source class, type,
 * category, etc. under one id) is a provider bug and throws, mirroring the intra-provider check in
 * `mergePropertyFieldsByIdentity`.
 */
export async function collectCalculatedFields(props: {
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  sources: ContentSource[];
  imodelFieldsProviders: IModelFieldsProvider[];
  getContribution: GetContributionFn;
}): Promise<Record<Field["id"], CalculatedField>> {
  const { imodelAccess, sources, imodelFieldsProviders, getContribution } = props;
  const declared = await collectInParallel({
    inputs: sources,
    expand: async (source) =>
      collectInParallel({
        inputs: imodelFieldsProviders,
        expand: async (provider) => {
          const contribution = await getContribution({ provider, target: source.target });
          return collectInParallel({
            inputs: contribution?.calculatedFields ?? [],
            expand: async (declaration) => {
              const primaryClassNames = await resolveApplicableClasses({
                imodelAccess,
                source,
                fieldSourceClassName: declaration.sourceClassName,
              });
              return primaryClassNames.length > 0 ? [{ providerId: provider.id, declaration, primaryClassNames }] : [];
            },
          });
        },
      }),
  });

  const result: Record<Field["id"], CalculatedField> = {};
  for (const { providerId, declaration, primaryClassNames } of declared) {
    const id = `${providerId}:${declaration.id}`;
    const field: CalculatedField = {
      kind: "calculated",
      id,
      label: declaration.label,
      type: declaration.type,
      sourceClassName: declaration.sourceClassName,
      expression: declaration.expression,
      primaryClassNames,
    };
    if (declaration.targetAlias !== undefined) {
      field.targetAlias = declaration.targetAlias;
    }
    if (declaration.bindings !== undefined) {
      field.bindings = declaration.bindings;
    }
    if (declaration.categoryId !== undefined) {
      field.categoryId = declaration.categoryId;
    }

    const existing = id in result ? result[id] : undefined;
    if (existing && !calculatedFieldsAgree(existing, field)) {
      throw new Error(
        `Cannot merge calculated field "${id}": provider "${providerId}" produced divergent declarations for one id across targets.`,
      );
    }
    result[id] = existing
      ? { ...field, primaryClassNames: toSortedUniqueClassNames([...existing.primaryClassNames, ...primaryClassNames]) }
      : { ...field, primaryClassNames: toSortedUniqueClassNames(primaryClassNames) };
  }
  return result;
}

/**
 * The source's resolved classes a declaration for `sourceClassName` applies to: all of them when the
 * target's class derives from it, only the ones deriving from it when it is narrower than the target
 * (e.g. a pump field under a request for every element), and none when it is unrelated to the target.
 */
async function resolveApplicableClasses(props: {
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  source: ContentSource;
  fieldSourceClassName: CalculatedField["sourceClassName"];
}): Promise<CalculatedField["primaryClassNames"]> {
  const { imodelAccess, source, fieldSourceClassName } = props;
  const targetClass = source.target.primaryClass;
  const resolvedClasses = source.resolvedPrimaryClasses.length > 0 ? source.resolvedPrimaryClasses : [targetClass];
  if (
    fieldSourceClassName === targetClass ||
    (await imodelAccess.classDerivesFrom(targetClass, fieldSourceClassName))
  ) {
    return resolvedClasses;
  }
  if (!(await imodelAccess.classDerivesFrom(fieldSourceClassName, targetClass))) {
    return [];
  }
  const derivesFromSource = await Promise.all(
    resolvedClasses.map(async (className) => imodelAccess.classDerivesFrom(className, fieldSourceClassName)),
  );
  return resolvedClasses.filter((_, index) => derivesFromSource[index]);
}

/**
 * Structural equality for two calculated fields that collapsed to the same id, ignoring
 * `primaryClassNames` (expected to differ across contributing targets and unioned separately by the
 * caller). The fields carry nested value shapes (`type`) and `bindings` records that cannot be
 * compared by reference, so both are reduced to a canonical, key-sorted JSON form (minus
 * `primaryClassNames`) and compared as strings.
 */
function calculatedFieldsAgree(a: CalculatedField, b: CalculatedField): boolean {
  const { primaryClassNames: _aClasses, ...aRest } = a;
  const { primaryClassNames: _bClasses, ...bRest } = b;
  return stableStringify(aRest) === stableStringify(bRest);
}
