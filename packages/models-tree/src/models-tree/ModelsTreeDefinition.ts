/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  BisInstanceLabelSelectClauseFactory,
  ClassBasedHierarchyLevelDefinitionsFactory,
  DefineHierarchyLevelProps,
  DefineInstanceNodeChildHierarchyLevelProps,
  DefineRootHierarchyLevelProps,
  ECSchema,
  ECSqlBinding,
  ECSqlSnippets,
  HierarchyLevelDefinition,
  HierarchyNode,
  HierarchyNodeIdentifiersPath,
  Id64String,
  IHierarchyLevelDefinitionsFactory,
  IInstanceLabelSelectClauseFactory,
  ILimitingECSqlQueryExecutor,
  IMetadataProvider,
  InstanceKey,
  NodeSelectClauseColumnNames,
  NodeSelectQueryFactory,
  parseFullClassName,
  ProcessedHierarchyNode,
} from "@itwin/presentation-hierarchy-builder";

export interface ModelsTreeDefinitionProps {
  metadataProvider: IMetadataProvider;
}

export interface ModelsTreeInstanceKeyPathsFromInstanceKeysProps {
  metadataProvider: IMetadataProvider;
  queryExecutor: ILimitingECSqlQueryExecutor;
  keys: InstanceKey[];
}

export interface ModelsTreeInstanceKeyPathsFromInstanceLabelProps {
  metadataProvider: IMetadataProvider;
  queryExecutor: ILimitingECSqlQueryExecutor;
  label: string;
}

export type ModelsTreeInstanceKeyPathsProps = ModelsTreeInstanceKeyPathsFromInstanceKeysProps | ModelsTreeInstanceKeyPathsFromInstanceLabelProps;

// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace ModelsTreeInstanceKeyPathsProps {
  export function isLabelProps(props: ModelsTreeInstanceKeyPathsProps): props is ModelsTreeInstanceKeyPathsFromInstanceLabelProps {
    return !!(props as ModelsTreeInstanceKeyPathsFromInstanceLabelProps).label;
  }
}

export class ModelsTreeDefinition implements IHierarchyLevelDefinitionsFactory {
  private _impl: ClassBasedHierarchyLevelDefinitionsFactory;
  private _selectQueryFactory: NodeSelectQueryFactory;
  private _nodeLabelSelectClauseFactory: BisInstanceLabelSelectClauseFactory;

  public constructor(props: ModelsTreeDefinitionProps) {
    this._impl = new ClassBasedHierarchyLevelDefinitionsFactory({
      metadataProvider: props.metadataProvider,
      hierarchy: {
        rootNodes: async (requestProps) => this.createRootHierarchyLevelDefinition(requestProps),
        childNodes: [
          {
            parentNodeClassName: "BisCore.Subject",
            definitions: async (requestProps: DefineInstanceNodeChildHierarchyLevelProps) => this.createSubjectChildrenQuery(requestProps),
          },
          {
            parentNodeClassName: "BisCore.ISubModeledElement",
            definitions: async (requestProps: DefineInstanceNodeChildHierarchyLevelProps) => this.createISubModeledElementChildrenQuery(requestProps),
          },
          {
            parentNodeClassName: "BisCore.GeometricModel3d",
            definitions: async (requestProps: DefineInstanceNodeChildHierarchyLevelProps) => this.createGeometricModel3dChildrenQuery(requestProps),
          },
          {
            parentNodeClassName: "BisCore.SpatialCategory",
            definitions: async (requestProps: DefineInstanceNodeChildHierarchyLevelProps) => this.createSpatialCategoryChildrenQuery(requestProps),
          },
          {
            parentNodeClassName: "BisCore.GeometricElement3d",
            definitions: async (requestProps: DefineInstanceNodeChildHierarchyLevelProps) => this.createGeometricElement3dChildrenQuery(requestProps),
          },
        ],
      },
    });
    this._selectQueryFactory = new NodeSelectQueryFactory(props.metadataProvider);
    this._nodeLabelSelectClauseFactory = new BisInstanceLabelSelectClauseFactory({ metadataProvider: props.metadataProvider });
  }

  public async postProcessNode(node: ProcessedHierarchyNode): Promise<ProcessedHierarchyNode> {
    if (HierarchyNode.isClassGroupingNode(node)) {
      // `imageId` is assigned to instance nodes at query time, but grouping ones need to
      // be handled during post-processing
      return { ...node, extendedData: { ...node.extendedData, imageId: "icon-ec-class" } };
    }
    return node;
  }

