/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Localization.Imports
import { createIModelHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
import { buildIModel, importSchema } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { createIModelAccess } from "../Utils.js";
import { collectHierarchy } from "./Utils.js";

// cspell:words Kita Nenurodyta

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Localization", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      it("localizes property grouping node labels", async function () {
        const { imodel, myPhysicalObjectClassName } = await buildIModel(this, async (builder, mochaContext) => {
          const schema = await importSchema(
            mochaContext,
            builder,
            `
              <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
              <ECEntityClass typeName="MyPhysicalObject">
                <BaseClass>bis:PhysicalElement</BaseClass>
                <ECProperty propertyName="IntProperty" typeName="int" />
              </ECEntityClass>
            `,
          );
          const category = insertSpatialCategory({ builder, codeValue: "Category" });
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "Model" });
          insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            classFullName: schema.items.MyPhysicalObject.fullName,
            userLabel: "Element 1",
            intProperty: 2,
          });
          insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            classFullName: schema.items.MyPhysicalObject.fullName,
            userLabel: "Element 2",
            intProperty: 4,
          });
          insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            classFullName: schema.items.MyPhysicalObject.fullName,
            userLabel: "Element 3",
            intProperty: 6,
          });
          insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            classFullName: schema.items.MyPhysicalObject.fullName,
            userLabel: "Element 4",
          });
          return { myPhysicalObjectClassName: schema.items.MyPhysicalObject.fullName };
        });
        const imodelAccess = createIModelAccess(imodel);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Localization.PropertyGroupsLocalizationExample
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            defineHierarchyLevel: async ({ parentNode }) => {
              if (!parentNode) {
                // The hierarchy definition returns nodes for `myPhysicalObjectClassName` element type, grouped by `IntProperty` property value,
                // with options to create groups for out-of-range and unspecified values - labels of those grouping nodes get localized
                return [
                  {
                    fullClassName: myPhysicalObjectClassName,
                    query: {
                      ecsql: `
                        SELECT ${await createNodesQueryClauseFactory({
                          imodelAccess,
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                        }).createSelectClause({
                          ecClassId: { selector: "this.ECClassId" },
                          ecInstanceId: { selector: "this.ECInstanceId" },
                          nodeLabel: { selector: "this.UserLabel" },
                          grouping: {
                            byProperties: {
                              propertiesClassName: myPhysicalObjectClassName,
                              propertyGroups: [
                                {
                                  propertyClassAlias: "this",
                                  propertyName: "IntProperty",
                                  ranges: [{ fromValue: 1, toValue: 5 }],
                                },
                              ],
                              createGroupForOutOfRangeValues: true,
                              createGroupForUnspecifiedValues: true,
                            },
                          },
                        })}
                        FROM ${myPhysicalObjectClassName} this
                      `,
                    },
                  },
                ];
              }
              return [];
            },
          },
          localizedStrings: {
            other: "Kita",
            unspecified: "Nenurodyta",
          },
        });

        // The iModel has four elements of `myPhysicalObjectClassName` type:
        //
        // | Element's label | Value of `IntProperty` | Grouping node | Localized grouping node |
        // | --------------- | ---------------------- | ------------- | ----------------------- |
        // | Element 1       | 2                      | 1 - 5         | 1 - 5                   |
        // | Element 2       | 4                      | 1 - 5         | 1 - 5                   |
        // | Element 3       | 6                      | Other         | Kita                    |
        // | Element 4       | undefined              | Unspecified   | Nenurodyta              |
        //
        // As shown in the above table, we expect to get 3 grouping nodes: "1 - 5", "Other", and "Unspecified". The
        // latter two strings are localized using the `localizedStrings` object, provided to `createIModelHierarchyProvider`.
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
          { label: "1 - 5", children: [{ label: "Element 1" }, { label: "Element 2" }] },
          { label: "Kita", children: [{ label: "Element 3" }] },
          { label: "Nenurodyta", children: [{ label: "Element 4" }] },
        ]);
        // __PUBLISH_EXTRACT_END__
      });
    });
  });
});
