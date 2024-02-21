/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { BeDuration, using } from "@itwin/core-bentley";
import { RegisteredRuleset } from "@itwin/presentation-common";
import { Presentation, RulesetManager } from "@itwin/presentation-frontend";
import { RulesetRegistrationHelper } from "../../presentation-components/common/RulesetRegistrationHelper";
import { createTestRuleset } from "../_helpers/Common";
import { ResolvablePromise } from "../_helpers/Promises";
import { createStub } from "../TestUtils";

describe("RulesetRegistrationHelper", () => {
  const rulesetManager = {
    add: createStub<RulesetManager["add"]>(),
  };

  beforeEach(() => {
    sinon.stub(Presentation, "presentation").get(() => ({
      rulesets: () => rulesetManager,
    }));
  });

  afterEach(() => {
    sinon.restore();
  });

  it("does nothing when helper is created with ruleset id", () => {
    const rulesetId = "test";
    using(new RulesetRegistrationHelper(rulesetId), (registration) => {
      expect(registration.rulesetId).to.eq(rulesetId);
      expect(rulesetManager.add).to.not.be.called;
    });
  });

  it("registers ruleset when helper is created with ruleset object", async () => {
    const ruleset = createTestRuleset();
    const disposeSpy = sinon.spy();
    rulesetManager.add.resolves(new RegisteredRuleset(ruleset, "test-hash", disposeSpy));
    await using(new RulesetRegistrationHelper(ruleset), async (registration) => {
      await BeDuration.wait(0); // handle the floating promise
      expect(registration.rulesetId).to.eq(ruleset.id);
      expect(rulesetManager.add).to.be.calledWith(ruleset);
    });
    expect(disposeSpy).to.be.calledOnce;
  });

  it("registers ruleset when helper is created with RegisteredRuleset object", async () => {
    const disposeSpy = sinon.spy();
    const ruleset = new RegisteredRuleset(createTestRuleset(), "test-hash-1", disposeSpy);
    rulesetManager.add.resolves(new RegisteredRuleset(ruleset, "test-hash-2", disposeSpy));
    await using(new RulesetRegistrationHelper(ruleset), async (registration) => {
      await BeDuration.wait(0); // handle the floating promise
      expect(registration.rulesetId).to.eq(ruleset.id);
      expect(rulesetManager.add).to.be.calledWith(ruleset.toJSON());
    });
    expect(disposeSpy).to.be.calledOnce;
  });

  it("disposes ruleset immediately after registration if helper was disposed while registering", async () => {
    const ruleset = createTestRuleset();
    const disposeSpy = sinon.spy();
    const result = new ResolvablePromise<RegisteredRuleset>();

    rulesetManager.add.returns(result);
    using(new RulesetRegistrationHelper(ruleset), (registration) => {
      expect(registration.rulesetId).to.eq(ruleset.id);
      expect(rulesetManager.add).to.be.calledWith(ruleset);
    });
    expect(disposeSpy).to.not.be.called;
    await result.resolve(new RegisteredRuleset(ruleset, "test-hash", disposeSpy));
    expect(disposeSpy).to.be.calledOnce;
  });
});
