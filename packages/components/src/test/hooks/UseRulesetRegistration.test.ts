/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisteredRuleset } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { useRulesetRegistration } from "../../presentation-components/hooks/UseRulesetRegistration.js";
import { renderHook } from "../TestUtils.js";

import type { Ruleset } from "@itwin/presentation-common";
import type { PresentationManager, RulesetManager } from "@itwin/presentation-frontend";

/* eslint-disable @typescript-eslint/no-deprecated */

describe("[deprecated] useRulesetRegistration", () => {
  interface HookProps {
    ruleset: Ruleset;
  }
  const initialProps: HookProps = { ruleset: { id: "test-ruleset", rules: [] } };

  const rulesetManagerStub = { add: vi.fn<RulesetManager["add"]>(), remove: vi.fn<RulesetManager["remove"]>() };

  beforeEach(() => {
    vi.spyOn(Presentation, "presentation", "get").mockReturnValue({
      rulesets: () => rulesetManagerStub,
    } as unknown as PresentationManager);
  });

  afterEach(() => {
    rulesetManagerStub.add.mockReset();
    rulesetManagerStub.remove.mockReset();
  });

  it("registers and un-registers ruleset", async () => {
    const registeredRulesetPromise = new ResolvablePromise<RegisteredRuleset>();
    rulesetManagerStub.add.mockReturnValue(registeredRulesetPromise);
    const { unmount } = renderHook((props: HookProps) => useRulesetRegistration(props.ruleset), { initialProps });

    const registered = new RegisteredRuleset(initialProps.ruleset, "testId", async (r) =>
      Presentation.presentation.rulesets().remove(r),
    );
    await registeredRulesetPromise.resolve(registered);

    expect(rulesetManagerStub.add).toHaveBeenCalledWith(initialProps.ruleset);

    unmount();

    expect(rulesetManagerStub.remove).toHaveBeenCalled();

    // this check fails in `StrictMode` due to ruleset registration happening during render cycle
    // expect(rulesetManagerStub.add.callCount).toBe(rulesetManagerStub.remove.callCount);
  });

  it("unregisters ruleset if registration happens after unmount", async () => {
    const registeredRulesetPromise = new ResolvablePromise<RegisteredRuleset>();
    rulesetManagerStub.add.mockReturnValue(registeredRulesetPromise);
    const { unmount } = renderHook((props: HookProps) => useRulesetRegistration(props.ruleset), { initialProps });

    const registered = new RegisteredRuleset(initialProps.ruleset, "testId", async (r) =>
      Presentation.presentation.rulesets().remove(r),
    );
    unmount();

    expect(rulesetManagerStub.add).toHaveBeenCalledWith(initialProps.ruleset);

    await registeredRulesetPromise.resolve(registered);

    expect(rulesetManagerStub.remove).toHaveBeenCalled();
    // this check fails in `StrictMode` due to ruleset registration happening during render cycle
    // expect(rulesetManagerStub.add.callCount).toBe(rulesetManagerStub.remove.callCount);
  });
});
