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
import { Content, Item, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { waitFor } from "@testing-library/react";
import {
  NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE,
  NavigationPropertyItemsLoader,
  useNavigationPropertyTargetsLoader,
  useNavigationPropertyTargetsRuleset,
} from "../../../presentation-components/properties/inputs/UseNavigationPropertyTargetsLoader";
import { UNIQUE_PROPERTY_VALUES_BATCH_SIZE } from "../../../presentation-components/properties/inputs/UseUniquePropertyValuesLoader";
import { createTestContentDescriptor, createTestContentItem } from "../../_helpers/Content";
import { renderHook } from "../../TestUtils";

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

    await waitFor(() => expect(result.current.isLoading).to.eq(false));
    expect(result.current.selectOptions).to.be.empty;
    expect(result.current.loadedOptions).to.be.empty;
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
      await waitFor(() => {
        expect(result.current.isLoading).to.eq(false);
      });
      expect(result.current.selectOptions).to.be.empty;
      expect(result.current.loadedOptions).to.be.empty;
    });

    it("loads targets", async () => {
      const contentItem = createTestContentItem({
        label: LabelDefinition.fromLabelString("testLabel"),
        primaryKeys: [{ className: "class", id: "1" }],
        displayValues: {},
        values: {},
      });
      getContentIteratorStub.callsFake(async () => {
        return { total: 1, descriptor: createTestContentDescriptor({ fields: [] }), items: createAsyncIterator([contentItem]) };
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

      await waitFor(() => {
        expect(result.current.selectOptions).to.have.lengthOf(1);
        expect(result.current.loadedOptions).to.have.lengthOf(1);
        expect(result.current.loadedOptions[0]).to.contain({ label: contentItem.label, key: contentItem.primaryKeys[0] });
      });
    });

    it("loads full batch of targets and sets 'hasMore' flag to true", async () => {
      const contentItems: Item[] = []; // Array.from({ length: NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE }, () => createTestContentItem({ displayValues: {}, values: {} }));
      for (let i = 0; i < NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE; i++) {
        contentItems.push(createTestContentItem({ label: i.toString(), displayValues: {}, values: {} }));
      }
      // eslint-disable-next-line no-console
      console.log(contentItems.length);
      getContentIteratorStub.callsFake(async () => {
        return {
          total: contentItems.length,
          descriptor: createTestContentDescriptor({ fields: [], categories: [] }),
          items: createAsyncIterator(contentItems),
        };
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] }, filterText: "" },
      });

      await waitFor(() => {
        // add 1 for the filter reminder option
        expect(result.current.selectOptions).to.have.lengthOf(NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE + 1);
        expect(result.current.loadedOptions).to.have.lengthOf(NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE);
      });
    });

    it("loads targets using provided filter string", async () => {
      getContentIteratorStub.callsFake(async () => {
        return { total: 0, descriptor: createTestContentDescriptor({ fields: [], categories: [] }), items: createAsyncIterator([]) };
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] }, filterText: "testFilter" },
      });

      await waitFor(() => expect(result.current.isLoading).to.eq(false));
      await waitFor(() => expect(getContentIteratorStub).to.be.calledThrice);
      const descriptor = getContentIteratorStub.getCall(2).args[0].descriptor;
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

      await waitFor(() => expect(result.current.isLoading).to.eq(false));
      expect(result.current.selectOptions).to.be.empty;
      expect(result.current.loadedOptions).to.be.empty;
    });

    it("loads targets", async () => {
      const contentItem = createTestContentItem({
        label: LabelDefinition.fromLabelString("testLabel"),
        primaryKeys: [{ className: "class", id: "1" }],
        displayValues: {},
        values: {},
      });
      getContentStub.callsFake(async () => {
        return new Content(createTestContentDescriptor({ fields: [] }), [contentItem]);
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

      await waitFor(() => expect(result.current.isLoading).to.eq(false));
      expect(result.current.selectOptions).to.have.lengthOf(1);
      expect(result.current.loadedOptions).to.have.lengthOf(1);
      expect(result.current.loadedOptions[0]).to.contain({ label: contentItem.label, key: contentItem.primaryKeys[0] });
    });

    it("loads full batch of targets and sets 'hasMore' flag to true", async () => {
      const contentItems = Array.from({ length: NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE }, () => createTestContentItem({ displayValues: {}, values: {} }));
      getContentStub.callsFake(async () => {
        return new Content(createTestContentDescriptor({ fields: [], categories: [] }), contentItems);
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } } });

      await waitFor(() => {
        // add 1 for the filter reminder option
        expect(result.current.selectOptions).to.have.lengthOf(NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE + 1);
        expect(result.current.loadedOptions).to.have.lengthOf(NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE);
      });
    });

    it("loads targets using provided filter string", async () => {
      getContentStub.callsFake(async () => {
        return new Content(createTestContentDescriptor({ fields: [], categories: [] }), []);
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] }, filterText: "testFilter" },
      });

      await waitFor(() => expect(result.current.isLoading).to.eq(false));
      await waitFor(() => expect(getContentStub).to.be.calledThrice);
      const descriptor = getContentStub.getCall(2).args[0].descriptor;
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

describe("Navigation property items loader", () => {
  const getItemsStub = sinon.stub();

  beforeEach(() => {
    getItemsStub.callsFake(() => {
      return Array.from({ length: NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE }, () => {
        return { label: { displayValue: "filterText" }, key: { id: "0x01" } };
      });
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("does not load items when filter is empty", async () => {
    const itemsLoader = new NavigationPropertyItemsLoader(
      () => {},
      () => {},
      () => getItemsStub(),
    );
    await itemsLoader.loadItems();

    expect(itemsLoader.needsLoadingItems("")).to.be.false;
  });

  it("does not load items when loaded options matches the filter", async () => {
    const itemsLoader = new NavigationPropertyItemsLoader(
      () => {},
      () => {},
      () => getItemsStub(),
    );
    await itemsLoader.loadItems();

    expect(itemsLoader.needsLoadingItems("filterText")).to.be.false;
  });

  it("does not load items when another load process is in progress", async () => {
    const spy = sinon.spy();
    const itemsLoader = new NavigationPropertyItemsLoader(
      () => {},
      () => spy,
      () => getItemsStub(),
    );
    await Promise.all([itemsLoader.loadItems("filterText"), itemsLoader.loadItems("filterText")]);

    expect(spy.calledOnce);
  });

  it("does not load duplicate items", async () => {
    const loadedItems = [];
    const itemsLoader = new NavigationPropertyItemsLoader(
      () => {},
      (newItems) => loadedItems.push(...newItems),
      () => getItemsStub(),
    );
    await itemsLoader.loadItems("filterText");
    await itemsLoader.loadItems("filterText");

    expect(loadedItems.length).to.be.eq(UNIQUE_PROPERTY_VALUES_BATCH_SIZE);
  });
});
