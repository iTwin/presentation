/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { createContributionMemoizer } from "../content/ContributionMemoizer.js";

import type { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentTarget } from "../content/ContentTarget.js";
import type { IModelFieldsProvider } from "../content/extensions/IModelFieldsProvider.js";

type Contribution = Awaited<ReturnType<IModelFieldsProvider["getContribution"]>>;

const imodelAccess = {} as ECSchemaProvider & ECClassHierarchyInspector;

function createProvider(id: IModelFieldsProvider["id"], contribution: Contribution) {
  const getContribution = vi.fn<IModelFieldsProvider["getContribution"]>(async () => contribution);
  const provider: IModelFieldsProvider = { id, getContribution };
  return { provider, getContribution };
}

describe("createContributionMemoizer", () => {
  it("calls the provider once per (provider, target) and returns the cached result", async () => {
    const contribution: Contribution = { calculatedFields: [] };
    const { provider, getContribution } = createProvider("p_v1", contribution);
    const target: ContentTarget = { primaryClass: "Schema.A" };
    const memoizer = createContributionMemoizer({ imodelAccess });

    expect(await memoizer.getContribution(provider, target)).to.equal(contribution);
    expect(await memoizer.getContribution(provider, target)).to.equal(contribution);
    expect(getContribution).toHaveBeenCalledTimes(1);
    expect(getContribution).toHaveBeenCalledWith({ imodelAccess, target });
  });

  it("caches an 'undefined' (not applicable) contribution without re-invoking the provider", async () => {
    const { provider, getContribution } = createProvider("p_v1", undefined);
    const target: ContentTarget = { primaryClass: "Schema.A" };
    const memoizer = createContributionMemoizer({ imodelAccess });

    expect(await memoizer.getContribution(provider, target)).to.be.undefined;
    expect(await memoizer.getContribution(provider, target)).to.be.undefined;
    expect(getContribution).toHaveBeenCalledTimes(1);
  });

  it("distinguishes different providers for the same target", async () => {
    const p1 = createProvider("p1_v1", { calculatedFields: [] });
    const p2 = createProvider("p2_v1", { calculatedFields: [] });
    const target: ContentTarget = { primaryClass: "Schema.A" };
    const memoizer = createContributionMemoizer({ imodelAccess });

    await memoizer.getContribution(p1.provider, target);
    await memoizer.getContribution(p2.provider, target);

    expect(p1.getContribution).toHaveBeenCalledTimes(1);
    expect(p2.getContribution).toHaveBeenCalledTimes(1);
  });

  it("reuses the cached contribution across repeated lookups for the same target reference", async () => {
    // Mirrors Stage 2 enumerating several declaration groups (plus the calculated-fields and
    // categories passes) for one target — all sharing the same target object.
    const { provider, getContribution } = createProvider("p_v1", { calculatedFields: [] });
    const target: ContentTarget = { primaryClass: "Schema.A", instanceIds: ["0x1", "0x2", "0x3"] };
    const memoizer = createContributionMemoizer({ imodelAccess });

    for (let i = 0; i < 5; ++i) {
      await memoizer.getContribution(provider, target);
    }

    expect(getContribution).toHaveBeenCalledTimes(1);
  });

  it("does not share the cache between distinct target objects, even with equal contents", async () => {
    // The cache is keyed by target reference, so two equal-but-distinct targets are separate
    // entries. This is the behavior that lets us avoid serializing (potentially very large)
    // `instanceIds` into a key; equal-but-distinct targets do not occur within a single build.
    const { provider, getContribution } = createProvider("p_v1", { calculatedFields: [] });
    const memoizer = createContributionMemoizer({ imodelAccess });

    await memoizer.getContribution(provider, { primaryClass: "Schema.A", instanceIds: ["0x1"] });
    await memoizer.getContribution(provider, { primaryClass: "Schema.A", instanceIds: ["0x1"] });

    expect(getContribution).toHaveBeenCalledTimes(2);
  });
});