  public async defineHierarchyLevel(props: DefineHierarchyLevelProps) {
    return this._impl.defineHierarchyLevel(props);
  }

  private async createRootHierarchyLevelDefinition(props: DefineRootHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const instanceFilterClauses = await this._selectQueryFactory.createFilterClauses(props.instanceFilter, { fullName: "BisCore.Subject", alias: "this" });
    return [
      {
        fullClassName: "BisCore.Subject",
        query: {
          ecsql: `
            SELECT
              ${await this._selectQueryFactory.createSelectClause({
                ecClassId: { selector: ECSqlSnippets.createRawPropertyValueSelector("this", "ECClassId") },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: {
                  selector: await this._nodeLabelSelectClauseFactory.createSelectClause({
                    classAlias: "this",
                    className: "BisCore.Subject",
                  }),
                },
                extendedData: {
                  imageId: "icon-imodel-hollow-2",
                },
                autoExpand: true,
                supportsFiltering: true,
              })}
            FROM ${instanceFilterClauses.from} this
            ${instanceFilterClauses.joins}
            WHERE
              this.Parent IS NULL
              ${instanceFilterClauses.where ? `AND ${instanceFilterClauses.where}` : ""}
          `,
        },
      },
    ];
  }

  private async createSubjectChildrenQuery({
    parentNodeInstanceIds: subjectIds,
    instanceFilter,
  }: DefineInstanceNodeChildHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const selectColumnNames = Object.values(NodeSelectClauseColumnNames).join(", ");
    const subjectFilterClauses = await this._selectQueryFactory.createFilterClauses(instanceFilter, { fullName: "BisCore.Subject", alias: "this" });
    const modelFilterClauses = await this._selectQueryFactory.createFilterClauses(instanceFilter, { fullName: "BisCore.GeometricModel3d", alias: "this" });
    const ctes = [
      `
        subjects(${selectColumnNames}, ParentId) AS (
          SELECT
            ${await this._selectQueryFactory.createSelectClause({
              ecClassId: { selector: "this.ECClassId" },
              ecInstanceId: { selector: "this.ECInstanceId" },
              nodeLabel: {
                selector: await this._nodeLabelSelectClauseFactory.createSelectClause({
                  classAlias: "this",
                  className: "BisCore.Subject",
                }),
              },
              hideNodeInHierarchy: {
                selector: `
                  CASE
                    WHEN (
                      json_extract(this.JsonProperties, '$.Subject.Job.Bridge') IS NOT NULL
                      OR json_extract(this.JsonProperties, '$.Subject.Model.Type') = 'Hierarchy'
                    ) THEN 1
                    ELSE 0
                  END
                `,
              },
              hideIfNoChildren: true,
              grouping: { byLabel: { action: "merge", groupId: "subject" } },
              extendedData: {
                imageId: "icon-folder",
              },
              supportsFiltering: true,
            })},
            this.Parent.Id ParentId
          FROM
            BisCore.Subject this
        )
      `,
      `
        child_subjects(${selectColumnNames}, ParentId, RootId) AS (
          SELECT *, s.ParentId RootId FROM subjects s
          UNION ALL
          SELECT s.*, p.RootId
          FROM child_subjects p
          JOIN subjects s ON s.ParentId = p.ECInstanceId
          WHERE p.${NodeSelectClauseColumnNames.HideNodeInHierarchy} = 1
        )
      `,
    ];
    return [
      {
        fullClassName: "BisCore.Subject",
        query: {
          ctes,
          ecsql: `
            SELECT
              ${Object.values(NodeSelectClauseColumnNames)
                .map((name) => `cs.${name} AS ${name}`)
                .join(", ")},
              ParentId
            FROM child_subjects cs
            JOIN ${subjectFilterClauses.from} this ON this.ECInstanceId = cs.ECInstanceId
            ${subjectFilterClauses.joins}
            WHERE
              cs.RootId IN (${subjectIds.map(() => "?").join(",")})
              AND NOT cs.${NodeSelectClauseColumnNames.HideNodeInHierarchy}
              ${subjectFilterClauses.where ? `AND ${subjectFilterClauses.where}` : ""}
          `,
          bindings: [...subjectIds.map((id): ECSqlBinding => ({ type: "id", value: id }))],
        },
      },
      {
        fullClassName: "BisCore.GeometricModel3d",
        query: {
          ctes,
          ecsql: `
            SELECT childModel.ECInstanceId AS ECInstanceId, childModel.*
            FROM (
              SELECT
                ${await this._selectQueryFactory.createSelectClause({
                  ecClassId: { selector: "model.ECClassId" },
                  ecInstanceId: { selector: "model.ECInstanceId" },
                  nodeLabel: {
                    selector: await this._nodeLabelSelectClauseFactory.createSelectClause({
                      classAlias: "partition",
                      className: "BisCore.InformationPartitionElement",
                    }),
                  },
                  hideNodeInHierarchy: {
                    selector: `
                      CASE
                        WHEN (
                          json_extract([partition].JsonProperties, '$.PhysicalPartition.Model.Content') IS NOT NULL
                          OR json_extract([partition].JsonProperties, '$.GraphicalPartition3d.Model.Content') IS NOT NULL
                        ) THEN 1
                        ELSE 0
                      END
                    `,
                  },
                  hasChildren: true,
                  extendedData: {
                    imageId: "icon-model",
                  },
                  supportsFiltering: true,
                })}
              FROM BisCore.GeometricModel3d model
              JOIN bis.InformationPartitionElement [partition] ON [partition].ECInstanceId = model.ModeledElement.Id
              JOIN bis.Subject [subject] ON [subject].ECInstanceId = [partition].Parent.Id OR json_extract([subject].JsonProperties,'$.Subject.Model.TargetPartition') = printf('0x%x', [partition].ECInstanceId)
              WHERE
                NOT model.IsPrivate
                AND EXISTS (
                  SELECT 1
                  FROM bis.ModelContainsElements a
                  JOIN bis.GeometricElement3d b ON b.ECClassId = a.TargetECClassId AND b.ECInstanceId = a.TargetECInstanceId
                  WHERE a.SourceECInstanceId = +model.ECInstanceId
                )
                AND (
                  [subject].ECInstanceId IN (${subjectIds.map(() => "?").join(",")})
                  OR [subject].ECInstanceId IN (
                    SELECT s.ECInstanceId
                    FROM child_subjects s
                    WHERE s.RootId IN (${subjectIds.map(() => "?").join(",")}) AND s.${NodeSelectClauseColumnNames.HideNodeInHierarchy}
                  )
                )
            ) childModel
            JOIN ${modelFilterClauses.from} this ON this.ECInstanceId = childModel.ECInstanceId
            ${modelFilterClauses.joins}
            ${modelFilterClauses.where ? `AND (childModel.${NodeSelectClauseColumnNames.HideNodeInHierarchy} OR ${modelFilterClauses.where})` : ""}
          `,
          bindings: [
            ...subjectIds.map((id): ECSqlBinding => ({ type: "id", value: id })),
            ...subjectIds.map((id): ECSqlBinding => ({ type: "id", value: id })),
          ],
        },
      },
    ];
  }

