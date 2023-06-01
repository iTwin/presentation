/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";
import { ECClass, SchemaContext } from "@itwin/ecschema-metadata";
import { InstanceId } from "@itwin/presentation-common";
import { getClass } from "./Common";
import { ECSqlBinding, ITreeQueryBuilder, QueryDef, TreeNode } from "./Interfaces";

export class ModelsTreeQueryBuilder implements ITreeQueryBuilder {
  public constructor(private _schemas: SchemaContext) {}

  public async createQueries(parentNode: TreeNode | undefined): Promise<QueryDef[]> {
    if (!parentNode) {
      return this.createRootNodesQuery();
    }

    if (parentNode.key.type === "instances") {
      const instanceIdsByClass = new Map<string, InstanceId[]>();
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
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            ECInstanceId,
            COALESCE(UserLabel, CodeValue) AS DisplayLabel,
            json_object(
              'imageId', 'icon-imodel-hollow-2'
            ) AS ExtendedData,
            1 as AutoExpand
          FROM bis.Subject this
          WHERE Parent IS NULL
        `,
      },
    ];
  }

  private async createChildNodesQuery(parentNodeClass: ECClass, instanceIds: InstanceId[], parentNode: TreeNode): Promise<QueryDef[]> {
    if (await parentNodeClass.is("Subject", "BisCore")) {
      return this.createSubjectChildrenQuery(instanceIds, parentNode);
    }
    if (await parentNodeClass.is("ISubModeledElement", "BisCore")) {
      return this.createISubModeledElementChildrenQuery(instanceIds, parentNode);
    }
    if (await parentNodeClass.is("GeometricModel3d", "BisCore")) {
      return this.createGeometricModel3dChildrenQuery(instanceIds, parentNode);
    }
    if (await parentNodeClass.is("SpatialCategory", "BisCore")) {
      return this.createSpatialCategoryChildrenQuery(instanceIds, parentNode);
    }
    if (await parentNodeClass.is("GeometricElement3d", "BisCore")) {
      return this.createGeometricElement3dChildrenQuery(instanceIds, parentNode);
    }
    return [];
  }

  private async createSubjectChildrenQuery(subjectIds: InstanceId[], _parentNode: TreeNode): Promise<QueryDef[]> {
    const ctes = [
      `
        subjects(FullClassName, ECInstanceId, DisplayLabel, HideInHierarchy, HideIfNoChildren, HasChildren, MergeByLabelId, ExtendedData, ParentId) AS (
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            COALESCE(this.UserLabel, this.CodeValue, 'Subject') AS DisplayLabel,
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
        ctes,
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            (
              SELECT
                COALESCE(
                  modeledElement.UserLabel,
                  modeledElement.CodeValue,
                  'Geometric Model'
                )
              FROM
                bis.Element modeledElement
              WHERE
                modeledElement.ECInstanceId = this.ModeledElement.Id
            ) AS DisplayLabel,
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

  private async createISubModeledElementChildrenQuery(elementIds: InstanceId[], _parentNode: TreeNode): Promise<QueryDef[]> {
    return [
      {
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            '<always hidden>' AS DisplayLabel,
            1 AS HideInHierarchy
          FROM bis.GeometricModel3d this
          WHERE this.ModeledElement.Id.ECInstanceId IN (${elementIds.map(() => "?").join(",")})
            AND NOT this.IsPrivate
            AND this.ECInstanceId IN (SELECT Model.Id FROM bis.GeometricElement3d)
        `,
        bindings: elementIds.map((id) => ({ type: "id", value: id })),
      },
    ];
  }

  private async createGeometricModel3dChildrenQuery(modelIds: InstanceId[], _parentNode: TreeNode): Promise<QueryDef[]> {
    function createModelIdsSelector(): string {
      // Note: `json_array` function only accepts up to 128 arguments and we may have more `modelIds` than that. As a workaround,
      // we're creating an array of arrays
      const slices = new Array<InstanceId[]>();
      for (let sliceIndex = 0; sliceIndex * 128 < modelIds.length; ++sliceIndex) {
        let endIndex: number | undefined = (sliceIndex + 1) * 128;
        if (endIndex > modelIds.length) {
          endIndex = undefined;
        }
        slices.push(modelIds.slice(sliceIndex * 128, endIndex));
      }
      return `json_array(${slices.map((sliceIds) => `json_array(${sliceIds.map((id) => `'${id}'`).join(",")})`).join(",")})`;
    }
    return [
      {
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            COALESCE(this.UserLabel, this.CodeValue, 'Spatial Category') AS DisplayLabel,
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

  private async createSpatialCategoryChildrenQuery(categoryIds: InstanceId[], parentNode: TreeNode): Promise<QueryDef[]> {
    const modelIds: Id64String[] =
      parentNode.extendedData && parentNode.extendedData.hasOwnProperty("modelIds")
        ? (parentNode.extendedData.modelIds as Array<Array<InstanceId>>).reduce((arr, ids) => [...arr, ...ids])
        : [];
    return [
      {
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            COALESCE(this.UserLabel, this.CodeValue, 'Geometric Element') AS DisplayLabel,
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

  private async createGeometricElement3dChildrenQuery(elementIds: InstanceId[], _parentNode: TreeNode): Promise<QueryDef[]> {
    return [
      {
        ecsql: `
          SELECT
            ec_classname(this.ECClassId) FullClassName,
            this.ECInstanceId,
            COALESCE(this.UserLabel, this.CodeValue, 'Geometric Element') AS DisplayLabel,
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

  private createGeometricElementLabelSelectClause(classAlias: string) {
    return `COALESCE(
      [${classAlias}].[CodeValue],
      CASE
        WHEN [${classAlias}].[UserLabel] IS NOT NULL
          THEN [${classAlias}].[UserLabel] || ' ' || ${this.createECInstanceBase36IdSelector(classAlias)}
        ELSE
          NULL
      END,
      (
        SELECT [c].[DisplayLabel] || ' ' || ${this.createECInstanceBase36IdSelector(classAlias)}
        FROM [meta].[ECClassDef] AS [c]
        WHERE [c].[ECInstanceId] = [${classAlias}].[ECClassId]
      )
    )`;
  }

  private createECInstanceBase36IdSelector(classAlias: string) {
    return `'[' || ']'`;
  }
}
