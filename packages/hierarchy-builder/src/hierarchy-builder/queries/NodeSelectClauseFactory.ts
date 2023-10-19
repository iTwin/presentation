/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { Id64 } from "@itwin/core-bentley";
import { Id64String } from "../values/Values";

/**
 * Column names of the SELECT clause created by [[NodeSelectClauseFactory]]. Order of the names matches the order of columns
 * created by the factory.
 *
 * @beta
 */
export enum NodeSelectClauseColumnNames {
  /** Full class name of the instance the node represents. Type: `string` in format `{schema name}:{class name}`. */
  FullClassName = "FullClassName",
  /** ECInstance ID of the instance the node represents. Type: `Id64String`. */
  ECInstanceId = "ECInstanceId",
  /** Display label. Type: `string`. */
  DisplayLabel = "DisplayLabel",
  /**
   * A flag indicating if the node has children. Type: `boolean`. Values:
   * - `false` - node never has children.
   * - `true` - node always has children.
   * - NULL - unknown, needs to be determined by requesting children for the node.
   */
  HasChildren = "HasChildren",
  /** A flag indicating that a node should be hidden if it has no children. Type: `boolean`. */
  HideIfNoChildren = "HideIfNoChildren",
  /** A flag indicating that a node should be hidden and its children should be displayed instead. Type: `boolean`. */
  HideNodeInHierarchy = "HideNodeInHierarchy",
  // /** A serialized JSON object for providing grouping information. */
  Grouping = "Grouping",
  /**
   * A string indicating a label merge group. Values:
   * - non-empty string puts the node into a label merge group.
   * - NULL or empty string doesn't merge node by label.
   */
  MergeByLabelId = "MergeByLabelId",
  /** A serialized JSON object for associating a node with additional data. */
  ExtendedData = "ExtendedData",
  /** A flag indicating the node should be auto-expanded when it's loaded. */
  AutoExpand = "AutoExpand",
}

/**
 * A data structure for defining an ECSQL value selector.
 * @beta
 */
export interface ECSqlValueSelector {
  selector: string;
}

/**
 * Props for [[NodeSelectClauseFactory.createSelectClause]].
 * @beta
 */
export interface NodeSelectClauseProps {
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
  grouping?: ECSqlSelectClauseGroupingParams;
  mergeByLabelId?: string | ECSqlValueSelector;
}

/** @beta */
type ECSqlSelectClauseGroupingParams = LabelGroupingParams & ClassGroupingParams;

/** @beta */
interface LabelGroupingParams {
  byLabel?: boolean | ECSqlValueSelector | BaseGroupingParams;
}

/** @beta */
interface ClassGroupingParams {
  byClass?: boolean | ECSqlValueSelector | BaseGroupingParams;
  byBaseClasses?: BaseClassGroupingParams;
}

/** @beta */
interface BaseGroupingParams {
  hideIfNoSiblings?: boolean | ECSqlValueSelector;
  hideIfOneGroupedNode?: boolean | ECSqlValueSelector;
}

/** @beta */
interface BaseClassGroupingParams extends BaseGroupingParams {
  baseClassInfo: BaseClassInfo[];
}

/** @beta */
interface BaseClassInfo {
  className: string | ECSqlValueSelector;
  schemaName: string | ECSqlValueSelector;
}

/**
 * A factory for creating a nodes' select clause in a format understood by results reader of the
 * library.
 *
 * @beta
 */
export class NodeSelectClauseFactory {
  public async createSelectClause(props: NodeSelectClauseProps) {
    // note: the columns order should match the order in `NodeSelectClauseColumnNames`
    return `
      ec_ClassName(${createECSqlValueSelector(props.ecClassId)}) AS ${NodeSelectClauseColumnNames.FullClassName},
      ${createECSqlValueSelector(props.ecInstanceId)} AS ${NodeSelectClauseColumnNames.ECInstanceId},
      ${createECSqlValueSelector(props.nodeLabel)} AS ${NodeSelectClauseColumnNames.DisplayLabel},
      CAST(${createECSqlValueSelector(props.hasChildren)} AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
      CAST(${createECSqlValueSelector(props.hideIfNoChildren)} AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
      CAST(${createECSqlValueSelector(props.hideNodeInHierarchy)} AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
      ${
        props.grouping
          ? `json_object(${Object.entries(props.grouping)
              .map(([key, value]) => {
                if (typeof value === "boolean") {
                  return `'${key}', ${createECSqlValueSelector(value)}`;
                } else if (typeof value === "object" && value !== null && value.hasOwnProperty("selector")) {
                  return `'${key}', ${value.selector}`;
                }
                return `'${key}', json_object(${Object.entries(value)
                  .map(([propKey, propValue]) => {
                    if (Array.isArray(propValue)) {
                      return `'${propKey}', json_array(${Object.entries(propValue)
                        .map(
                          ([_objKey, objValue]) =>
                            `json_object('className', ${createECSqlValueSelector(objValue.className)}, 'schemaName', ${createECSqlValueSelector(
                              objValue.schemaName,
                            )})`,
                        )
                        .join(", ")})`;
                    } else if (typeof propValue === "boolean") {
                      return `'${propKey}', ${createECSqlValueSelector(propValue)}`;
                    } else if (typeof propValue === "object" && propValue !== null && propValue.hasOwnProperty("selector")) {
                      return `${Object.entries(propValue)
                        .map(([, selectorValue]) => `'${propKey}', ${selectorValue}`)
                        .join(", ")}`;
                    }
                    return "CAST(NULL AS TEXT)";
                  })
                  .join(", ")})`;
              })
              .join(", ")})`
          : "CAST(NULL AS TEXT)"
      } AS ${NodeSelectClauseColumnNames.Grouping},
      CAST(${createECSqlValueSelector(props.mergeByLabelId)} AS TEXT) AS ${NodeSelectClauseColumnNames.MergeByLabelId},
      ${
        props.extendedData
          ? `json_object(${Object.entries(props.extendedData)
              .map(([key, value]) => `'${key}', ${createECSqlValueSelector(value)}`)
              .join(", ")})`
          : "CAST(NULL AS TEXT)"
      } AS ${NodeSelectClauseColumnNames.ExtendedData},
      CAST(${createECSqlValueSelector(props.autoExpand)} AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand}
    `;
  }
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
      return Id64.isId64(input) ? input : `'${input}'`;
  }
}
