/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-this-alias */

import { omit } from "@itwin/core-bentley";
import { createMergedIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
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
    describe("Label grouping nodes", () => {
      describe("General case", () => {
        async function setupDbs(mochaContext: Mocha.Context) {
          return createChangedDbs(
            mochaContext,
            async (builder) => {
              const schema = await importXYZSchema(builder);
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
        }

        let dbs: Awaited<ReturnType<typeof setupDbs>>;
        let provider: ReturnType<typeof createMergedIModelHierarchyProvider>;

        before(async function () {
          dbs = await setupDbs(this);
        });

        after(async () => {
          dbs[Symbol.dispose]();
        });

        beforeEach(() => {
          provider = createMergedHierarchyProvider({
            imodels: [
              { ecdb: dbs.base.ecdb, key: "base" },
              { ecdb: dbs.changeset1.ecdb, key: "changeset1" },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createYGroupingParams: () => ({ byLabel: true }),
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
                  NodeValidators.createForLabelGroupingNode({
                    label: "y-group",
                    groupedInstanceKeys: [
                      { ...dbs.base.y1, imodelKey: "base" },
                      { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    ],
                    childrenUnordered: [
                      NodeValidators.createForInstanceNode({
                        label: "y-group",
                        instanceKeys: [
                          { ...dbs.base.y1, imodelKey: "base" },
                          { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                        ],
                      }),
                    ],
                  }),
                  NodeValidators.createForLabelGroupingNode({
                    label: "y-group-updated",
                    groupedInstanceKeys: [
                      { ...dbs.base.y2, imodelKey: "base" },
                      { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                    ],
                    childrenUnordered: [
                      NodeValidators.createForInstanceNode({
                        label: "y-group-updated",
                        instanceKeys: [
                          { ...dbs.base.y2, imodelKey: "base" },
                          { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                        ],
                      }),
                    ],
                  }),
                  NodeValidators.createForLabelGroupingNode({
                    label: "y-other-group",
                    groupedInstanceKeys: [
                      { ...dbs.base.y3, imodelKey: "base" },
                      { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                      { ...dbs.changeset1.y4, imodelKey: "changeset1" },
                    ],
                    childrenUnordered: [
                      NodeValidators.createForInstanceNode({
                        label: "y-other-group",
                        instanceKeys: [
                          { ...dbs.base.y3, imodelKey: "base" },
                          { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                        ],
                      }),
                      NodeValidators.createForInstanceNode({
                        label: "y-other-group",
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
              createYGroupingParams: () => ({ byLabel: { hideIfOneGroupedNode: true } }),
            }),
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              label: "x",
              children: [
                NodeValidators.createForLabelGroupingNode({
                  label: "y",
                  groupedInstanceKeys: [
                    { ...dbs.base.y1, imodelKey: "base" },
                    { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                  ],
                  childrenUnordered: [
                    NodeValidators.createForInstanceNode({
                      label: "y",
                      instanceKeys: [
                        { ...dbs.base.y1, imodelKey: "base" },
                        { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                      ],
                    }),
                    NodeValidators.createForInstanceNode({
                      label: "y",
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
              createYGroupingParams: () => ({ byLabel: { hideIfNoSiblings: true } }),
            }),
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              label: "x",
              children: [
                NodeValidators.createForLabelGroupingNode({
                  label: "y",
                  groupedInstanceKeys: [{ ...dbs.base.y, imodelKey: "base" }],
                  childrenUnordered: [
                    NodeValidators.createForInstanceNode({
                      label: "y",
                      instanceKeys: [{ ...dbs.base.y, imodelKey: "base" }],
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

      it("creates grouping node when it's not created for individual imodels due to different `groupId` flags", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder);
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
              createYGroupingParams: (alias) => ({ byLabel: { groupId: { selector: `${alias}.PropY` } } }),
            }),
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              label: "x",
              children: [
                NodeValidators.createForLabelGroupingNode({
                  label: "y",
                  groupedInstanceKeys: [
                    { ...dbs.base.y1, imodelKey: "base" },
                    { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    { ...dbs.base.y2, imodelKey: "base" },
                    { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                  ],
                  childrenUnordered: [
                    NodeValidators.createForInstanceNode({
                      label: "y",
                      instanceKeys: [
                        { ...dbs.base.y1, imodelKey: "base" },
                        { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                      ],
                    }),
                    NodeValidators.createForInstanceNode({
                      label: "y",
                      instanceKeys: [
                        { ...dbs.base.y2, imodelKey: "base" },
                        { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("creates merged label node", async function () {
        const mochaContext = this;
        using dbs = await createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder);
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
                // has one Y node with "y" label
                ecdb: dbs.base.ecdb,
                key: "base",
              },
              {
                // has two Y nodes with "y" label - one from `base` and one that exists only in `changeset1`
                ecdb: dbs.changeset1.ecdb,
                key: "changeset1",
              },
            ],
            createHierarchyDefinition: createHierarchyDefinitionFactory({
              schema: dbs.base.schema,
              createYGroupingParams: () => ({ byLabel: { action: "merge" } }),
            }),
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              label: "x",
              children: [
                NodeValidators.createForInstanceNode({
                  label: "y",
                  instanceKeys: [
                    { ...dbs.base.y1, imodelKey: "base" },
                    { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    { ...dbs.changeset1.y2, imodelKey: "changeset1" },
                  ],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });
    });
  });
});
