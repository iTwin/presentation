/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-shadow */

import { expect } from "chai";
import { ECDb } from "@itwin/core-backend";
import {
  createNodesQueryClauseFactory,
  createPredicateBasedHierarchyDefinition,
  DefineInstanceNodeChildHierarchyLevelProps,
  HierarchyDefinition,
  mergeProviders,
} from "@itwin/presentation-hierarchies";
import { createDefaultInstanceLabelSelectClauseFactory, ECSqlBinding, Props } from "@itwin/presentation-shared";
import { cloneECDb, createECDb, ECDbBuilder, importSchema } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { validateHierarchy } from "./HierarchyValidation.js";
import { createIModelAccess, createProvider } from "./Utils.js";

describe("Hierarchies", () => {
  before(async function () {
    await initialize();
  });

  after(async () => {
    await terminate();
  });

  describe.only("Merging", () => {
    it("merges instance nodes", async function () {
      const mochaContext = this;
      using setup = await createChangedDbs(
        this,
        async (builder) => {
          const schema = await importSchema(
            mochaContext,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="Y">
                <ECProperty propertyName="Label" typeName="string" />
              </ECEntityClass>
              <ECRelationshipClass typeName="XY"  strength="referencing" strengthDirection="forward" modifier="None">
                  <Source multiplicity="(0..1)" roleLabel="xy" polymorphic="False">
                      <Class class="X" />
                  </Source>
                  <Target multiplicity="(0..1)" roleLabel="yx" polymorphic="True">
                      <Class class="Y" />
                  </Target>
              </ECRelationshipClass>
            `,
          );
          const x = builder.insertInstance(schema.items.X.fullName, { ["Label"]: "x" });
          const y1 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y1" });
          const y2 = builder.insertInstance(schema.items.Y.fullName, { ["Label"]: "y2" });
          return { schema, x, y1, y2 };
        },
        async (builder, from) => {
          builder.deleteInstance(from.y2);
          const y3 = builder.insertInstance(from.schema.items.Y.fullName, { ["Label"]: "y3" });
          return { y3 };
        },
      );

      const schema = setup.before.schema;
      const createDefinition: Props<typeof createHierarchyProvider>["createDefinition"] = ({ imodelAccess, selectQueryFactory }) =>
        createPredicateBasedHierarchyDefinition({
          classHierarchyInspector: imodelAccess,
          hierarchy: {
            rootNodes: async () => [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: "this.Label" },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                },
              },
            ],
            childNodes: [
              {
                parentInstancesNodePredicate: schema.items.X.fullName,
                definitions: async ({ parentNodeInstanceIds }: DefineInstanceNodeChildHierarchyLevelProps) => [
                  {
                    fullClassName: schema.items.Y.fullName,
                    query: {
                      ecsql: `
                        SELECT ${await selectQueryFactory.createSelectClause({
                          ecClassId: { selector: `this.ECClassId` },
                          ecInstanceId: { selector: `this.ECInstanceId` },
                          nodeLabel: { selector: "this.Label" },
                        })}
                        FROM ${schema.items.Y.fullName} AS this
                        JOIN ${schema.items.XY.fullName} AS xy ON xy.TargetECInstanceId = this.ECInstanceId
                        WHERE xy.SourceECInstanceId IN (${parentNodeInstanceIds.join(",")})
                      `,
                      bindings: parentNodeInstanceIds.map((id): ECSqlBinding => ({ type: "id", value: id })),
                    },
                  },
                ],
              },
            ],
          },
        });

      await validateHierarchy({
        provider: mergeProviders({
          providers: [
            createHierarchyProvider({ imodel: setup.before.ecdb, createDefinition }),
            createHierarchyProvider({ imodel: setup.after.ecdb, createDefinition }),
          ],
        }),
        expect: [
          {
            node: (node) => expect(node.label).to.eq(`x`),
            children: [
              {
                node: (node) => expect(node.label).to.eq(`y1`),
              },
              {
                node: (node) => expect(node.label).to.eq(`y3`),
              },
            ],
          },
        ],
      });
    });
  });
});

async function createChangedDbs<TResultBefore extends {}, TResultAfter extends {}>(
  mochaContext: Mocha.Context,
  setupBefore: (db: ECDbBuilder) => Promise<TResultBefore>,
  setupAfter: (db: ECDbBuilder, before: TResultBefore) => Promise<TResultAfter>,
): Promise<{
  before: TResultBefore & { ecdb: ECDb };
  after: TResultAfter & { ecdb: ECDb };
  [Symbol.dispose]: () => void;
}> {
  const before = await createECDb(`${mochaContext.test!.fullTitle()}-before`, setupBefore);
  const after = await cloneECDb(before.ecdbPath, `${mochaContext.test!.fullTitle()}-after`, async (ecdb) => setupAfter(ecdb, before));
  return {
    before,
    after,
    [Symbol.dispose]() {
      before.ecdb[Symbol.dispose]();
      after.ecdb[Symbol.dispose]();
    },
  };
}

function createHierarchyProvider({
  imodel,
  createDefinition,
}: {
  imodel: ECDb;
  createDefinition: (props: {
    imodelAccess: ReturnType<typeof createIModelAccess>;
    selectQueryFactory: ReturnType<typeof createNodesQueryClauseFactory>;
  }) => HierarchyDefinition;
}) {
  const imodelAccess = createIModelAccess(imodel);
  const selectQueryFactory = createNodesQueryClauseFactory({
    imodelAccess,
    instanceLabelSelectClauseFactory: createDefaultInstanceLabelSelectClauseFactory(),
  });
  return createProvider({ imodelAccess, hierarchy: createDefinition({ imodelAccess, selectQueryFactory }) });
}
