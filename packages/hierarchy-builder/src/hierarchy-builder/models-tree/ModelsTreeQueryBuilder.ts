/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";
import { ECClass, SchemaContext } from "@itwin/ecschema-metadata";
import { ECSqlBinding } from "../ECSqlBinding";
import { getClass } from "../internal/Common";
import { TreeNode } from "../TreeNode";
import { ITreeQueryBuilder, QueryDef } from "../TreeQueryBuilder";

/** @beta */
export interface ModelsTreeQueryBuilderProps {
  schemas: SchemaContext;
}

/**
 * This class is responsible for building the Models tree hierarchy - it's only part of this package
 * for testing reasons.
 * @beta
 */
export class ModelsTreeQueryBuilder implements ITreeQueryBuilder {
  private _schemas: SchemaContext;

  public constructor(props: ModelsTreeQueryBuilderProps) {
    this._schemas = props.schemas;
  }

  /**
   * Create ECSQL queries for selecting nodes from an iModel.
   * @param parentNode Parent node to create children queries for.
   */
  public async createQueries(parentNode: TreeNode | undefined): Promise<QueryDef[]> {
    if (!parentNode) {
      return this.createRootNodesQuery();
    }

    if (parentNode.key.type === "instances") {
      const instanceIdsByClass = new Map<string, Id64String[]>();
      parentNode.key.instanceKeys.forEach((key) => {
        let instanceIds = instanceIdsByClass.get(key.className);
        if (!instanceIds) {
          instanceIds = [];
          instanceIdsByClass.set(key.className, instanceIds);
        }
        instanceIds.push(key.id);
      });

      const queries: QueryDef[] = [];
      await Promise.all(
        [...instanceIdsByClass.entries()].map(async ([fullClassName, instanceIds]) => {
          const nodeClass = await getClass(this._schemas, fullClassName);
          queries.push(...(await this.createChildNodesQuery(nodeClass, instanceIds, parentNode)));
        }),
      );
      return queries;
    }

    return [];
  }

