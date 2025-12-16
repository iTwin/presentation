/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { omit } from "@itwin/core-bentley";
import { createMergedIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createChangedDbs, createHierarchyDefinitionFactory, createMergedHierarchyProvider, importQSchema, importXYZSchema } from "./HierarchiesMerging.js";

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
            const qSchema = await importQSchema(builder);
            builder.deleteInstance(base.y2);
            builder.updateInstance(base.y3, { ["Label"]: "y3-updated" });
            const q = builder.insertInstance(qSchema.items.Q.fullName, { ["Label"]: "q" });
            builder.insertRelationship(base.xyzSchema.items.XY.fullName, base.x.id, q.id);
            return { ...omit(base, ["y2"]), qSchema, q };
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
            schema: dbs.base.xyzSchema,
          }),
        });
      });

      it("merges instance nodes", async () => {
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              label: "x",
              children: [
                // exists only in the second imodel, also comes from schema that also exists only in the second imodel
                NodeValidators.createForInstanceNode({
                  label: "q",
                  instanceKeys: [{ ...dbs.changeset1.q, imodelKey: "changeset1" }],
                }),
                // exists in both imodels
                NodeValidators.createForInstanceNode({
                  label: "y1",
                  instanceKeys: [
                    { ...dbs.changeset1.y1, imodelKey: "changeset1" },
                    { ...dbs.base.y1, imodelKey: "base" },
                  ],
                }),
                // exists only in the first imodel
                NodeValidators.createForInstanceNode({
                  label: "y2",
                  instanceKeys: [{ ...dbs.base.y2, imodelKey: "base" }],
                }),
                // exists in both, but have different values
                NodeValidators.createForInstanceNode({
                  label: "y3-updated",
                  instanceKeys: [
                    { ...dbs.changeset1.y3, imodelKey: "changeset1" },
                    { ...dbs.base.y3, imodelKey: "base" },
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
