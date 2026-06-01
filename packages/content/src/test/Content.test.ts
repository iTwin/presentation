/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { resolveContentSources } from "../content/Content.js";
import { ECSQL_PREFIX } from "../content/InternalUtils.js";

import type {
  ECSchemaProvider,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
  RelationshipPath,
} from "@itwin/presentation-shared";
import type { ContentTarget } from "../content/ContentTarget.js";
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

function createMockIModelAccess(props?: {
  resolvePathsQueryResults?: ECSqlQueryRow[];
}): ECSqlQueryExecutor & ECSchemaProvider {
  const { resolvePathsQueryResults = [] } = props ?? {};
  return {
    createQueryReader: vi.fn((_query: ECSqlQueryDef) => {
      return (async function* () {
        for (const row of resolvePathsQueryResults) {
          yield row;
        }
      })();
    }),
    getSchema: vi.fn(async () => undefined),
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
      expect(result[0]).to.deep.equal({ target: targets[0], resolvedDeclarations: [] });
      expect(result[1]).to.deep.equal({ target: targets[1], resolvedDeclarations: [] });
    });

    it("returns empty resolvedDeclarations when provider returns undefined", async () => {
      const provider = createMockIModelFieldsProvider("test_v1", undefined);
      const result = await resolveContentSources({
        imodelAccess: createMockIModelAccess(),
        targets: [targetA],
        config: { fieldsProviders: [provider] },
      });
      expect(result).to.have.length(1);
      expect(result[0].resolvedDeclarations).to.deep.equal([]);
    });

    it("returns empty resolvedDeclarations when provider contribution has no relatedProperties", async () => {
      const provider = createMockIModelFieldsProvider("test_v1", { relatedProperties: undefined });
      const result = await resolveContentSources({
        imodelAccess: createMockIModelAccess(),
        targets: [targetA],
        config: { fieldsProviders: [provider] },
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
        config: { fieldsProviders: [provider] },
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
          (): AsyncIterableIterator<ECSqlQueryRow> => (async function* (): AsyncGenerator<ECSqlQueryRow> { throw queryError; })(),
        ),
      };
      await expect(
        resolveContentSources({ imodelAccess, targets: [targetA], config: { fieldsProviders: [provider] } }),
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
      const queryRow: ECSqlQueryRow = { 0: "TestSchema.ConcreteB" };
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [queryRow] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { fieldsProviders: [provider] },
      });

      expect(result).to.deep.equal([
        {
          target: targetA,
          resolvedDeclarations: [
            {
              providerId: "test_v1",
              declarationIndex: 0,
              paths: [
                [
                  {
                    sourceClassName: "TestSchema.ClassA",
                    targetClassName: "TestSchema.ConcreteB",
                    relationshipName: "TestSchema.RelAB",
                  },
                ],
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
        resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB1" }, { 0: "TestSchema.ConcreteB2" }],
      });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { fieldsProviders: [provider] },
      });

      expect(result).to.deep.equal([
        {
          target: targetA,
          resolvedDeclarations: [
            {
              providerId: "test_v1",
              declarationIndex: 0,
              paths: [
                [
                  {
                    sourceClassName: "TestSchema.ClassA",
                    targetClassName: "TestSchema.ConcreteB1",
                    relationshipName: "TestSchema.RelAB",
                  },
                ],
                [
                  {
                    sourceClassName: "TestSchema.ClassA",
                    targetClassName: "TestSchema.ConcreteB2",
                    relationshipName: "TestSchema.RelAB",
                  },
                ],
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
      const queryRow: ECSqlQueryRow = { 0: "TestSchema.ConcreteB", 1: "TestSchema.ConcreteC" };
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [queryRow] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { fieldsProviders: [provider] },
      });

      expect(result).to.deep.equal([
        {
          target: targetA,
          resolvedDeclarations: [
            {
              providerId: "test_v1",
              declarationIndex: 0,
              paths: [
                [
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
        0: "TestSchema.ConcreteB",
        1: "TestSchema.ConcreteC",
        2: "TestSchema.ConcreteD",
      };
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [queryRow] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { fieldsProviders: [provider] },
      });

      // 3 strategies are applicable for a 3-step path: original, subquery-anchor, cross-join
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(3);

      // Verify the final resolved paths are correct regardless of which strategy won the race
      expect(result).to.deep.equal([
        {
          target: targetA,
          resolvedDeclarations: [
            {
              providerId: "test_v1",
              declarationIndex: 0,
              paths: [
                [
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
              ],
            },
          ],
        },
      ]);
    });
  });

  it("delegates custom resolve callback to declaration's resolve function instead of querying", async () => {
    const customPaths: RelationshipPath[] = [
      [
        {
          sourceClassName: "TestSchema.ClassA",
          targetClassName: "TestSchema.Resolved",
          relationshipName: "TestSchema.CustomRel",
        },
      ],
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
      config: { fieldsProviders: [provider] },
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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteTarget" }] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { fieldsProviders: [provider1, provider2] },
      });

      expect(result[0].resolvedDeclarations).to.deep.equal([
        {
          providerId: "provider1_v1",
          declarationIndex: 0,
          paths: [
            [
              {
                sourceClassName: "TestSchema.ClassA",
                targetClassName: "TestSchema.ConcreteTarget",
                relationshipName: "TestSchema.RelAB",
              },
            ],
          ],
        },
        {
          providerId: "provider2_v1",
          declarationIndex: 0,
          paths: [
            [
              {
                sourceClassName: "TestSchema.ClassA",
                targetClassName: "TestSchema.ConcreteTarget",
                relationshipName: "TestSchema.RelAC",
              },
            ],
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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB" }] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { fieldsProviders: [provider1, provider2] },
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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB" }] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { fieldsProviders: [provider1, provider2] },
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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB" }] });

      await resolveContentSources({ imodelAccess, targets: [target], config: { fieldsProviders: [provider] } });

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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB" }] });

      await resolveContentSources({ imodelAccess, targets: [target], config: { fieldsProviders: [provider] } });

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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB" }] });

      await resolveContentSources({ imodelAccess, targets: [target], config: { fieldsProviders: [provider] } });

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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB" }] });

      await resolveContentSources({ imodelAccess, targets: [target], config: { fieldsProviders: [provider] } });

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

      await resolveContentSources({ imodelAccess, targets: [target], config: { fieldsProviders: [provider] } });

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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB" }] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [target1, target2],
        config: { fieldsProviders: [provider] },
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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteB" }] });

      await resolveContentSources({ imodelAccess, targets, config: { fieldsProviders: [provider] } });

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
      const imodelAccess = createMockIModelAccess({ resolvePathsQueryResults: [{ 0: "TestSchema.ConcreteTarget" }] });

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { fieldsProviders: [provider] },
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
          const rows = callCount <= 1 ? [] : [{ 0: "TestSchema.ConcreteC" }];
          return (async function* () {
            for (const row of rows) {
              yield row;
            }
          })();
        }),
        getSchema: vi.fn(async () => undefined),
      };

      const result = await resolveContentSources({
        imodelAccess,
        targets: [targetA],
        config: { fieldsProviders: [provider] },
      });

      expect(result[0].resolvedDeclarations.map((d) => d.declarationIndex)).to.deep.equal([1]);
    });
  });
});
