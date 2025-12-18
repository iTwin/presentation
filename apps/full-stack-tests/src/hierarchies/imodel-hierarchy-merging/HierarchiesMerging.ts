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
  DefineRootHierarchyLevelProps,
  HierarchyDefinition,
  HierarchyNodeKey,
  NodesQueryClauseFactory,
} from "@itwin/presentation-hierarchies";
import { createDefaultInstanceLabelSelectClauseFactory, ECSqlBinding, Props } from "@itwin/presentation-shared";
import { cloneECDb, createECDb, ECDbBuilder, importSchema } from "../../IModelUtils.js";
import { createIModelAccess } from "../Utils.js";

export function createHierarchyDefinitionFactory({
  xyzSchema,
  createYGroupingParams,
  createGenericNodeForY,
}: {
  xyzSchema: Awaited<ReturnType<typeof importSchema>>;
  createYGroupingParams?: (alias: string) => Props<NodesQueryClauseFactory["createSelectClause"]>["grouping"];
  createGenericNodeForY?: boolean;
}): Props<typeof createMergedHierarchyProvider>["createHierarchyDefinition"] {
  const classes = xyzSchema.items;

  const rootNodes = async ({ imodelAccess, instanceFilter }: DefineRootHierarchyLevelProps) => {
    const queryClauseFactory = createNodesQueryClauseFactory({
      imodelAccess,
      instanceLabelSelectClauseFactory: createDefaultInstanceLabelSelectClauseFactory(),
    });
    const { from, joins, where } = await queryClauseFactory.createFilterClauses({
      contentClass: { fullName: classes.X.fullName, alias: "this" },
      filter: instanceFilter,
    });
    return [
      {
        fullClassName: classes.X.fullName,
        query: {
          ecsql: `
            SELECT ${await queryClauseFactory.createSelectClause({
              ecClassId: { selector: `this.ECClassId` },
              ecInstanceId: { selector: `this.ECInstanceId` },
              nodeLabel: { selector: "this.Label" },
            })}
            FROM ${from} AS this
            ${joins}
            ${where ? `WHERE ${where}` : ""}
          `,
        },
      },
    ];
  };
  const childNodesForX = async ({
    imodelAccess,
    instanceFilter,
    parentNodeInstanceIds,
  }: Pick<DefineInstanceNodeChildHierarchyLevelProps, "imodelAccess" | "instanceFilter" | "parentNodeInstanceIds">) => {
    const queryClauseFactory = createNodesQueryClauseFactory({
      imodelAccess,
      instanceLabelSelectClauseFactory: createDefaultInstanceLabelSelectClauseFactory(),
    });
    const [filterY, filterZ] = await Promise.all(
      [classes.Y.fullName, classes.Z.fullName].map(async (contentClassName) =>
        queryClauseFactory.createFilterClauses({
          contentClass: { fullName: contentClassName, alias: "this" },
          filter: instanceFilter,
        }),
      ),
    );
    return [
      {
        fullClassName: classes.Y.fullName,
        query: {
          ecsql: `
            SELECT ${await queryClauseFactory.createSelectClause({
              ecClassId: { selector: `this.ECClassId` },
              ecInstanceId: { selector: `this.ECInstanceId` },
              nodeLabel: { selector: "this.Label" },
              grouping: createYGroupingParams?.("this"),
            })}
            FROM ${filterY.from} AS this
            ${filterY.joins}
            JOIN ${classes.XY.fullName} AS xy ON xy.TargetECInstanceId = this.ECInstanceId
            WHERE xy.SourceECInstanceId IN (${parentNodeInstanceIds.map(() => "?").join(",")})
              ${filterY.where ? `AND ${filterY.where}` : ""}
          `,
          bindings: parentNodeInstanceIds.map((id): ECSqlBinding => ({ type: "id", value: id })),
        },
      },
      {
        fullClassName: classes.Z.fullName,
        query: {
          ecsql: `
            SELECT ${await queryClauseFactory.createSelectClause({
              ecClassId: { selector: `this.ECClassId` },
              ecInstanceId: { selector: `this.ECInstanceId` },
              nodeLabel: { selector: "this.Label" },
            })}
            FROM ${filterZ.from} AS this
            ${filterZ.joins}
            JOIN ${classes.XZ.fullName} AS xz ON xz.TargetECInstanceId = this.ECInstanceId
            WHERE xz.SourceECInstanceId IN (${parentNodeInstanceIds.map(() => "?").join(",")})
              ${filterZ.where ? `AND ${filterZ.where}` : ""}
          `,
          bindings: parentNodeInstanceIds.map((id): ECSqlBinding => ({ type: "id", value: id })),
        },
      },
    ];
  };

  return ({ primaryIModelAccess }) =>
    createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: primaryIModelAccess,
      hierarchy: {
        rootNodes: async (props) => rootNodes(props),
        childNodes: [
          {
            parentInstancesNodePredicate: classes.X.fullName,
            definitions: async (props: DefineInstanceNodeChildHierarchyLevelProps) =>
              createGenericNodeForY
                ? [
                    {
                      node: {
                        label: "Y elements",
                        key: "y-elements",
                        extendedData: {
                          parentNodeInstanceIds: props.parentNodeInstanceIds,
                        },
                      },
                    },
                  ]
                : childNodesForX(props),
          },
          {
            parentGenericNodePredicate: async ({ id }) => id === "y-elements",
            definitions: async (props: DefineGenericNodeChildHierarchyLevelProps) => {
              const xNodeKey = props.parentNode.parentKeys[props.parentNode.parentKeys.length - 1];
              assert(HierarchyNodeKey.isInstances(xNodeKey));
              const parentNodeInstanceIds = xNodeKey.instanceKeys.map(({ id }) => id);
              return childNodesForX({ ...props, parentNodeInstanceIds });
            },
          },
        ],
      },
    });
}

