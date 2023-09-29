/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { PrimitiveValue, PropertyRecord } from "@itwin/appui-abstract";
import { PropertyCategory } from "@itwin/components-react";
import { using } from "@itwin/core-bentley";
import { InstanceKey, KeySet, RuleTypes } from "@itwin/presentation-common";
import { DEFAULT_PROPERTY_GRID_RULESET, PresentationPropertyDataProvider, PresentationPropertyDataProviderProps } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import {
  insertExternalSourceAspect,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertRepositoryLink,
  insertSpatialCategory,
} from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";

describe("PropertyDataProvider", async () => {
  before(async () => {
    await initialize();
  });

  after(async () => {
    await terminate();
  });

  const runTests = (configName: string, setup: (proider: PresentationPropertyDataProvider) => void) => {
    const createProvider = (props: PresentationPropertyDataProviderProps) => {
      const provider = new PresentationPropertyDataProvider(props);
      setup(provider);
      return provider;
    };

    describe(configName, () => {
      afterEach(() => {
        sinon.restore();
      });

      it("creates empty result when properties requested for 0 instances", async function () {
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          insertSpatialCategory({ builder, fullClassNameSeparator: ":", label: "My Category" });
        });
        await using(createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET }), async (provider) => {
          provider.keys = new KeySet();
          const properties = await provider.getData();
          expect(properties.records).to.be.empty;
        });
      });

      it("creates property data when given key with concrete class", async function () {
        let categoryKey: InstanceKey;
        let modelKey: InstanceKey;
        let elementKey: InstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", label: "My Category" });
          modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", label: "My Model" });
          elementKey = insertPhysicalElement({
            builder,
            fullClassNameSeparator: ":",
            userLabel: "My Element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });
        });
        await using(createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET }), async (provider) => {
          provider.keys = new KeySet([elementKey]);
          const properties = await provider.getData();
          expect((properties.label.value as PrimitiveValue).displayValue).to.contain("My Element");
          validateRecords(properties.records["/selected-item/"], [
            {
              propName: "CodeValue",
              valueComparer: (value) => expect(value.value).to.be.undefined,
            },
            {
              propName: "UserLabel",
              valueComparer: (value) => expect(value.value).to.be.eq("My Element"),
            },
            {
              propName: "Model",
              valueComparer: (value) => expect((value.value as InstanceKey).id).to.be.eq(modelKey.id),
            },
            {
              propName: "Category",
              valueComparer: (value) => expect((value.value as InstanceKey).id).to.be.eq(categoryKey.id),
            },
          ]);
        });
      });

      it("creates property data when given key with base class", async function () {
        let categoryKey: InstanceKey;
        let modelKey: InstanceKey;
        let elementKey: InstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", label: "My Category" });
          modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", label: "My Model" });
          elementKey = insertPhysicalElement({
            builder,
            fullClassNameSeparator: ":",
            userLabel: "My Element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });
        });
        await using(createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET }), async (provider) => {
          provider.keys = new KeySet([{ className: "BisCore:Element", id: elementKey.id }]);
          const properties = await provider.getData();
          expect((properties.label.value as PrimitiveValue).displayValue).to.contain("My Element");
          validateRecords(properties.records["/selected-item/"], [
            {
              propName: "CodeValue",
              valueComparer: (value) => expect(value.value).to.be.undefined,
            },
            {
              propName: "UserLabel",
              valueComparer: (value) => expect(value.value).to.be.eq("My Element"),
            },
            {
              propName: "Model",
              valueComparer: (value) => expect((value.value as InstanceKey).id).to.be.eq(modelKey.id),
            },
            {
              propName: "Category",
              valueComparer: (value) => expect((value.value as InstanceKey).id).to.be.eq(categoryKey.id),
            },
          ]);
        });
      });

      it("favorites properties", async function () {
        let categoryKey: InstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", label: "My Category" });
        });
        await using(createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET }), async (provider) => {
          sinon.stub(provider as any, "isFieldFavorite").returns(true);
          provider.keys = new KeySet([categoryKey]);
          const properties = await provider.getData();
          const favoriteCategoryName = provider.isNestedPropertyCategoryGroupingEnabled ? "Favorite-/selected-item/" : "Favorite";
          validateRecords(properties.records["/selected-item/"], [
            {
              propName: "CodeValue",
            },
            {
              propName: "UserLabel",
            },
            {
              propName: "Model",
            },
          ]);
          validateRecords(properties.records[favoriteCategoryName], [
            {
              propName: "CodeValue",
            },
            {
              propName: "UserLabel",
            },
            {
              propName: "Model",
            },
          ]);
        });
      });

      it("overrides default property category", async function () {
        let categoryKey: InstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", label: "My Category" });
        });
        await using(
          createProvider({
            imodel,
            ruleset: {
              ...DEFAULT_PROPERTY_GRID_RULESET,
              rules: [
                ...DEFAULT_PROPERTY_GRID_RULESET.rules,
                {
                  ruleType: RuleTypes.DefaultPropertyCategoryOverride,
                  specification: {
                    id: "default",
                    label: "Custom Category",
                    description: "Custom description",
                    autoExpand: true,
                  },
                },
              ],
            },
          }),
          async (provider) => {
            provider.keys = new KeySet([categoryKey]);
            const properties = await provider.getData();
            expect(properties.categories.find((category) => category.name === "default")?.label).to.be.eq("Custom Category");
            validateRecords(properties.records.default, [
              {
                propName: "CodeValue",
              },
              {
                propName: "UserLabel",
              },
              {
                propName: "Model",
              },
            ]);
          },
        );
      });

      it("finds root property record keys", async function () {
        let categoryKey: InstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", label: "My Category" });
        });

        await using(createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET }), async (provider) => {
          provider.keys = new KeySet([categoryKey]);
          const properties = await provider.getData();

          const category = properties.categories.find((c) => c.name === "/selected-item/");
          expect(category).to.not.be.undefined;

          const record = properties.records[category!.name].find((r) => r.property.displayLabel === "Code");
          expect(record).to.not.be.undefined;

          const keys = await provider.getPropertyRecordInstanceKeys(record!);
          expect(keys).to.deep.eq([categoryKey]);
        });
      });

      it("finds nested property record keys", async function () {
        let elementKey: InstanceKey;
        let externalsSourceAspectKey: InstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          const categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", label: "My Category" });
          const modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", label: "My Model" });
          elementKey = insertPhysicalElement({
            builder,
            fullClassNameSeparator: ":",
            userLabel: "My Element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });
          const repositoryLinkKey = insertRepositoryLink({
            builder,
            fullClassNameSeparator: ":",
            repositoryUrl: "Repository URL",
            repositoryLabel: "Repository Label",
          });
          externalsSourceAspectKey = insertExternalSourceAspect({
            builder,
            fullClassNameSeparator: ":",
            elementId: elementKey.id,
            identifier: "My External Source Aspect",
            repositoryId: repositoryLinkKey.id,
          });
        });

        await using(createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET }), async (provider) => {
          provider.keys = new KeySet([elementKey]);
          const properties = await provider.getData();

          function findNestedCategory(categories: PropertyCategory[], name: string): PropertyCategory | undefined {
            for (const c of categories) {
              if (c.name === name) {
                return c;
              }

              const nested = findNestedCategory(c.childCategories ?? [], name);
              if (nested) {
                return nested;
              }
            }
            return undefined;
          }
          const category = findNestedCategory(properties.categories, "/selected-item/-source_information");
          expect(category).to.not.be.undefined;

          const record = properties.records[category!.name].find((r) => r.property.displayLabel === "Source Element ID");
          expect(record).to.not.be.undefined;

          const keys = await provider.getPropertyRecordInstanceKeys(record!);
          expect(keys).to.deep.eq([externalsSourceAspectKey]);
        });
      });
    });
  };

  runTests("with flat property categories", (provider) => (provider.isNestedPropertyCategoryGroupingEnabled = false));
  runTests("with nested property categories", (provider) => (provider.isNestedPropertyCategoryGroupingEnabled = true));

  it("gets property data after re-initializing Presentation", async function () {
    let categoryKey: InstanceKey;
    // eslint-disable-next-line deprecation/deprecation
    const imodel = await buildTestIModel(this, async (builder) => {
      categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", label: "My Category" });
    });
    const checkDataProvider = async () => {
      await using(new PresentationPropertyDataProvider({ imodel }), async (p) => {
        p.keys = new KeySet([categoryKey]);
        const properties = await p.getData();
        expect(properties.categories).to.not.be.empty;
      });
    };

    // first request something to make sure we get data back
    await checkDataProvider();

    // re-initialize
    Presentation.terminate();
    await Presentation.initialize({
      presentation: {
        activeLocale: "en-pseudo",
      },
    });

    // repeat request
    await checkDataProvider();
  });
});

function validateRecords(records: PropertyRecord[], expectations: Array<{ propName: string; valueComparer?: (value: PrimitiveValue) => void }>) {
  for (const { propName, valueComparer } of expectations) {
    const record = records.find((rec) => rec.property.name.endsWith(propName));
    if (!record) {
      throw new Error(`Failed to find PropertyRecord for property - ${propName}`);
    }
    valueComparer?.(record.value as PrimitiveValue);
  }
}
