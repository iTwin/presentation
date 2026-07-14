/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collectInParallel, stableStringify } from "../InternalUtils.js";

import type { ContentSource } from "../ContentTarget.js";
import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";
import type { CalculatedField, Field } from "../model/Field.js";
import type { GetContribution } from "./ContributionMemoizer.js";

/**
 * Collects the `CalculatedField`s contributed by the configured providers.
 *
 * Each provider's contribution (re-fetched per source target) may declare calculated fields — ECSQL
 * expressions evaluated in the query. A field's global id is `${providerId}:${localId}`, and its
 * `selectorId` equals that id (each calculated field backs its own selector). A provider may
 * contribute the same local id for several targets; because the id doubles as the selector id, the
 * same calculated field must be one field/one selector across the descriptor. Declarations that
 * collapse to the same id are therefore deduplicated, but only after asserting they are structurally
 * identical — a divergence (different expression, type, category, etc. under one id) is a provider
 * bug and throws, mirroring the intra-provider check in `mergePropertyFieldsByIdentity`.
 *
 * @internal
 */
export async function collectCalculatedFields(props: {
  sources: ContentSource[];
  imodelFieldsProviders: IModelFieldsProvider[];
  getContribution: GetContribution;
}): Promise<Record<Field["id"], CalculatedField>> {
  const { sources, imodelFieldsProviders, getContribution } = props;
  const declared = await collectInParallel(sources, async (source) =>
    collectInParallel(imodelFieldsProviders, async (provider) => {
      const contribution = await getContribution(provider, source.target);
      return (contribution?.calculatedFields ?? []).map((declaration) => ({ providerId: provider.id, declaration }));
    }),
  );

  const result: Record<Field["id"], CalculatedField> = {};
  for (const { providerId, declaration } of declared) {
    const id = `${providerId}:${declaration.id}`;
    const field: CalculatedField = {
      kind: "calculated",
      id,
      label: declaration.label,
      type: declaration.type,
      expression: declaration.expression,
      selectorId: id,
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

    if (id in result && !calculatedFieldsAgree(result[id], field)) {
      throw new Error(
        `Cannot merge calculated field "${id}": provider "${providerId}" produced divergent declarations for one id across targets.`,
      );
    }
    result[id] = field;
  }
  return result;
}

/**
 * Structural equality for two calculated fields that collapsed to the same id. The fields carry
 * nested value shapes (`type`) and `bindings` records that cannot be compared by reference, so both
 * are reduced to a canonical, key-sorted JSON form and compared as strings.
 */
function calculatedFieldsAgree(a: CalculatedField, b: CalculatedField): boolean {
  return stableStringify(a) === stableStringify(b);
}
