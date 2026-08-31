/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { resolveContentSources } from "../content/Content.js";
import { TARGET_FILTER_JOIN_ALIAS } from "../content/query/TargetFilter.js";

import type {
  EC,
  ECSchemaProvider,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
  RelationshipPath,
} from "@itwin/presentation-shared";
import type { ContentTarget, ResolvedPath } from "../content/ContentTarget.js";
import type { IModelFieldsProvider, RelatedPropertiesDeclaration } from "../content/extensions/IModelFieldsProvider.js";

// Mock `ECSql.createRelationshipPathJoinInfo` / `ECSql.createRelationshipPathJoinClause` because the
// real implementations require a functioning ECSchemaProvider that returns actual schema metadata to
// construct JOIN clauses. `createRelationshipPathJoinInfo` returns the per-step selectors; the sync
// `createRelationshipPathJoinClause` overload renders the fixed JOIN string from that info so the
// tests can verify strategy/racing/mapping logic without needing real schema objects.
vi.mock("@itwin/presentation-shared", async (importOriginal) => {
  const actual: any = await importOriginal();
  const FIXED_JOINS = `INNER JOIN [TestSchema].[TestRel] [r0] ON [r0].[SourceECInstanceId] = [this].[ECInstanceId] INNER JOIN [TestSchema].[TestTarget] [s0] ON [s0].[ECInstanceId] = [r0].[TargetECInstanceId]`;
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ECSql: {
      ...actual.ECSql,
      createRelationshipPathJoinInfo: async ({
        path,
      }: {
        path: Array<{ sourceAlias: string; targetAlias: string; relationshipAlias: string }>;
      }) => ({
        // `joins` is a `RelationshipJoinInfo[]` in the real result; the tests never inspect it (the
        // rendered string comes from the mocked `createRelationshipPathJoinClause` below).
        steps: path.map((step) => ({
          joins: [],
          sourceClassIdSelector: `[${step.sourceAlias}].[ECClassId]`,
          relationshipClassIdSelector: `[${step.relationshipAlias}].[ECClassId]`,
          targetClassIdSelector: `[${step.targetAlias}].[ECClassId]`,
        })),
        bindings: undefined,
      }),
      createRelationshipPathJoinClause: (info: {
        steps: Array<{ relationshipClassIdSelector: string }>;
        bindings?: unknown;
      }) => ({ joins: FIXED_JOINS, bindings: info.bindings }),
    },
  };
});

