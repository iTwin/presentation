/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createMergedIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createChangedDbs, createHierarchyDefinitionFactory, createMergedHierarchyProvider, importXYZSchema, pickAndTransform } from "./HierarchiesMerging.js";

describe("Hierarchies", () => {
  before(async function () {
    await initialize();
  });

  after(async () => {
    await terminate();
  });

  describe("Merging iModel hierarchies", () => {
    describe("Generic nodes", () => {
      async function setupDbs(mochaContext: Mocha.Context) {
        return createChangedDbs(
          mochaContext,
          async (builder) => {
            const xyzSchema = await importXYZSchema(builder);
            const x = builder.insertInstance(xyzSchema.items.X.fullName, { ["Label"]: "x" });
            const y1 = builder.insertInstance(xyzSchema.items.Y.fullName, { ["Label"]: "y1" });
            builder.insertRelationship(xyzSchema.items.XY.fullName, x.id, y1.id);
            return { xyzSchema, x, y1 };
          },
          async (builder, base) => {
            const y2 = builder.insertInstance(base.xyzSchema.items.Y.fullName, { ["Label"]: "y2" });
            builder.insertRelationship(base.xyzSchema.items.XY.fullName, base.x.id, y2.id);
            return { ...base, y2 };
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
          base: pickAndTransform(dbs.base, ["x", "y1"], (_, value) => ({ ...value, imodelKey: "base" })),
          changeset1: pickAndTransform(dbs.changeset1, ["x", "y1", "y2"], (_, value) => ({ ...value, imodelKey: "changeset1" })),
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
            xyzSchema: dbs.base.xyzSchema,
            createGenericNodeForY: true,
          }),
        });
      });

      it("merges generic nodes", async function () {
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              label: "x",
              instanceKeys: [keys.base.x, keys.changeset1.x],
              children: [
                NodeValidators.createForGenericNode({
                  label: "Y elements",
                  key: "y-elements",
                  children: [
                    // exists in both imodels
                    NodeValidators.createForInstanceNode({
                      label: "y1",
                      instanceKeys: [keys.base.y1, keys.changeset1.y1],
                    }),
                    // exists only in the second imodel
                    NodeValidators.createForInstanceNode({
                      label: "y2",
                      instanceKeys: [keys.changeset1.y2],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      describe("Hierarchy search", () => {
        it("creates hierarchy when targeting instances from both imodels", async () => {
          provider.setHierarchySearch({
            paths: [
              [keys.base.x, { type: "generic", id: "y-elements" }, keys.base.y1],
              [keys.changeset1.x, { type: "generic", id: "y-elements" }, keys.changeset1.y2],
            ],
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "x",
                instanceKeys: [keys.base.x, keys.changeset1.x],
                children: [
                  NodeValidators.createForGenericNode({
                    label: "Y elements",
                    key: "y-elements",
                    children: [
                      // exists in both imodels
                      NodeValidators.createForInstanceNode({
                        label: "y1",
                        instanceKeys: [keys.base.y1],
                      }),
                      // exists only in the second imodel
                      NodeValidators.createForInstanceNode({
                        label: "y2",
                        instanceKeys: [keys.changeset1.y2],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        });

        it("creates hierarchy when targeting instances from base imodel", async () => {
          provider.setHierarchySearch({
            paths: [[keys.base.x, { type: "generic", id: "y-elements" }, keys.base.y1]],
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "x",
                instanceKeys: [keys.base.x],
                children: [
                  NodeValidators.createForGenericNode({
                    label: "Y elements",
                    key: "y-elements",
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "y1",
                        instanceKeys: [keys.base.y1],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        });

        it("creates hierarchy when targeting instances from changeset1 imodel", async () => {
          provider.setHierarchySearch({
            paths: [
              [keys.changeset1.x, { type: "generic", id: "y-elements" }, keys.changeset1.y1],
              [keys.changeset1.x, { type: "generic", id: "y-elements" }, keys.changeset1.y2],
            ],
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "x",
                instanceKeys: [keys.changeset1.x],
                children: [
                  NodeValidators.createForGenericNode({
                    label: "Y elements",
                    key: "y-elements",
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "y1",
                        instanceKeys: [keys.changeset1.y1],
                      }),
                      NodeValidators.createForInstanceNode({
                        label: "y2",
                        instanceKeys: [keys.changeset1.y2],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        });
      });
    });
  });
});
