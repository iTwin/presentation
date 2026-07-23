/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { resolveContentSources } from "../content/Content.js";
import { ECSQL_PREFIX } from "../content/InternalUtils.js";

import type {
  EC,
  ECClassHierarchyInspector,
  ECSchemaProvider,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
  RelationshipPath,
} from "@itwin/presentation-shared";
import type { ContentTarget, ResolvedPath } from "../content/ContentTarget.js";
import type { IModelFieldsProvider } from "../content/extensions/IModelFieldsProvider.js";

// Mock `ECSql.createRelationshipPathJoinClause` because the real implementation requires
// a functioning ECSchemaProvider that returns actual schema metadata to construct JOIN clauses.
// Here we return a fixed JOIN string so the tests can verify strategy/racing/mapping logic
// without needing real schema objects.
vi.mock("@itwin/presentation-shared", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ECSql: {
      ...actual.ECSql,
      createRelationshipPathJoinClause: vi.fn(async () => ({
        joins: `INNER JOIN [TestSchema].[TestRel] [r0] ON [r0].[SourceECInstanceId] = [this].[ECInstanceId] INNER JOIN [TestSchema].[TestTarget] [s0] ON [s0].[ECInstanceId] = [r0].[TargetECInstanceId]`,
        bindings: undefined,
      })),
    },
  };
});

function createMockGetSchema(derivedClasses: Record<string, string[]> = {}) {
  return vi.fn(
    async (schemaName: string) =>
      ({
        getClass: async (className: string) => {
          const fullName = `${schemaName}.${className}`;
          const derived = derivedClasses[fullName] ?? [];
          return { fullName, getDerivedClasses: async () => derived.map((d) => ({ fullName: d })) };
        },
      }) as unknown as EC.Schema,
  );
}

// The primary-class enumeration scan is the only resolution query without a relationship join, so it
// never references a relationship alias (`[r0]`). Path-resolution queries always join at least one step.
function isPrimaryEnumerationQuery(ecsql: string): boolean {
  return !ecsql.includes("[r0]");
}

function createMockIModelAccess(props?: {
  resolvePathsQueryResults?: ECSqlQueryRow[];
  primaryClassScanResults?: ECSqlQueryRow[];
  derivedClasses?: Record<string, string[]>;
}): ECSqlQueryExecutor & ECSchemaProvider & ECClassHierarchyInspector {
  const { resolvePathsQueryResults = [], primaryClassScanResults = [], derivedClasses = {} } = props ?? {};
  return {
    createQueryReader: vi.fn((query: ECSqlQueryDef) => {
      const rows = isPrimaryEnumerationQuery(query.ecsql) ? primaryClassScanResults : resolvePathsQueryResults;
      return (async function* () {
        for (const row of rows) {
          yield row;
        }
      })();
    }),
    getSchema: createMockGetSchema(derivedClasses),
    classDerivesFrom: vi.fn(async () => false),
  };
}

function createMockIModelFieldsProvider(
  id: IModelFieldsProvider["id"],
  contribution: Awaited<ReturnType<IModelFieldsProvider["getContribution"]>>,
): IModelFieldsProvider {
  return { id, getContribution: vi.fn(async () => contribution) };
}

