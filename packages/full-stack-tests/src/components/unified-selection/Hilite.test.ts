/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Id64, using } from "@itwin/core-bentley";
import { InstanceKey, KeySet } from "@itwin/presentation-common";
import { ViewportSelectionHandler } from "@itwin/presentation-components";
import { Presentation, TRANSIENT_ELEMENT_CLASSNAME } from "@itwin/presentation-frontend";
import { buildTestIModel as buildTestIModel } from "@itwin/presentation-testing";
import { waitFor } from "@testing-library/react";
import {
  getDefaultSubcategoryKey,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
  insertSubCategory,
  insertSubject,
} from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";

describe("Unified Selection", () => {
  before(async () => {
    await initialize();
  });

  after(async () => {
    await terminate();
  });

  describe("Hiliting selection", () => {
    describe("Subject", () => {
      it("hilites models directly under subject", async function () {
        let subjectKey: InstanceKey;
        let modelKeys: InstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          subjectKey = insertSubject({ builder, codeValue: "test subject" });
          modelKeys = [
            insertPhysicalModelWithPartition({ builder, codeValue: "model 1", partitionParentId: subjectKey.id }),
            insertPhysicalModelWithPartition({ builder, codeValue: "model 2", partitionParentId: subjectKey.id }),
          ];
        });
        await using(new ViewportSelectionHandler({ imodel }), async (_) => {
          Presentation.selection.replaceSelection("", imodel, new KeySet([subjectKey!]));
          await waitFor(() => {
            expect(imodel.hilited.models.toId64Array())
              .to.have.lengthOf(modelKeys.length)
              .and.to.include.members(modelKeys.map((k) => k.id));
            expect(imodel.hilited.subcategories.isEmpty).to.be.true;
            expect(imodel.hilited.elements.isEmpty).to.be.true;
            expect(imodel.selectionSet.size).to.eq(0);
          });
        });
      });

      it("hilites models nested deeply under subject", async function () {
        let subjectKey: InstanceKey;
        let modelKeys: InstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          subjectKey = insertSubject({ builder, codeValue: "test subject" });
          const subject2 = insertSubject({ builder, codeValue: "subject 2", parentId: subjectKey.id });
          const subject3 = insertSubject({ builder, codeValue: "subject 3", parentId: subjectKey.id });
          const subject4 = insertSubject({ builder, codeValue: "subject 4", parentId: subject3.id });
          modelKeys = [
            insertPhysicalModelWithPartition({ builder, codeValue: "model 1", partitionParentId: subject2.id }),
            insertPhysicalModelWithPartition({ builder, codeValue: "model 2", partitionParentId: subject4.id }),
          ];
        });
        await using(new ViewportSelectionHandler({ imodel }), async (_) => {
          Presentation.selection.replaceSelection("", imodel, new KeySet([subjectKey!]));
          await waitFor(() => {
            expect(imodel.hilited.models.toId64Array())
              .to.have.lengthOf(modelKeys.length)
              .and.to.include.members(modelKeys.map((k) => k.id));
            expect(imodel.hilited.subcategories.isEmpty).to.be.true;
            expect(imodel.hilited.elements.isEmpty).to.be.true;
            expect(imodel.selectionSet.size).to.eq(0);
          });
        });
      });
    });

    describe("Model", () => {
      it("hilites model", async function () {
        let modelKey: InstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        });
        await using(new ViewportSelectionHandler({ imodel }), async (_) => {
          Presentation.selection.replaceSelection("", imodel, new KeySet([modelKey!]));
          await waitFor(() => {
            expect(imodel.hilited.models.toId64Array()).to.have.lengthOf(1).and.to.include(modelKey.id);
            expect(imodel.hilited.subcategories.isEmpty).to.be.true;
            expect(imodel.hilited.elements.isEmpty).to.be.true;
            expect(imodel.selectionSet.size).to.eq(0);
          });
        });
      });
    });

    describe("Category", () => {
      it("hilites category's subcategories", async function () {
        let categoryKey: InstanceKey;
        let subCategoryKeys: InstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          subCategoryKeys = [
            getDefaultSubcategoryKey(categoryKey.id),
            insertSubCategory({ builder, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
            insertSubCategory({ builder, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
          ];
        });
        await using(new ViewportSelectionHandler({ imodel }), async (_) => {
          Presentation.selection.replaceSelection("", imodel, new KeySet([categoryKey!]));
          await waitFor(() => {
            expect(imodel.hilited.models.isEmpty).to.be.true;
            expect(imodel.hilited.subcategories.toId64Array())
              .to.have.lengthOf(subCategoryKeys.length)
              .and.to.include.members(subCategoryKeys.map((k) => k.id));
            expect(imodel.hilited.elements.isEmpty).to.be.true;
            expect(imodel.selectionSet.size).to.eq(0);
          });
        });
      });

      it("hilites subcategory", async function () {
        let categoryKey: InstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        });
        const subCategoryKey = getDefaultSubcategoryKey(categoryKey!.id);
        await using(new ViewportSelectionHandler({ imodel }), async (_) => {
          Presentation.selection.replaceSelection("", imodel, new KeySet([subCategoryKey]));
          await waitFor(() => {
            expect(imodel.hilited.models.isEmpty).to.be.true;
            expect(imodel.hilited.subcategories.toId64Array()).to.have.lengthOf(1).and.to.include(subCategoryKey.id);
            expect(imodel.hilited.elements.isEmpty).to.be.true;
            expect(imodel.selectionSet.size).to.eq(0);
          });
        });
      });
    });

    describe("Element", () => {
      it("hilites assembly element", async function () {
        let assemblyKey: InstanceKey;
        let expectedHighlightedElementKeys: InstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          assemblyKey = insertPhysicalElement({ builder, userLabel: "element 1", modelId: modelKey.id, categoryId: categoryKey.id });
          const element2 = insertPhysicalElement({
            builder,
            userLabel: "element 2",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
            parentId: assemblyKey.id,
          });
          const element3 = insertPhysicalElement({
            builder,
            userLabel: "element 3",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
            parentId: assemblyKey.id,
          });
          const element4 = insertPhysicalElement({ builder, userLabel: "element 4", modelId: modelKey.id, categoryId: categoryKey.id, parentId: element3.id });
          const element5 = insertPhysicalElement({ builder, userLabel: "element 5", modelId: modelKey.id, categoryId: categoryKey.id, parentId: element3.id });
          expectedHighlightedElementKeys = [assemblyKey, element2, element3, element4, element5];
        });
        await using(new ViewportSelectionHandler({ imodel }), async (_) => {
          Presentation.selection.replaceSelection("", imodel, new KeySet([assemblyKey!]));
          await waitFor(() => {
            expect(imodel.hilited.models.isEmpty).to.be.true;
            expect(imodel.hilited.subcategories.isEmpty).to.be.true;
            expect(imodel.hilited.elements.toId64Array())
              .to.have.lengthOf(expectedHighlightedElementKeys.length)
              .and.to.include.members(expectedHighlightedElementKeys.map((k) => k.id));
            expect([...imodel.selectionSet.elements])
              .to.have.lengthOf(expectedHighlightedElementKeys.length)
              .and.to.include.members(expectedHighlightedElementKeys.map((k) => k.id));
          });
        });
      });

      it("hilites leaf element", async function () {
        let elementKey: InstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          elementKey = insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id });
        });
        await using(new ViewportSelectionHandler({ imodel }), async (_) => {
          Presentation.selection.replaceSelection("", imodel, new KeySet([elementKey!]));
          await waitFor(() => {
            expect(imodel.hilited.models.isEmpty).to.be.true;
            expect(imodel.hilited.subcategories.isEmpty).to.be.true;
            expect(imodel.hilited.elements.toId64Array()).to.have.lengthOf(1).and.to.include(elementKey.id);
            expect([...imodel.selectionSet.elements])
              .to.have.lengthOf(1)
              .and.to.include(elementKey.id);
          });
        });
      });

      it("hilites transient element", async function () {
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (_) => {});
        const transientElementKey = { className: TRANSIENT_ELEMENT_CLASSNAME, id: Id64.fromLocalAndBriefcaseIds(123, 0xffffff) };
        await using(new ViewportSelectionHandler({ imodel }), async (_) => {
          Presentation.selection.replaceSelection("", imodel, new KeySet([transientElementKey]));
          await waitFor(() => {
            expect(imodel.hilited.models.isEmpty).to.be.true;
            expect(imodel.hilited.subcategories.isEmpty).to.be.true;
            expect(imodel.hilited.elements.toId64Array()).to.have.lengthOf(1).and.to.include(transientElementKey.id);
            expect([...imodel.selectionSet.elements])
              .to.have.lengthOf(1)
              .and.to.include(transientElementKey.id);
          });
        });
      });

      it("hilites transient element after removing and adding it back", async function () {
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (_) => {});
        const transientElementKey = { className: TRANSIENT_ELEMENT_CLASSNAME, id: Id64.fromLocalAndBriefcaseIds(123, 0xffffff) };
        await using(new ViewportSelectionHandler({ imodel }), async (_) => {
          // set up the selection to contain a transient element
          Presentation.selection.replaceSelection("", imodel, new KeySet([transientElementKey]));
          await waitFor(() => {
            expect(imodel.hilited.elements.toId64Array()).to.have.lengthOf(1).and.to.include(transientElementKey.id);
            expect([...imodel.selectionSet.elements])
              .to.have.lengthOf(1)
              .and.to.include(transientElementKey.id);
          });

          // remove and add back the transient element
          imodel.selectionSet.remove(transientElementKey.id);
          imodel.selectionSet.replace(transientElementKey.id);

          // expect the transient element to be both hilited and selected
          await waitFor(() => {
            expect(imodel.hilited.elements.toId64Array()).to.have.lengthOf(1).and.to.include(transientElementKey.id);
            expect([...imodel.selectionSet.elements])
              .to.have.lengthOf(1)
              .and.to.include(transientElementKey.id);
          });
        });
      });
    });
  });
});
