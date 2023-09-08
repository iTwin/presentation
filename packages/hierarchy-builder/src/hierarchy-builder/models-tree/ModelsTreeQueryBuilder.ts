/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";
import { ECClass, SchemaContext } from "@itwin/ecschema-metadata";
import { ECSqlBinding } from "../ECSql";
import {
  createECInstanceNodeSelectClause,
  createGeometricElementLabelSelectClause,
  createNonGeometricElementLabelSelectClause,
  ECInstanceNodeSelectClauseColumnNames,
} from "../ECSqlSelectClauseHelpers";
import { HierarchyNode } from "../HierarchyNode";
import { HierarchyLevelDefinition, IHierarchyDefinition } from "../IHierarchyDefinition";
import { getClass } from "../internal/Common";

/** @beta */
export interface ModelsTreeQueryBuilderProps {
  schemas: SchemaContext;
}

/**
 * This class is responsible for building the Models tree hierarchy - it's only part of this package
 * for testing reasons.
 * @beta
 */
export class ModelsTreeQueryBuilder implements IHierarchyDefinition {
  private _schemas: SchemaContext;

  public constructor(props: ModelsTreeQueryBuilderProps) {
    this._schemas = props.schemas;
  }

  /**
   * Create ECSQL queries for selecting nodes from an iModel.
   * @param parentNode Parent node to create children queries for.
   */
  public async defineHierarchyLevel(parentNode: HierarchyNode | undefined): Promise<HierarchyLevelDefinition[]> {
    if (!parentNode) {
      return this.createRootNodesQuery();
    }

    if (HierarchyNode.isStandard(parentNode) && parentNode.key.type === "instances") {
      const instanceIdsByClass = new Map<string, Id64String[]>();
      parentNode.key.instanceKeys.forEach((key) => {
        let instanceIds = instanceIdsByClass.get(key.className);
        if (!instanceIds) {
          instanceIds = [];
          instanceIdsByClass.set(key.className, instanceIds);
        }
        instanceIds.push(key.id);
      });

      const queries: HierarchyLevelDefinition[] = [];
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
        query: {
          ecsql: `
            SELECT
              ${createECInstanceNodeSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { selector: createNonGeometricElementLabelSelectClause("this") },
                extendedData: {
                  imageId: "icon-imodel-hollow-2",
                },
                autoExpand: true,
              })}
            FROM bis.Subject this
            WHERE
              this.Parent IS NULL
          `,
        },
      },
    ];
  }

  private async createChildNodesQuery(
    parentNodeClass: ECClass,
    parentInstanceIds: Id64String[],
    parentNode: HierarchyNode,
  ): Promise<HierarchyLevelDefinition[]> {
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

  private async createSubjectChildrenQuery(subjectIds: Id64String[], _parentNode: HierarchyNode): Promise<HierarchyLevelDefinition[]> {
    const selectColumnNames = Object.values(ECInstanceNodeSelectClauseColumnNames).join(", ");
    const ctes = [
      `
        subjects(${selectColumnNames}, ParentId) AS (
          SELECT
            ${createECInstanceNodeSelectClause({
              ecClassId: { selector: "this.ECClassId" },
              ecInstanceId: { selector: "this.ECInstanceId" },
              nodeLabel: { selector: createNonGeometricElementLabelSelectClause("this") },
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
              mergeByLabelId: "subject",
              extendedData: {
                imageId: "icon-folder",
              },
            })},
            this.Parent.Id ParentId
          FROM
            bis.Subject this
        )
      `,
      `
        child_subjects(${selectColumnNames}, ParentId, RootId) AS (
          SELECT *, s.ParentId RootId FROM subjects s
          UNION ALL
          SELECT s.*, p.RootId
          FROM child_subjects p
          JOIN subjects s ON s.ParentId = p.ECInstanceId
          WHERE p.${ECInstanceNodeSelectClauseColumnNames.HideNodeInHierarchy} = 1
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
            ${selectColumnNames}, ParentId
            FROM
              child_subjects this
            WHERE
              this.RootId IN (${subjectIds.map(() => "?").join(",")})
              AND NOT this.${ECInstanceNodeSelectClauseColumnNames.HideNodeInHierarchy}
          `,
          bindings: [...subjectIds.map((id): ECSqlBinding => ({ type: "id", value: id }))],
        },
      },
      {
        fullClassName: "BisCore.GeometricModel3d",
        query: {
          ctes,
          ecsql: `
            SELECT
              ${createECInstanceNodeSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { selector: createNonGeometricElementLabelSelectClause("partition") },
                hideNodeInHierarchy: {
                  selector: `
                    CASE
                      WHEN (
                        json_extract(partition.JsonProperties, '$.PhysicalPartition.Model.Content') IS NOT NULL
                        OR json_extract(partition.JsonProperties, '$.GraphicalPartition3d.Model.Content') IS NOT NULL
                      ) THEN 1
                      ELSE 0
                    END
                  `,
                },
                hasChildren: true,
                extendedData: {
                  imageId: "icon-model",
                },
              })}
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
                  WHERE s.RootId IN (${subjectIds.map(() => "?").join(",")}) AND s.${ECInstanceNodeSelectClauseColumnNames.HideNodeInHierarchy}
                )
              )
          `,
          bindings: [
            ...subjectIds.map((id): ECSqlBinding => ({ type: "id", value: id })),
            ...subjectIds.map((id): ECSqlBinding => ({ type: "id", value: id })),
          ],
        },
      },
    ];
  }

  private async createISubModeledElementChildrenQuery(elementIds: Id64String[], _parentNode: HierarchyNode): Promise<HierarchyLevelDefinition[]> {
    return [
      {
        fullClassName: "BisCore.GeometricModel3d",
        query: {
          ecsql: `
            SELECT
              ${createECInstanceNodeSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: "", // doesn't matter - the node is always hidden
                hideNodeInHierarchy: true,
              })}
            FROM bis.GeometricModel3d this
            WHERE this.ModeledElement.Id IN (${elementIds.map(() => "?").join(",")})
              AND NOT this.IsPrivate
              AND this.ECInstanceId IN (SELECT Model.Id FROM bis.GeometricElement3d)
          `,
          bindings: [...elementIds.map((id): ECSqlBinding => ({ type: "id", value: id }))],
        },
      },
    ];
  }

  private async createGeometricModel3dChildrenQuery(modelIds: Id64String[], _parentNode: HierarchyNode): Promise<HierarchyLevelDefinition[]> {
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
        query: {
          ecsql: `
            SELECT
              ${createECInstanceNodeSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { selector: createNonGeometricElementLabelSelectClause("this") },
                mergeByLabelId: "category",
                hasChildren: true,
                extendedData: {
                  imageId: "icon-layers",
                  modelIds: { selector: createModelIdsSelector() },
                },
              })}
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
      },
    ];
  }

  private async createSpatialCategoryChildrenQuery(categoryIds: Id64String[], parentNode: HierarchyNode): Promise<HierarchyLevelDefinition[]> {
    const modelIds: Id64String[] =
      parentNode.extendedData && parentNode.extendedData.hasOwnProperty("modelIds")
        ? (parentNode.extendedData.modelIds as Array<Array<Id64String>>).reduce((arr, ids) => [...arr, ...ids])
        : [];
    return [
      {
        fullClassName: "BisCore.GeometricElement3d",
        query: {
          ecsql: `
            SELECT
              ${createECInstanceNodeSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { selector: createGeometricElementLabelSelectClause("this") },
                groupByClass: true,
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
              })}
            FROM bis.GeometricElement3d this
            WHERE this.Category.Id IN (${categoryIds.map(() => "?").join(",")})
              AND this.Model.Id IN (${modelIds.map(() => "?").join(",")})
              AND this.Parent IS NULL
          `,
          bindings: [...categoryIds.map((id) => ({ type: "id", value: id })), ...modelIds.map((id) => ({ type: "id", value: id }))] as ECSqlBinding[],
        },
      },
    ];
  }

  private async createGeometricElement3dChildrenQuery(elementIds: Id64String[], _parentNode: HierarchyNode): Promise<HierarchyLevelDefinition[]> {
    return [
      {
        fullClassName: "BisCore.GeometricElement3d",
        query: {
          ecsql: `
            SELECT
              ${createECInstanceNodeSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { selector: createGeometricElementLabelSelectClause("this") },
                groupByClass: true,
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
              })}
            FROM bis.GeometricElement3d this
            WHERE this.Parent.Id IN (${elementIds.map(() => "?").join(",")})
          `,
          bindings: elementIds.map((id) => ({ type: "id", value: id })),
        },
      },
    ];
  }
}
