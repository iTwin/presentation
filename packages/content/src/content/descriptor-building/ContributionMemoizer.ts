/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ContentTarget } from "../ContentTarget.js";
import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";

/** The contribution returned by an `IModelFieldsProvider`, with `undefined` meaning "not applicable". */
type FieldsProviderContribution = Awaited<ReturnType<IModelFieldsProvider["getContribution"]>>;

/** The iModel access shape required by `IModelFieldsProvider.getContribution`. */
type ContributionIModelAccess = Parameters<IModelFieldsProvider["getContribution"]>[0]["imodelAccess"];

/**
 * Re-fetches `IModelFieldsProvider` contributions during descriptor building (Stage 2).
 *
 * Descriptor building re-calls providers to recover declaration metadata (property specs,
 * cardinality hints, calculated fields, categories). A single provider may be queried multiple
 * times for the same target while enumerating its resolved declaration groups, so results are
 * memoized per `(provider, target)` to avoid redundant `getContribution` calls.
 *
 * Why the same `(provider, target)` is queried repeatedly: a provider can return several
 * `relatedProperties` declarations, and Stage 1 turns each one that resolves into a separate
 * `ResolvedDeclarationGroup` — all sharing the provider's id and the target but differing by
 * `declarationIndex`. Stage 2 processes each group by re-reading
 * `contribution.relatedProperties[declarationIndex]`, and additionally reads the same
 * contribution's `calculatedFields` and `categories`. For example, a provider declaring both
 * `Pump → PumpType` (index 0) and `Pump → OperatingParametersAspect` (index 1) yields two groups
 * for the `Pump` target; without memoization each group (plus the calculated-fields and categories
 * passes) would re-invoke `getContribution` for the same `Pump` target.
 *
 * The cache is keyed by the target *object reference* (via a `WeakMap`). Within a single build the
 * same `ContentTarget` instance is reused across all of a source's declaration groups, so identity
 * is a sufficient key — and, unlike a value-based key, it never serializes the target's
 * (potentially very large) `instanceIds`.
 *
 * @internal
 */
export function createContributionMemoizer(props: { imodelAccess: ContributionIModelAccess }): {
  getContribution(provider: IModelFieldsProvider, target: ContentTarget): Promise<FieldsProviderContribution>;
} {
  const { imodelAccess } = props;
  const cache = new WeakMap<ContentTarget, Map<IModelFieldsProvider["id"], Promise<FieldsProviderContribution>>>();
  return {
    async getContribution(provider, target) {
      let byProvider = cache.get(target);
      if (!byProvider) {
        byProvider = new Map();
        cache.set(target, byProvider);
      }
      // Cached values are always promises (truthy), so `undefined` unambiguously means "not cached"
      // — even when a provider's contribution resolves to `undefined` (not applicable).
      let contribution = byProvider.get(provider.id);
      if (contribution === undefined) {
        contribution = provider.getContribution({ imodelAccess, target });
        byProvider.set(provider.id, contribution);
      }
      return contribution;
    },
  };
}
