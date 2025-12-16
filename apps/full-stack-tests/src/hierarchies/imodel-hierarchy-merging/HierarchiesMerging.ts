/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECDb } from "@itwin/core-backend";
import { assert } from "@itwin/core-bentley";
import {
  createMergedIModelHierarchyProvider,
  createNodesQueryClauseFactory,
  createPredicateBasedHierarchyDefinition,
  DefineGenericNodeChildHierarchyLevelProps,
  DefineInstanceNodeChildHierarchyLevelProps,
  HierarchyDefinition,
  HierarchyNodeKey,
  NodesQueryClauseFactory,
} from "@itwin/presentation-hierarchies";
import { createDefaultInstanceLabelSelectClauseFactory, ECSqlBinding, Props } from "@itwin/presentation-shared";
import { cloneECDb, createECDb, ECDbBuilder, importSchema } from "../../IModelUtils.js";
import { createIModelAccess } from "../Utils.js";

export function createHierarchyDefinitionFactory({
  schema,
  createYGroupingParams,
  createGenericNodeForY,
}: {
  schema: Awaited<ReturnType<typeof importSchema>>;
  createYGroupingParams?: (alias: string) => Props<NodesQueryClauseFactory["createSelectClause"]>["grouping"];
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
              grouping: createYGroupingParams?.("this"),
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

export async function importXYZSchema(target: ECDbBuilder) {
  return importSchema(
    { schemaName: "XYZ", schemaAlias: "xyz" },
    target,
    `
      <ECEntityClass typeName="X">
        <ECProperty propertyName="Label" typeName="string" />
        <ECProperty propertyName="PropX" typeName="int" />
      </ECEntityClass>

      <ECEntityClass typeName="Y">
        <ECCustomAttributes>
            <ClassMap xmlns="ECDbMap.02.00.04">
                <MapStrategy>TablePerHierarchy</MapStrategy>
            </ClassMap>
        </ECCustomAttributes>
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

export async function importQSchema(target: ECDbBuilder) {
  return importSchema(
    { schemaName: "Q", schemaAlias: "q" },
    target,
    `
      <ECSchemaReference name="XYZ" version="01.00.00" alias="xyz"/>
      <ECEntityClass typeName="Q">
        <BaseClass>xyz:Y</BaseClass>
        <ECProperty propertyName="PropQ" typeName="int" />
      </ECEntityClass>
    `,
  );
}

export async function createChangedDbs<TResultBase extends {}, TResultChangeset1 extends {}>(
  mochaContext: Mocha.Context,
  setupBase: (db: ECDbBuilder) => Promise<TResultBase>,
  setupChangeset1: (db: ECDbBuilder, before: TResultBase) => Promise<TResultChangeset1>,
): Promise<{ base: Awaited<ReturnType<typeof createECDb>> & TResultBase; changeset1: Awaited<ReturnType<typeof createECDb>> & TResultChangeset1 } & Disposable>;
export async function createChangedDbs<TResultBase extends {}, TResultChangeset1 extends {}, TResultChangeset2 extends {}>(
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
export async function createChangedDbs<TResultBase extends {}, TResultChangeset1 extends {}, TResultChangeset2 extends {}>(
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

export function createMergedHierarchyProvider(props: {
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
