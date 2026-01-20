/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { omit } from "@itwin/core-bentley";
import { createMergedIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { createChangedDbs } from "../../ECDbUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy, validateHierarchyLevel } from "../HierarchyValidation.js";
import { createHierarchyDefinitionFactory, createMergedHierarchyProvider, importQSchema, importXYZSchema, pickAndTransform } from "./HierarchiesMerging.js";

describe("Hierarchies", () => {
  before(async function () {
    await initialize();
  });

  after(async () => {
    await terminate();
  });

  describe("Merging iModel hierarchies", () => {
    describe("Instance nodes", () => {
      async function setupDbs(mochaContext: Mocha.Context) {
        return createChangedDbs(
          mochaContext,
          async (builder) => {
            const xyzSchema = await importXYZSchema(builder);
            const x = builder.insertInstance(xyzSchema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(xyzSchema.items.Y.fullName, { ["Label"]: "y1" });
            builder.insertRelationship(xyzSchema.items.XY.fullName, x.id, y1.id);
            const y2 = builder.insertInstance(xyzSchema.items.Y.fullName, { ["Label"]: "y2" });
            builder.insertRelationship(xyzSchema.items.XY.fullName, x.id, y2.id);
            const y3 = builder.insertInstance(xyzSchema.items.Y.fullName, { ["Label"]: "y3" });
            builder.insertRelationship(xyzSchema.items.XY.fullName, x.id, y3.id);
            return { xyzSchema, x, y1, y2, y3 };
          },
          async (builder, base) => {
            const xyzSchema = await importXYZSchema(builder, "1.0.1");
            const qSchema = await importQSchema(builder, xyzSchema);
            builder.updateInstance(base.x, { ["PropX2"]: 111 });
            builder.deleteInstance(base.y2);
            builder.updateInstance(base.y3, { ["Label"]: "y3-updated", ["PropY2"]: 222 });
            const q1 = builder.insertInstance(qSchema.items.Q.fullName, { ["Label"]: "q1" });
            builder.insertRelationship(base.xyzSchema.items.XY.fullName, base.x.id, q1.id);
            const w = builder.insertInstance(qSchema.items.W.fullName, { ["Label"]: "w" });
            const q2 = builder.insertInstance(qSchema.items.Q.fullName, { ["Label"]: "q2" });
            builder.insertRelationship(base.xyzSchema.items.XY.fullName, w.id, q2.id);
            return { ...omit(base, ["xyzSchema", "y2"]), xyzSchema, qSchema, w, q1, q2 };
          },
        );
      }

      let dbs: Awaited<ReturnType<typeof setupDbs>>;
      let keys: {
        base: Omit<typeof dbs.base, "ecdb" | "ecdbPath" | "xyzSchema">;
        changeset1: Omit<typeof dbs.changeset1, "ecdb" | "ecdbPath" | "xyzSchema" | "qSchema">;
      };
      let provider: ReturnType<typeof createMergedIModelHierarchyProvider>;

      before(async function () {
        dbs = await setupDbs(this);
        keys = {
          base: pickAndTransform(dbs.base, ["x", "y1", "y2", "y3"], (_, value) => ({ ...value, imodelKey: "base" })),
          changeset1: pickAndTransform(dbs.changeset1, ["x", "y1", "y3", "w", "q1", "q2"], (_, value) => ({ ...value, imodelKey: "changeset1" })),
        };
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
            xyzSchema: dbs.changeset1.xyzSchema,
          }),
        });
      });

      it("merges instance nodes", async () => {
        await validateHierarchy({
          provider,
          expect: [
            // the whole branch exists only in the second imodel, also comes from schema that also exists only in the second imodel
            NodeValidators.createForInstanceNode({
              label: "w",
              children: [
                NodeValidators.createForInstanceNode({
                  label: "q2",
                  instanceKeys: [keys.changeset1.q2],
                }),
              ],
            }),
            NodeValidators.createForInstanceNode({
              label: "x",
              children: [
                // exists only in the second imodel, also comes from schema that also exists only in the second imodel
                NodeValidators.createForInstanceNode({
                  label: "q1",
                  instanceKeys: [keys.changeset1.q1],
                }),
                // exists in both imodels
                NodeValidators.createForInstanceNode({
                  label: "y1",
                  instanceKeys: [keys.changeset1.y1, keys.base.y1],
                }),
                // exists only in the first imodel
                NodeValidators.createForInstanceNode({
                  label: "y2",
                  instanceKeys: [keys.base.y2],
                }),
                // exists in both, but have different values
                NodeValidators.createForInstanceNode({
                  label: "y3-updated",
                  instanceKeys: [keys.changeset1.y3, keys.base.y3],
                }),
              ],
            }),
          ],
        });
      });

      describe("Hierarchy search", () => {
        it("creates hierarchy when targeting all instances from both imodels", async () => {
          provider.setHierarchySearch({
            paths: [
              [keys.base.x],
              [keys.base.x, keys.base.y1],
              [keys.base.x, keys.base.y2],
              [keys.base.x, keys.base.y3],
              [keys.changeset1.x],
              [keys.changeset1.x, keys.changeset1.y1],
              [keys.changeset1.x, keys.changeset1.y3],
              [keys.changeset1.x, keys.changeset1.q1],
              [keys.changeset1.w],
              [keys.changeset1.w, keys.changeset1.q2],
            ],
          });
          await validateHierarchy({
            provider,
            expect: [
              // the whole branch exists only in the second imodel, also comes from schema that also exists only in the second imodel
              NodeValidators.createForInstanceNode({
                label: "w",
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "q2",
                    instanceKeys: [keys.changeset1.q2],
                  }),
                ],
              }),
              NodeValidators.createForInstanceNode({
                label: "x",
                children: [
                  // exists only in the second imodel, also comes from schema that also exists only in the second imodel
                  NodeValidators.createForInstanceNode({
                    label: "q1",
                    instanceKeys: [keys.changeset1.q1],
                  }),
                  // exists in both imodels
                  NodeValidators.createForInstanceNode({
                    label: "y1",
                    instanceKeys: [keys.changeset1.y1, keys.base.y1],
                  }),
                  // exists only in the first imodel
                  NodeValidators.createForInstanceNode({
                    label: "y2",
                    instanceKeys: [keys.base.y2],
                  }),
                  // exists in both, but have different values
                  NodeValidators.createForInstanceNode({
                    label: "y3-updated",
                    instanceKeys: [keys.changeset1.y3, keys.base.y3],
                  }),
                ],
              }),
            ],
          });
        });

        it("creates hierarchy when targeting instances from different imodels", async () => {
          provider.setHierarchySearch({
            paths: [
              [keys.base.x, keys.base.y2],
              [keys.changeset1.x, keys.changeset1.q1],
              [keys.changeset1.w, keys.changeset1.q2],
            ],
          });
          await validateHierarchy({
            provider,
            expect: [
              // the whole branch exists only in the second imodel, also comes from schema that also exists only in the second imodel
              NodeValidators.createForInstanceNode({
                label: "w",
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "q2",
                    instanceKeys: [keys.changeset1.q2],
                  }),
                ],
              }),
              NodeValidators.createForInstanceNode({
                label: "x",
                children: [
                  // exists only in the second imodel, also comes from schema that also exists only in the second imodel
                  NodeValidators.createForInstanceNode({
                    label: "q1",
                    instanceKeys: [keys.changeset1.q1],
                  }),
                  // exists only in the first imodel
                  NodeValidators.createForInstanceNode({
                    label: "y2",
                    instanceKeys: [keys.base.y2],
                  }),
                ],
              }),
            ],
          });
        });
      });

      describe("Hierarchy level filtering", () => {
        it("filters hierarchy level using filter class that exists only in one imodel", async () => {
          validateHierarchyLevel({
            nodes: await collect(
              provider.getNodes({
                parentNode: undefined,
                instanceFilter: {
                  filteredClassNames: [dbs.changeset1.qSchema.items.W.fullName],
                  propertyClassNames: [],
                  relatedInstances: [],
                  rules: {
                    operator: "and",
                    rules: [],
                  },
                },
              }),
            ),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.changeset1.w] })],
          });
        });

        it("filters hierarchy level using property class that exists only in one imodel", async () => {
          validateHierarchyLevel({
            nodes: await collect(
              provider.getNodes({
                parentNode: undefined,
                instanceFilter: {
                  propertyClassNames: [dbs.changeset1.qSchema.items.W.fullName],
                  relatedInstances: [],
                  rules: {
                    sourceAlias: "this",
                    propertyName: `PropW`,
                    operator: "is-null",
                    propertyTypeName: "int",
                  },
                },
              }),
            ),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.changeset1.w] })],
          });
        });

        it("filters hierarchy level using property that exists only in one imodel", async () => {
          validateHierarchyLevel({
            nodes: await collect(
              provider.getNodes({
                parentNode: undefined,
                instanceFilter: {
                  propertyClassNames: [dbs.changeset1.xyzSchema.items.X.fullName],
                  relatedInstances: [],
                  rules: {
                    sourceAlias: "this",
                    propertyName: `PropX2`,
                    operator: "is-not-null",
                    propertyTypeName: "int",
                  },
                },
              }),
            ),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.changeset1.x] })],
          });
        });

        it("filters hierarchy level using related class that exists only in one imodel", async () => {
          validateHierarchyLevel({
            nodes: await collect(
              provider.getNodes({
                parentNode: undefined,
                instanceFilter: {
                  propertyClassNames: [dbs.changeset1.xyzSchema.items.X.fullName],
                  relatedInstances: [
                    {
                      alias: "qq",
                      path: [
                        {
                          sourceClassName: dbs.changeset1.xyzSchema.items.X.fullName,
                          relationshipClassName: dbs.changeset1.xyzSchema.items.XY.fullName,
                          isForwardRelationship: true,
                          targetClassName: dbs.changeset1.qSchema.items.Q.fullName,
                        },
                      ],
                    },
                  ],
                  rules: {
                    sourceAlias: "qq",
                    propertyName: "Label",
                    operator: "is-not-null",
                    propertyTypeName: "int",
                  },
                },
              }),
            ),
            expect: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.changeset1.w] }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.changeset1.x] }),
            ],
          });
        });

        it("filters hierarchy level using related class property that exists only in one imodel", async () => {
          validateHierarchyLevel({
            nodes: await collect(
              provider.getNodes({
                parentNode: undefined,
                instanceFilter: {
                  propertyClassNames: [dbs.changeset1.xyzSchema.items.X.fullName],
                  relatedInstances: [
                    {
                      alias: "yy",
                      path: [
                        {
                          sourceClassName: dbs.changeset1.xyzSchema.items.X.fullName,
                          relationshipClassName: dbs.changeset1.xyzSchema.items.XY.fullName,
                          isForwardRelationship: true,
                          targetClassName: dbs.changeset1.xyzSchema.items.Y.fullName,
                        },
                      ],
                    },
                  ],
                  rules: {
                    sourceAlias: "yy",
                    propertyName: "PropY2",
                    operator: "is-not-null",
                    propertyTypeName: "int",
                  },
                },
              }),
            ),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.changeset1.x] })],
          });
        });
      });
    });
  });
});
