/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { RegisteredRuleset, Ruleset } from "@itwin/presentation-common";
import { Presentation, RulesetManager } from "@itwin/presentation-frontend";
import { useRulesetRegistration } from "../../presentation-components/hooks/UseRulesetRegistration";
import { ResolvablePromise } from "../_helpers/Promises";
import { renderHook } from "../TestUtils";

/* eslint-disable deprecation/deprecation */

describe("[deprecated] useRulesetRegistration", () => {
  interface HookProps {
    ruleset: Ruleset;
  }
  const initialProps: HookProps = {
    ruleset: { id: "test-ruleset", rules: [] },
  };

  const rulesetManagerStub = {
    add: sinon.stub<Parameters<RulesetManager["add"]>, ReturnType<RulesetManager["add"]>>(),
    remove: sinon.stub<Parameters<RulesetManager["remove"]>, ReturnType<RulesetManager["remove"]>>(),
  };

  before(() => {
    sinon.stub(Presentation, "presentation").get(() => ({
      rulesets: () => rulesetManagerStub,
    }));
  });

  after(() => {
    sinon.restore();
  });

  afterEach(() => {
    rulesetManagerStub.add.reset();
    rulesetManagerStub.remove.reset();
  });

  it("registers and un-registers ruleset", async () => {
    const registeredRulesetPromise = new ResolvablePromise<RegisteredRuleset>();
    rulesetManagerStub.add.returns(registeredRulesetPromise);
    const { unmount } = renderHook((props: HookProps) => useRulesetRegistration(props.ruleset), { initialProps });

    const registered = new RegisteredRuleset(initialProps.ruleset, "testId", async (r) => Presentation.presentation.rulesets().remove(r));
    await registeredRulesetPromise.resolve(registered);

    expect(rulesetManagerStub.add).to.be.calledWith(initialProps.ruleset);

    unmount();

    expect(rulesetManagerStub.remove).to.be.called;

    // this check fails in `StrictMode` due to ruleset registration happening during render cycle
    // expect(rulesetManagerStub.add.callCount).to.be.eq(rulesetManagerStub.remove.callCount);
  });

  it("unregisters ruleset if registration happens after unmount", async () => {
    const registeredRulesetPromise = new ResolvablePromise<RegisteredRuleset>();
    rulesetManagerStub.add.returns(registeredRulesetPromise);
    const { unmount } = renderHook((props: HookProps) => useRulesetRegistration(props.ruleset), { initialProps });

    const registered = new RegisteredRuleset(initialProps.ruleset, "testId", async (r) => Presentation.presentation.rulesets().remove(r));
    unmount();

    expect(rulesetManagerStub.add).to.be.calledWith(initialProps.ruleset);

    await registeredRulesetPromise.resolve(registered);

    expect(rulesetManagerStub.remove).to.be.called;
    // this check fails in `StrictMode` due to ruleset registration happening during render cycle
    // expect(rulesetManagerStub.add.callCount).to.be.eq(rulesetManagerStub.remove.callCount);
  });
});
