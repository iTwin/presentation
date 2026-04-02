/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeDuration } from "@itwin/core-bentley";
import { RegisteredRuleset } from "@itwin/presentation-common";
import { Presentation, RulesetManager } from "@itwin/presentation-frontend";
import { RulesetRegistrationHelper } from "../../presentation-components/common/RulesetRegistrationHelper.js";
import { createTestRuleset } from "../_helpers/Common.js";
import { createStub } from "../TestUtils.js";

describe("RulesetRegistrationHelper", () => {
  const rulesetManager = {
    add: createStub<RulesetManager["add"]>(),
  };

  beforeEach(() => {
    vi.spyOn(Presentation, "presentation", "get").mockReturnValue({ rulesets: () => rulesetManager } as any);
  });

  afterEach(() => {});

  it("does nothing when helper is created with ruleset id", () => {
    const rulesetId = "test";
    using registration = new RulesetRegistrationHelper(rulesetId);
    expect(registration.rulesetId).to.eq(rulesetId);
    expect(rulesetManager.add).not.toHaveBeenCalled();
  });

  it("registers ruleset when helper is created with ruleset object", async () => {
    const ruleset = createTestRuleset();
    const disposeSpy = vi.fn();
    rulesetManager.add.mockResolvedValue(new RegisteredRuleset(ruleset, "test-hash", disposeSpy));
    {
      using registration = new RulesetRegistrationHelper(ruleset);
      await BeDuration.wait(0); // handle the floating promise
      expect(registration.rulesetId).to.eq(ruleset.id);
      expect(rulesetManager.add).toHaveBeenCalledWith(ruleset);
    }
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it("registers ruleset when helper is created with RegisteredRuleset object", async () => {
    const disposeSpy = vi.fn();
    const ruleset = new RegisteredRuleset(createTestRuleset(), "test-hash-1", disposeSpy);
    rulesetManager.add.mockResolvedValue(new RegisteredRuleset(ruleset, "test-hash-2", disposeSpy));
    {
      using registration = new RulesetRegistrationHelper(ruleset);
      await BeDuration.wait(0); // handle the floating promise
      expect(registration.rulesetId).to.eq(ruleset.id);
      expect(rulesetManager.add).toHaveBeenCalledWith(ruleset.toJSON());
    }
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it("disposes ruleset immediately after registration if helper was disposed while registering", async () => {
    const ruleset = createTestRuleset();
    const disposeSpy = vi.fn();
    const result = new ResolvablePromise<RegisteredRuleset>();

    rulesetManager.add.mockReturnValue(result);
    {
      using registration = new RulesetRegistrationHelper(ruleset);
      expect(registration.rulesetId).to.eq(ruleset.id);
      expect(rulesetManager.add).toHaveBeenCalledWith(ruleset);
    }
    expect(disposeSpy).not.toHaveBeenCalled();
    await result.resolve(new RegisteredRuleset(ruleset, "test-hash", disposeSpy));
    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});