  private async createISubModeledElementChildrenQuery({
    parentNodeInstanceIds: elementIds,
  }: DefineInstanceNodeChildHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    // note: we do not apply hierarchy level filtering on this hierarchy level, because it's always
    // hidden - the filter will get applied on the child hierarchy levels
    return [
      {
        fullClassName: "BisCore.GeometricModel3d",
        query: {
          ecsql: `
            SELECT
              ${await this._selectQueryFactory.createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: "", // doesn't matter - the node is always hidden
                hideNodeInHierarchy: true,
              })}
            FROM BisCore.GeometricModel3d this
            WHERE
              this.ModeledElement.Id IN (${elementIds.map(() => "?").join(",")})
              AND NOT this.IsPrivate
              AND this.ECInstanceId IN (SELECT Model.Id FROM bis.GeometricElement3d)
          `,
          bindings: [...elementIds.map((id): ECSqlBinding => ({ type: "id", value: id }))],
        },
      },
    ];
  }

  private async createGeometricModel3dChildrenQuery({
    parentNodeInstanceIds: modelIds,
    instanceFilter,
  }: DefineInstanceNodeChildHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    function createModelIdsSelector(): string {
      // Note: `json_array` function only accepts up to 128 arguments and we may have more `modelIds` than that. As a workaround,
      // we're creating an array of arrays
      const slices = new Array<Id64String[]>();
      for (let sliceStartIndex = 0; sliceStartIndex < modelIds.length; sliceStartIndex += 128) {
        let sliceEndIndex: number | undefined = sliceStartIndex + 128;
        if (sliceEndIndex > modelIds.length) {
          sliceEndIndex = undefined;
        }
        slices.push(modelIds.slice(sliceStartIndex, sliceEndIndex));
      }
      return `json_array(${slices.map((sliceIds) => `json_array(${sliceIds.map((id) => `'${id}'`).join(",")})`).join(",")})`;
    }
    const instanceFilterClauses = await this._selectQueryFactory.createFilterClauses(instanceFilter, { fullName: "BisCore.SpatialCategory", alias: "this" });
    return [
      {
        fullClassName: "BisCore.SpatialCategory",
        query: {
          ecsql: `
            SELECT
              ${await this._selectQueryFactory.createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: {
                  selector: await this._nodeLabelSelectClauseFactory.createSelectClause({
                    classAlias: "this",
                    className: "BisCore.SpatialCategory",
                  }),
                },
                grouping: { byLabel: { action: "merge", groupId: "category" } },
                hasChildren: true,
                extendedData: {
                  imageId: "icon-layers",
                  modelIds: { selector: createModelIdsSelector() },
                },
                supportsFiltering: true,
              })}
            FROM ${instanceFilterClauses.from} this
            ${instanceFilterClauses.joins}
            WHERE
              EXISTS (
                SELECT 1
                FROM bis.GeometricElement3d element
                WHERE
                  element.Model.Id IN (${modelIds.map(() => "?").join(",")})
                  AND element.Category.Id = +this.ECInstanceId
                  AND element.Parent IS NULL
              )
              ${instanceFilterClauses.where ? `AND ${instanceFilterClauses.where}` : ""}
          `,
          bindings: modelIds.map((id) => ({ type: "id", value: id })),
        },
      },
    ];
  }

