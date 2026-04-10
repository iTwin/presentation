/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator } from "presentation-test-utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyDescription } from "@itwin/appui-abstract";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Content, Item, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { VALUE_BATCH_SIZE } from "../../../presentation-components/properties/inputs/ItemsLoader.js";
import {
  NavigationPropertyItemsLoader,
  NavigationPropertyTarget,
  useNavigationPropertyTargetsLoader,
  useNavigationPropertyTargetsRuleset,
} from "../../../presentation-components/properties/inputs/UseNavigationPropertyTargetsLoader.js";
import { createTestContentDescriptor, createTestContentItem } from "../../_helpers/Content.js";
import { renderHook, waitFor } from "../../TestUtils.js";

describe("useNavigationPropertyTargetsLoader", () => {
  const testImodel = {} as IModelConnection;

  beforeEach(() => {
    const localization = new EmptyLocalization();
    vi.spyOn(IModelApp, "initialized", "get").mockReturnValue(true);
    vi.spyOn(IModelApp, "localization", "get").mockReturnValue(localization);
    vi.spyOn(Presentation, "localization", "get").mockReturnValue(localization);
  });

  it("returns empty targets array if ruleset is undefined", async () => {
    const { result } = renderHook(useNavigationPropertyTargetsLoader, { initialProps: { imodel: testImodel } });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selectOptions).toHaveLength(0);
    expect(result.current.loadedOptions).toHaveLength(0);
  });

  describe("when `getContentIterator` is available", () => {
    const getContentIteratorStub = vi.fn<PresentationManager["getContentIterator"]>();

    beforeEach(() => {
      getContentIteratorStub.mockReset();
      vi.spyOn(Presentation, "presentation", "get").mockReturnValue({
        getContentIterator: getContentIteratorStub,
      } as unknown as PresentationManager);
    });

    it("returns empty targets array if there's no content", async () => {
      getContentIteratorStub.mockResolvedValue(undefined);
      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } },
      });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.selectOptions).toHaveLength(0);
      expect(result.current.loadedOptions).toHaveLength(0);
    });

    it("loads targets", async () => {
      const contentItem = createTestContentItem({
        label: LabelDefinition.fromLabelString("testLabel"),
        primaryKeys: [{ className: "class", id: "1" }],
        displayValues: {},
        values: {},
      });
      getContentIteratorStub.mockImplementation(async () => {
        return {
          total: 1,
          descriptor: createTestContentDescriptor({ fields: [] }),
          items: createAsyncIterator([contentItem]),
        };
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] } },
      });

      await waitFor(() => {
        expect(result.current.loadedOptions).toMatchObject([
          { label: contentItem.label, key: contentItem.primaryKeys[0] },
        ]);
      });
    });

    it("loads full batch of targets", async () => {
      const contentItems: Item[] = [];
      for (let i = 0; i < VALUE_BATCH_SIZE; i++) {
        contentItems.push(createTestContentItem({ label: i.toString(), displayValues: {}, values: {} }));
      }
      getContentIteratorStub.mockImplementation(async () => {
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
        expect(result.current.selectOptions).toHaveLength(VALUE_BATCH_SIZE + 1);
        expect(result.current.loadedOptions).toHaveLength(VALUE_BATCH_SIZE);
      });
    });

    it("loads targets using provided filter string", async () => {
      getContentIteratorStub.mockImplementation(async () => {
        return {
          total: 0,
          descriptor: createTestContentDescriptor({ fields: [], categories: [] }),
          items: createAsyncIterator([]),
        };
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] }, filterText: "testFilter" },
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await waitFor(() => {
        expect(getContentIteratorStub.mock.calls.length).toBeGreaterThanOrEqual(2);
        const descriptor = getContentIteratorStub.mock.lastCall![0].descriptor;
        expect(descriptor.fieldsFilterExpression).toContain("testFilter");
      });
    });
  });

  describe("when `getContentIterator` is not available", () => {
    const getContentStub = vi.fn<PresentationManager["getContent"]>();

    beforeEach(() => {
      getContentStub.mockReset();
      vi.spyOn(Presentation, "presentation", "get").mockReturnValue({
        getContent: getContentStub,
      } as unknown as PresentationManager);
    });

    it("returns empty targets array if there's no content", async () => {
      getContentStub.mockResolvedValue(undefined);
      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] }, filterText: "" },
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.selectOptions).toHaveLength(0);
      expect(result.current.loadedOptions).toHaveLength(0);
    });

    it("loads targets", async () => {
      const contentItem = createTestContentItem({
        label: LabelDefinition.fromLabelString("testLabel"),
        primaryKeys: [{ className: "class", id: "1" }],
        displayValues: {},
        values: {},
      });
      getContentStub.mockImplementation(async () => {
        return new Content(createTestContentDescriptor({ fields: [] }), [contentItem]);
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] }, filterText: "" },
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.loadedOptions).toMatchObject([
        { label: contentItem.label, key: contentItem.primaryKeys[0] },
      ]);
    });

    it("loads full batch of targets", async () => {
      const contentItems = Array.from({ length: VALUE_BATCH_SIZE }, () =>
        createTestContentItem({ displayValues: {}, values: {} }),
      );
      getContentStub.mockImplementation(async () => {
        return new Content(createTestContentDescriptor({ fields: [], categories: [] }), contentItems);
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] }, filterText: "" },
      });

      await waitFor(() => {
        // add 1 for the filter reminder option
        expect(result.current.selectOptions).toHaveLength(VALUE_BATCH_SIZE + 1);
        expect(result.current.loadedOptions).toHaveLength(VALUE_BATCH_SIZE);
      });
    });

    it("loads targets using provided filter string", async () => {
      getContentStub.mockImplementation(async () => {
        return new Content(createTestContentDescriptor({ fields: [], categories: [] }), []);
      });

      const { result } = renderHook(useNavigationPropertyTargetsLoader, {
        initialProps: { imodel: testImodel, ruleset: { id: "testRuleset", rules: [] }, filterText: "testFilter" },
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await waitFor(() => {
        expect(getContentStub.mock.calls.length).toBeGreaterThanOrEqual(2);
        const descriptor = getContentStub.mock.lastCall![0].descriptor;
        expect(descriptor.fieldsFilterExpression).toContain("testFilter");
      });
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
    const propertyDescription: PropertyDescription = {
      displayLabel: "TestProp",
      name: "test_prop",
      typename: "navigation",
    };
    const { result } = renderHook(
      ({ getNavigationPropertyInfo, property }: Props) =>
        useNavigationPropertyTargetsRuleset(getNavigationPropertyInfo, property),
      { initialProps: { getNavigationPropertyInfo: async () => testInfo, property: propertyDescription } },
    );

    await waitFor(() => expect(result.current).toBeDefined());
    const ruleset = result.current;
    expect(ruleset).toMatchObject({
      rules: [
        {
          specifications: [
            { classes: { schemaName: "TestSchema", classNames: ["TargetClass"], arePolymorphic: true } },
          ],
        },
      ],
    });
  });

  it("returns undefined if navigation property info is undefined", () => {
    const propertyDescription: PropertyDescription = {
      displayLabel: "TestProp",
      name: "test_prop",
      typename: "navigation",
    };
    const { result } = renderHook(
      ({ getNavigationPropertyInfo, property }: Props) =>
        useNavigationPropertyTargetsRuleset(getNavigationPropertyInfo, property),
      { initialProps: { getNavigationPropertyInfo: async () => undefined, property: propertyDescription } },
    );

    const ruleset = result.current;
    expect(ruleset).toBeUndefined();
  });
});