  private createRootNodesQuery() {
    return [
      {
        fullClassName: "BisCore.Subject",
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            ECInstanceId,
            ${createNonGeometricElementLabelSelectClause("this")} AS DisplayLabel,
            json_object(
              'imageId', 'icon-imodel-hollow-2'
            ) AS ExtendedData,
            1 as AutoExpand
          FROM bis.Subject this
          WHERE
            this.Parent IS NULL
        `,
      },
    ];
  }

  private async createChildNodesQuery(parentNodeClass: ECClass, parentInstanceIds: Id64String[], parentNode: TreeNode): Promise<QueryDef[]> {
    if (await parentNodeClass.is("Subject", "BisCore")) {
      return this.createSubjectChildrenQuery(parentInstanceIds, parentNode);
    }
    if (await parentNodeClass.is("ISubModeledElement", "BisCore")) {
      return this.createISubModeledElementChildrenQuery(parentInstanceIds, parentNode);
    }
    if (await parentNodeClass.is("GeometricModel3d", "BisCore")) {
      return this.createGeometricModel3dChildrenQuery(parentInstanceIds, parentNode);
    }
    if (await parentNodeClass.is("SpatialCategory", "BisCore")) {
      return this.createSpatialCategoryChildrenQuery(parentInstanceIds, parentNode);
    }
    if (await parentNodeClass.is("GeometricElement3d", "BisCore")) {
      return this.createGeometricElement3dChildrenQuery(parentInstanceIds, parentNode);
    }
    return [];
  }

  private async createSubjectChildrenQuery(subjectIds: Id64String[], _parentNode: TreeNode): Promise<QueryDef[]> {
    const ctes = [
      `
        subjects(FullClassName, ECInstanceId, DisplayLabel, HideInHierarchy, HideIfNoChildren, HasChildren, MergeByLabelId, ExtendedData, ParentId) AS (
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            ${createNonGeometricElementLabelSelectClause("this")} AS DisplayLabel,
            CAST(CASE
              WHEN (
                json_extract(this.JsonProperties, '$.Subject.Job.Bridge') IS NOT NULL
                OR json_extract(this.JsonProperties, '$.Subject.Model.Type') = 'Hierarchy'
              ) THEN 1
              ELSE 0
            END AS BOOLEAN) AS HideInHierarchy,
            CAST(1 AS BOOLEAN) AS HideIfNoChildren,
            CAST(NULL AS BOOLEAN) AS HasChildren,
            'subject' AS MergeByLabelId,
            json_object('imageId', 'icon-folder') AS ExtendedData,
            this.Parent.Id ParentId
          FROM
            bis.Subject this
        )
      `,
      `
        child_subjects(FullClassName, ECInstanceId, DisplayLabel, HideInHierarchy, HideIfNoChildren, HasChildren, MergeByLabelId, ExtendedData, ParentId, RootId) AS (
          SELECT *, s.ParentId RootId FROM subjects s
          UNION ALL
          SELECT s.*, p.RootId
          FROM child_subjects p
          JOIN subjects s ON s.ParentId = p.ECInstanceId
          WHERE p.HideInHierarchy = 1
        )
      `,
    ];
    return [
      {
        fullClassName: "BisCore.Subject",
        ctes,
        ecsql: `
          SELECT
            FullClassName, ECInstanceId, DisplayLabel, HideInHierarchy, HideIfNoChildren, HasChildren, MergeByLabelId, ExtendedData, ParentId
          FROM
            child_subjects this
          WHERE
            this.RootId IN (${subjectIds.map(() => "?").join(",")})
            AND NOT this.HideInHierarchy
        `,
        bindings: [...subjectIds.map((id): ECSqlBinding => ({ type: "id", value: id }))],
      },
      {
        fullClassName: "BisCore.GeometricModel3d",
        ctes,
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            ${createNonGeometricElementLabelSelectClause("partition")} AS DisplayLabel,
            CAST(CASE
              WHEN (
                json_extract(partition.JsonProperties, '$.PhysicalPartition.Model.Content') IS NOT NULL
                OR json_extract(partition.JsonProperties, '$.GraphicalPartition3d.Model.Content') IS NOT NULL
              ) THEN 1
              ELSE 0
            END AS BOOLEAN) AS HideInHierarchy,
            CAST(0 AS BOOLEAN) AS HideIfNoChildren,
            CAST(1 AS BOOLEAN) AS HasChildren,
            CAST('' AS TEXT) AS MergeByLabelId,
            json_object('imageId', 'icon-model') AS ExtendedData
          FROM
            bis.GeometricModel3d this
            JOIN bis.InformationPartitionElement partition ON partition.ECInstanceId = this.ModeledElement.Id
            JOIN bis.Subject subject ON subject.ECInstanceId = partition.Parent.Id OR json_extract(subject.JsonProperties,'$.Subject.Model.TargetPartition') = printf('0x%x', partition.ECInstanceId)
          WHERE
            NOT this.IsPrivate
            AND EXISTS (
              SELECT 1
              FROM bis.ModelContainsElements a
              JOIN bis.GeometricElement3d b ON b.ECClassId = a.TargetECClassId AND b.ECInstanceId = a.TargetECInstanceId
              WHERE a.SourceECInstanceId = +this.ECInstanceId
            )
            AND (
              subject.ECInstanceId IN (${subjectIds.map(() => "?").join(",")})
              OR subject.ECInstanceId IN (
                SELECT s.ECInstanceId
                FROM child_subjects s
                WHERE s.RootId IN (${subjectIds.map(() => "?").join(",")}) AND s.HideInHierarchy
              )
            )
        `,
        bindings: [...subjectIds.map((id): ECSqlBinding => ({ type: "id", value: id })), ...subjectIds.map((id): ECSqlBinding => ({ type: "id", value: id }))],
      },
    ];
  }

  private async createISubModeledElementChildrenQuery(elementIds: Id64String[], _parentNode: TreeNode): Promise<QueryDef[]> {
    return [
      {
        fullClassName: "BisCore.GeometricModel3d",
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            '<always hidden>' AS DisplayLabel,
            1 AS HideInHierarchy
          FROM bis.GeometricModel3d this
          WHERE this.ModeledElement.Id IN (${elementIds.map(() => "?").join(",")})
            AND NOT this.IsPrivate
            AND this.ECInstanceId IN (SELECT Model.Id FROM bis.GeometricElement3d)
        `,
        bindings: [...elementIds.map((id): ECSqlBinding => ({ type: "id", value: id }))],
      },
    ];
  }

  private async createGeometricModel3dChildrenQuery(modelIds: Id64String[], _parentNode: TreeNode): Promise<QueryDef[]> {
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
    return [
      {
        fullClassName: "BisCore.SpatialCategory",
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            ${createNonGeometricElementLabelSelectClause("this")} AS DisplayLabel,
            'category' AS MergeByLabelId,
            1 AS HasChildren,
            json_object(
              'imageId', 'icon-layers',
              'modelIds', ${createModelIdsSelector()}
            ) AS ExtendedData
          FROM bis.SpatialCategory this
          WHERE EXISTS (
            SELECT 1
            FROM bis.GeometricElement3d element
            WHERE
              element.Model.Id IN (${modelIds.map(() => "?").join(",")})
              AND element.Category.Id = +this.ECInstanceId
              AND element.Parent IS NULL
          )
        `,
        bindings: modelIds.map((id) => ({ type: "id", value: id })),
      },
    ];
  }

