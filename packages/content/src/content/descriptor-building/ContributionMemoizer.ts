/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getOrCreate } from "../InternalUtils.js";

import type { Props } from "@itwin/presentation-shared";
import type { ContentTarget } from "../ContentTarget.js";
import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";

/** The contribution returned by an `IModelFieldsProvider`, with `undefined` meaning "not applicable". */
type GetContributionReturnType = ReturnType<IModelFieldsProvider["getContribution"]>;

/** The iModel access shape required by `IModelFieldsProvider.getContribution`. */
type ContributionIModelAccess = Props<IModelFieldsProvider["getContribution"]>["imodelAccess"];

/**
 * Re-fetches an `IModelFieldsProvider` contribution for a target — the memoized accessor produced by
 * {@link createContributionMemoizer} and consumed by the Stage 2 field/category/calculated-field
 * collectors.
 *
 * @internal
 */
export type GetContributionFn = (props: {
  provider: IModelFieldsProvider;
  target: ContentTarget;
}) => GetContributionReturnType;

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
  getContribution: GetContributionFn;
} {
  const { imodelAccess } = props;
  const cache = new WeakMap<ContentTarget, Map<IModelFieldsProvider["id"], GetContributionReturnType>>();
  return {
    getContribution: async ({ provider, target }) => {
      const byProvider = getOrCreate({ map: cache, key: target, createFunc: () => new Map() });
      // Cached values are always promises (truthy), so `undefined` unambiguously means "not cached"
      // — even when a provider's contribution resolves to `undefined` (not applicable).
      return getOrCreate({
        map: byProvider,
        key: provider.id,
        createFunc: async () => provider.getContribution({ imodelAccess, target }),
      });
    },
  };
}