const xyzSchema100Xml = `
  <ECEntityClass typeName="X">
    <ECCustomAttributes>
        <ClassMap xmlns="ECDbMap.02.00.04">
            <MapStrategy>TablePerHierarchy</MapStrategy>
        </ClassMap>
    </ECCustomAttributes>
    <!-- X properties -->
    <ECProperty propertyName="Label" typeName="string" />
    <ECProperty propertyName="PropX" typeName="int" />
  </ECEntityClass>

  <ECEntityClass typeName="Y">
    <ECCustomAttributes>
        <ClassMap xmlns="ECDbMap.02.00.04">
            <MapStrategy>TablePerHierarchy</MapStrategy>
        </ClassMap>
    </ECCustomAttributes>
    <!-- Y properties -->
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
    <!-- Z properties -->
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
`;
const xyzSchema101Xml = xyzSchema100Xml
  .replace(
    `<!-- X properties -->`,
    `
      <!-- X properties -->
      <ECProperty propertyName="PropX2" typeName="int" />
    `,
  )
  .replace(
    `<!-- Y properties -->`,
    `
      <!-- Y properties -->
      <ECProperty propertyName="PropY2" typeName="int" />
    `,
  )
  .replace(
    `<!-- Z properties -->`,
    `
      <!-- Z properties -->
      <ECProperty propertyName="PropZ2" typeName="int" />
    `,
  );
export async function importXYZSchema(target: ECDbBuilder, version: "1.0.0" | "1.0.1" = "1.0.0") {
  return importSchema({ schemaName: "XYZ", schemaAlias: "xyz", schemaVersion: version }, target, version === "1.0.0" ? xyzSchema100Xml : xyzSchema101Xml);
}

export async function importQSchema(target: ECDbBuilder, xyzSchema?: Omit<Awaited<ReturnType<typeof importSchema>>, "items">) {
  if (!xyzSchema) {
    xyzSchema = { schemaName: "XYZ", schemaAlias: "xyz", schemaVersion: "01.00.00" };
  }
  return importSchema(
    { schemaName: "Q", schemaAlias: "q" },
    target,
    `
      <ECSchemaReference name="${xyzSchema.schemaName}" version="${xyzSchema.schemaVersion ?? "01.00.00"}" alias="${xyzSchema.schemaAlias}" />
      <ECEntityClass typeName="Q">
        <BaseClass>xyz:Y</BaseClass>
        <ECProperty propertyName="PropQ" typeName="int" />
      </ECEntityClass>
      <ECEntityClass typeName="W">
        <BaseClass>xyz:X</BaseClass>
        <ECProperty propertyName="PropW" typeName="int" />
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
  createHierarchyDefinition: (props: { primaryIModelAccess: ReturnType<typeof createIModelAccess> }) => HierarchyDefinition;
}) {
  const imodels = props.imodels.map(({ ecdb, key }) => ({ imodelAccess: { ...createIModelAccess(ecdb), imodelKey: key } }));
  const primaryIModelAccess = imodels[imodels.length - 1].imodelAccess;
  return createMergedIModelHierarchyProvider({
    imodels,
    hierarchyDefinition: props.createHierarchyDefinition({ primaryIModelAccess }),
  });
}

export function pickAndTransform<TObj extends {}, TKey extends keyof TObj>(
  obj: TObj,
  keys: Array<TKey>,
  transform: (key: TKey, value: TObj[TKey]) => TObj[TKey],
) {
  return keys.reduce(
    (acc: Pick<TObj, TKey>, key: TKey) => {
      acc[key] = transform(key, obj[key]);
      return acc;
    },
    {} as Pick<TObj, TKey>,
  );
}