describe("resolveContentSources", () => {
  const targetA: ContentTarget = { primaryClass: "TestSchema.ClassA" };

  describe("edge cases", () => {
    it("returns empty array when targets is empty", async () => {
      const result = await resolveContentSources({ imodelAccess: createMockIModelAccess(), targets: [] });
      expect(result).to.deep.equal([]);
    });

    it("returns ContentSource per target with empty resolvedDeclarations when no providers configured", async () => {
      const targets: ContentTarget[] = [targetA, { primaryClass: "TestSchema.ClassB" }];
      const result = await resolveContentSources({ imodelAccess: createMockIModelAccess(), targets });
      expect(result).to.have.length(2);
      expect(result[0]).to.deep.equal({
        target: targets[0],
        resolvedPrimaryClasses: ["TestSchema.ClassA"],
        resolvedDeclarations: [],
      });
      expect(result[1]).to.deep.equal({
        target: targets[1],
        resolvedPrimaryClasses: ["TestSchema.ClassB"],
        resolvedDeclarations: [],
      });
    });

    it("resolves polymorphic primary classes when no providers are configured", async () => {
      const imodelAccess = createMockIModelAccess({
        derivedClasses: { "TestSchema.ClassA": ["TestSchema.ConcreteA"] },
        primaryClassScanResults: [{ 0: "TestSchema.ConcreteA" }],
      });

      const [result] = await resolveContentSources({ imodelAccess, targets: [targetA] });

      expect(result).to.deep.equal({
        target: targetA,
        resolvedPrimaryClasses: ["TestSchema.ConcreteA"],
        resolvedDeclarations: [],
      });
    });

    it("returns empty resolvedDeclarations when provider returns undefined", async () => {
      const provider = createMockIModelFieldsProvider("test_v1", undefined);
      const result = await resolveContentSources({
        imodelAccess: createMockIModelAccess(),
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });
      expect(result).to.have.length(1);
      expect(result[0].resolvedDeclarations).to.deep.equal([]);
    });

    it("returns empty resolvedDeclarations when provider contribution has no relatedProperties", async () => {
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: undefined });
      const result = await resolveContentSources({
        imodelAccess: createMockIModelAccess(),
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });
      expect(result).to.have.length(1);
      expect(result[0].resolvedDeclarations).to.deep.equal([]);
    });

    it("omits declaration when resolution query returns no rows", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });
      expect(result[0].resolvedDeclarations).to.deep.equal([]);
    });

    it("propagates error when query reader throws", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const queryError = new Error("query failed");
      const imodelAccess = {
        ...createMockIModelAccess(),
        createQueryReader: vi.fn(
          (): AsyncIterableIterator<ECSqlQueryRow> =>
            (async function* (): AsyncGenerator<ECSqlQueryRow> {
              throw queryError;
            })(),
        ),
      };
      await expect(
        resolveContentSources({ imodelAccess, targets: [targetA], config: { imodelFieldsProviders: [provider] } }),
      ).rejects.toThrow(queryError);
    });
  });

  describe("single-step path resolution", () => {
    it("resolves a single-step path to concrete classes from query results", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const queryRow: ECSqlQueryRow = { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB" };
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [queryRow] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result).to.deep.equal([
        {
          target: targetA,
          resolvedPrimaryClasses: ["TestSchema.ClassA"],
          resolvedDeclarations: [
            {
              providerId: "test_v1",
              declarationIndex: 0,
              paths: [
                {
                  path: [
                    {
                      sourceClassName: "TestSchema.ClassA",
                      targetClassName: "TestSchema.ConcreteB",
                      relationshipName: "TestSchema.RelAB",
                    },
                  ],
                  targetClassNames: ["TestSchema.ClassA"],
                },
              ],
            },
          ],
        },
      ]);
    });

    it("resolves multiple rows to multiple concrete paths", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB1" },
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB2" },
        ],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result).to.deep.equal([
        {
          target: targetA,
          resolvedPrimaryClasses: ["TestSchema.ClassA"],
          resolvedDeclarations: [
            {
              providerId: "test_v1",
              declarationIndex: 0,
              paths: [
                {
                  path: [
                    {
                      sourceClassName: "TestSchema.ClassA",
                      targetClassName: "TestSchema.ConcreteB1",
                      relationshipName: "TestSchema.RelAB",
                    },
                  ],
                  targetClassNames: ["TestSchema.ClassA"],
                },
                {
                  path: [
                    {
                      sourceClassName: "TestSchema.ClassA",
                      targetClassName: "TestSchema.ConcreteB2",
                      relationshipName: "TestSchema.RelAB",
                    },
                  ],
                  targetClassNames: ["TestSchema.ClassA"],
                },
              ],
            },
          ],
        },
      ]);
    });
  });

  describe("multi-step path resolution", () => {
    it("resolves a multi-step path with correct source/target from each row", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
        {
          sourceClassName: "TestSchema.ClassB",
          targetClassName: "TestSchema.ClassC",
          relationshipName: "TestSchema.RelBC",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const queryRow: ECSqlQueryRow = { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB", 2: "TestSchema.ConcreteC" };
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [queryRow] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result).to.deep.equal([
        {
          target: targetA,
          resolvedPrimaryClasses: ["TestSchema.ClassA"],
          resolvedDeclarations: [
            {
              providerId: "test_v1",
              declarationIndex: 0,
              paths: [
                {
                  path: [
                    {
                      sourceClassName: "TestSchema.ClassA",
                      targetClassName: "TestSchema.ConcreteB",
                      relationshipName: "TestSchema.RelAB",
                    },
                    {
                      sourceClassName: "TestSchema.ConcreteB",
                      targetClassName: "TestSchema.ConcreteC",
                      relationshipName: "TestSchema.RelBC",
                    },
                  ],
                  targetClassNames: ["TestSchema.ClassA"],
                },
              ],
            },
          ],
        },
      ]);
    });

    it("resolves a three-step path triggering all strategies", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
        {
          sourceClassName: "TestSchema.ClassB",
          targetClassName: "TestSchema.ClassC",
          relationshipName: "TestSchema.RelBC",
        },
        {
          sourceClassName: "TestSchema.ClassC",
          targetClassName: "TestSchema.ClassD",
          relationshipName: "TestSchema.RelCD",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const queryRow: ECSqlQueryRow = {
        0: "TestSchema.ClassA",
        1: "TestSchema.ConcreteB",
        2: "TestSchema.ConcreteC",
        3: "TestSchema.ConcreteD",
      };
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [queryRow] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });

      // 3 strategies are applicable for a 3-step path: original, subquery-anchor, cross-join
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(3);

      // Verify the final resolved paths are correct regardless of which strategy won the race
      expect(result).to.deep.equal([
        {
          target: targetA,
          resolvedPrimaryClasses: ["TestSchema.ClassA"],
          resolvedDeclarations: [
            {
              providerId: "test_v1",
              declarationIndex: 0,
              paths: [
                {
                  path: [
                    {
                      sourceClassName: "TestSchema.ClassA",
                      targetClassName: "TestSchema.ConcreteB",
                      relationshipName: "TestSchema.RelAB",
                    },
                    {
                      sourceClassName: "TestSchema.ConcreteB",
                      targetClassName: "TestSchema.ConcreteC",
                      relationshipName: "TestSchema.RelBC",
                    },
                    {
                      sourceClassName: "TestSchema.ConcreteC",
                      targetClassName: "TestSchema.ConcreteD",
                      relationshipName: "TestSchema.RelCD",
                    },
                  ],
                  targetClassNames: ["TestSchema.ClassA"],
                },
              ],
            },
          ],
        },
      ]);
    });
  });

  describe("content-target class capture", () => {
    it("splits the aggregated near-end class list for a path", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      // The query aggregates the concrete near-end classes for a shared downstream target into a
      // single `GROUP_CONCAT`ed cell; the resolver splits and sorts them.
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.Sub2,TestSchema.Sub1", 1: "TestSchema.ConcreteB" }],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedDeclarations).to.deep.equal([
        {
          providerId: "test_v1",
          declarationIndex: 0,
          paths: [
            {
              path: [
                {
                  sourceClassName: "TestSchema.ClassA",
                  targetClassName: "TestSchema.ConcreteB",
                  relationshipName: "TestSchema.RelAB",
                },
              ],
              targetClassNames: ["TestSchema.Sub1", "TestSchema.Sub2"],
            },
          ],
        },
      ]);
    });

    it("keeps separate near-end sets for distinct downstream chains", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [
          { 0: "TestSchema.Sub1", 1: "TestSchema.ConcreteB" },
          { 0: "TestSchema.Sub2", 1: "TestSchema.ConcreteC" },
        ],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedDeclarations).to.deep.equal([
        {
          providerId: "test_v1",
          declarationIndex: 0,
          paths: [
            {
              path: [
                {
                  sourceClassName: "TestSchema.ClassA",
                  targetClassName: "TestSchema.ConcreteB",
                  relationshipName: "TestSchema.RelAB",
                },
              ],
              targetClassNames: ["TestSchema.Sub1"],
            },
            {
              path: [
                {
                  sourceClassName: "TestSchema.ClassA",
                  targetClassName: "TestSchema.ConcreteC",
                  relationshipName: "TestSchema.RelAB",
                },
              ],
              targetClassNames: ["TestSchema.Sub2"],
            },
          ],
        },
      ]);
    });
  });

  it("delegates custom resolve callback to declaration's resolve function instead of querying", async () => {
    const customPaths: ResolvedPath[] = [
      {
        path: [
          {
            sourceClassName: "TestSchema.ClassA",
            targetClassName: "TestSchema.Resolved",
            relationshipName: "TestSchema.CustomRel",
          },
        ],
        targetClassNames: ["TestSchema.ClassA"],
      },
    ];
    const resolveFn = vi.fn(async () => customPaths);
    const provider = createMockIModelFieldsProvider("test_v1", {
      relatedProperties: [
        {
          path: [
            {
              sourceClassName: "TestSchema.ClassA",
              targetClassName: "TestSchema.ClassB",
              relationshipName: "TestSchema.RelAB",
            },
          ],
          resolve: resolveFn,
        },
      ],
    });
    const imodelAccess = createMockIModelAccess();

    const result = await resolveContentSources({
      imodelAccess,
      targets: [targetA],
      config: { imodelFieldsProviders: [provider] },
    });

    expect(resolveFn).toHaveBeenCalledOnce();
    expect(resolveFn).toHaveBeenCalledWith({ imodelAccess, target: targetA });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(imodelAccess.createQueryReader).not.toHaveBeenCalled();
    expect(result[0].resolvedDeclarations).to.deep.equal([
      { providerId: "test_v1", declarationIndex: 0, paths: customPaths },
    ]);
  });

  describe("multiple providers", () => {
    it("collects declarations from all applicable providers", async () => {
      const pathA: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const pathB: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassC",
          relationshipName: "TestSchema.RelAC",
        },
      ];
      const provider1 = createMockIModelFieldsProvider("provider1_v1", { relatedProperties: [{ path: pathA }] });
      const provider2 = createMockIModelFieldsProvider("provider2_v1", { relatedProperties: [{ path: pathB }] });
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteTarget" }],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider1, provider2] },
      });

      expect(result[0].resolvedDeclarations).to.deep.equal([
        {
          providerId: "provider1_v1",
          declarationIndex: 0,
          paths: [
            {
              path: [
                {
                  sourceClassName: "TestSchema.ClassA",
                  targetClassName: "TestSchema.ConcreteTarget",
                  relationshipName: "TestSchema.RelAB",
                },
              ],
              targetClassNames: ["TestSchema.ClassA"],
            },
          ],
        },
        {
          providerId: "provider2_v1",
          declarationIndex: 0,
          paths: [
            {
              path: [
                {
                  sourceClassName: "TestSchema.ClassA",
                  targetClassName: "TestSchema.ConcreteTarget",
                  relationshipName: "TestSchema.RelAC",
                },
              ],
              targetClassNames: ["TestSchema.ClassA"],
            },
          ],
        },
      ]);
    });

    it("skips providers that return undefined and includes those that contribute", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider1 = createMockIModelFieldsProvider("skipped_v1", undefined);
      const provider2 = createMockIModelFieldsProvider("active_v1", { relatedProperties: [{ path }] });
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB" }],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider1, provider2] },
      });

      expect(result[0].resolvedDeclarations.map((d) => d.providerId)).to.deep.equal(["active_v1"]);
    });

    it("preserves provider and declaration order even when later providers resolve faster", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      // provider1 resolves after extra microtask tick, provider2 resolves immediately
      const provider1: IModelFieldsProvider = {
        id: "slow_v1",
        getContribution: vi.fn(async () => {
          await Promise.resolve();
          return { relatedProperties: [{ path }] };
        }),
      };
      const provider2 = createMockIModelFieldsProvider("fast_v1", { relatedProperties: [{ path }] });
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB" }],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider1, provider2] },
      });

      expect(result[0].resolvedDeclarations.map((d) => d.providerId)).to.deep.equal(["slow_v1", "fast_v1"]);
    });
  });

  describe("instance IDs filter", () => {
    it("passes idset binding in the resolution query when instanceIds are provided", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const target: ContentTarget = { primaryClass: "TestSchema.ClassA", instanceIds: ["0x1", "0x2"] };
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB" }],
      });

      await resolveContentSources({ imodelAccess, targets: [target], config: { imodelFieldsProviders: [provider] } });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(imodelAccess.createQueryReader).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const call = vi.mocked(imodelAccess.createQueryReader).mock.calls[0];
      const query = call[0];
      const idSetAlias = `${ECSQL_PREFIX}instanceIds`;
      expect(query.ecsql).to.include(
        `JOIN IdSet(:${idSetAlias}) [${idSetAlias}] ON [${idSetAlias}].id = [this].ECInstanceId`,
      );
      expect(query.bindings).to.deep.equal({ [idSetAlias]: { type: "idset", value: ["0x1", "0x2"] } });
    });
  });

  describe("instance filter expression", () => {
    it("includes the filter expression in the resolution query", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const target: ContentTarget = {
        primaryClass: "TestSchema.ClassA",
        instanceFilter: { expression: "this.Area > :minArea", bindings: { minArea: { type: "double", value: 100.0 } } },
      };
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB" }],
      });

      await resolveContentSources({ imodelAccess, targets: [target], config: { imodelFieldsProviders: [provider] } });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(imodelAccess.createQueryReader).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const call = vi.mocked(imodelAccess.createQueryReader).mock.calls[0];
      const query = call[0];
      expect(query.ecsql).to.include("[this].Area > :minArea");
      expect(query.bindings).to.deep.equal({ minArea: { type: "double", value: 100.0 } });
    });

    it("replaces custom primaryClassAlias in expression", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const target: ContentTarget = {
        primaryClass: "TestSchema.ClassA",
        instanceFilter: { expression: 'x.Name = "test"', primaryClassAlias: "x" },
      };
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB" }],
      });

      await resolveContentSources({ imodelAccess, targets: [target], config: { imodelFieldsProviders: [provider] } });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const call = vi.mocked(imodelAccess.createQueryReader).mock.calls[0];
      const query = call[0];
      expect(query.ecsql).to.include('[this].Name = "test"');
      expect(query.ecsql).not.to.include("x.");
    });

    it("replaces bracket-quoted primaryClassAlias in expression", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const target: ContentTarget = {
        primaryClass: "TestSchema.ClassA",
        instanceFilter: { expression: '[x].Name = "test"', primaryClassAlias: "x" },
      };
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB" }],
      });

      await resolveContentSources({ imodelAccess, targets: [target], config: { imodelFieldsProviders: [provider] } });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const call = vi.mocked(imodelAccess.createQueryReader).mock.calls[0];
      const query = call[0];
      expect(query.ecsql).to.include('[this].Name = "test"');
      expect(query.ecsql).not.to.include("[x].");
    });

    it("passes bindings through all strategies for multi-step paths", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
        {
          sourceClassName: "TestSchema.ClassB",
          targetClassName: "TestSchema.ClassC",
          relationshipName: "TestSchema.RelBC",
        },
        {
          sourceClassName: "TestSchema.ClassC",
          targetClassName: "TestSchema.ClassD",
          relationshipName: "TestSchema.RelCD",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const target: ContentTarget = {
        primaryClass: "TestSchema.ClassA",
        instanceFilter: {
          expression: "this.IsActive = :active",
          bindings: { active: { type: "boolean", value: true } },
        },
      };
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB", 1: "TestSchema.ConcreteC", 2: "TestSchema.ConcreteD" }],
      });

      await resolveContentSources({ imodelAccess, targets: [target], config: { imodelFieldsProviders: [provider] } });

      // All 3 strategies should include the filter bindings in their queries
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const queries = vi.mocked(imodelAccess.createQueryReader).mock.calls.map((c) => c[0]);
      expect(queries).to.have.length(3);
      for (const query of queries) {
        expect(query.bindings).to.deep.equal({ active: { type: "boolean", value: true } });
      }
    });
  });

  describe("multiple targets", () => {
    it("resolves each target independently", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const target1: ContentTarget = { primaryClass: "TestSchema.ClassA" };
      const target2: ContentTarget = { primaryClass: "TestSchema.ClassD" };
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB" }],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [target1, target2],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result.map((r) => ({ target: r.target, declarationCount: r.resolvedDeclarations.length }))).to.deep.equal([
        { target: target1, declarationCount: 1 },
        { target: target2, declarationCount: 1 },
      ]);
    });

    it("calls provider getContribution once per target", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      const targets: ContentTarget[] = [{ primaryClass: "TestSchema.ClassA" }, { primaryClass: "TestSchema.ClassB" }];
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteB" }],
      });

      await resolveContentSources({ imodelAccess, targets, config: { imodelFieldsProviders: [provider] } });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(provider.getContribution).toHaveBeenCalledTimes(2);
    });
  });

  describe("multiple declarations", () => {
    it("resolves multiple declarations from one provider with correct declarationIndex", async () => {
      const pathA: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const pathB: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassC",
          relationshipName: "TestSchema.RelAC",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", {
        relatedProperties: [{ path: pathA }, { path: pathB }],
      });
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteTarget" }],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedDeclarations.map((d) => d.declarationIndex)).to.deep.equal([0, 1]);
    });

    it("omits declarations with empty results but keeps those with results", async () => {
      const pathA: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.RelAB",
        },
      ];
      const pathB: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassC",
          relationshipName: "TestSchema.RelAC",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", {
        relatedProperties: [{ path: pathA }, { path: pathB }],
      });
      let callCount = 0;
      const imodelAccess: ECSqlQueryExecutor & ECSchemaProvider & ECClassHierarchyInspector = {
        createQueryReader: vi.fn((_query: ECSqlQueryDef) => {
          callCount++;
          // First declaration gets no results, second gets results
          const rows = callCount <= 1 ? [] : [{ 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteC" }];
          return (async function* () {
            for (const row of rows) {
              yield row;
            }
          })();
        }),
        getSchema: createMockGetSchema(),
        classDerivesFrom: vi.fn(async () => false),
      };

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedDeclarations.map((d) => d.declarationIndex)).to.deep.equal([1]);
    });
  });

  describe("primary class enumeration", () => {
    const provider = createMockIModelFieldsProvider("test_v1", {
      relatedProperties: [
        {
          path: [
            {
              sourceClassName: "TestSchema.ClassA",
              targetClassName: "TestSchema.ClassB",
              relationshipName: "TestSchema.RelAB",
            },
          ],
        },
      ],
    });

    it("skips the scan and returns the primary class for a leaf class", async () => {
      const imodelAccess = createMockIModelAccess();

      const result = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: "TestSchema.ClassA" }],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedPrimaryClasses).to.deep.equal(["TestSchema.ClassA"]);
      // Only the path-resolution query runs — no primary-enumeration scan for a leaf class.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const queries = vi.mocked(imodelAccess.createQueryReader).mock.calls.map((c) => c[0].ecsql);
      expect(queries.some((ecsql) => isPrimaryEnumerationQuery(ecsql))).to.equal(false);
    });

    it("normalizes the primary class name for a leaf class", async () => {
      const imodelAccess = createMockIModelAccess();

      const result = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: "TestSchema.ClassA" }],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedPrimaryClasses).to.deep.equal(["TestSchema.ClassA"]);
    });

    it("enumerates concrete primary classes for a polymorphic base", async () => {
      const imodelAccess = createMockIModelAccess({
        derivedClasses: { "TestSchema.ClassA": ["TestSchema.Door", "TestSchema.Window", "TestSchema.Ladder"] },
        primaryClassScanResults: [{ 0: "TestSchema.Door" }, { 0: "TestSchema.Window" }],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: "TestSchema.ClassA" }],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedPrimaryClasses).to.deep.equal(["TestSchema.Door", "TestSchema.Window"]);
    });

    it("de-duplicates and sorts enumerated classes", async () => {
      const imodelAccess = createMockIModelAccess({
        derivedClasses: { "TestSchema.ClassA": ["TestSchema.Door"] },
        primaryClassScanResults: [{ 0: "TestSchema.Window" }, { 0: "TestSchema.Door" }, { 0: "TestSchema.Window" }],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: "TestSchema.ClassA" }],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedPrimaryClasses).to.deep.equal(["TestSchema.Door", "TestSchema.Window"]);
    });

    it("returns an empty list for a polymorphic base with no instances in scope", async () => {
      const imodelAccess = createMockIModelAccess({
        derivedClasses: { "TestSchema.ClassA": ["TestSchema.Door"] },
        primaryClassScanResults: [],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: "TestSchema.ClassA" }],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedPrimaryClasses).to.deep.equal([]);
    });

    it("honors instanceFilter in the enumeration query", async () => {
      const imodelAccess = createMockIModelAccess({
        derivedClasses: { "TestSchema.ClassA": ["TestSchema.Door"] },
        primaryClassScanResults: [{ 0: "TestSchema.Door" }],
      });

      await resolveContentSources({
        imodelAccess,
        targets: [
          {
            primaryClass: "TestSchema.ClassA",
            instanceFilter: {
              expression: "this.Area > :minArea",
              bindings: { minArea: { type: "double", value: 100.0 } },
            },
          },
        ],
        config: { imodelFieldsProviders: [provider] },
      });

      const scanQuery = vi
        // eslint-disable-next-line @typescript-eslint/unbound-method
        .mocked(imodelAccess.createQueryReader)
        .mock.calls.map((c) => c[0])
        .find((q) => isPrimaryEnumerationQuery(q.ecsql));
      expect(scanQuery).to.not.equal(undefined);
      expect(scanQuery!.ecsql).to.include("[this].Area > :minArea");
      expect(scanQuery!.bindings).to.deep.equal({ minArea: { type: "double", value: 100.0 } });
    });

    it("returns an empty list when no fields providers are configured", async () => {
      const result = await resolveContentSources({
        imodelAccess: createMockIModelAccess({ derivedClasses: { "TestSchema.ClassA": ["TestSchema.Door"] } }),
        targets: [{ primaryClass: "TestSchema.ClassA" }],
      });

      expect(result[0].resolvedPrimaryClasses).to.deep.equal([]);
    });
  });
});
