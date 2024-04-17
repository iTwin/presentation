/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
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
} from "../../../presentation-components/properties/inputs/UseNavigationPropertyTargetsLoader";
import { createTestContentDescriptor, createTestContentItem } from "../../_helpers/Content";
import { renderHook, waitFor } from "../../TestUtils";

describe("useNavigationPropertyTargetsLoader", () => {
  let presentationManagerStub: sinon.SinonStub;
  const testImodel = {} as IModelConnection;

  before(() => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
  });

  after(() => {
    sinon.restore();
  });

  beforeEach(() => {
    presentationManagerStub = sinon.stub(Presentation, "presentation");
  });

  it("returns empty targets array if ruleset is undefined", async () => {
    const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel } });

    const { options, hasMore } = await result.current("", 0);
    expect(options).to.be.empty;
    expect(hasMore).to.be.false;
  });

  describe("when `getContentIterator` is available", () => {
    const getContentIteratorStub = sinon.stub<Parameters<PresentationManager["getContentIterator"]>, ReturnType<PresentationManager["getContentIterator"]>>();

    beforeEach(() => {
      getContentIteratorStub.reset();
      presentationManagerStub.get(() => ({
        getContentIterator: getContentIteratorStub,
      }));
    });

    it("returns empty targets array if there's no content", async () => {
      getContentIteratorStub.resolves(undefined);
      const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });
      const { options, hasMore } = await result.current("", 0);
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
      getContentIteratorStub.resolves({ total: 1, descriptor: createTestContentDescriptor({ fields: [] }), items: createAsyncIterator([contentItem]) });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

      const { options, hasMore } = await result.current("", 0);
      expect(options).to.have.lengthOf(1);
      expect(options[0]).to.contain({ label: contentItem.label, key: contentItem.primaryKeys[0] });
      expect(hasMore).to.be.false;
    });

    it("loads targets with offset", async () => {
      getContentIteratorStub.resolves({ total: 0, descriptor: createTestContentDescriptor({ fields: [], categories: [] }), items: createAsyncIterator([]) });
      const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

      const loadedTargets: NavigationPropertyTarget[] = [
        { label: LabelDefinition.fromLabelString("test1"), key: { className: "class", id: "1" } },
        { label: LabelDefinition.fromLabelString("test2"), key: { className: "class", id: "2" } },
      ];
      await result.current("", loadedTargets.length);
      expect(getContentIteratorStub).to.be.calledOnce;
      expect(getContentIteratorStub.getCall(0).args[0]).to.containSubset({ paging: { start: loadedTargets.length } });
    });

    it("loads full batch of targets and sets 'hasMore' flag to true", async () => {
      const contentItems = Array.from({ length: NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE }, () => createTestContentItem({ displayValues: {}, values: {} }));
      getContentIteratorStub.resolves({
        total: contentItems.length,
        descriptor: createTestContentDescriptor({ fields: [], categories: [] }),
        items: createAsyncIterator(contentItems),
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

      const { options, hasMore } = await result.current("", 0);
      expect(options).to.have.lengthOf(NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE);
      expect(hasMore).to.be.true;
    });

    it("loads targets using provided filter string", async () => {
      getContentIteratorStub.resolves({ total: 0, descriptor: createTestContentDescriptor({ fields: [], categories: [] }), items: createAsyncIterator([]) });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

      await result.current("testFilter", 0);
      expect(getContentIteratorStub).to.be.calledOnce;
      const descriptor = getContentIteratorStub.getCall(0).args[0].descriptor;
      expect(descriptor.fieldsFilterExpression).to.contain("testFilter");
    });
  });

  describe("when `getContentIterator` is not available", () => {
    const getContentStub = sinon.stub<Parameters<PresentationManager["getContent"]>, ReturnType<PresentationManager["getContent"]>>();

    beforeEach(() => {
      getContentStub.reset();
      presentationManagerStub.get(() => ({
        getContent: getContentStub,
      }));
    });

    it("returns empty targets array if there's no content", async () => {
      getContentStub.resolves(undefined);
      const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });
      const { options, hasMore } = await result.current("", 0);
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
      getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), []));
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
