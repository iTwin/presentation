/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertDrawingCategory,
  insertDrawingGraphic,
  insertDrawingModelWithPartition,
  insertFunctionalElement,
  insertFunctionalModelWithPartition,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { computeSelection } from "@itwin/unified-selection";
import { buildTestIModel } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { getSchemaFromPackage } from "./getSchema.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { Props } from "@itwin/presentation-shared";
import type { SelectableInstanceKey } from "@itwin/unified-selection";

describe("SelectionScope", () => {
  let imodelConnection: IModelConnection;

  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  async function getSelection(
    keys: string[],
    scope: Props<typeof computeSelection>["scope"],
  ): Promise<SelectableInstanceKey[]> {
    const selectables: SelectableInstanceKey[] = [];
    for await (const selectable of computeSelection({
      queryExecutor: createECSqlQueryExecutor(imodelConnection),
      elementIds: keys,
      scope,
    })) {
      selectables.push(selectable);
    }
    return selectables;
  }

  describe("`element` scope", () => {
    it("returns element", async () => {
      let elementKey1: SelectableInstanceKey;

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          return withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            const assemblyKey = insertPhysicalElement({
              txn,
              userLabel: "root element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            }).id;
            elementKey1 = insertPhysicalElement({
              txn,
              userLabel: "element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: assemblyKey,
            });
          });
        })
      ).imodelConnection;

      const actual = await getSelection([elementKey1!.id], { id: "element" });
      expect(actual).toEqual(expect.arrayContaining([elementKey1!]));
    });

    it("skips invalid ID's", async () => {
      let elementKey1: SelectableInstanceKey;

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            const assemblyKey = insertPhysicalElement({
              txn,
              userLabel: "root element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            }).id;
            elementKey1 = insertPhysicalElement({
              txn,
              userLabel: "element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: assemblyKey,
            });
          });
        })
      ).imodelConnection;

      const actual = await getSelection([elementKey1!.id, "invalid"], { id: "element" });
      expect(actual).toEqual(expect.arrayContaining([elementKey1!]));
    });

    it("returns element parent", async () => {
      let parentKey: SelectableInstanceKey;
      let elementKey1: SelectableInstanceKey;
      let elementKey2: SelectableInstanceKey;

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            parentKey = insertPhysicalElement({
              txn,
              userLabel: "root element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
            elementKey1 = insertPhysicalElement({
              txn,
              userLabel: "element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: parentKey.id,
            });
            elementKey2 = insertPhysicalElement({
              txn,
              userLabel: "element 2",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: parentKey.id,
            });
          });
        })
      ).imodelConnection;
      const actual = await getSelection([elementKey1!.id, elementKey2!.id], { id: "element", ancestorLevel: 1 });
      expect(actual).toEqual(expect.arrayContaining([parentKey!]));
    });

    it("returns element when it has no parent", async () => {
      let elementKey: SelectableInstanceKey;

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            elementKey = insertPhysicalElement({
              txn,
              userLabel: "root element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
          });
        })
      ).imodelConnection;

      const actual = await getSelection([elementKey!.id], { id: "element", ancestorLevel: 1 });
      expect(actual).toEqual(expect.arrayContaining([elementKey!]));
    });

    it("returns grandparent of element", async () => {
      let grandParentKey: SelectableInstanceKey;
      let elementKey: SelectableInstanceKey;

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            grandParentKey = insertPhysicalElement({
              txn,
              userLabel: "root element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
            const parentKey = insertPhysicalElement({
              txn,
              userLabel: "element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: grandParentKey.id,
            });
            elementKey = insertPhysicalElement({
              txn,
              userLabel: "element 2",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: parentKey.id,
            });
          });
        })
      ).imodelConnection;

      const actual = await getSelection([elementKey!.id], { id: "element", ancestorLevel: 2 });
      expect(actual).toEqual(expect.arrayContaining([grandParentKey!]));
    });

    it("returns last existing ancestor", async () => {
      let parentKey: SelectableInstanceKey;
      let elementKey: SelectableInstanceKey;

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            parentKey = insertPhysicalElement({
              txn,
              userLabel: "root element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
            elementKey = insertPhysicalElement({
              txn,
              userLabel: "element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: parentKey.id,
            });
          });
        })
      ).imodelConnection;

      const actual = await getSelection([elementKey!.id], { id: "element", ancestorLevel: 2 });
      expect(actual).toEqual(expect.arrayContaining([parentKey!]));
    });

    it("returns all selected elements", async () => {
      let elementKeys: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            elementKeys = [
              insertPhysicalElement({ txn, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
              insertPhysicalElement({ txn, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
              insertPhysicalElement({ txn, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
            ];
          });
        })
      ).imodelConnection;

      const actual = await getSelection(
        elementKeys!.map((key) => key.id),
        { id: "element" },
      );
      expect(actual).toEqual(expect.arrayContaining(elementKeys!));
    });

    it("returns root element", async () => {
      let rootElementKey: SelectableInstanceKey;
      let elementKey3: SelectableInstanceKey;

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            rootElementKey = insertPhysicalElement({
              txn,
              userLabel: "root element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
            const elementKey1 = insertPhysicalElement({
              txn,
              userLabel: "element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: rootElementKey.id,
            });
            const elementKey2 = insertPhysicalElement({
              txn,
              userLabel: "element 2",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: elementKey1.id,
            });
            elementKey3 = insertPhysicalElement({
              txn,
              userLabel: "element 3",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: elementKey2.id,
            });
          });
        })
      ).imodelConnection;

      const actual = await getSelection([elementKey3!.id], { id: "element", ancestorLevel: -1 });
      expect(actual).toEqual(expect.arrayContaining([rootElementKey!]));
    });
  });

  describe("`category` scope", () => {
    it("returns element category", async () => {
      let categoryKey1: SelectableInstanceKey;
      let categoryKey2: SelectableInstanceKey;
      let elementIds: string[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            categoryKey1 = insertSpatialCategory({ txn, codeValue: "test category 1" });
            categoryKey2 = insertSpatialCategory({ txn, codeValue: "test category 2" });
            const assemblyKey = insertPhysicalElement({
              txn,
              userLabel: "root element",
              modelId: modelKey.id,
              categoryId: categoryKey1.id,
            });
            elementIds = [
              insertPhysicalElement({
                txn,
                userLabel: "element 1",
                modelId: modelKey.id,
                categoryId: categoryKey1.id,
                parentId: assemblyKey.id,
              }).id,
              insertPhysicalElement({
                txn,
                userLabel: "element 2",
                modelId: modelKey.id,
                categoryId: categoryKey1.id,
                parentId: assemblyKey.id,
              }).id,
              insertPhysicalElement({
                txn,
                userLabel: "element 2",
                modelId: modelKey.id,
                categoryId: categoryKey2.id,
                parentId: assemblyKey.id,
              }).id,
            ];
          });
        })
      ).imodelConnection;

      const actual = await getSelection(elementIds!, { id: "category" });
      expect(actual).toEqual(expect.arrayContaining([categoryKey1!, categoryKey2!]));
    });
  });

  describe("`model` scope", () => {
    it("returns element model", async () => {
      let modelKey: SelectableInstanceKey;
      let elementIds: string[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            const assemblyKey = insertPhysicalElement({
              txn,
              userLabel: "root element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
            elementIds = [
              insertPhysicalElement({
                txn,
                userLabel: "element 1",
                modelId: modelKey.id,
                categoryId: categoryKey.id,
                parentId: assemblyKey.id,
              }).id,
              insertPhysicalElement({
                txn,
                userLabel: "element 2",
                modelId: modelKey.id,
                categoryId: categoryKey.id,
                parentId: assemblyKey.id,
              }).id,
            ];
          });
        })
      ).imodelConnection;

      const actual = await getSelection(elementIds!, { id: "model" });
      expect(actual).toEqual(expect.arrayContaining([modelKey!]));
    });
  });

  describe("`functional` scope", () => {
    describe("`GeometricElement3d`", () => {
      it("returns `GeometricElement3d` related functional element", async () => {
        let physicalElement: SelectableInstanceKey;
        let functionalElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              functionalElement = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: physicalElement.id,
                relationshipName: "PhysicalElementFulfillsFunction",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional" });
        expect(actual).toEqual(expect.arrayContaining([functionalElement!]));
      });

      it("returns `GeometricElement3d` when no related functional element exists", async () => {
        let physicalElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional" });
        expect(actual).toEqual(expect.arrayContaining([physicalElement!]));
      });

      it("returns `GeometricElement3d` when parent has related functional element", async () => {
        let physicalElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              const physicalElementParent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementParent.id,
              });
              insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: physicalElementParent.id,
                relationshipName: "PhysicalElementFulfillsFunction",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional" });
        expect(actual).toEqual(expect.arrayContaining([physicalElement!]));
      });

      it("returns `GeometricElement3d` and related functional element", async () => {
        let physicalElement1: SelectableInstanceKey;
        let physicalElement2: SelectableInstanceKey;
        let functionalElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              physicalElement1 = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              physicalElement2 = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElement1.id,
              });
              functionalElement = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: physicalElement1.id,
                relationshipName: "PhysicalElementFulfillsFunction",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement1!.id, physicalElement2!.id], { id: "functional" });
        expect(actual).toEqual(expect.arrayContaining([functionalElement!, physicalElement2!]));
      });

      it("returns `GeometricElement3d` parent related functional element", async () => {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              const physicalElementParent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementParent.id,
              });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: physicalElementParent.id,
                relationshipName: "PhysicalElementFulfillsFunction",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).toEqual(expect.arrayContaining([functionalElementKey!]));
      });

      it("returns parent without functional element", async () => {
        let parentKey: SelectableInstanceKey;
        let physicalElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              parentKey = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: parentKey.id,
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).toEqual(expect.arrayContaining([parentKey!]));
      });

      it("returns parentless `GeometricElement3d` related functional element", async () => {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: physicalElement.id,
                relationshipName: "PhysicalElementFulfillsFunction",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).toEqual(expect.arrayContaining([functionalElementKey!]));
      });

      it("returns parentless `GeometricElement3d` when functional element does not exist", async () => {
        let physicalElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).toEqual(expect.arrayContaining([physicalElement!]));
      });

      it("returns `GeometricElement3d` grandparent related functional element", async () => {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              const physicalElementGrandParent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              const physicalElementParent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementGrandParent.id,
              });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementParent.id,
              });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: physicalElementGrandParent.id,
                relationshipName: "PhysicalElementFulfillsFunction",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).toEqual(expect.arrayContaining([functionalElementKey!]));
      });

      it("returns `GeometricElement3d` grandparent without related functional element", async () => {
        let physicalElementGrandParent: SelectableInstanceKey;
        let physicalElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              physicalElementGrandParent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              const physicalElementParent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementGrandParent.id,
              });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementParent.id,
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).toEqual(expect.arrayContaining([physicalElementGrandParent!]));
      });

      it("returns last existing `GeometricElement3d` ancestor related functional element", async () => {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              const physicalElementParent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementParent.id,
              });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: physicalElementParent.id,
                relationshipName: "PhysicalElementFulfillsFunction",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).toEqual(expect.arrayContaining([functionalElementKey!]));
      });

      it("returns last existing `GeometricElement3d` ancestor without related functional element", async () => {
        let physicalElementParent: SelectableInstanceKey;
        let physicalElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              physicalElementParent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementParent.id,
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).toEqual(expect.arrayContaining([physicalElementParent!]));
      });

      it("returns `GeometricElement3d` top assembly related functional element", async () => {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              const physicalElementGrandparent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
              });
              const physicalElementParent = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementGrandparent.id,
              });
              physicalElement = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: categoryKey.id,
                parentId: physicalElementParent.id,
              });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: physicalElementGrandparent.id,
                relationshipName: "PhysicalElementFulfillsFunction",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: -1 });
        expect(actual).toEqual(expect.arrayContaining([functionalElementKey!]));
      });
    });

    describe("`GeometricElement2d`", () => {
      it("returns `GeometricElement2d` related functional element", async () => {
        let graphicsElement: SelectableInstanceKey;
        let functionalElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              functionalElement = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElement.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional" });
        expect(actual).toEqual(expect.arrayContaining([functionalElement!]));
      });

      it("returns `GeometricElement2d` when no related functional element exists", async () => {
        let graphicsElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional" });
        expect(actual).toEqual(expect.arrayContaining([graphicsElement!]));
      });

      it("returns `GeometricElement2d` and related functional element", async () => {
        let graphicsElement1: SelectableInstanceKey;
        let graphicsElement2: SelectableInstanceKey;
        let functionalElement1: SelectableInstanceKey;
        let functionalElement2: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement1 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              graphicsElement2 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              functionalElement1 = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElement2.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
              functionalElement2 = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElementGrandParent.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement1!.id, graphicsElement2!.id], { id: "functional" });
        expect(actual).toEqual(expect.arrayContaining([functionalElement1!, functionalElement2!]));
      });

      it("returns `GeometricElement2d` related functional elements of different depth", async () => {
        let graphicsElement1: SelectableInstanceKey;
        let graphicsElement2: SelectableInstanceKey;
        let functionalElement1: SelectableInstanceKey;
        let functionalElement2: SelectableInstanceKey;
        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement1 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              graphicsElement2 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              functionalElement1 = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElement2.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
              functionalElement2 = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElementParent.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
              insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElementGrandParent.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement1!.id, graphicsElement2!.id], { id: "functional" });
        expect(actual).toMatchObject([functionalElement1!, functionalElement2!]);
      });

      it("returns `GeometricElement2d` nearest related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElement.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).toMatchObject([functionalElementKey!]);
      });

      it("returns `GeometricElement2d` parent related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElementParent.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).toMatchObject([functionalElementKey!]);
      });

      it("returns `GeometricElement2d` ancestor related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElementGrandParent.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).toMatchObject([functionalElementKey!]);
      });

      it("returns all `GeometricElement2d` nearest related functional elements", async function () {
        let graphicsElement1: SelectableInstanceKey;
        let graphicsElement2: SelectableInstanceKey;
        let functionalElementKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement1 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              graphicsElement2 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              functionalElementKeys = [
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: graphicsElementGrandParent.id,
                  relationshipName: "DrawingGraphicRepresentsFunctionalElement",
                }),
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: graphicsElement1.id,
                  relationshipName: "DrawingGraphicRepresentsFunctionalElement",
                }),
              ];
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement1!.id, graphicsElement2!.id], {
          id: "functional",
          ancestorLevel: 1,
        });
        expect(actual).toMatchObject(functionalElementKeys!);
      });

      it("returns parentless `GeometricElement2d` related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              graphicsElement = insertDrawingGraphic({ txn, modelId: drawingModelKey.id, categoryId: categoryKey.id });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElement.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).toMatchObject([functionalElementKey!]);
      });

      it("returns parentless `GeometricElement2d` without related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              graphicsElement = insertDrawingGraphic({ txn, modelId: drawingModelKey.id, categoryId: categoryKey.id });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).toMatchObject([graphicsElement!]);
      });

      it("returns `GeometricElement2d` grandparent", async function () {
        let graphicsElementGrandParent: SelectableInstanceKey;
        let graphicsElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).toMatchObject([graphicsElementGrandParent!]);
      });

      it("returns last existing `GeometricElement2d` ancestor", async function () {
        let graphicsElementParent: SelectableInstanceKey;
        let graphicsElement: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              graphicsElement = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).toMatchObject([graphicsElementParent!]);
      });

      it("returns `GeometricElement2d` grandparent related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              graphicsElement = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: categoryKey.id,
                parentId: graphicsElementParent.id,
              });
              functionalElementKey = insertFunctionalElement({
                txn,
                modelId: functionalModelKey.id,
                representedElementId: graphicsElementGrandParent.id,
                relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              });
            });
          })
        ).imodelConnection;

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: -1 });
        expect(actual).toMatchObject([functionalElementKey!]);
      });
    });

    describe("mixed elements", () => {
      it("returns element related functional elements", async function () {
        let elementIds: string[];
        let physicalElement2: SelectableInstanceKey;
        let functionalElementKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const spatialCategoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              const drawingCategoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });

              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              const graphicsElement1 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
                parentId: graphicsElementParent.id,
              });
              const graphicsElement2 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
                parentId: graphicsElementParent.id,
              });
              const physicalElement1 = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: spatialCategoryKey.id,
              });
              physicalElement2 = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: spatialCategoryKey.id,
                parentId: physicalElement1.id,
              });
              elementIds = [graphicsElement1.id, graphicsElement2.id, physicalElement1.id, physicalElement2.id];
              functionalElementKeys = [
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: graphicsElement2.id,
                  relationshipName: "DrawingGraphicRepresentsFunctionalElement",
                }),
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: graphicsElementGrandParent.id,
                  relationshipName: "DrawingGraphicRepresentsFunctionalElement",
                }),
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: physicalElement1.id,
                  relationshipName: "PhysicalElementFulfillsFunction",
                }),
              ];
            });
          })
        ).imodelConnection;

        const actual = await getSelection(elementIds!, { id: "functional" });
        expect(actual).toMatchObject([physicalElement2!, ...functionalElementKeys!]);
      });

      it("returns parent related functional elements", async function () {
        let elementIds: string[];
        let functionalElementKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const spatialCategoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              const drawingCategoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });

              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              const graphicsElement1 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
                parentId: graphicsElementParent.id,
              });
              const graphicsElement2 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
                parentId: graphicsElementParent.id,
              });
              const physicalElement1 = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: spatialCategoryKey.id,
              });
              const physicalElement2 = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: spatialCategoryKey.id,
                parentId: physicalElement1.id,
              });
              elementIds = [graphicsElement1.id, graphicsElement2.id, physicalElement1.id, physicalElement2.id];
              functionalElementKeys = [
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: graphicsElement2.id,
                  relationshipName: "DrawingGraphicRepresentsFunctionalElement",
                }),
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: graphicsElementParent.id,
                  relationshipName: "DrawingGraphicRepresentsFunctionalElement",
                }),
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: physicalElement1.id,
                  relationshipName: "PhysicalElementFulfillsFunction",
                }),
              ];
            });
          })
        ).imodelConnection;

        const actual = await getSelection(elementIds!, { id: "functional", ancestorLevel: 1 });
        expect(actual).toMatchObject(functionalElementKeys!);
      });

      it("returns top assembly related functional elements", async function () {
        let elementIds: string[];
        let physicalElement2: SelectableInstanceKey;
        let functionalElementKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            await withEditTxn(imodel, async (txn) => {
              const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
              await imodel.importSchemaStrings([schema]);
              const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
              const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
              const functionalModelKey = insertFunctionalModelWithPartition({
                txn,
                codeValue: "test functional model",
              });
              const spatialCategoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
              const drawingCategoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });

              const graphicsElementGrandParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
              });
              const graphicsElementParent = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
                parentId: graphicsElementGrandParent.id,
              });
              const graphicsElement1 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
                parentId: graphicsElementParent.id,
              });
              const graphicsElement2 = insertDrawingGraphic({
                txn,
                modelId: drawingModelKey.id,
                categoryId: drawingCategoryKey.id,
                parentId: graphicsElementParent.id,
              });
              const physicalElement1 = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: spatialCategoryKey.id,
              });
              physicalElement2 = insertPhysicalElement({
                txn,
                userLabel: "element",
                modelId: physicalModelKey.id,
                categoryId: spatialCategoryKey.id,
                parentId: physicalElement1.id,
              });
              elementIds = [graphicsElement1.id, graphicsElement2.id, physicalElement1.id, physicalElement2.id];
              functionalElementKeys = [
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: graphicsElement2.id,
                  relationshipName: "DrawingGraphicRepresentsFunctionalElement",
                }),
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: graphicsElementGrandParent.id,
                  relationshipName: "DrawingGraphicRepresentsFunctionalElement",
                }),
                insertFunctionalElement({
                  txn,
                  modelId: functionalModelKey.id,
                  representedElementId: physicalElement1.id,
                  relationshipName: "PhysicalElementFulfillsFunction",
                }),
              ];
            });
          })
        ).imodelConnection;

        const actual = await getSelection(elementIds!, { id: "functional", ancestorLevel: -1 });
        expect(actual).toEqual(expect.arrayContaining(functionalElementKeys!));
      });
    });
  });
});