  private async createSpatialCategoryChildrenQuery({
    parentNodeInstanceIds: categoryIds,
    parentNode,
    instanceFilter,
  }: DefineInstanceNodeChildHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const modelIds: Id64String[] =
      parentNode.extendedData && parentNode.extendedData.hasOwnProperty("modelIds") && Array.isArray(parentNode.extendedData.modelIds)
        ? parentNode.extendedData.modelIds.reduce(
            (arr, ids: Id64String | Id64String[]) => [...arr, ...(Array.isArray(ids) ? ids : [ids])],
            new Array<Id64String>(),
          )
        : [];
    if (modelIds.length === 0) {
      throw new Error(`Invalid category node "${parentNode.label}" - missing model information.`);
    }
    const instanceFilterClauses = await this._selectQueryFactory.createFilterClauses(instanceFilter, { fullName: "BisCore.GeometricElement3d", alias: "this" });
    return [
      {
        fullClassName: "BisCore.GeometricElement3d",
        query: {
          ecsql: `
            SELECT
              ${await this._selectQueryFactory.createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: {
                  selector: await this._nodeLabelSelectClauseFactory.createSelectClause({
                    classAlias: "this",
                    className: "BisCore.GeometricElement3d",
                  }),
                },
                grouping: {
                  byClass: true,
                },
                hasChildren: {
                  selector: `
                    IFNULL((
                      SELECT 1
                      FROM (
                        SELECT Parent.Id ParentId FROM bis.GeometricElement3d
                        UNION ALL
                        SELECT ModeledElement.Id ParentId FROM bis.GeometricModel3d
                      )
                      WHERE ParentId = this.ECInstanceId
                      LIMIT 1
                    ), 0)
                  `,
                },
                extendedData: {
                  imageId: "icon-item",
                },
                supportsFiltering: true,
              })}
            FROM ${instanceFilterClauses.from} this
            ${instanceFilterClauses.joins}
            WHERE
              this.Category.Id IN (${categoryIds.map(() => "?").join(",")})
              AND this.Model.Id IN (${modelIds.map(() => "?").join(",")})
              AND this.Parent IS NULL
              ${instanceFilterClauses.where ? `AND ${instanceFilterClauses.where}` : ""}
          `,
          bindings: [...categoryIds.map((id) => ({ type: "id", value: id })), ...modelIds.map((id) => ({ type: "id", value: id }))] as ECSqlBinding[],
        },
      },
    ];
  }

