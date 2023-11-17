/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64 } from "@itwin/core-bentley";
import { Id64String, PrimitiveValue } from "../values/Values";

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
  /** A serialized JSON object for providing grouping information. */
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

/**
 * A data structure for defining nodes' grouping requirements.
 * @beta
 */
export interface ECSqlSelectClauseGroupingParams {
  byLabel?: boolean | ECSqlValueSelector | BaseGroupingParams;
  byClass?: boolean | ECSqlValueSelector | BaseGroupingParams;
  byBaseClasses?: BaseClassGroupingParams;
  byProperties?: PropertiesGroupingParams;
}

interface BaseGroupingParams {
  hideIfNoSiblings?: boolean | ECSqlValueSelector;
  hideIfOneGroupedNode?: boolean | ECSqlValueSelector;
  autoExpand?: string | ECSqlValueSelector;
}

interface PropertiesGroupingParams extends BaseGroupingParams {
  fullClassName: string | ECSqlValueSelector;
  propertyGroups: Array<PropertyGroup>;
}

interface PropertyGroup {
  propertyName: string | ECSqlValueSelector;
  propertyValue: PrimitiveValue | ECSqlValueSelector;
  ranges?: Array<Range>;
}

interface Range {
  fromValue: number | ECSqlValueSelector;
  toValue: number | ECSqlValueSelector;
  rangeLabel?: string | ECSqlValueSelector;
}

interface BaseClassGroupingParams extends BaseGroupingParams {
  fullClassNames: string[] | ECSqlValueSelector[];
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
      ${props.grouping ? createGroupingSelector(props.grouping) : "CAST(NULL AS TEXT)"} AS ${NodeSelectClauseColumnNames.Grouping},
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

export function createECSqlValueSelector(input: undefined | PrimitiveValue | ECSqlValueSelector) {
  if (input === undefined) {
    return "NULL";
  }
  if (isSelector(input)) {
    return input.selector;
  }
  if (input instanceof Date) {
    return `'${input.toISOString()}'`;
  }
  if (PrimitiveValue.isPoint3d(input)) {
    return `json_object('x', ${input.x}, 'y', ${input.y}, 'z', ${input.z})`;
  }
  if (PrimitiveValue.isPoint2d(input)) {
    return `json_object('x', ${input.x}, 'y', ${input.y})`;
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

function isSelector(x: any): x is ECSqlValueSelector {
  return !!x.selector;
}

function createGroupingSelector(grouping: ECSqlSelectClauseGroupingParams): string {
  const groupingSelectors = new Array<{ key: string; selector: string }>();

  grouping.byLabel &&
    groupingSelectors.push({
      key: "byLabel",
      selector:
        typeof grouping.byLabel === "boolean" || isSelector(grouping.byLabel)
          ? `CAST(${createECSqlValueSelector(grouping.byLabel)} AS BOOLEAN)`
          : serializeJsonObject(createBaseGroupingParamSelectors(grouping.byLabel)),
    });

  grouping.byClass &&
    groupingSelectors.push({
      key: "byClass",
      selector:
        typeof grouping.byClass === "boolean" || isSelector(grouping.byClass)
          ? `CAST(${createECSqlValueSelector(grouping.byClass)} AS BOOLEAN)`
          : serializeJsonObject(createBaseGroupingParamSelectors(grouping.byClass)),
    });

  grouping.byBaseClasses &&
    groupingSelectors.push({
      key: "byBaseClasses",
      selector: serializeJsonObject([
        {
          key: "fullClassNames",
          selector: `json_array(${grouping.byBaseClasses.fullClassNames.map((className) => createECSqlValueSelector(className)).join(", ")})`,
        },
        ...createBaseGroupingParamSelectors(grouping.byBaseClasses),
      ]),
    });

  grouping.byProperties &&
    groupingSelectors.push({
      key: "byProperties",
      selector: serializeJsonObject([
        {
          key: "fullClassName",
          selector: `${createECSqlValueSelector(grouping.byProperties.fullClassName)}`,
        },
        {
          key: "propertyGroups",
          selector: `json_array(${grouping.byProperties.propertyGroups
            .map((propertyGroup) => {
              return serializeJsonObject(createPropertyGroupSelectors(propertyGroup));
            })
            .join(", ")})`,
        },
        ...createBaseGroupingParamSelectors(grouping.byProperties),
      ]),
    });

  return serializeJsonObject(groupingSelectors);
}

function createPropertyGroupSelectors(propertyGroup: PropertyGroup) {
  const selectors = new Array<{ key: string; selector: string }>();
  selectors.push(
    {
      key: "propertyName",
      selector: `${createECSqlValueSelector(propertyGroup.propertyName)}`,
    },
    {
      key: "propertyValue",
      selector:
        typeof propertyGroup.propertyValue === "boolean"
          ? `CAST(${createECSqlValueSelector(propertyGroup.propertyValue)} AS BOOLEAN)`
          : createECSqlValueSelector(propertyGroup.propertyValue),
    },
  );
  if (propertyGroup.ranges) {
    selectors.push(createRangeParamSelectors(propertyGroup.ranges));
  }
  return selectors;
}

function createRangeParamSelectors(ranges: Range[]) {
  const selector = {
    key: "ranges",
    selector: `json_array(${ranges
      .map((range) => {
        return serializeJsonObject([
          {
            key: "fromValue",
            selector: createECSqlValueSelector(range.fromValue),
          },
          {
            key: "toValue",
            selector: createECSqlValueSelector(range.toValue),
          },
          ...(range.rangeLabel
            ? [
                {
                  key: "rangeLabel",
                  selector: `${createECSqlValueSelector(range.rangeLabel)}`,
                },
              ]
            : []),
        ]);
      })
      .join(", ")})`,
  };
  return selector;
}

function createBaseGroupingParamSelectors(params: BaseGroupingParams) {
  const selectors = new Array<{ key: string; selector: string }>();
  if (params.hideIfNoSiblings !== undefined) {
    selectors.push({
      key: "hideIfNoSiblings",
      selector: `CAST(${createECSqlValueSelector(params.hideIfNoSiblings)} AS BOOLEAN)`,
    });
  }
  if (params.hideIfOneGroupedNode !== undefined) {
    selectors.push({
      key: "hideIfOneGroupedNode",
      selector: `CAST(${createECSqlValueSelector(params.hideIfOneGroupedNode)} AS BOOLEAN)`,
    });
  }
  if (params.autoExpand !== undefined) {
    selectors.push({
      key: "autoExpand",
      selector: `CAST(${createECSqlValueSelector(params.autoExpand)} AS TEXT)`,
    });
  }
  return selectors;
}

function serializeJsonObject(selectors: Array<{ key: string; selector: string }>): string {
  return `json_object(${selectors.map(({ key, selector }) => `'${key}', ${selector}`).join(", ")})`;
}