  private async createSpatialCategoryChildrenQuery(categoryIds: Id64String[], parentNode: TreeNode): Promise<QueryDef[]> {
    const modelIds: Id64String[] =
      parentNode.extendedData && parentNode.extendedData.hasOwnProperty("modelIds")
        ? (parentNode.extendedData.modelIds as Array<Array<Id64String>>).reduce((arr, ids) => [...arr, ...ids])
        : [];
    return [
      {
        fullClassName: "BisCore.GeometricElement3d",
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            ${createGeometricElementLabelSelectClause("this")} AS DisplayLabel,
            json_object(
              'imageId', 'icon-item'
            ) AS ExtendedData,
            1 AS GroupByClass,
            IFNULL((
              SELECT 1
              FROM (
                SELECT Parent.Id ParentId FROM bis.GeometricElement3d
                UNION ALL
                SELECT ModeledElement.Id ParentId FROM bis.GeometricModel3d
              )
              WHERE ParentId = this.ECInstanceId
              LIMIT 1
            ), 0) AS HasChildren
          FROM bis.GeometricElement3d this
          WHERE this.Category.Id IN (${categoryIds.map(() => "?").join(",")})
            AND this.Model.Id IN (${modelIds.map(() => "?").join(",")})
            AND this.Parent IS NULL
        `,
        bindings: [...categoryIds.map((id) => ({ type: "id", value: id })), ...modelIds.map((id) => ({ type: "id", value: id }))] as ECSqlBinding[],
      },
    ];
  }

  private async createGeometricElement3dChildrenQuery(elementIds: Id64String[], _parentNode: TreeNode): Promise<QueryDef[]> {
    return [
      {
        fullClassName: "BisCore.GeometricElement3d",
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            ${createGeometricElementLabelSelectClause("this")} AS DisplayLabel,
            json_object(
              'imageId', 'icon-item'
            ) AS ExtendedData,
            1 AS GroupByClass,
            IFNULL((
              SELECT 1
              FROM (
                SELECT Parent.Id ParentId FROM bis.GeometricElement3d
                UNION ALL
                SELECT ModeledElement.Id ParentId FROM bis.GeometricModel3d
              )
              WHERE ParentId = this.ECInstanceId
              LIMIT 1
            ), 0) AS HasChildren
          FROM bis.GeometricElement3d this
          WHERE this.Parent.Id IN (${elementIds.map(() => "?").join(",")})
        `,
        bindings: elementIds.map((id) => ({ type: "id", value: id })),
      },
    ];
  }
}

function createGeometricElementLabelSelectClause(classAlias: string) {
  return `COALESCE(
    [${classAlias}].[CodeValue],
    CASE WHEN [${classAlias}].[UserLabel] IS NOT NULL
      THEN [${classAlias}].[UserLabel] || ' ' || ${createECInstanceIdentifier(classAlias)}
      ELSE NULL
    END,
    (
      SELECT COALESCE([c].[DisplayLabel], [c].[Name]) || ' ' || ${createECInstanceIdentifier(classAlias)}
      FROM [meta].[ECClassDef] AS [c]
      WHERE [c].[ECInstanceId] = [${classAlias}].[ECClassId]
    )
  )`;
}

function createNonGeometricElementLabelSelectClause(classAlias: string) {
  return `COALESCE(
    [${classAlias}].[UserLabel],
    [${classAlias}].[CodeValue],
    (
      SELECT COALESCE([c].[DisplayLabel], [c].[Name]) || ' ' || ${createECInstanceIdentifier(classAlias)}
      FROM [meta].[ECClassDef] AS [c]
      WHERE [c].[ECInstanceId] = [${classAlias}].[ECClassId]
    )
  )`;
}

function createECInstanceIdentifier(classAlias: string) {
  return `'[' || printf('0x%x', [${classAlias}].[ECInstanceId]) || ']'`;
}