  private async createGeometricElement3dChildrenQuery({
    parentNodeInstanceIds: elementIds,
    instanceFilter,
  }: DefineInstanceNodeChildHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const instanceFilterClauses = await this._selectQueryFactory.createFilterClauses(instanceFilter, { fullName: "BisCore.GeometricElement3d", alias: "this" });
    return [
      {
        fullClassName: "BisCore.GeometricElement3d",
        query: {
          ecsql: `
            SELECT
              ${await this._selectQueryFactory.createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: {
                  selector: await this._nodeLabelSelectClauseFactory.createSelectClause({
                    classAlias: "this",
                    className: "BisCore.GeometricElement3d",
                  }),
                },
                grouping: {
                  byClass: true,
                },
                hasChildren: {
                  selector: `
                    IFNULL((
                      SELECT 1
                      FROM (
                        SELECT Parent.Id ParentId FROM bis.GeometricElement3d
                        UNION ALL
                        SELECT ModeledElement.Id ParentId FROM bis.GeometricModel3d
                      )
                      WHERE ParentId = this.ECInstanceId
                      LIMIT 1
                    ), 0)
                  `,
                },
                extendedData: {
                  imageId: "icon-item",
                },
                supportsFiltering: true,
              })}
            FROM ${instanceFilterClauses.from} this
            ${instanceFilterClauses.joins}
            WHERE
              this.Parent.Id IN (${elementIds.map(() => "?").join(",")})
              ${instanceFilterClauses.where ? `AND ${instanceFilterClauses.where}` : ""}
          `,
          bindings: elementIds.map((id) => ({ type: "id", value: id })),
        },
      },
    ];
  }

  public static async createInstanceKeyPaths(props: ModelsTreeInstanceKeyPathsProps) {
    if (ModelsTreeInstanceKeyPathsProps.isLabelProps(props)) {
      const labelsFactory = new BisInstanceLabelSelectClauseFactory({ metadataProvider: props.metadataProvider });
      return createInstanceKeyPathsFromInstanceLabel({ ...props, labelsFactory });
    }
    return createInstanceKeyPathsFromInstanceKeys(props);
  }
}

function createECInstanceKeySelectClause(
  props: (({ classIdSelector: string } | { classIdAlias: string }) & ({ instanceHexIdSelector: string } | { instanceIdAlias: string })) | { alias: string },
) {
  const classIdSelector = (props as any).classIdSelector ?? `[${(props as any).classIdAlias ?? (props as any).alias}].[ECClassId]`;
  const instanceHexIdSelector =
    (props as any).instanceHexIdSelector ?? `printf('0x%x', [${(props as any).instanceIdAlias ?? (props as any).alias}].[ECInstanceId])`;
  return `json_object('className', replace(ec_classname(${classIdSelector}), ':', '.'), 'id', ${instanceHexIdSelector})`;
}

