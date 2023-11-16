/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { ECClass, IMetadataProvider } from "../ECMetadata";
import {
  GenericInstanceFilter,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
  PropertyFilterRuleBinaryOperator,
  PropertyFilterRuleGroupOperator,
  PropertyFilterRuleOperator,
  PropertyFilterValue,
} from "../GenericInstanceFilter";
import { getClass } from "../internal/Common";
import { RelationshipPath } from "../Metadata";
import { Id64String, PrimitiveValue } from "../values/Values";
import { createRelationshipPathJoinClause, JoinRelationshipPath } from "./ecsql-snippets/ECSqlJoinSnippets";
import { createPrimitiveValueSelector, createPropertyValueSelector } from "./ecsql-snippets/ECSqlValueSelectorSnippets";

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
  /** A flag indicating the node supports child hierarchy level filtering. */
  SupportsFiltering = "SupportsFiltering",
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
  supportsFiltering?: boolean | ECSqlValueSelector;
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
  byLabel?: boolean | ECSqlSelectClauseGroupingParamsBase | ECSqlValueSelector;
  byClass?: boolean | ECSqlSelectClauseGroupingParamsBase | ECSqlValueSelector;
  byBaseClasses?: ECSqlSelectClauseBaseClassGroupingParams;
}

/**
 * A data structure for defining base grouping parameters shared across all types of grouping.
 * @beta
 */
export interface ECSqlSelectClauseGroupingParamsBase {
  hideIfNoSiblings?: boolean | ECSqlValueSelector;
  hideIfOneGroupedNode?: boolean | ECSqlValueSelector;
  autoExpand?: string | ECSqlValueSelector;
}

/**
 * A data structure for defining base class grouping.
 * @beta
 */
export interface ECSqlSelectClauseBaseClassGroupingParams extends ECSqlSelectClauseGroupingParamsBase {
  fullClassNames: string[] | ECSqlValueSelector[];
}

/**
 * A factory for creating a nodes' select ECSQL query.
 * @beta
 */
export class NodeSelectQueryFactory {
  public constructor(private _metadataProvider: IMetadataProvider) {}

