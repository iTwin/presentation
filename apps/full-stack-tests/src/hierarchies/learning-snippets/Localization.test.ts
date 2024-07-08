/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Localization.Imports
import { createHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { buildIModel, importSchema } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { createIModelAccess } from "../Utils";

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
            intProperty: 2,
          });
          insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            classFullName: schema.items.MyPhysicalObject.fullName,
            intProperty: 4,
          });
          insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            classFullName: schema.items.MyPhysicalObject.fullName,
            intProperty: 6,
          });
          insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            classFullName: schema.items.MyPhysicalObject.fullName,
          });
          return { myPhysicalObjectClassName: schema.items.MyPhysicalObject.fullName };
        });
        const imodelAccess = createIModelAccess(imodel);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Localization.PropertyGroupsLocalizationExample
        const hierarchyProvider = createHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            defineHierarchyLevel: async () => [
              // the hierarchy definition returns nodes for `myPhysicalObjectClassName` element type, grouped by `IntProperty` property value,
              // with options to create groups for out-of-range and unspecified values - labels of those grouping nodes get localized
              {
                fullClassName: myPhysicalObjectClassName,
                query: {
                  ecsql: `
                    SELECT ${await createNodesQueryClauseFactory({ imodelAccess }).createSelectClause({
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
            ],
          },
          localizedStrings: {
            other: "Kita",
            unspecified: "Nenurodyta",
          },
        });

        // The iModel has four elements of `myPhysicalObjectClassName` type:
        //
        // | No. of element | Value of `IntProperty` | Grouping node | Localized grouping node |
        // | -------------- | ---------------------- | ------------- | ----------------------- |
        // | 1              | 2                      | 1 - 5         | 1 - 5                   |
        // | 2              | 4                      | 1 - 5         | 1 - 5                   |
        // | 3              | 6                      | Other         | Kita                    |
        // | 4              | undefined              | Unspecified   | Nenurodyta              |
        //
        // As shown in the above table, we expect to get 3 grouping nodes: "1 - 5", "Other", and "Unspecified". The
        // latter two strings are localized using the `localizedStrings` object, provided to `createHierarchyProvider`.
        const nodes = hierarchyProvider.getNodes({ parentNode: undefined });
        // __PUBLISH_EXTRACT_END__

        expect((await collect(nodes)).map((node) => node.label)).to.deep.eq(["1 - 5", "Kita", "Nenurodyta"]);
      });
    });
  });
});
