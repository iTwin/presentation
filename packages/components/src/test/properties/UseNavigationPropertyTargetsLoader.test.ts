/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyDescription } from "@itwin/appui-abstract";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Content, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import {
  NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE,
  NavigationPropertyTarget,
  useNavigationPropertyTargetsLoader,
  useNavigationPropertyTargetsRuleset,
} from "../../presentation-components/properties/UseNavigationPropertyTargetsLoader";
import { createTestContentDescriptor, createTestContentItem } from "../_helpers/Content";
import { renderHook, waitFor } from "../TestUtils";

describe("useNavigationPropertyTargetsLoader", () => {
  const testImodel = {} as IModelConnection;
  const getContentStub = sinon.stub<Parameters<PresentationManager["getContent"]>, ReturnType<PresentationManager["getContent"]>>();

  before(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
    sinon.stub(Presentation, "presentation").get(() => ({
      getContent: getContentStub,
    }));
  });

  after(async () => {
    sinon.restore();
  });

  beforeEach(() => {
    getContentStub.reset();
  });

  it("returns empty targets array if ruleset is undefined", async () => {
    const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel } });

    const { options, hasMore } = await result.current("", 0);
    expect(getContentStub).to.not.be.called;
    expect(options).to.be.empty;
    expect(hasMore).to.be.false;
  });

  it("loads targets", async () => {
    const contentItem = createTestContentItem({
      label: LabelDefinition.fromLabelString("testLabel"),
      primaryKeys: [{ className: "class", id: "1" }],
      displayValues: {},
      values: {},
    });
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [] }), [contentItem]));

    const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

    const { options, hasMore } = await result.current("", 0);
    expect(options).to.have.lengthOf(1);
    expect(options[0]).to.contain({ label: contentItem.label, key: contentItem.primaryKeys[0] });
    expect(hasMore).to.be.false;
  });

  it("loads targets with offset", async () => {
    const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

    const loadedTargets: NavigationPropertyTarget[] = [
      { label: LabelDefinition.fromLabelString("test1"), key: { className: "class", id: "1" } },
      { label: LabelDefinition.fromLabelString("test2"), key: { className: "class", id: "2" } },
    ];
    await result.current("", loadedTargets.length);
    expect(getContentStub).to.be.calledOnce;
    expect(getContentStub.getCall(0).args[0]).to.containSubset({ paging: { start: loadedTargets.length } });
  });

  it("loads full batch of targets and sets 'hasMore' flag to true", async () => {
    const contentItems = Array.from({ length: NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE }, () => createTestContentItem({ displayValues: {}, values: {} }));
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), contentItems));

    const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

    const { options, hasMore } = await result.current("", 0);
    expect(options).to.have.lengthOf(NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE);
    expect(hasMore).to.be.true;
  });

  it("loads targets using provided filter string", async () => {
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), []));

    const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

    await result.current("testFilter", 0);
    expect(getContentStub).to.be.calledOnce;
    const descriptor = getContentStub.getCall(0).args[0].descriptor;
    expect(descriptor.fieldsFilterExpression).to.contain("testFilter");
  });
});

describe("useNavigationPropertyTargetsRuleset", () => {
  interface Props {
    getNavigationPropertyInfo: (property: PropertyDescription) => Promise<NavigationPropertyInfo | undefined>;
    property: PropertyDescription;
  }

  it("creates ruleset for target class", async () => {
    const testInfo: NavigationPropertyInfo = {
      classInfo: { id: "1", label: "Relationship Class", name: "TestSchema:RelationshipClass" },
      isForwardRelationship: true,
      isTargetPolymorphic: true,
      targetClassInfo: { id: "2", label: "Target Class", name: "TestSchema:TargetClass" },
    };
    const propertyDescription: PropertyDescription = { displayLabel: "TestProp", name: "test_prop", typename: "navigation" };
    const { result } = renderHook(
      ({ getNavigationPropertyInfo, property }: Props) => useNavigationPropertyTargetsRuleset(getNavigationPropertyInfo, property),
      { initialProps: { getNavigationPropertyInfo: async () => testInfo, property: propertyDescription } },
    );

    await waitFor(() => expect(result.current).to.not.be.undefined);
    const ruleset = result.current;
    expect(ruleset).to.containSubset({
      rules: [
        {
          specifications: [
            {
              classes: { schemaName: "TestSchema", classNames: ["TargetClass"], arePolymorphic: true },
            },
          ],
        },
      ],
    });
  });

  it("returns undefined if navigation property info is undefined", () => {
    const propertyDescription: PropertyDescription = { displayLabel: "TestProp", name: "test_prop", typename: "navigation" };
    const { result } = renderHook(
      ({ getNavigationPropertyInfo, property }: Props) => useNavigationPropertyTargetsRuleset(getNavigationPropertyInfo, property),
      { initialProps: { getNavigationPropertyInfo: async () => undefined, property: propertyDescription } },
    );

    const ruleset = result.current;
    expect(ruleset).to.be.undefined;
  });
});