async function createInstanceKeyPathsCTEs(labelsFactory: IInstanceLabelSelectClauseFactory) {
  return [
    `GeometricElementsHierarchy(TargetId, TargetLabel, ECClassId, ECInstanceId, ParentId, ModelId, CategoryId, Path) AS (
      SELECT
        e.ECInstanceId,
        ${await labelsFactory.createSelectClause({
          classAlias: "e",
          className: "BisCore.GeometricElement3d",
          // eslint-disable-next-line @typescript-eslint/unbound-method
          selectorsConcatenator: ECSqlSnippets.createConcatenatedValueStringSelector,
        })},
        e.ECClassId,
        e.ECInstanceId,
        e.Parent.Id,
        e.Model.Id,
        e.Category.Id,
        json_array(${createECInstanceKeySelectClause({ alias: "e" })})
      FROM bis.GeometricElement3d e
      UNION ALL
      SELECT
        c.TargetId,
        c.TargetLabel,
        p.ECClassId,
        p.ECInstanceId,
        p.Parent.Id,
        p.Model.Id,
        p.Category.Id,
        json_insert(c.Path, '$[#]', ${createECInstanceKeySelectClause({ alias: "p" })})
      FROM GeometricElementsHierarchy c
      JOIN bis.GeometricElement3d p on p.ECInstanceId = c.ParentId
    )`,
    `GeometricElements(TargetId, TargetLabel, ECClassId, ECInstanceId, ModelId, CategoryId, Path) AS (
      SELECT e.TargetId, e.TargetLabel, e.ECClassId, e.ECInstanceId, e.ModelId, e.CategoryId, e.Path
      FROM GeometricElementsHierarchy e
      WHERE e.ParentId IS NULL
    )`,
    `Categories(ECClassId, ECInstanceId, HexId, Label) AS (
      SELECT
        c.ECClassId,
        c.ECInstanceId,
        printf('0x%x', c.ECInstanceId) HexId,
        ${await labelsFactory.createSelectClause({
          classAlias: "c",
          className: "BisCore.SpatialCategory",
          // eslint-disable-next-line @typescript-eslint/unbound-method
          selectorsConcatenator: ECSqlSnippets.createConcatenatedValueStringSelector,
        })}
      FROM bis.SpatialCategory c
    )`,
    `Models(ECClassId, ECInstanceId, HexId, ModeledElementParentId, Label) AS (
      SELECT
        m.ECClassId,
        m.ECInstanceId,
        printf('0x%x', m.ECInstanceId) HexId,
        p.Parent.Id,
        ${await labelsFactory.createSelectClause({
          classAlias: "p",
          className: "BisCore.Element",
          // eslint-disable-next-line @typescript-eslint/unbound-method
          selectorsConcatenator: ECSqlSnippets.createConcatenatedValueStringSelector,
        })}
      FROM bis.GeometricModel3d m
      JOIN bis.Element p on p.ECInstanceId = m.ModeledElement.Id
    )`,
    `ModelsCategoriesElementsHierarchy(TargetElementId, TargetElementLabel, ModelId, ModelHexId, ModelParentId, Path) AS (
      SELECT
        e.TargetId,
        e.TargetLabel,
        m.ECInstanceId,
        m.HexId,
        m.ModeledElementParentId,
        json_insert(
          e.Path,
          '$[#]', ${createECInstanceKeySelectClause({
            classIdAlias: "c",
            instanceHexIdSelector: "c.HexId",
          })},
          '$[#]', ${createECInstanceKeySelectClause({
            classIdAlias: "m",
            instanceHexIdSelector: "m.HexId",
          })}
        )
      FROM GeometricElements e
      JOIN Categories c ON c.ECInstanceId = e.CategoryId
      JOIN Models m ON m.ECInstanceId = e.ModelId
      UNION ALL
      SELECT
        mce.TargetElementId,
        mce.TargetElementLabel,
        m.ECInstanceId,
        m.HexId,
        m.ModeledElementParentId,
        json_insert(
          mce.Path,
          '$[#]', json(e.Path),
          '$[#]', ${createECInstanceKeySelectClause({
            classIdAlias: "c",
            instanceHexIdSelector: "c.HexId",
          })},
          '$[#]', ${createECInstanceKeySelectClause({
            classIdAlias: "m",
            instanceHexIdSelector: "m.HexId",
          })}
        )
      FROM ModelsCategoriesElementsHierarchy mce
      JOIN GeometricElements e on e.TargetId = mce.ModelId
      JOIN Categories c ON c.ECInstanceId = e.CategoryId
      JOIN Models m ON m.ECInstanceId = e.ModelId
    )`,
    `SubjectsHierarchy(TargetId, TargetLabel, ECClassId, ECInstanceId, ParentId, JsonProperties, Path) AS (
      SELECT
        s.ECInstanceId,
        ${await labelsFactory.createSelectClause({
          classAlias: "s",
          className: "BisCore.Subject",
          // eslint-disable-next-line @typescript-eslint/unbound-method
          selectorsConcatenator: ECSqlSnippets.createConcatenatedValueStringSelector,
        })},
        s.ECClassId,
        s.ECInstanceId,
        s.Parent.Id,
        s.JsonProperties,
        CASE
          WHEN (
            json_extract(s.JsonProperties, '$.Subject.Job.Bridge') IS NOT NULL
            OR json_extract(s.JsonProperties, '$.Subject.Model.Type') = 'Hierarchy'
          )
          THEN
            json_array()
          ELSE
            json_array(${createECInstanceKeySelectClause({ alias: "s" })})
        END
      FROM bis.Subject s
      UNION ALL
      SELECT
        c.TargetId,
        c.TargetLabel,
        p.ECClassId,
        p.ECInstanceId,
        p.Parent.Id,
        p.JsonProperties,
        CASE
          WHEN (
            json_extract(p.JsonProperties, '$.Subject.Job.Bridge') IS NOT NULL
            OR json_extract(p.JsonProperties, '$.Subject.Model.Type') = 'Hierarchy'
          )
          THEN
            c.Path
          ELSE
            json_insert(c.Path, '$[#]', ${createECInstanceKeySelectClause({ alias: "p" })})
        END
      FROM SubjectsHierarchy c
      JOIN bis.Element p on p.ECInstanceId = c.ParentId
    )`,
    `Subjects(TargetId, TargetLabel, ECClassId, ECInstanceId, JsonProperties, Path) AS (
      SELECT s.TargetId, s.TargetLabel, s.ECClassId, s.ECInstanceId, s.JsonProperties, s.Path
      FROM SubjectsHierarchy s
      WHERE s.ParentId IS NULL
    )`,
  ];
}

