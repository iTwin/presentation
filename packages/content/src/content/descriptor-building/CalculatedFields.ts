/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collectInParallel } from "../InternalUtils.js";

import type { ContentSource } from "../ContentTarget.js";
import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";
import type { CalculatedField, Field } from "../model/Field.js";

/** Re-fetches an `IModelFieldsProvider` contribution for a target (see `createContributionMemoizer`). */
type GetContribution = (
  provider: IModelFieldsProvider,
  target: ContentSource["target"],
) => ReturnType<IModelFieldsProvider["getContribution"]>;

/**
 * Collects the `CalculatedField`s contributed by the configured providers.
 *
 * Each provider's contribution (re-fetched per source target) may declare calculated fields — ECSQL
 * expressions evaluated in the query. A field's global id is `${providerId}:${localId}`, and its
 * `selectorId` equals that id (each calculated field backs its own selector). The same provider
 * contributes the same calculated fields for every target, so results are deduplicated by id.
 *
 * @internal
 */
export async function collectCalculatedFields(props: {
  sources: ContentSource[];
  providers: IModelFieldsProvider[];
  getContribution: GetContribution;
}): Promise<Record<Field["id"], CalculatedField>> {
  const { sources, providers, getContribution } = props;
  const declared = await collectInParallel(sources, async (source) =>
    collectInParallel(providers, async (provider) => {
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
    result[id] = field;
  }
  return result;
}
