/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64, Id64String } from "@itwin/core-bentley";

/** @beta */
export enum ECInstanceNodeSelectClauseColumnNames {
  FullClassName = "FullClassName",
  ECInstanceId = "ECInstanceId",
  DisplayLabel = "DisplayLabel",
  HasChildren = "HasChildren",
  HideIfNoChildren = "HideIfNoChildren",
  HideNodeInHierarchy = "HideNodeInHierarchy",
  GroupByClass = "GroupByClass",
  MergeByLabelId = "MergeByLabelId",
  ExtendedData = "ExtendedData",
  AutoExpand = "AutoExpand",
}

/** @beta */
export interface ECSqlValueSelector {
  selector: string;
}

/** @beta */
export interface ECInstanceNodeSelectClauseProps {
  ecClassId: Id64String | ECSqlValueSelector;
  ecInstanceId: Id64String | ECSqlValueSelector;
  nodeLabel: string | ECSqlValueSelector;
  extendedData?: {
    [key: string]: Id64String | string | number | boolean | ECSqlValueSelector;
  };
  autoExpand?: boolean | ECSqlValueSelector;
  hasChildren?: boolean | ECSqlValueSelector;
  hideNodeInHierarchy?: boolean | ECSqlValueSelector;
  hideIfNoChildren?: boolean | ECSqlValueSelector;
  groupByClass?: boolean | ECSqlValueSelector;
  mergeByLabelId?: string | ECSqlValueSelector;
}

/** @beta */
export function createECInstanceNodeSelectClause(props: ECInstanceNodeSelectClauseProps): string {
  return `
    ec_ClassName(${createECSqlValueSelector(props.ecClassId)}) AS ${ECInstanceNodeSelectClauseColumnNames.FullClassName},
    ${createECSqlValueSelector(props.ecInstanceId)} AS ${ECInstanceNodeSelectClauseColumnNames.ECInstanceId},
    ${createECSqlValueSelector(props.nodeLabel)} AS ${ECInstanceNodeSelectClauseColumnNames.DisplayLabel},
    CAST(${createECSqlValueSelector(props.hasChildren)} AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HasChildren},
    CAST(${createECSqlValueSelector(props.hideIfNoChildren)} AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HideIfNoChildren},
    CAST(${createECSqlValueSelector(props.hideNodeInHierarchy)} AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HideNodeInHierarchy},
    CAST(${createECSqlValueSelector(props.groupByClass)} AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.GroupByClass},
    CAST(${createECSqlValueSelector(props.mergeByLabelId)} AS TEXT) AS ${ECInstanceNodeSelectClauseColumnNames.MergeByLabelId},
    ${
      props.extendedData
        ? `json_object(${Object.entries(props.extendedData)
            .map(([key, value]) => `'${key}', ${createECSqlValueSelector(value)}`)
            .join(", ")})`
        : "NULL"
    } AS ${ECInstanceNodeSelectClauseColumnNames.ExtendedData},
    CAST(${createECSqlValueSelector(props.autoExpand)} AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.AutoExpand}
  `;
}

/** @beta */
export function createGeometricElementLabelSelectClause(classAlias: string) {
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

/** @beta */
export function createNonGeometricElementLabelSelectClause(classAlias: string) {
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

function createECSqlValueSelector(input: undefined | Id64String | string | number | boolean | ECSqlValueSelector) {
  function isSelector(x: any): x is ECSqlValueSelector {
    return !!x.selector;
  }
  if (input === undefined) {
    return "NULL";
  }
  if (isSelector(input)) {
    return input.selector;
  }
  switch (typeof input) {
    case "boolean":
      return input ? "1" : "0";
    case "number":
      return `${input}`;
    case "string":
      return Id64.isId64(input) ? `${input}` : `'${input}'`;
  }
}