async function createInstanceKeyPathsFromInstanceKeys(props: ModelsTreeInstanceKeyPathsFromInstanceKeysProps): Promise<HierarchyNodeIdentifiersPath[]> {
  const ids = {
    models: new Array<Id64String>(),
    categories: new Array<Id64String>(),
    subjects: new Array<Id64String>(),
    elements: new Array<Id64String>(),
  };
  const bisSchema = await props.metadataProvider.getSchema("BisCore");
  if (!bisSchema) {
    throw new Error("Failed to load `BisCore` schema");
  }
  const subjectClass = await getSchemaClass(bisSchema, "Subject");
  const modelClass = await getSchemaClass(bisSchema, "Model");
  const categoryClass = await getSchemaClass(bisSchema, "SpatialCategory");
  await Promise.all(
    props.keys.map(async (key) => {
      const keyClass = await getClass(props.metadataProvider, key.className);
      if (await keyClass.is(subjectClass)) {
        ids.subjects.push(key.id);
      } else if (await keyClass.is(modelClass)) {
        ids.models.push(key.id);
      } else if (await keyClass.is(categoryClass)) {
        ids.categories.push(key.id);
      } else {
        ids.elements.push(key.id);
      }
    }),
  );

  const queries = [];
  if (ids.elements.length > 0) {
    queries.push(`
      SELECT json_insert(mce.Path, '$[#]', json(s.Path))
      FROM ModelsCategoriesElementsHierarchy mce
      JOIN Subjects s ON s.TargetId = mce.ModelParentId OR json_extract(s.JsonProperties,'$.Subject.Model.TargetPartition') = mce.ModelHexId
      WHERE mce.TargetElementId IN (${ids.elements.map(() => "?").join(",")})
    `);
  }
  if (ids.categories.length > 0) {
    queries.push(`
      SELECT
        json_array(
          ${createECInstanceKeySelectClause({ classIdAlias: "c", instanceHexIdSelector: "c.HexId" })},
          ${createECInstanceKeySelectClause({ classIdAlias: "m", instanceHexIdSelector: "m.HexId" })},
          json(s.Path)
        )
      FROM Categories c,
           Models m
      JOIN Subjects s ON s.TargetId = m.ModeledElementParentId OR json_extract(s.JsonProperties,'$.Subject.Model.TargetPartition') = m.HexId
      WHERE
        m.ECInstanceId IN (SELECT e.Model.Id FROM bis.GeometricElement3d e WHERE e.Category.Id = c.ECInstanceId)
        AND c.ECInstanceId IN (${ids.categories.map(() => "?").join(",")})
    `);
  }
  if (ids.models.length > 0) {
    queries.push(`
      SELECT
        json_array(
          ${createECInstanceKeySelectClause({ classIdAlias: "m", instanceHexIdSelector: "m.HexId" })},
          json(s.Path)
        )
      FROM Models m
      JOIN Subjects s ON s.TargetId = m.ModeledElementParentId OR json_extract(s.JsonProperties,'$.Subject.Model.TargetPartition') = m.HexId
      WHERE m.ECInstanceId IN (${ids.models.map(() => "?").join(",")})
    `);
  }
  if (ids.subjects.length > 0) {
    queries.push(`
      SELECT s.Path
      FROM Subjects s
      WHERE s.TargetId IN (${ids.subjects.map(() => "?").join(",")})
    `);
  }
  if (queries.length === 0) {
    return [];
  }

  const bindings: ECSqlBinding[] = [];
  ids.elements.forEach((id) => bindings.push({ type: "id", value: id }));
  ids.categories.forEach((id) => bindings.push({ type: "id", value: id }));
  ids.models.forEach((id) => bindings.push({ type: "id", value: id }));
  ids.subjects.forEach((id) => bindings.push({ type: "id", value: id }));

  const reader = props.queryExecutor.createQueryReader(
    {
      ctes: await createInstanceKeyPathsCTEs({ createSelectClause: async () => "''" }),
      ecsql: queries.join(" UNION ALL "),
      bindings,
    },
    { rowFormat: "Indexes" },
  );
  const paths = new Array<HierarchyNodeIdentifiersPath>();
  for await (const row of reader) {
    paths.push(flatten<InstanceKey>(JSON.parse(row[0])).reverse());
  }
  return paths;
}

