/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BisCodeSpec, Code } from "@itwin/core-common";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.MergedIModelHierarchies.Imports
import {
  createIModelHierarchyProvider,
  createMergedIModelHierarchyProvider,
  createPredicateBasedHierarchyDefinition,
  DefineInstanceNodeChildHierarchyLevelProps,
} from "@itwin/presentation-hierarchies";
import { EC } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
import { createChangedIModels } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { createIModelAccess } from "../Utils.js";
import { collectHierarchy } from "./Utils.js";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Merged iModel hierarchies", () => {
      beforeAll(async () => {
        await initialize();
      });

      afterAll(async () => {
        await terminate();
      });

      it("creates merged iModel hierarchy", async function () {
        await using changesets = await createChangedIModels(
          async (imodel) => {
            const model1 = insertPhysicalModelWithPartition({ imodel, codeValue: "Model 1" });
            const category = insertSpatialCategory({ imodel, codeValue: "Category" });
            const element1 = insertPhysicalElement({
              imodel,
              modelId: model1.id,
              categoryId: category.id,
              codeValue: "Element 1",
            });
            const element2 = insertPhysicalElement({
              imodel,
              modelId: model1.id,
              categoryId: category.id,
              codeValue: "Element 2",
            });
            const element3 = insertPhysicalElement({
              imodel,
              modelId: model1.id,
              categoryId: category.id,
              codeValue: "Element 3",
            });
            return { model1, category, element1, element2, element3 };
          },
          async (imodel, base) => {
            const { element2, ...restKeys } = base;
            imodel.elements.deleteElement(element2.id);
            imodel.elements.updateElement({
              id: base.element3.id,
              code: new Code({
                spec: imodel.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).id,
                scope: base.model1.id,
                value: "Updated element 3",
              }),
            });
            const element4 = insertPhysicalElement({
              imodel,
              modelId: base.model1.id,
              categoryId: base.category.id,
              codeValue: "Element 4",
            });
            const model2 = insertPhysicalModelWithPartition({ imodel, codeValue: "Model 2" });
            const element5 = insertPhysicalElement({
              imodel,
              modelId: model2.id,
              categoryId: base.category.id,
              codeValue: "Element 5",
            });
            return { ...restKeys, model2, element4, element5 };
          },
        );

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.MergedIModelHierarchies.Example
        // Each version of the iModel already has an open `IModelConnection`. Create iModel access objects for
        // both versions - `base` and `changeset1`. The order is important - we want the changesets to be from oldest to
        // newest.
        const imodels = [
          { imodelAccess: createIModelAccess(changesets.base.imodelConnection) },
          { imodelAccess: createIModelAccess(changesets.changeset1.imodelConnection) },
        ];

        // Define an utility for creating instance nodes query definitions, that we'll use in our hierarchy definition.
        async function createInstanceNodesQueryDefinition({
          instanceLabelSelectClauseFactory,
          nodeSelectClauseFactory,
          fullClassName,
          whereClauseFactory,
        }: Pick<
          DefineInstanceNodeChildHierarchyLevelProps,
          "instanceLabelSelectClauseFactory" | "nodeSelectClauseFactory"
        > & { fullClassName: EC.FullClassName; whereClauseFactory?: (props: { alias: string }) => Promise<string> }) {
          const whereClause = whereClauseFactory ? await whereClauseFactory({ alias: "this" }) : undefined;
          return {
            fullClassName,
            query: {
              ecsql: `
                SELECT ${await nodeSelectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: {
                    selector: await instanceLabelSelectClauseFactory.createSelectClause({
                      classAlias: "this",
                      className: fullClassName,
                    }),
                  },
                })}
                FROM ${fullClassName} AS this
                ${whereClause ? `WHERE ${whereClause}` : ""}
              `,
            },
          };
        }

        // Create a simple hierarchy definition that uses `BisCore.PhysicalModel` for root nodes and
        // `BisCore.PhysicalElement` for each model's child nodes.
        const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
          // Note: we use the latest version of the iModel as our class hierarchy inspector - that
          // ensures we can find all classes even if they were not present in the base iModel
          classHierarchyInspector: imodels[imodels.length - 1].imodelAccess,
          hierarchy: {
            rootNodes: async (props) => [
              await createInstanceNodesQueryDefinition({ ...props, fullClassName: "BisCore.PhysicalModel" }),
            ],
            childNodes: [
              {
                parentInstancesNodePredicate: "BisCore.PhysicalModel",
                definitions: async (props: DefineInstanceNodeChildHierarchyLevelProps) => [
                  await createInstanceNodesQueryDefinition({
                    ...props,
                    fullClassName: "BisCore.PhysicalElement",
                    whereClauseFactory: async ({ alias }) =>
                      `${alias}.Model.Id IN (${props.parentNodeInstanceIds.join(", ")})`,
                  }),
                ],
              },
            ],
          },
        });
        // __PUBLISH_EXTRACT_END__

        expect(
          await collectHierarchy(
            createIModelHierarchyProvider({ hierarchyDefinition, imodelAccess: imodels[0].imodelAccess }),
          ),
        ).toMatchObject(
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.MergedIModelHierarchies.Example.Version1Hierarchy
          // The first iModel version has 3 elements in "Model 1". The resulting hierarchy:
          [{ label: "Model 1", children: [{ label: "Element 1" }, { label: "Element 2" }, { label: "Element 3" }] }],
          // __PUBLISH_EXTRACT_END__
        );

        expect(
          await collectHierarchy(
            createIModelHierarchyProvider({ hierarchyDefinition, imodelAccess: imodels[1].imodelAccess }),
          ),
        ).toMatchObject(
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.MergedIModelHierarchies.Example.Version2Hierarchy
          // The second iModel version has the following changes:
          // - "Element 2" was deleted
          // - "Element 3" was updated to "Updated element 3"
          // - "Element 4" was added under "Model 1"
          // - "Model 2" with "Element 5" was added
          //
          // The resulting hierarchy:
          [
            {
              label: "Model 1",
              children: [{ label: "Element 1" }, { label: "Element 4" }, { label: "Updated element 3" }],
            },
            { label: "Model 2", children: [{ label: "Element 5" }] },
          ],
          // __PUBLISH_EXTRACT_END__
        );

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.MergedIModelHierarchies.Example.MergedHierarchyProvider
        const mergedHierarchyProvider = createMergedIModelHierarchyProvider({ imodels, hierarchyDefinition });
        // __PUBLISH_EXTRACT_END__
        expect(await collectHierarchy(mergedHierarchyProvider)).toMatchObject(
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.MergedIModelHierarchies.Example.MergedHierarchy
          [
            // "Model 1" exists in both iModel versions - its elements are merged
            {
              label: "Model 1",
              children: [
                // "Element 1" exists in both iModel versions
                { label: "Element 1" },
                // "Element 2" exists only in the 1st iModel version (deleted in the 2nd)
                { label: "Element 2" },
                // "Element 4" exists only in the 2nd iModel version (added in the 2nd)
                { label: "Element 4" },
                // "Element 3" exists in both iModel versions, but was updated in the 2nd version
                // to have a different label ("Element 3" -> "Updated element 3")
                { label: "Updated element 3" },
              ],
            },
            // "Model 2" and its "Element 5" come from the 2nd iModel version
            { label: "Model 2", children: [{ label: "Element 5" }] },
          ],
          // __PUBLISH_EXTRACT_END__
        );
      });
    });
  });
});
