/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

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
    describe("Generic nodes", () => {
      async function setupDbs(mochaContext: Mocha.Context) {
        return createChangedDbs(
          mochaContext,
          async (builder) => {
            const schema = await importXYZSchema(builder);
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
        });
      });

      it("merges generic nodes", async function () {
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              label: "x",
              instanceKeys: [
                { ...dbs.base.x, imodelKey: "base" },
                { ...dbs.changeset1.x, imodelKey: "changeset1" },
              ],
              children: [
                NodeValidators.createForGenericNode({
                  label: "Y elements",
                  key: "y-elements",
                  children: [
                    // exists in both imodels
                    NodeValidators.createForInstanceNode({
                      label: "y1",
                      instanceKeys: [
                        { ...dbs.base.y1, imodelKey: "base" },
                        { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                      ],
                    }),
                    // exists only in the second imodel
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

      describe("Hierarchy search", () => {
        it("creates hierarchy when targeting instances from both imodels", async () => {
          provider.setHierarchySearch({
            paths: [
              [
                { ...dbs.base.x, imodelKey: "base" },
                { type: "generic", id: "y-elements" },
                { ...dbs.base.y1, imodelKey: "base" },
              ],
              [
                { ...dbs.changeset1.x, imodelKey: "changeset1" },
                { type: "generic", id: "y-elements" },
                { ...dbs.changeset1.y2, imodelKey: "changeset1" },
              ],
            ],
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "x",
                instanceKeys: [
                  { ...dbs.base.x, imodelKey: "base" },
                  { ...dbs.changeset1.x, imodelKey: "changeset1" },
                ],
                children: [
                  NodeValidators.createForGenericNode({
                    label: "Y elements",
                    key: "y-elements",
                    children: [
                      // exists in both imodels
                      NodeValidators.createForInstanceNode({
                        label: "y1",
                        instanceKeys: [{ ...dbs.base.y1, imodelKey: "base" }],
                      }),
                      // exists only in the second imodel
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

        it("creates hierarchy when targeting instances from base imodel", async () => {
          provider.setHierarchySearch({
            paths: [
              [
                { ...dbs.base.x, imodelKey: "base" },
                { type: "generic", id: "y-elements" },
                { ...dbs.base.y1, imodelKey: "base" },
              ],
            ],
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "x",
                instanceKeys: [{ ...dbs.base.x, imodelKey: "base" }],
                children: [
                  NodeValidators.createForGenericNode({
                    label: "Y elements",
                    key: "y-elements",
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "y1",
                        instanceKeys: [{ ...dbs.base.y1, imodelKey: "base" }],
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
              [
                { ...dbs.changeset1.x, imodelKey: "changeset1" },
                { type: "generic", id: "y-elements" },
                { ...dbs.changeset1.y1, imodelKey: "changeset1" },
              ],
              [
                { ...dbs.changeset1.x, imodelKey: "changeset1" },
                { type: "generic", id: "y-elements" },
                { ...dbs.changeset1.y2, imodelKey: "changeset1" },
              ],
            ],
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "x",
                instanceKeys: [{ ...dbs.changeset1.x, imodelKey: "changeset1" }],
                children: [
                  NodeValidators.createForGenericNode({
                    label: "Y elements",
                    key: "y-elements",
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "y1",
                        instanceKeys: [{ ...dbs.changeset1.y1, imodelKey: "changeset1" }],
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
      });
    });
  });
});