function createMockGetSchema(derivedClasses: Record<string, string[]> = {}) {
  return vi.fn(
    async (schemaName: string) =>
      ({
        getClass: (className: string) => {
          const fullName = `${schemaName}.${className}`;
          const derived = derivedClasses[fullName] ?? [];
          return { fullName, getDerivedClassNames: () => derived };
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
}): ECSqlQueryExecutor & ECSchemaProvider {
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

/**
 * An iModel access whose non-primary-enumeration query results are computed per-call from the
 * generated ECSQL — needed to test nested expansion, where a single test run resolves several
 * distinct declaration paths (base + nested, at growing lengths) that each need their own rows.
 * `routeRows` can tell queries apart by the step aliases they reference (`[s0]`, `[s1]`, `[s2]`, ...
 * one per path step, present regardless of which racing strategy's query happens to be inspected).
 */
function createRoutedIModelAccess(props: {
  derivedClasses?: Record<string, string[]>;
  routeRows: (ecsql: string) => ECSqlQueryRow[];
}): ECSqlQueryExecutor & ECSchemaProvider {
  const { derivedClasses = {}, routeRows } = props;
  return {
    createQueryReader: vi.fn((query: ECSqlQueryDef) => {
      const rows = isPrimaryEnumerationQuery(query.ecsql) ? [] : routeRows(query.ecsql);
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
        createQueryReader: vi.fn((): AsyncIterableIterator<ECSqlQueryRow> =>
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
      const queryRow: ECSqlQueryRow = {
        0: "TestSchema.ClassA",
        1: "TestSchema.ConcreteRelAB",
        2: "TestSchema.ConcreteB",
      };
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
                      relationshipName: "TestSchema.ConcreteRelAB",
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
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB1", 2: "TestSchema.ConcreteB1" },
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB2", 2: "TestSchema.ConcreteB2" },
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
                      relationshipName: "TestSchema.ConcreteRelAB1",
                    },
                  ],
                  targetClassNames: ["TestSchema.ClassA"],
                },
                {
                  path: [
                    {
                      sourceClassName: "TestSchema.ClassA",
                      targetClassName: "TestSchema.ConcreteB2",
                      relationshipName: "TestSchema.ConcreteRelAB2",
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

  describe("concrete relationship class resolution", () => {
    it("projects and groups by the concrete relationship class in the resolution query", async () => {
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
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
        ],
      });

      await resolveContentSources({ imodelAccess, targets: [targetA], config: { imodelFieldsProviders: [provider] } });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const allQueries = vi.mocked(imodelAccess.createQueryReader).mock.calls.map((c) => c[0].ecsql);
      const queries = allQueries.filter((ecsql) => !isPrimaryEnumerationQuery(ecsql));
      expect(queries.length).to.be.greaterThan(0);
      for (const ecsql of queries) {
        // the concrete relationship class name is projected...
        expect(ecsql).to.include("ec_classname([r0].[ECClassId], 's.c')");
        // ...and the query groups by the relationship class id so distinct subclasses are separate rows
        const groupByClause = ecsql.slice(ecsql.lastIndexOf("GROUP BY"));
        expect(groupByClause).to.include("[r0].[ECClassId]");
      }
    });

    it("resolves distinct relationship subclasses of the same source/target as separate paths", async () => {
      const path: RelationshipPath = [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.ClassB",
          relationshipName: "TestSchema.BaseRel",
        },
      ];
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: [{ path }] });
      // Same near-end and target classes, but two concrete relationship subclasses present in the data.
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRel1", 2: "TestSchema.ConcreteB" },
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRel2", 2: "TestSchema.ConcreteB" },
        ],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result[0].resolvedDeclarations[0].paths).to.deep.equal([
        {
          path: [
            {
              sourceClassName: "TestSchema.ClassA",
              targetClassName: "TestSchema.ConcreteB",
              relationshipName: "TestSchema.ConcreteRel1",
            },
          ],
          targetClassNames: ["TestSchema.ClassA"],
        },
        {
          path: [
            {
              sourceClassName: "TestSchema.ClassA",
              targetClassName: "TestSchema.ConcreteB",
              relationshipName: "TestSchema.ConcreteRel2",
            },
          ],
          targetClassNames: ["TestSchema.ClassA"],
        },
      ]);
    });

    it("projects the first step's relationship class and instance out of the anchoring subquery for multi-step paths", async () => {
      // A 2-step path makes the subquery-anchor strategy applicable; its first step's relationship
      // class and instance are resolved inside the anchoring subquery.
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
      const imodelAccess = createMockIModelAccess({
        resolvePathsQueryResults: [
          {
            0: "TestSchema.ClassA",
            1: "TestSchema.ConcreteRelAB",
            2: "TestSchema.ConcreteB",
            3: "TestSchema.ConcreteRelBC",
            4: "TestSchema.ConcreteC",
          },
        ],
      });

      await resolveContentSources({ imodelAccess, targets: [targetA], config: { imodelFieldsProviders: [provider] } });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const queries = vi.mocked(imodelAccess.createQueryReader).mock.calls.map((c) => c[0].ecsql);
      const anchoringQuery = queries.find((ecsql) => ecsql.includes("[FirstStepRelClassId]"));
      expect(anchoringQuery).to.not.equal(undefined);
      expect(anchoringQuery).to.include("[s0].[ECInstanceId] [FirstHopInstanceId]");
      expect(anchoringQuery).to.include("[reachable].[FirstHopInstanceId] = [s0].[ECInstanceId]");
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
      const queryRow: ECSqlQueryRow = {
        0: "TestSchema.ClassA",
        1: "TestSchema.ConcreteRelAB",
        2: "TestSchema.ConcreteB",
        3: "TestSchema.ConcreteRelBC",
        4: "TestSchema.ConcreteC",
      };
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
                      relationshipName: "TestSchema.ConcreteRelAB",
                    },
                    {
                      sourceClassName: "TestSchema.ConcreteB",
                      targetClassName: "TestSchema.ConcreteC",
                      relationshipName: "TestSchema.ConcreteRelBC",
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
        1: "TestSchema.ConcreteRelAB",
        2: "TestSchema.ConcreteB",
        3: "TestSchema.ConcreteRelBC",
        4: "TestSchema.ConcreteC",
        5: "TestSchema.ConcreteRelCD",
        6: "TestSchema.ConcreteD",
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
                      relationshipName: "TestSchema.ConcreteRelAB",
                    },
                    {
                      sourceClassName: "TestSchema.ConcreteB",
                      targetClassName: "TestSchema.ConcreteC",
                      relationshipName: "TestSchema.ConcreteRelBC",
                    },
                    {
                      sourceClassName: "TestSchema.ConcreteC",
                      targetClassName: "TestSchema.ConcreteD",
                      relationshipName: "TestSchema.ConcreteRelCD",
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.Sub2,TestSchema.Sub1", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
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
                  relationshipName: "TestSchema.ConcreteRelAB",
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
          { 0: "TestSchema.Sub1", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
          { 0: "TestSchema.Sub2", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteC" },
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
                  relationshipName: "TestSchema.ConcreteRelAB",
                },
              ],
              targetClassNames: ["TestSchema.Sub1"],
            },
            {
              path: [
                {
                  sourceClassName: "TestSchema.ClassA",
                  targetClassName: "TestSchema.ConcreteC",
                  relationshipName: "TestSchema.ConcreteRelAB",
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRel", 2: "TestSchema.ConcreteTarget" },
        ],
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
                  relationshipName: "TestSchema.ConcreteRel",
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
                  relationshipName: "TestSchema.ConcreteRel",
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
        ],
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
        ],
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
        ],
      });

      await resolveContentSources({ imodelAccess, targets: [target], config: { imodelFieldsProviders: [provider] } });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(imodelAccess.createQueryReader).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const call = vi.mocked(imodelAccess.createQueryReader).mock.calls[0];
      const query = call[0];
      expect(query.ecsql).to.include(
        `JOIN IdSet(:${TARGET_FILTER_JOIN_ALIAS}) [${TARGET_FILTER_JOIN_ALIAS}] ON [${TARGET_FILTER_JOIN_ALIAS}].[id] = [this].[ECInstanceId]`,
      );
      expect(query.bindings).to.deep.equal({ [TARGET_FILTER_JOIN_ALIAS]: { type: "idset", value: ["0x1", "0x2"] } });
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
        ],
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
        ],
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
        ],
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
        resolvePathsQueryResults: [
          {
            0: "TestSchema.ClassA",
            1: "TestSchema.ConcreteRelAB",
            2: "TestSchema.ConcreteB",
            3: "TestSchema.ConcreteRelBC",
            4: "TestSchema.ConcreteC",
            5: "TestSchema.ConcreteRelCD",
            6: "TestSchema.ConcreteD",
          },
        ],
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
        ],
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteB" },
        ],
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
        resolvePathsQueryResults: [
          { 0: "TestSchema.ClassA", 1: "TestSchema.ConcreteRelAB", 2: "TestSchema.ConcreteTarget" },
        ],
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
      const imodelAccess: ECSqlQueryExecutor & ECSchemaProvider = {
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

  describe("nested contribution expansion (applyRecursively)", () => {
    const aToB: RelationshipPath[number] = {
      sourceClassName: "TestSchema.ClassA",
      targetClassName: "TestSchema.ClassB",
      relationshipName: "TestSchema.RelAB",
    };
    const aToC: RelationshipPath[number] = {
      sourceClassName: "TestSchema.ClassA",
      targetClassName: "TestSchema.ClassC",
      relationshipName: "TestSchema.RelAC",
    };
    const bToC: RelationshipPath[number] = {
      sourceClassName: "TestSchema.ClassB",
      targetClassName: "TestSchema.ClassC",
      relationshipName: "TestSchema.RelBC",
    };
    const bToD: RelationshipPath[number] = {
      sourceClassName: "TestSchema.ClassB",
      targetClassName: "TestSchema.ClassD",
      relationshipName: "TestSchema.RelBD",
    };
    const cToD: RelationshipPath[number] = {
      sourceClassName: "TestSchema.ClassC",
      targetClassName: "TestSchema.ClassD",
      relationshipName: "TestSchema.RelCD",
    };

    // Builds a single mock query row: column 0 is the (concrete, `GROUP_CONCAT`-aggregated) near-end
    // class, followed by one [relationshipClassName, targetClassName] pair per path step.
    function row(nearEndClass: string, ...stepClassNames: string[]): ECSqlQueryRow {
      const result: ECSqlQueryRow = { 0: nearEndClass };
      stepClassNames.forEach((className, i) => {
        result[i + 1] = className;
      });
      return result;
    }

    // Counts path steps referenced by a query's ECSQL by probing for `[s0]`, `[s1]`, ... column
    // aliases (see `resolveDeclarationPaths`'s `joinPath` construction) — reliable across every
    // racing strategy since all of them project one column pair per step regardless of JOIN shape.
    function countSteps(ecsql: string): number {
      let n = 0;
      while (ecsql.includes(`[s${n}]`)) {
        n++;
      }
      return n;
    }

    // Routes a query to its rows purely by how many path steps it references and in which order they are queried
    // Each entry in `rowsByStepCount` is a queue of rows for a given step count; the function returns the next available row for the queried step count.
    function routeByStepCount(rowsByStepCount: Record<number, ECSqlQueryRow[][]>) {
      const invocations = new Map<number, number>();
      return (ecsql: string) => {
        const steps = countSteps(ecsql);
        if (!(steps in rowsByStepCount)) {
          throw new Error(`No ECSQL rows are setup for paths with ${steps} steps.`);
        }
        const rows = rowsByStepCount[steps];
        // up to 3 ecsql queries can be run for a particular paths. That depends on the number of steps in the path.
        // wait for all 3 to happen before moving to the next result setup for this step count.
        const stepInvocations = invocations.get(steps) ?? Math.min(steps, 3);
        if (stepInvocations === 0) {
          rows.shift();
          invocations.delete(steps);
        } else {
          invocations.set(steps, stepInvocations - 1);
        }
        if (rows.length === 0) {
          throw new Error(`No more ECSQL rows are available for paths with ${steps} steps.`);
        }
        return rows[0];
      };
    }

    it("applies an opted-in provider's contribution on another provider's resolved anchor", async () => {
      const providerA = createMockIModelFieldsProvider("providerA_v1", { relatedProperties: [{ path: [aToB] }] });
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.ClassB" ? { relatedProperties: [{ path: [bToC] }] } : undefined;
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          1: [[row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")]],
          2: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
              ),
            ],
          ],
        }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      expect(result.resolvedDeclarations).to.deep.equal([
        {
          providerId: "providerA_v1",
          declarationIndex: 0,
          paths: [{ path: [aToB], targetClassNames: ["TestSchema.ClassA"] }],
        },
        {
          providerId: "providerB_v1",
          declarationIndex: 0,
          paths: [{ path: [aToB, bToC], targetClassNames: ["TestSchema.ClassA"] }],
          nested: { anchorClassName: "TestSchema.ClassB", prefixStepCount: 1 },
        },
      ]);
    });

    it("does not apply an opted-out provider's contribution on a resolved anchor", async () => {
      const providerA = createMockIModelFieldsProvider("providerA_v1", { relatedProperties: [{ path: [aToB] }] });
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        // `applyRecursively` intentionally omitted — defaults to opted out.
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.ClassB" ? { relatedProperties: [{ path: [bToC] }] } : undefined;
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({ 1: [[row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")]] }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      expect(result.resolvedDeclarations).to.deep.equal([
        {
          providerId: "providerA_v1",
          declarationIndex: 0,
          paths: [{ path: [aToB], targetClassNames: ["TestSchema.ClassA"] }],
        },
      ]);
    });

    it('derives nested anchors from `select: "all"` and `exclude` steps, but not `include` steps', async () => {
      const declaration: RelatedPropertiesDeclaration = {
        path: [aToB, bToC, cToD],
        properties: [
          { stepIndex: 0, target: { select: "all" } },
          { stepIndex: 1, target: { select: { exclude: ["Description"] } } },
          { stepIndex: 2, target: { select: { include: ["Name"] } } },
        ],
      };
      const providerA = createMockIModelFieldsProvider("providerA_v1", { relatedProperties: [declaration] });
      const anchorsSeen: string[] = [];
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          anchorsSeen.push(target.primaryClass);
          // Contributes nothing further — this test only cares which anchors it gets invoked for.
          return undefined;
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          3: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
                "TestSchema.RelCD",
                "TestSchema.ClassD",
              ),
            ],
          ],
        }),
      });

      await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      // Invoked for the base target (A), the "all" anchor (B), and the "exclude" anchor (C) — never
      // for D, whose step selects only a narrower property subset.
      expect(anchorsSeen).to.deep.equal(["TestSchema.ClassA", "TestSchema.ClassB", "TestSchema.ClassC"]);
    });

    it('skips a `select: "all"` property spec whose step index is out of the resolved path\'s bounds', async () => {
      const declaration: RelatedPropertiesDeclaration = {
        path: [aToB],
        properties: [
          { stepIndex: 0, target: { select: "all" } },
          // the path has a single step, so index 5 can never anchor — expansion must
          // skip it without failing.
          { stepIndex: 5, target: { select: "all" } },
        ],
      };
      const providerA = createMockIModelFieldsProvider("providerA_v1", { relatedProperties: [declaration] });
      const anchorsSeen: string[] = [];
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          anchorsSeen.push(target.primaryClass);
          return undefined;
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({ 1: [[row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")]] }),
      });

      await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      // The in-range spec anchors B; the out-of-bounds spec contributes no anchor.
      expect(anchorsSeen).to.deep.equal(["TestSchema.ClassA", "TestSchema.ClassB"]);
    });

    it("terminates expansion when a nested declaration's full path resolves to no instances", async () => {
      const providerA = createMockIModelFieldsProvider("providerA_v1", { relatedProperties: [{ path: [aToB] }] });
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.ClassB" ? { relatedProperties: [{ path: [bToC] }] } : undefined;
        },
      };
      // The 1-step base path resolves, but the 2-step nested full path matches no instances.
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          1: [[row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")]],
          2: [[]],
        }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      // Only the base group remains — the empty nested resolution produces no group and enqueues nothing.
      expect(result.resolvedDeclarations).to.deep.equal([
        {
          providerId: "providerA_v1",
          declarationIndex: 0,
          paths: [{ path: [aToB], targetClassNames: ["TestSchema.ClassA"] }],
        },
      ]);
    });

    it("expands nested contributions recursively across multiple levels", async () => {
      const providerA = createMockIModelFieldsProvider("providerA_v1", { relatedProperties: [{ path: [aToB] }] });
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.ClassB" ? { relatedProperties: [{ path: [bToC] }] } : undefined;
        },
      };
      const providerC: IModelFieldsProvider = {
        id: "providerC_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.ClassC" ? { relatedProperties: [{ path: [cToD] }] } : undefined;
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          1: [[row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")]],
          2: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
              ),
            ],
          ],
          3: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
                "TestSchema.RelCD",
                "TestSchema.ClassD",
              ),
            ],
          ],
        }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB, providerC] },
      });

      const nestedGroups = result.resolvedDeclarations.filter((g) => g.nested);
      expect(nestedGroups).to.deep.equal([
        {
          providerId: "providerB_v1",
          declarationIndex: 0,
          paths: [{ path: [aToB, bToC], targetClassNames: ["TestSchema.ClassA"] }],
          nested: { anchorClassName: "TestSchema.ClassB", prefixStepCount: 1 },
        },
        {
          providerId: "providerC_v1",
          declarationIndex: 0,
          paths: [{ path: [aToB, bToC, cToD], targetClassNames: ["TestSchema.ClassA"] }],
          nested: { anchorClassName: "TestSchema.ClassC", prefixStepCount: 2 },
        },
      ]);
    });

    it("applies a nested provider at most once per (provider, anchor class) branch, even for a data-driven cycle", async () => {
      const xToX: RelationshipPath[number] = {
        sourceClassName: "TestSchema.ClassX",
        targetClassName: "TestSchema.ClassX",
        relationshipName: "TestSchema.RelXX",
      };
      const targetX: ContentTarget = { primaryClass: "TestSchema.ClassX" };
      const provider: IModelFieldsProvider = {
        id: "providerX_v1",
        applyRecursively: true,
        getContribution: vi.fn(async () => ({ relatedProperties: [{ path: [xToX] }] })),
      };
      // Every query — regardless of how many steps it joins — resolves to the same self-referencing
      // class, so an unguarded implementation would recurse forever; only the cycle guard stops it.
      const imodelAccess = createRoutedIModelAccess({
        routeRows: (ecsql) => {
          const steps = countSteps(ecsql);
          const cells: ECSqlQueryRow = { 0: "TestSchema.ClassX" };
          for (let i = 0; i < steps; i++) {
            cells[1 + i * 2] = "TestSchema.RelXX";
            cells[2 + i * 2] = "TestSchema.ClassX";
          }
          return [cells];
        },
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetX],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(result.resolvedDeclarations).to.deep.equal([
        {
          providerId: "providerX_v1",
          declarationIndex: 0,
          paths: [{ path: [xToX], targetClassNames: ["TestSchema.ClassX"] }],
        },
        {
          providerId: "providerX_v1",
          declarationIndex: 0,
          paths: [{ path: [xToX, xToX], targetClassNames: ["TestSchema.ClassX"] }],
          nested: { anchorClassName: "TestSchema.ClassX", prefixStepCount: 1 },
        },
      ]);
    });

    it("still anchors nested expansion using paths produced by a custom `resolve` declaration", async () => {
      const customResolve = vi.fn(async (): Promise<ResolvedPath[]> => [
        { path: [aToB], targetClassNames: ["TestSchema.ClassA"] },
      ]);
      const providerA = createMockIModelFieldsProvider("providerA_v1", {
        relatedProperties: [{ path: [aToB], resolve: customResolve }],
      });
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.ClassB" ? { relatedProperties: [{ path: [bToC] }] } : undefined;
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          2: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
              ),
            ],
          ],
        }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      expect(customResolve).toHaveBeenCalledOnce();
      const nested = result.resolvedDeclarations.find((g) => g.nested);
      expect(nested).to.deep.equal({
        providerId: "providerB_v1",
        declarationIndex: 0,
        paths: [{ path: [aToB, bToC], targetClassNames: ["TestSchema.ClassA"] }],
        nested: { anchorClassName: "TestSchema.ClassB", prefixStepCount: 1 },
      });
    });

    it("anchors nested expansion to same class reached by different paths", async () => {
      const providerA = createMockIModelFieldsProvider("providerA_v1", {
        relatedProperties: [{ path: [aToC] }, { path: [aToB, bToC] }],
      });
      const providerC: IModelFieldsProvider = {
        id: "providerC_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          if (target.primaryClass !== "TestSchema.ClassC") {
            return undefined;
          }
          return { relatedProperties: [{ path: [cToD] }] };
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          1: [[row("TestSchema.ClassA", "TestSchema.RelAC", "TestSchema.ClassC")]],
          2: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
              ),
            ],
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAC",
                "TestSchema.ClassC",
                "TestSchema.RelCD",
                "TestSchema.ClassD",
              ),
            ],
          ],
          3: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
                "TestSchema.RelCD",
                "TestSchema.ClassD",
              ),
            ],
          ],
        }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerC] },
      });

      const nestedGroups = result.resolvedDeclarations.filter((g) => g.nested);
      expect(nestedGroups).to.deep.equal([
        {
          providerId: "providerC_v1",
          declarationIndex: 0,
          paths: [{ path: [aToC, cToD], targetClassNames: ["TestSchema.ClassA"] }],
          nested: { anchorClassName: "TestSchema.ClassC", prefixStepCount: 1 },
        },
        {
          providerId: "providerC_v1",
          declarationIndex: 0,
          paths: [{ path: [aToB, bToC, cToD], targetClassNames: ["TestSchema.ClassA"] }],
          nested: { anchorClassName: "TestSchema.ClassC", prefixStepCount: 2 },
        },
      ]);
    });

    it("skips a nested declaration with a custom `resolve` callback, applying only its non-custom siblings", async () => {
      const providerA = createMockIModelFieldsProvider("providerA_v1", { relatedProperties: [{ path: [aToB] }] });
      const customResolve = vi.fn(async (): Promise<ResolvedPath[]> => [
        { path: [bToC], targetClassNames: ["TestSchema.ClassA"] },
      ]);
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          if (target.primaryClass !== "TestSchema.ClassB") {
            return undefined;
          }
          return { relatedProperties: [{ path: [bToC], resolve: customResolve }, { path: [bToD] }] };
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          1: [[row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")]],
          2: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBD",
                "TestSchema.ClassD",
              ),
            ],
          ],
        }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      expect(customResolve).not.toHaveBeenCalled();
      const nestedGroups = result.resolvedDeclarations.filter((g) => g.nested);
      // The custom-`resolve` declaration (index 0) is skipped entirely as a nested suffix; only its
      // non-custom sibling (index 1) is applied — and it keeps its original index (skip-in-place).
      expect(nestedGroups).to.deep.equal([
        {
          providerId: "providerB_v1",
          declarationIndex: 1,
          paths: [{ path: [aToB, bToD], targetClassNames: ["TestSchema.ClassA"] }],
          nested: { anchorClassName: "TestSchema.ClassB", prefixStepCount: 1 },
        },
      ]);
    });

    it("memoizes a nested provider's contribution per anchor class, de-duplicating across parent branches that land on it", async () => {
      const providerA = createMockIModelFieldsProvider("providerA_v1", {
        relatedProperties: [{ path: [aToB] }, { path: [aToB] }],
      });
      let callCount = 0;
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          if (target.primaryClass !== "TestSchema.ClassB") {
            return undefined;
          }
          callCount++;
          return { relatedProperties: [{ path: [bToC] }] };
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          1: [
            [row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")],
            [row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")],
          ],
          2: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
              ),
            ],
          ],
        }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      expect(callCount).to.equal(1);
      const nestedGroups = result.resolvedDeclarations.filter((g) => g.nested);
      expect(nestedGroups).to.deep.equal([
        {
          providerId: "providerB_v1",
          declarationIndex: 0,
          paths: [{ path: [aToB, bToC], targetClassNames: ["TestSchema.ClassA"] }],
          nested: { anchorClassName: "TestSchema.ClassB", prefixStepCount: 1 },
        },
      ]);
    });

    it("computes the nested group's effective cardinality hint by combining the parent and nested hints", async () => {
      const providerA = createMockIModelFieldsProvider("providerA_v1", {
        relatedProperties: [{ path: [aToB], cardinalityHint: "many" }],
      });
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.ClassB" ? { relatedProperties: [{ path: [bToC] }] } : undefined;
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          1: [[row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")]],
          2: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
              ),
            ],
          ],
        }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      const nested = result.resolvedDeclarations.find((g) => g.nested);
      expect(nested?.nested?.effectiveCardinalityHint).to.equal("many");
    });

    it("computes the effective cardinality hint for mixed and matching hint combinations", async () => {
      const providerA = createMockIModelFieldsProvider("providerA_v1", {
        relatedProperties: [{ path: [aToB], cardinalityHint: "one" }],
      });
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.ClassB"
            ? {
                relatedProperties: [
                  { path: [bToC], cardinalityHint: "many" },
                  { path: [bToD] },
                  { path: [bToC], cardinalityHint: "one" },
                ],
              }
            : undefined;
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: (ecsql: string) => {
          if (ecsql.includes("RelBD")) {
            return [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBD",
                "TestSchema.ClassD",
              ),
            ];
          }
          if (ecsql.includes("RelBC")) {
            return [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
              ),
            ];
          }
          return [row("TestSchema.ClassA", "TestSchema.RelAB", "TestSchema.ClassB")];
        },
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      const nestedGroups = result.resolvedDeclarations.filter((g) => g.nested);
      // Parent "one" + nested "many" → "many"; parent "one" + nested without a hint → undefined (the
      // unhinted segment may be schema-many, so no 1:1 promise can be made — consumers fall back to
      // schema inspection); parent "one" + nested "one" → "one".
      expect(nestedGroups.map((g) => g.nested?.effectiveCardinalityHint)).to.deep.equal(["many", undefined, "one"]);
    });

    it("anchors a custom `resolve` declaration's nested expansion at each resolved path's own final step", async () => {
      // The custom resolver returns a 2-step concrete path for a 1-step declared path — anchors must
      // derive from the resolved path's final step (ClassC), not the declared path's length (ClassB).
      const customResolve = vi.fn(async (): Promise<ResolvedPath[]> => [
        { path: [aToB, bToC], targetClassNames: ["TestSchema.ClassA"] },
      ]);
      const providerA = createMockIModelFieldsProvider("providerA_v1", {
        relatedProperties: [{ path: [aToB], resolve: customResolve }],
      });
      const anchorsSeen: string[] = [];
      const providerB: IModelFieldsProvider = {
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          anchorsSeen.push(target.primaryClass);
          return target.primaryClass === "TestSchema.ClassC" ? { relatedProperties: [{ path: [cToD] }] } : undefined;
        },
      };
      const imodelAccess = createRoutedIModelAccess({
        routeRows: routeByStepCount({
          3: [
            [
              row(
                "TestSchema.ClassA",
                "TestSchema.RelAB",
                "TestSchema.ClassB",
                "TestSchema.RelBC",
                "TestSchema.ClassC",
                "TestSchema.RelCD",
                "TestSchema.ClassD",
              ),
            ],
          ],
        }),
      });

      const [result] = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      // The anchor is the resolved path's final step's class (C) — never the mid-path class (B) that
      // the declared path's length would point at. C's own nested group then probes its anchor (D).
      expect(anchorsSeen).to.deep.equal(["TestSchema.ClassA", "TestSchema.ClassC", "TestSchema.ClassD"]);
      const nested = result.resolvedDeclarations.find((g) => g.nested);
      expect(nested).to.deep.equal({
        providerId: "providerB_v1",
        declarationIndex: 0,
        paths: [{ path: [aToB, bToC, cToD], targetClassNames: ["TestSchema.ClassA"] }],
        nested: { anchorClassName: "TestSchema.ClassC", prefixStepCount: 2 },
      });
    });
  });
});