describe("NavigationPropertyItemsLoader", () => {
  const getItemsStub = vi.fn();

  beforeEach(() => {
    getItemsStub.mockImplementation(() => {
      return Array.from({ length: VALUE_BATCH_SIZE }, () => {
        return { label: { displayValue: "filterText" }, key: { id: "0x01" } };
      });
    });
  });

  it("does not load items when loaded options matches the filter", async () => {
    const getItemsSpy = vi.fn();
    const itemsLoader = new NavigationPropertyItemsLoader(() => {}, getItemsSpy, getItemsStub);
    await itemsLoader.loadItems();
    await itemsLoader.loadItems("filterText");

    expect(getItemsSpy).toHaveBeenCalledOnce();
  });

  it("does not load items when another load process is in progress", async () => {
    const getItemsSpy = vi.fn();
    const itemsLoader = new NavigationPropertyItemsLoader(() => {}, getItemsSpy, getItemsStub);
    await Promise.all([itemsLoader.loadItems("filterText"), itemsLoader.loadItems("filterText")]);

    expect(getItemsSpy).toHaveBeenCalledOnce();
  });

  it("does not load items when enough items matches the filter", async () => {
    const loadedItems: NavigationPropertyTarget[] = [];
    const itemsLoader = new NavigationPropertyItemsLoader(
      () => {},
      (newItems) => loadedItems.push(...newItems),
      getItemsStub,
    );
    await itemsLoader.loadItems("filterText");
    await itemsLoader.loadItems("filterText");

    expect(loadedItems).toHaveLength(VALUE_BATCH_SIZE);
  });

  it("does not load duplicate items", async () => {
    getItemsStub.mockImplementation(() => {
      return Array.from({ length: VALUE_BATCH_SIZE / 2 }, () => {
        return { label: { displayValue: "filterText" }, key: { id: "0x01" } };
      });
    });

    const loadedItems: NavigationPropertyTarget[] = [];
    const itemsLoader = new NavigationPropertyItemsLoader(
      () => {},
      (newItems) => loadedItems.push(...newItems),
      getItemsStub,
    );
    await itemsLoader.loadItems("filterText");
    await itemsLoader.loadItems("filterText");

    expect(loadedItems).toHaveLength(VALUE_BATCH_SIZE / 2);
  });
});
