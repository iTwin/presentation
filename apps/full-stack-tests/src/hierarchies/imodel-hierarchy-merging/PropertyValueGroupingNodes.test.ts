/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-this-alias */

import { omit } from "@itwin/core-bentley";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createChangedDbs, createHierarchyDefinitionFactory, createMergedHierarchyProvider, importXYZSchema } from "./HierarchiesMerging.js";

describe("Hierarchies", () => {
  before(async function () {
    await initialize();
  });

  after(async () => {
    await terminate();
  });

  describe("Merging iModel hierarchies", () => {
    describe("Property value grouping nodes", () => {
      describe("General case", () => {
        async function setupDbs(mochaContext: Mocha.Context) {
          return createChangedDbs(
            mochaContext,
            async (builder) => {
              const schema = await importXYZSchema(builder);
              const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
              const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1", ["PropY"]: 123 });
              builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
              const y2 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y2", ["PropY"]: 456 });
              builder.insertRelationship(schema.items.XY.fullName, x.id, y2.id);
              const y3 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y3", ["PropY"]: 789 });
              builder.insertRelationship(schema.items.XY.fullName, x.id, y3.id);
              return { schema, x, y1, y2, y3 };
            },
            async (builder, base) => {
              builder.deleteInstance(base.y2);
              builder.updateInstance(base.y3, { ["PropY"]: 888 });
              const y4 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y4", ["PropY"]: undefined });
              builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y4.id);
              return { ...omit(base, ["y2"]), y4 };
            },
          );
        }

        let dbs: Awaited<ReturnType<typeof setupDbs>>;
        let provider: ReturnType<typeof createMergedHierarchyProvider>;

        before(async function () {
          dbs = await setupDbs(this);
        });

        after(async () => {
          dbs[Symbol.dispose]();
        });

        beforeEach(() => {
          provider = createMergedHierarchyProvider({
            imodels: [
              {
                ecdb: dbs.base.ecdb,
                key: "base",
              },
              {
                ecdb: dbs.changeset1.ecdb,
                key: "changeset1",
              },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createYGroupingParams: (alias) => ({
                byProperties: {
                  propertiesClassName: dbs.base.schema.items.Y.fullName,
                  propertyGroups: [{ propertyClassAlias: alias, propertyName: "PropY" }],
                  createGroupForUnspecifiedValues: true,
                },
              }),
            }),
          });
        });

        it("merges grouping and grouped nodes", async function () {
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "x",
                children: [
                  NodeValidators.createForPropertyValueGroupingNode({
                    label: "123",
                    groupedInstanceKeys: [
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    ],
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "y1",
                        instanceKeys: [
                          { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                          { ...dbs.base.y1, imodelKey: "base" },
                        ],
                      }),
                    ],
                  }),
                  NodeValidators.createForPropertyValueGroupingNode({
                    label: "456",
                    groupedInstanceKeys: [{ ...dbs.base.y2, imodelKey: "base" }],
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "y2",
                        instanceKeys: [{ ...dbs.base.y2, imodelKey: "base" }],
                      }),
                    ],
                  }),
                  NodeValidators.createForPropertyValueGroupingNode({
                    label: "888",
                    groupedInstanceKeys: [
                      { ...dbs.base.y3, imodelKey: "base" },
                      { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                    ],
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "y3",
                        instanceKeys: [
                          { ...dbs.base.y3, imodelKey: "base" },
                          { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                        ],
                      }),
                    ],
                  }),
                  NodeValidators.createForPropertyValueGroupingNode({
                    label: "Not specified",
                    groupedInstanceKeys: [{ ...dbs.changeset1.y4, imodelKey: "changeset1" }],
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "y4",
                        instanceKeys: [{ ...dbs.changeset1.y4, imodelKey: "changeset1" }],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfOneGroupedNode` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1", ["PropY"]: 111 });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            return { schema, x, y1 };
          },
          async (builder, base) => {
            builder.deleteInstance(base.y1);
            const y2 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y2", ["PropY"]: 111 });
            builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y2.id);
            return { ...omit(base, ["y1"]), y2 };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
            imodels: [
              {
                // has one Y node that is not grouped
                ecdb: dbs.base.ecdb,
                key: "base",
              },
              {
                // has one Y node that is not grouped
                ecdb: dbs.changeset1.ecdb,
                key: "changeset1",
              },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createYGroupingParams: (alias) => ({
                byProperties: {
                  propertiesClassName: dbs.base.schema.items.Y.fullName,
                  propertyGroups: [{ propertyClassAlias: alias, propertyName: "PropY" }],
                  hideIfOneGroupedNode: true,
                },
              }),
            }),
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              label: "x",
              children: [
                NodeValidators.createForPropertyValueGroupingNode({
                  label: "111",
                  groupedInstanceKeys: [
                    { ...dbs.base.y1, imodelKey: "base" },
                    { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                  ],
                  children: [
                    NodeValidators.createForInstanceNode({
                      label: "y1",
                      instanceKeys: [{ ...dbs.base.y1, imodelKey: "base" }],
                    }),
                    NodeValidators.createForInstanceNode({
                      label: "y2",
                      instanceKeys: [{ ...dbs.changeset1.y2, imodelKey: "changeset1" }],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfNoSiblings` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1", ["PropY"]: 111 });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            return { schema, x, y1 };
          },
          async (builder, base) => {
            builder.deleteInstance(base.y1);
            const z = builder.insertInstance(base.schema.items.Z.fullName, { ["Label"]: "z" });
            builder.insertRelationship(base.schema.items.XZ.fullName, base.x.id, z.id);
            return { ...omit(base, ["y1"]), z };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
            imodels: [
              {
                // has Y node which is not grouped
                ecdb: dbs.base.ecdb,
                key: "base",
              },
              {
                // has Z node
                ecdb: dbs.changeset1.ecdb,
                key: "changeset1",
              },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createYGroupingParams: (alias) => ({
                byProperties: {
                  propertiesClassName: dbs.base.schema.items.Y.fullName,
                  propertyGroups: [{ propertyClassAlias: alias, propertyName: "PropY" }],
                  hideIfNoSiblings: true,
                },
              }),
            }),
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              label: "x",
              children: [
                NodeValidators.createForPropertyValueGroupingNode({
                  label: "111",
                  groupedInstanceKeys: [{ ...dbs.base.y1, imodelKey: "base" }],
                  children: [
                    NodeValidators.createForInstanceNode({
                      label: "y1",
                      instanceKeys: [{ ...dbs.base.y1, imodelKey: "base" }],
                    }),
                  ],
                }),
                NodeValidators.createForInstanceNode({
                  label: "z",
                  instanceKeys: [{ ...dbs.changeset1.z, imodelKey: "changeset1" }],
                }),
              ],
            }),
          ],
        });
      });
    });
  });
});