async function createInstanceKeyPathsFromInstanceLabel(
  props: ModelsTreeInstanceKeyPathsFromInstanceLabelProps & { labelsFactory: IInstanceLabelSelectClauseFactory },
) {
  const queries = [];
  queries.push(`
    SELECT mce.TargetElementLabel AS Label, json_insert(mce.Path, '$[#]', json(s.Path)) AS Path
    FROM ModelsCategoriesElementsHierarchy mce
    JOIN Subjects s ON s.TargetId = mce.ModelParentId OR json_extract(s.JsonProperties,'$.Subject.Model.TargetPartition') = mce.ModelHexId
  `);
  queries.push(`
    SELECT
      c.Label AS Label,
      json_array(
        ${createECInstanceKeySelectClause({ classIdAlias: "c", instanceHexIdSelector: "c.HexId" })},
        ${createECInstanceKeySelectClause({ classIdAlias: "m", instanceHexIdSelector: "m.HexId" })},
        json(s.Path)
      ) AS Path
    FROM Categories c,
         Models m
    JOIN Subjects s ON s.TargetId = m.ModeledElementParentId OR json_extract(s.JsonProperties,'$.Subject.Model.TargetPartition') = m.HexId
    WHERE
      m.ECInstanceId IN (SELECT e.Model.Id FROM bis.GeometricElement3d e WHERE e.Category.Id = c.ECInstanceId)
  `);
  queries.push(`
    SELECT
      m.Label AS Label,
      json_array(
        ${createECInstanceKeySelectClause({ classIdAlias: "m", instanceHexIdSelector: "m.HexId" })},
        json(s.Path)
      ) AS Path
    FROM Models m
    JOIN Subjects s ON s.TargetId = m.ModeledElementParentId OR json_extract(s.JsonProperties,'$.Subject.Model.TargetPartition') = m.HexId
  `);
  queries.push(`
    SELECT s.TargetLabel AS Label, s.Path AS Path
    FROM Subjects s
  `);

  const reader = props.queryExecutor.createQueryReader(
    {
      ctes: await createInstanceKeyPathsCTEs(props.labelsFactory),
      ecsql: `
        SELECT DISTINCT Path
        FROM (
          ${queries.join(" UNION ALL ")}
        )
        WHERE Label LIKE '%' || ? || '%'
      `,
      bindings: [{ type: "string", value: props.label }],
    },
    { rowFormat: "Indexes" },
  );
  const paths = new Array<HierarchyNodeIdentifiersPath>();
  for await (const row of reader) {
    paths.push(flatten<InstanceKey>(JSON.parse(row[0])).reverse());
  }
  return paths;
}

type ArrayOrValue<T> = T | Array<ArrayOrValue<T>>;
function flatten<T>(source: Array<ArrayOrValue<T>>): T[] {
  return source.reduce<T[]>((flat, item): T[] => {
    return [...flat, ...(Array.isArray(item) ? flatten(item) : [item])];
  }, new Array<T>());
}

async function getClass(metadata: IMetadataProvider, fullClassName: string) {
  const { schemaName, className } = parseFullClassName(fullClassName);
  const schema = await metadata.getSchema(schemaName);
  if (!schema) {
    throw new Error(`Schema "${schemaName}" not found`);
  }
  return getSchemaClass(schema, className);
}

async function getSchemaClass(schema: ECSchema, className: string) {
  const ecClass = await schema.getClass(className);
  if (!ecClass) {
    throw new Error(`Class "${className}" not found in schema "${schema.name}"`);
  }
  return ecClass;
}
