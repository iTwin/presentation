/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collectInParallel, stableStringify } from "../InternalUtils.js";
import { toSortedUniqueClassNames } from "../model/Utils.js";

import type { ContentSource } from "../ContentTarget.js";
import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";
import type { CalculatedField, Field } from "../model/Field.js";
import type { GetContributionFn } from "./ContributionMemoizer.js";

/**
 * Collects the `CalculatedField`s contributed by the configured providers.
 *
 * Each provider's contribution (re-fetched per source target) may declare calculated fields — ECSQL
 * expressions evaluated in the query. A field's global id is `${providerId}:${localId}` and privately
 * identifies the field's value requirement. A provider may contribute the same local id for several targets; the
 * same calculated field must be one field/one selector across the descriptor. Declarations that
 * collapse to the same id are therefore deduplicated, but only after asserting they are structurally
 * identical (ignoring `primaryClassNames`, which is expected to differ per contributing target and is
 * unioned instead) — a divergence (different expression, type, category, etc. under one id) is a provider
 * bug and throws, mirroring the intra-provider check in `mergePropertyFieldsByIdentity`.
 * Source applicability is retained separately from the merged fields for query planning.
 *
 */
export async function collectCalculatedFields(props: {
  sources: ContentSource[];
  imodelFieldsProviders: IModelFieldsProvider[];
  getContribution: GetContributionFn;
}): Promise<{ fields: Record<Field["id"], CalculatedField>; fieldIdsBySource: Map<ContentSource, Set<Field["id"]>> }> {
  const { sources, imodelFieldsProviders, getContribution } = props;
  const declared = await collectInParallel({
    inputs: sources,
    expand: async (source) =>
      collectInParallel({
        inputs: imodelFieldsProviders,
        expand: async (provider) => {
          const contribution = await getContribution({ provider, target: source.target });
          return (contribution?.calculatedFields ?? []).map((declaration) => ({
            source,
            providerId: provider.id,
            declaration,
            primaryClassNames:
              source.resolvedPrimaryClasses.length > 0 ? source.resolvedPrimaryClasses : [source.target.primaryClass],
          }));
        },
      }),
  });

  const result: Record<Field["id"], CalculatedField> = {};
  const fieldIdsBySource = new Map(sources.map((source) => [source, new Set<Field["id"]>()]));
  for (const { source, providerId, declaration, primaryClassNames } of declared) {
    const id = `${providerId}:${declaration.id}`;
    const field: CalculatedField = {
      kind: "calculated",
      id,
      label: declaration.label,
      type: declaration.type,
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
    fieldIdsBySource.get(source)!.add(id);
  }
  return { fields: result, fieldIdsBySource };
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
