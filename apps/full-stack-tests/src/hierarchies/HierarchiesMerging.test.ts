/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-this-alias */

import { expect } from "chai";
import { ECDb } from "@itwin/core-backend";
import { assert, omit } from "@itwin/core-bentley";
import {
  createMergedIModelHierarchyProvider,
  createNodesQueryClauseFactory,
  createPredicateBasedHierarchyDefinition,
  DefineGenericNodeChildHierarchyLevelProps,
  DefineInstanceNodeChildHierarchyLevelProps,
  GroupingHierarchyNode,
  HierarchyDefinition,
  HierarchyNode,
  HierarchyNodeKey,
  InstancesNodeKey,
  NodesQueryClauseFactory,
} from "@itwin/presentation-hierarchies";
import { createDefaultInstanceLabelSelectClauseFactory, ECSqlBinding, Props } from "@itwin/presentation-shared";
import { cloneECDb, createECDb, ECDbBuilder, importSchema } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { validateHierarchy } from "./HierarchyValidation.js";
import { createIModelAccess } from "./Utils.js";

describe("Hierarchies", () => {
  before(async function () {
    await initialize();
  });

  after(async () => {
    await terminate();
  });

  describe("Merging iModel hierarchies", () => {
    it("merges generic nodes", async function () {
      const mochaContext = this;
      using dbs = await createChangedDbs(
        mochaContext,
        async (builder) => {
          const schema = await importXYZSchema(builder, mochaContext);
          const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
          const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1" });
          builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
          return { schema, x, y1 };
        },
        async (builder, base) => {
          const y2 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y2" });
          builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y2.id);
          return { ...base, y2 };
        },
      );

      await validateHierarchy({
        provider: createMergedHierarchyProvider({
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
            createGenericNodeForY: true,
          }),
        }),
        expect: [
          {
            node: (node) => expect(node.label).to.eq(`x`),
            children: [
              {
                node: (node) => {
                  expect(HierarchyNode.isGeneric(node));
                  expect(node.label).to.eq("Y elements");
                },
                children: [
                  {
                    // exists in both imodels
                    node: (node) => {
                      expect(node.label).to.eq(`y1`);
                      expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                        { ...dbs.base.y1, imodelKey: "base" },
                        { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                      ]);
                    },
                  },
                  {
                    // exists only in the second imodel
                    node: (node) => {
                      expect(node.label).to.eq(`y2`);
                      expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y2, imodelKey: "changeset1" }]);
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
    });

    it("merges instance nodes", async function () {
      const mochaContext = this;
      using dbs = await createChangedDbs(
        mochaContext,
        async (builder) => {
          const schema = await importXYZSchema(builder, mochaContext);
          const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
          const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1" });
          builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
          const y2 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y2" });
          builder.insertRelationship(schema.items.XY.fullName, x.id, y2.id);
          const y3 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y3" });
          builder.insertRelationship(schema.items.XY.fullName, x.id, y3.id);
          return { schema, x, y1, y2, y3 };
        },
        async (builder, base) => {
          builder.deleteInstance(base.y2);
          builder.updateInstance(base.y3, { ["Label"]: "y3-updated" });
          const y4 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y4" });
          builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y4.id);
          return { ...omit(base, ["y2"]), y4 };
        },
      );

      await validateHierarchy({
        provider: createMergedHierarchyProvider({
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
          }),
        }),
        expect: [
          {
            node: (node) => expect(node.label).to.eq(`x`),
            children: [
              {
                // exists in both imodels
                node: (node) => {
                  expect(node.label).to.eq(`y1`);
                  expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                    { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    { ...dbs.base.y1, imodelKey: "base" },
                  ]);
                },
              },
              {
                // exists only in the first imodel
                node: (node) => {
                  expect(node.label).to.eq(`y2`);
                  expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y2, imodelKey: "base" }]);
                },
              },
              {
                // exists in both, but have different values
                node: (node) => {
                  expect(node.label).to.eq(`y3-updated`);
                  expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                    { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                    { ...dbs.base.y3, imodelKey: "base" },
                  ]);
                },
              },
              {
                // exists only in the second imodel
                node: (node) => {
                  expect(node.label).to.eq(`y4`);
                  expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y4, imodelKey: "changeset1" }]);
                },
              },
            ],
          },
        ],
      });
    });

    describe("label grouping nodes", () => {
      it("merges grouping and grouped nodes", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y-group" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            const y2 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y-group" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y2.id);
            const y3 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y-other-group" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y3.id);
            return { schema, x, y1, y2, y3 };
          },
          async (builder, base) => {
            builder.updateInstance(base.y2, { ["Label"]: "y-group-updated" });
            const y4 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y-other-group" });
            builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y4.id);
            return { ...base, y4 };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
            imodels: [
              { ecdb: dbs.base.ecdb, key: "base" },
              { ecdb: dbs.changeset1.ecdb, key: "changeset1" },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createGroupingParams: () => ({ byLabel: true }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isLabelGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`y-group`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    ]);
                  },
                  childrenUnordered: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y-group`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.base.y1, imodelKey: "base" },
                          { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                        ]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(HierarchyNode.isLabelGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`y-group-updated`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y2, imodelKey: "base" },
                      { ...dbs.base.y2, imodelKey: "changeset1" },
                    ]);
                  },
                  childrenUnordered: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y-group-updated`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.base.y2, imodelKey: "base" },
                          { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                        ]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(HierarchyNode.isLabelGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`y-other-group`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y3, imodelKey: "base" },
                      { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                      { ...dbs.changeset1.y4, imodelKey: "changeset1" },
                    ]);
                  },
                  childrenUnordered: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y-other-group`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.base.y3, imodelKey: "base" },
                          { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                        ]);
                      },
                    },
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y-other-group`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y4, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfOneGroupedNode` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            return { schema, x, y1 };
          },
          async (builder, base) => {
            const y2 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y" });
            builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y2.id);
            return { ...base, y2 };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
            imodels: [
              { ecdb: dbs.base.ecdb, key: "base" },
              { ecdb: dbs.changeset1.ecdb, key: "changeset1" },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createGroupingParams: () => ({ byLabel: { hideIfOneGroupedNode: true } }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isLabelGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`y`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                      { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                    ]);
                  },
                  childrenUnordered: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.base.y1, imodelKey: "base" },
                          { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                        ]);
                      },
                    },
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y2, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfNoSiblings` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y.id);
            return { schema, x, y };
          },
          async (builder, base) => {
            builder.deleteInstance(base.y);
            const z = builder.insertInstance(base.schema.items.Z.fullName, { ["Label"]: "z" });
            builder.insertRelationship(base.schema.items.XZ.fullName, base.x.id, z.id);
            return { ...omit(base, ["y"]), z };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
            imodels: [
              {
                // has Y node which is not grouped by class
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
              createGroupingParams: () => ({ byLabel: { hideIfNoSiblings: true } }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isLabelGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`y`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y, imodelKey: "base" }]);
                  },
                  childrenUnordered: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y, imodelKey: "base" }]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(node.label).to.eq(`z`);
                    expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.z, imodelKey: "changeset1" }]);
                  },
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to different `groupId` flags", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y", ["PropY"]: 0 });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            const y2 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y", ["PropY"]: 2 });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y2.id);
            return { schema, x, y1, y2 };
          },
          async (builder, base) => {
            builder.updateInstance(base.y2, { ["PropY"]: 0 });
            return { ...base };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
            imodels: [
              {
                // has two Y nodes with "y" label, but their PropY values are different
                ecdb: dbs.base.ecdb,
                key: "base",
              },
              {
                // has the same Y nodes, but in this case their PropY values are the same
                ecdb: dbs.changeset1.ecdb,
                key: "changeset1",
              },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createGroupingParams: (alias) => ({ byLabel: { groupId: { selector: `${alias}.PropY` } } }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isLabelGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`y`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                      { ...dbs.base.y2, imodelKey: "base" },
                      { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                    ]);
                  },
                  childrenUnordered: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.base.y1, imodelKey: "base" },
                          { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                        ]);
                      },
                    },
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.base.y2, imodelKey: "base" },
                          { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                        ]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates merged label node", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            return { schema, x, y1 };
          },
          async (builder, base) => {
            const y2 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y" });
            builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y2.id);
            return { ...base, y2 };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
            imodels: [
              {
                // has Y node which is not grouped by class
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
              createGroupingParams: () => ({ byLabel: { action: "merge" } }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isInstancesNode(node)).to.be.true;
                    expect(node.label).to.eq(`y`);
                    expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                      { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                    ]);
                  },
                  children: false,
                },
              ],
            },
          ],
        });
      });
    });

    describe("class grouping nodes", () => {
      it("merges grouping and grouped nodes", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            const y2 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y2" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y2.id);
            const y3 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y3" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y3.id);
            return { schema, x, y1, y2, y3 };
          },
          async (builder, base) => {
            builder.deleteInstance(base.y2);
            builder.updateInstance(base.y3, { ["Label"]: "y3-updated" });
            const y4 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y4" });
            builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y4.id);
            return { ...omit(base, ["y2"]), y4 };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
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
              createGroupingParams: () => ({ byClass: true }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isClassGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`Y`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.base.y2, imodelKey: "base" },
                      { ...dbs.base.y3, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                      { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                      { ...dbs.changeset1.y4, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      // exists in both imodels
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                          { ...dbs.base.y1, imodelKey: "base" },
                        ]);
                      },
                    },
                    {
                      // exists only in the first imodel
                      node: (node) => {
                        expect(node.label).to.eq(`y2`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y2, imodelKey: "base" }]);
                      },
                    },
                    {
                      // exists in both, but have different values
                      node: (node) => {
                        expect(node.label).to.eq(`y3-updated`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                          { ...dbs.base.y3, imodelKey: "base" },
                        ]);
                      },
                    },
                    {
                      // exists only in the second imodel
                      node: (node) => {
                        expect(node.label).to.eq(`y4`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y4, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfOneGroupedNode` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            return { schema, x, y1 };
          },
          async (builder, base) => {
            builder.deleteInstance(base.y1);
            const y2 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y2" });
            builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y2.id);
            return { ...omit(base, ["y1"]), y2 };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
            imodels: [
              {
                // has one Y node that is not grouped by class
                ecdb: dbs.base.ecdb,
                key: "base",
              },
              {
                // has one Y node that is not grouped by class
                ecdb: dbs.changeset1.ecdb,
                key: "changeset1",
              },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createGroupingParams: () => ({ byClass: { hideIfOneGroupedNode: true } }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isClassGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`Y`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                      },
                    },
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y2`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y2, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfNoSiblings` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1" });
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
                // has Y node which is not grouped by class
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
              createGroupingParams: () => ({ byClass: { hideIfNoSiblings: true } }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isClassGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`Y`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                  },
                  children: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(node.label).to.eq(`z`);
                    expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.z, imodelKey: "changeset1" }]);
                  },
                },
              ],
            },
          ],
        });
      });
    });

    describe("base class grouping nodes", () => {
      it("merges grouping and grouped nodes", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            const y2 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y2" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y2.id);
            const y3 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y3" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y3.id);
            return { schema, x, y1, y2, y3 };
          },
          async (builder, base) => {
            builder.deleteInstance(base.y2);
            builder.updateInstance(base.y3, { ["Label"]: "y3-updated" });
            const y4 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y4" });
            builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y4.id);
            return { ...omit(base, ["y2"]), y4 };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
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
              createGroupingParams: () => ({ byBaseClasses: { fullClassNames: [dbs.base.schema.items.Y.fullName] } }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isClassGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`Y`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.base.y2, imodelKey: "base" },
                      { ...dbs.base.y3, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                      { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                      { ...dbs.changeset1.y4, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      // exists in both imodels
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                          { ...dbs.base.y1, imodelKey: "base" },
                        ]);
                      },
                    },
                    {
                      // exists only in the first imodel
                      node: (node) => {
                        expect(node.label).to.eq(`y2`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y2, imodelKey: "base" }]);
                      },
                    },
                    {
                      // exists in both, but have different values
                      node: (node) => {
                        expect(node.label).to.eq(`y3-updated`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                          { ...dbs.base.y3, imodelKey: "base" },
                        ]);
                      },
                    },
                    {
                      // exists only in the second imodel
                      node: (node) => {
                        expect(node.label).to.eq(`y4`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y4, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfOneGroupedNode` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1" });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            return { schema, x, y1 };
          },
          async (builder, base) => {
            builder.deleteInstance(base.y1);
            const y2 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y2" });
            builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y2.id);
            return { ...omit(base, ["y1"]), y2 };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
            imodels: [
              {
                // has one Y node that is not grouped by class
                ecdb: dbs.base.ecdb,
                key: "base",
              },
              {
                // has one Y node that is not grouped by class
                ecdb: dbs.changeset1.ecdb,
                key: "changeset1",
              },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createGroupingParams: () => ({ byBaseClasses: { fullClassNames: [dbs.base.schema.items.Y.fullName], hideIfOneGroupedNode: true } }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isClassGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`Y`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                      },
                    },
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y2`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y2, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfNoSiblings` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1" });
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
                // has Y node which is not grouped by class
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
              createGroupingParams: () => ({ byBaseClasses: { fullClassNames: [dbs.base.schema.items.Y.fullName], hideIfNoSiblings: true } }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isClassGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`Y`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                  },
                  children: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(node.label).to.eq(`z`);
                    expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.z, imodelKey: "changeset1" }]);
                  },
                },
              ],
            },
          ],
        });
      });
    });

    describe("property value grouping nodes", () => {
      it("merges grouping and grouped nodes", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
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

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
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
              createGroupingParams: (alias) => ({
                byProperties: {
                  propertiesClassName: dbs.base.schema.items.Y.fullName,
                  propertyGroups: [{ propertyClassAlias: alias, propertyName: "PropY" }],
                  createGroupForUnspecifiedValues: true,
                },
              }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`123`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      // exists in both imodels
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                          { ...dbs.base.y1, imodelKey: "base" },
                        ]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`456`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y2, imodelKey: "base" }]);
                  },
                  children: [
                    {
                      // exists only in the first imodel
                      node: (node) => {
                        expect(node.label).to.eq(`y2`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y2, imodelKey: "base" }]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`888`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y3, imodelKey: "base" },
                      { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      // exists in both, but have different values
                      node: (node) => {
                        expect(node.label).to.eq(`y3`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.base.y3, imodelKey: "base" },
                          { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                        ]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`Not specified`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y4, imodelKey: "changeset1" }]);
                  },
                  children: [
                    {
                      // exists only in the second imodel
                      node: (node) => {
                        expect(node.label).to.eq(`y4`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y4, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfOneGroupedNode` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
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
              createGroupingParams: (alias) => ({
                byProperties: {
                  propertiesClassName: dbs.base.schema.items.Y.fullName,
                  propertyGroups: [{ propertyClassAlias: alias, propertyName: "PropY" }],
                  hideIfOneGroupedNode: true,
                },
              }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`111`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                      },
                    },
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y2`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y2, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfNoSiblings` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
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
              createGroupingParams: (alias) => ({
                byProperties: {
                  propertiesClassName: dbs.base.schema.items.Y.fullName,
                  propertyGroups: [{ propertyClassAlias: alias, propertyName: "PropY" }],
                  hideIfNoSiblings: true,
                },
              }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`111`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                  },
                  children: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(node.label).to.eq(`z`);
                    expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.z, imodelKey: "changeset1" }]);
                  },
                },
              ],
            },
          ],
        });
      });
    });

    describe("property range grouping nodes", () => {
      it("merges grouping and grouped nodes", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1", ["PropY"]: 11 });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            const y2 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y2", ["PropY"]: 21 });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y2.id);
            const y3 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y3", ["PropY"]: 22 });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y3.id);
            return { schema, x, y1, y2, y3 };
          },
          async (builder, base) => {
            builder.deleteInstance(base.y2);
            builder.updateInstance(base.y3, { ["PropY"]: 31 });
            const y4 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y4", ["PropY"]: 41 });
            builder.insertRelationship(base.schema.items.XY.fullName, base.x.id, y4.id);
            return { ...omit(base, ["y2"]), y4 };
          },
        );

        await validateHierarchy({
          provider: createMergedHierarchyProvider({
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
              createGroupingParams: (alias) => ({
                byProperties: {
                  propertiesClassName: dbs.base.schema.items.Y.fullName,
                  propertyGroups: [
                    {
                      propertyClassAlias: alias,
                      propertyName: "PropY",
                      ranges: [
                        { fromValue: 10, toValue: 20, rangeLabel: "10 - 20" },
                        { fromValue: 20, toValue: 30, rangeLabel: "20 - 30" },
                        { fromValue: 30, toValue: 40, rangeLabel: "30 - 40" },
                      ],
                    },
                  ],
                  createGroupForOutOfRangeValues: true,
                },
              }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueRangeGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`10 - 20`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      // exists in both imodels
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                          { ...dbs.base.y1, imodelKey: "base" },
                        ]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueRangeGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`20 - 30`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y2, imodelKey: "base" }]);
                  },
                  children: [
                    {
                      // exists only in the first imodel
                      node: (node) => {
                        expect(node.label).to.eq(`y2`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y2, imodelKey: "base" }]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueRangeGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`30 - 40`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y3, imodelKey: "base" },
                      { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      // exists in both, but have different values
                      node: (node) => {
                        expect(node.label).to.eq(`y3`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([
                          { ...dbs.base.y3, imodelKey: "base" },
                          { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                        ]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyOtherValuesGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`Other`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y4, imodelKey: "changeset1" }]);
                  },
                  children: [
                    {
                      // exists only in the second imodel
                      node: (node) => {
                        expect(node.label).to.eq(`y4`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y4, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfOneGroupedNode` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
            const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1", ["PropY"]: 111 });
            builder.insertRelationship(schema.items.XY.fullName, x.id, y1.id);
            return { schema, x, y1 };
          },
          async (builder, base) => {
            builder.deleteInstance(base.y1);
            const y2 = builder.insertInstance(base.schema.items.Y.fullName, { ["Label"]: "y2", ["PropY"]: 199 });
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
              createGroupingParams: (alias) => ({
                byProperties: {
                  propertiesClassName: dbs.base.schema.items.Y.fullName,
                  propertyGroups: [{ propertyClassAlias: alias, propertyName: "PropY", ranges: [{ fromValue: 100, toValue: 200 }] }],
                  hideIfOneGroupedNode: true,
                },
              }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueRangeGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`100 - 200`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                    ]);
                  },
                  children: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                      },
                    },
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y2`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.y2, imodelKey: "changeset1" }]);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      });

      it("creates grouping node when it's not created for individual imodels due to `hideIfNoSiblings` flag", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder, mochaContext);
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
              createGroupingParams: (alias) => ({
                byProperties: {
                  propertiesClassName: dbs.base.schema.items.Y.fullName,
                  propertyGroups: [{ propertyClassAlias: alias, propertyName: "PropY", ranges: [{ fromValue: 100, toValue: 200 }] }],
                  hideIfNoSiblings: true,
                },
              }),
            }),
          }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`x`),
              children: [
                {
                  node: (node) => {
                    expect(HierarchyNode.isPropertyValueRangeGroupingNode(node)).to.be.true;
                    expect(node.label).to.eq(`100 - 200`);
                    expect((node as GroupingHierarchyNode).groupedInstanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                  },
                  children: [
                    {
                      node: (node) => {
                        expect(node.label).to.eq(`y1`);
                        expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.base.y1, imodelKey: "base" }]);
                      },
                    },
                  ],
                },
                {
                  node: (node) => {
                    expect(node.label).to.eq(`z`);
                    expect((node.key as InstancesNodeKey).instanceKeys).to.deep.equalInAnyOrder([{ ...dbs.changeset1.z, imodelKey: "changeset1" }]);
                  },
                },
              ],
            },
          ],
        });
      });
    });
  });
});

function createHierarchyDefinitionFactory({
  schema,
  createGroupingParams,
  createGenericNodeForY,
}: {
  schema: Awaited<ReturnType<typeof importSchema>>;
  createGroupingParams?: (alias: string) => Props<NodesQueryClauseFactory["createSelectClause"]>["grouping"];
  createGenericNodeForY?: boolean;
}): Props<typeof createMergedHierarchyProvider>["createHierarchyDefinition"] {
  const classes = schema.items;

  const rootNodes = async ({ selectQueryFactory }: { selectQueryFactory: ReturnType<typeof createNodesQueryClauseFactory> }) => [
    {
      fullClassName: classes.X.fullName,
      query: {
        ecsql: `
          SELECT ${await selectQueryFactory.createSelectClause({
            ecClassId: { selector: `this.ECClassId` },
            ecInstanceId: { selector: `this.ECInstanceId` },
            nodeLabel: { selector: "this.Label" },
          })}
          FROM ${classes.X.fullName} AS this
        `,
      },
    },
  ];
  const childNodesForX = async ({
    selectQueryFactory,
    parentNodeInstanceIds,
  }: {
    selectQueryFactory: ReturnType<typeof createNodesQueryClauseFactory>;
    parentNodeInstanceIds: DefineInstanceNodeChildHierarchyLevelProps["parentNodeInstanceIds"];
  }) => [
    {
      fullClassName: classes.Y.fullName,
      query: {
        ecsql: `
            SELECT ${await selectQueryFactory.createSelectClause({
              ecClassId: { selector: `this.ECClassId` },
              ecInstanceId: { selector: `this.ECInstanceId` },
              nodeLabel: { selector: "this.Label" },
              grouping: createGroupingParams?.("this"),
            })}
            FROM ${classes.Y.fullName} AS this
            JOIN ${classes.XY.fullName} AS xy ON xy.TargetECInstanceId = this.ECInstanceId
            WHERE xy.SourceECInstanceId IN (${parentNodeInstanceIds.map(() => "?").join(",")})
          `,
        bindings: parentNodeInstanceIds.map((id): ECSqlBinding => ({ type: "id", value: id })),
      },
    },
    {
      fullClassName: classes.Z.fullName,
      query: {
        ecsql: `
            SELECT ${await selectQueryFactory.createSelectClause({
              ecClassId: { selector: `this.ECClassId` },
              ecInstanceId: { selector: `this.ECInstanceId` },
              nodeLabel: { selector: "this.Label" },
            })}
            FROM ${classes.Z.fullName} AS this
            JOIN ${classes.XZ.fullName} AS xz ON xz.TargetECInstanceId = this.ECInstanceId
            WHERE xz.SourceECInstanceId IN (${parentNodeInstanceIds.map(() => "?").join(",")})
          `,
        bindings: parentNodeInstanceIds.map((id): ECSqlBinding => ({ type: "id", value: id })),
      },
    },
  ];

  return ({ imodelAccess, selectQueryFactory }) =>
    createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      hierarchy: {
        rootNodes: async () => rootNodes({ selectQueryFactory }),
        childNodes: createGenericNodeForY
          ? [
              {
                parentInstancesNodePredicate: classes.X.fullName,
                definitions: async ({ parentNodeInstanceIds }: DefineInstanceNodeChildHierarchyLevelProps) => [
                  {
                    node: {
                      label: "Y elements",
                      key: "y-elements",
                      extendedData: {
                        parentNodeInstanceIds,
                      },
                    },
                  },
                ],
              },
              {
                parentGenericNodePredicate: async ({ id }) => id === "y-elements",
                definitions: async ({ parentNode }: DefineGenericNodeChildHierarchyLevelProps) => {
                  const xNodeKey = parentNode.parentKeys[parentNode.parentKeys.length - 1];
                  assert(HierarchyNodeKey.isInstances(xNodeKey));
                  const parentNodeInstanceIds = xNodeKey.instanceKeys.map(({ id }) => id);
                  return childNodesForX({ selectQueryFactory, parentNodeInstanceIds });
                },
              },
            ]
          : [
              {
                parentInstancesNodePredicate: classes.X.fullName,
                definitions: async ({ parentNodeInstanceIds }: DefineInstanceNodeChildHierarchyLevelProps) =>
                  childNodesForX({ selectQueryFactory, parentNodeInstanceIds }),
              },
            ],
      },
    });
}

async function importXYZSchema(target: ECDbBuilder, mochaContext: Mocha.Context) {
  return importSchema(
    mochaContext,
    target,
    `
      <ECEntityClass typeName="X">
        <ECProperty propertyName="Label" typeName="string" />
        <ECProperty propertyName="PropX" typeName="int" />
      </ECEntityClass>

      <ECEntityClass typeName="Y">
        <ECProperty propertyName="Label" typeName="string" />
        <ECProperty propertyName="PropY" typeName="int" />
      </ECEntityClass>
      <ECRelationshipClass typeName="XY" strength="referencing" strengthDirection="forward" modifier="None">
          <Source multiplicity="(0..*)" roleLabel="xy" polymorphic="False">
              <Class class="X" />
          </Source>
          <Target multiplicity="(0..*)" roleLabel="yx" polymorphic="True">
              <Class class="Y" />
          </Target>
      </ECRelationshipClass>

      <ECEntityClass typeName="Z">
        <ECProperty propertyName="Label" typeName="string" />
        <ECProperty propertyName="PropZ" typeName="int" />
      </ECEntityClass>
      <ECRelationshipClass typeName="XZ" strength="referencing" strengthDirection="forward" modifier="None">
          <Source multiplicity="(0..*)" roleLabel="xz" polymorphic="False">
              <Class class="X" />
          </Source>
          <Target multiplicity="(0..*)" roleLabel="zx" polymorphic="True">
              <Class class="Z" />
          </Target>
      </ECRelationshipClass>
    `,
  );
}

async function createChangedDbs<TResultBase extends {}, TResultChangeset1 extends {}>(
  mochaContext: Mocha.Context,
  setupBase: (db: ECDbBuilder) => Promise<TResultBase>,
  setupChangeset1: (db: ECDbBuilder, before: TResultBase) => Promise<TResultChangeset1>,
): Promise<{ base: Awaited<ReturnType<typeof createECDb>> & TResultBase; changeset1: Awaited<ReturnType<typeof createECDb>> & TResultChangeset1 } & Disposable>;
async function createChangedDbs<TResultBase extends {}, TResultChangeset1 extends {}, TResultChangeset2 extends {}>(
  mochaContext: Mocha.Context,
  setupBase: (db: ECDbBuilder) => Promise<TResultBase>,
  setupChangeset1: (db: ECDbBuilder, before: TResultBase) => Promise<TResultChangeset1>,
  setupChangeset2: (db: ECDbBuilder, before: TResultChangeset1) => Promise<TResultChangeset2>,
): Promise<
  {
    base: Awaited<ReturnType<typeof createECDb>> & TResultBase;
    changeset1: Awaited<ReturnType<typeof createECDb>> & TResultChangeset1;
    changeset2: Awaited<ReturnType<typeof createECDb>> & TResultChangeset2;
  } & Disposable
>;
async function createChangedDbs<TResultBase extends {}, TResultChangeset1 extends {}, TResultChangeset2 extends {}>(
  mochaContext: Mocha.Context,
  setupBase: (db: ECDbBuilder) => Promise<TResultBase>,
  setupChangeset1: (db: ECDbBuilder, before: TResultBase) => Promise<TResultChangeset1>,
  setupChangeset2?: (db: ECDbBuilder, before: TResultChangeset1) => Promise<TResultChangeset2>,
) {
  const base = await createECDb(`${mochaContext.test!.fullTitle()}-base`, setupBase);
  const changeset1 = await cloneECDb(base.ecdbPath, `${mochaContext.test!.fullTitle()}-changeset1`, async (ecdb) => setupChangeset1(ecdb, base));
  const changeset2 = setupChangeset2
    ? await cloneECDb(changeset1.ecdbPath, `${mochaContext.test!.fullTitle()}-changeset2`, async (ecdb) => setupChangeset2(ecdb, changeset1))
    : undefined;
  return {
    base,
    changeset1,
    changeset2,
    [Symbol.dispose]() {
      base.ecdb[Symbol.dispose]();
      changeset1.ecdb[Symbol.dispose]();
      changeset2?.ecdb[Symbol.dispose]();
    },
  };
}

function createMergedHierarchyProvider(props: {
  imodels: Array<{ ecdb: ECDb; key: string }>;
  createHierarchyDefinition: (props: {
    imodelAccess: ReturnType<typeof createIModelAccess>;
    selectQueryFactory: ReturnType<typeof createNodesQueryClauseFactory>;
  }) => HierarchyDefinition;
}) {
  const imodels = props.imodels.map(({ ecdb, key }) => ({ imodelAccess: { ...createIModelAccess(ecdb), imodelKey: key } }));
  const primaryIModelAccess = imodels[imodels.length - 1].imodelAccess;
  const selectQueryFactory = createNodesQueryClauseFactory({
    imodelAccess: primaryIModelAccess,
    instanceLabelSelectClauseFactory: createDefaultInstanceLabelSelectClauseFactory(),
  });
  return createMergedIModelHierarchyProvider({
    imodels,
    hierarchyDefinition: props.createHierarchyDefinition({ imodelAccess: primaryIModelAccess, selectQueryFactory }),
  });
}