  /** Create a SELECT clause in a format understood by results reader of the library. */
  public async createSelectClause(props: NodeSelectClauseProps) {
    // note: the columns order must match the order in `NodeSelectClauseColumnNames`
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
      CAST(${createECSqlValueSelector(props.autoExpand)} AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand},
      CAST(${createECSqlValueSelector(props.supportsFiltering)} AS BOOLEAN) AS ${NodeSelectClauseColumnNames.SupportsFiltering}
    `;
  }

  /**
   * Creates the necessary ECSQL snippets to create an instance filter described by the `def` argument.
   * - `from` is set to either the `contentClass.fullName` or `def.propertyClassName`, depending on which is more specific.
   * - `joins` is set to a number of `JOIN` clauses required to join all relationships described by `def.relatedInstances`.
   * - `where` is set to a `WHERE` clause that filters instances by classes on `def.filterClassNames` and by properties
   * as described by `def.rules`.
   *
   * Note: In case the provided content class doesn't intersect with the property class in provided filter, a special result
   * is returned to make sure the resulting query is valid and doesn't return anything.
   */
  public async createFilterClauses(def: GenericInstanceFilter, contentClass: { fullName: string; alias: string }) {
    const from = await specializeContentClass({
      metadata: this._metadataProvider,
      contentClassName: contentClass.fullName,
      filterClassName: def.propertyClassName,
    });
    if (!from) {
      // filter class doesn't intersect with content class - make sure the query returns nothing by returning a `FALSE` WHERE clause
      return { from: contentClass.fullName, joins: "", where: "FALSE" };
    }

    /**
     * TODO:
     * There may be similar related instance paths, e.g.:
     * - A -> B -> C,
     * - A -> B -> D.
     * At this moment we're handling each path individually which means A and B would get joined twice. We could look into
     * creating a join tree first, e.g.
     *         C
     *        /
     * A -> B
     *        \
     *         D
     */
    const joins = await Promise.all(
      def.relatedInstances.map(async (rel, i) =>
        createRelationshipPathJoinClause({
          metadata: this._metadataProvider,
          path: assignRelationshipPathAliases(rel.path, i, contentClass.alias, rel.alias),
        }),
      ),
    );

    const propertiesClass = await getClass(this._metadataProvider, def.propertyClassName);
    const whereConditions = [(await createWhereClause(propertiesClass, def.rules, contentClass.alias)) ?? ""];
    if (def.filterClassNames && def.filterClassNames.length > 0) {
      whereConditions.push(`${createPropertyValueSelector(contentClass.alias, "ECClassId")} IS (${def.filterClassNames.join(", ")})`);
    }
    return {
      from,
      joins: joins.join("\n"),
      where: whereConditions.join(" AND "),
    };
  }
}

function createECSqlValueSelector(input: undefined | Id64String | string | number | boolean | ECSqlValueSelector) {
  if (input === undefined) {
    return "NULL";
  }
  if (isSelector(input)) {
    return input.selector;
  }
  return createPrimitiveValueSelector(input);
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
          ? createECSqlValueSelector(grouping.byLabel)
          : serializeJsonObject(createBaseGroupingParamSelectors(grouping.byLabel)),
    });

  grouping.byClass &&
    groupingSelectors.push({
      key: "byClass",
      selector:
        typeof grouping.byClass === "boolean" || isSelector(grouping.byClass)
          ? createECSqlValueSelector(grouping.byClass)
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

  return serializeJsonObject(groupingSelectors);
}

function createBaseGroupingParamSelectors(params: ECSqlSelectClauseGroupingParamsBase) {
  const selectors = new Array<{ key: string; selector: string }>();
  if (params.hideIfNoSiblings !== undefined) {
    selectors.push({
      key: "hideIfNoSiblings",
      selector: createECSqlValueSelector(params.hideIfNoSiblings),
    });
  }
  if (params.hideIfOneGroupedNode !== undefined) {
    selectors.push({
      key: "hideIfOneGroupedNode",
      selector: createECSqlValueSelector(params.hideIfOneGroupedNode),
    });
  }
  if (params.autoExpand !== undefined) {
    selectors.push({
      key: "autoExpand",
      selector: createECSqlValueSelector(params.autoExpand),
    });
  }
  return selectors;
}

function serializeJsonObject(selectors: Array<{ key: string; selector: string }>): string {
  return `json_object(${selectors.map(({ key, selector }) => `'${key}', ${selector}`).join(", ")})`;
}

async function createWhereClause(
  propertiesClass: ECClass,
  rule: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup,
  contentClassAlias: string,
): Promise<string | undefined> {
  if (GenericInstanceFilter.isFilterRuleGroup(rule)) {
    const clause = (await Promise.all(rule.rules.map(async (r) => createWhereClause(propertiesClass, r, contentClassAlias))))
      .filter((c) => !!c)
      .join(` ${getECSqlLogicalOperator(rule.operator)} `);
    return clause ? (rule.operator === "Or" ? `(${clause})` : clause) : undefined;
  }
  const sourceAlias = rule.sourceAlias ?? contentClassAlias;
  const propertyValueSelector = createPropertyValueSelector(sourceAlias, rule.propertyName);
  if (PropertyFilterRuleOperator.isUnary(rule.operator)) {
    switch (rule.operator) {
      case "True":
        return propertyValueSelector;
      case "False":
        return `NOT ${propertyValueSelector}`;
      case "Null":
        return `${propertyValueSelector} IS NULL`;
      case "NotNull":
        return `${propertyValueSelector} IS NOT NULL`;
    }
  }
  const ecsqlOperator = getECSqlComparisonOperator(rule.operator);
  if (rule.operator === "Like" && typeof rule.value === "string") {
    return `${propertyValueSelector} ${ecsqlOperator} '%${rule.value}%'`;
  }
  const property = (await propertiesClass.getProperty(rule.propertyName))!;
  if (property.isNavigation()) {
    assert(rule.value !== undefined && PropertyFilterValue.isInstanceKey(rule.value));
    return `${propertyValueSelector}.[Id] ${ecsqlOperator} ${createPrimitiveValueSelector(rule.value.id)}`;
  }
  if (property.isEnumeration()) {
    assert(rule.value !== undefined && PropertyFilterValue.isPrimitive(rule.value));
    return `${propertyValueSelector} ${ecsqlOperator} ${createPrimitiveValueSelector(rule.value)}`;
  }
  if (property.isPrimitive()) {
    assert(rule.value !== undefined && PropertyFilterValue.isPrimitive(rule.value));
    switch (property.primitiveType) {
      case "Point2d": {
        assert(rule.operator === "Equal" || rule.operator === "NotEqual");
        assert(PrimitiveValue.isPoint2d(rule.value));
        return `
          ${createFloatingPointEqualityClause(`${propertyValueSelector}.[x]`, rule.operator, rule.value.x)}
          AND ${createFloatingPointEqualityClause(`${propertyValueSelector}.[y]`, rule.operator, rule.value.y)}
        `;
      }
      case "Point3d": {
        assert(rule.operator === "Equal" || rule.operator === "NotEqual");
        assert(PrimitiveValue.isPoint3d(rule.value));
        return `
          ${createFloatingPointEqualityClause(`${propertyValueSelector}.[x]`, rule.operator, rule.value.x)}
          AND ${createFloatingPointEqualityClause(`${propertyValueSelector}.[y]`, rule.operator, rule.value.y)}
          AND ${createFloatingPointEqualityClause(`${propertyValueSelector}.[z]`, rule.operator, rule.value.z)}
        `;
      }
      case "DateTime": {
        assert(rule.value instanceof Date);
        return `${propertyValueSelector} ${ecsqlOperator} julianday(${createPrimitiveValueSelector(rule.value.toISOString())})`;
      }
      case "Double": {
        assert(typeof rule.value === "number");
        if (rule.operator === "Equal" || rule.operator === "NotEqual") {
          return `${createFloatingPointEqualityClause(propertyValueSelector, rule.operator, rule.value)}`;
        }
        return `${propertyValueSelector} ${ecsqlOperator} ${createPrimitiveValueSelector(rule.value)}`;
      }
      default: {
        return `${propertyValueSelector} ${ecsqlOperator} ${createPrimitiveValueSelector(rule.value)}`;
      }
    }
  }
  throw new Error("Struct and array properties are not supported for filtering");
}

function createFloatingPointEqualityClause(valueSelector: string, operator: "Equal" | "NotEqual", value: number) {
  const [from, to] = getFloatingPointValueRange(value);
  return `${valueSelector} ${operator === "NotEqual" ? "NOT " : ""} BETWEEN ${from} AND ${to}`;
}

function getFloatingPointValueRange(value: number): [number, number] {
  return [value - Number.EPSILON, value + Number.EPSILON];
}

function getECSqlLogicalOperator(op: PropertyFilterRuleGroupOperator) {
  switch (op) {
    case "And":
      return "AND";
    case "Or":
      return "OR";
  }
}

function getECSqlComparisonOperator(op: PropertyFilterRuleBinaryOperator) {
  switch (op) {
    case "Equal":
      return `=`;
    case "NotEqual":
      return `<>`;
    case "Greater":
      return `>`;
    case "GreaterOrEqual":
      return `>=`;
    case "Less":
      return `<`;
    case "LessOrEqual":
      return `<=`;
    case "Like":
      return `LIKE`;
  }
}

function assignRelationshipPathAliases(path: RelationshipPath, pathIndex: number, sourceAlias: string, targetAlias: string): JoinRelationshipPath {
  function createAlias(fullClassName: string, index: number) {
    return `rel_${pathIndex}_${fullClassName.replaceAll(/\.:/, "_")}_${index}`;
  }
  const result: JoinRelationshipPath = [];
  path.forEach((step, i) => {
    result.push({
      ...step,
      sourceAlias: i === 0 ? sourceAlias : result[i - 1].targetAlias,
      relationshipAlias: createAlias(step.relationshipName, i),
      targetAlias: i === path.length ? targetAlias : createAlias(step.targetClassName, i),
      joinType: "inner",
    });
  });
  return result;
}

interface SpecializeContentClassProps {
  metadata: IMetadataProvider;
  contentClassName: string;
  filterClassName: string;
}
async function specializeContentClass(props: SpecializeContentClassProps) {
  const filterClass = await getClass(props.metadata, props.filterClassName);
  const contentClass = await getClass(props.metadata, props.contentClassName);
  if (await filterClass.is(contentClass)) {
    return props.filterClassName;
  }
  if (await contentClass.is(filterClass)) {
    return props.contentClassName;
  }
  return undefined;
}
