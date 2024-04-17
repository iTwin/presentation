/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, Id64String } from "@itwin/core-bentley";
import {
  GenericInstanceFilter,
  GenericInstanceFilterRelationshipStep,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
  GenericInstanceFilterRuleGroupOperator,
  GenericInstanceFilterRuleOperator,
  GenericInstanceFilterRuleValue,
} from "@itwin/core-common";
import {
  createCachingECClassHierarchyInspector,
  EC,
  ECSql,
  getClass,
  IECClassHierarchyInspector,
  IECMetadataProvider,
  parseFullClassName,
  PrimitiveValue,
} from "@itwin/presentation-shared";

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
  // TODO: `ecClassId` and `ecInstanceId` will nearly always be equal to `this.ECClassId` and `this.ECInstanceId` - should make them optional here
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
}

/**
 * A data structure for defining nodes' grouping requirements.
 * @beta
 */
export interface ECSqlSelectClauseGroupingParams {
  byLabel?: ECSqlSelectClauseLabelGroupingParams;
  byClass?: boolean | ECSqlSelectClauseGroupingParamsBase | ECSqlValueSelector;
  byBaseClasses?: ECSqlSelectClauseBaseClassGroupingParams;
  byProperties?: ECSqlSelectClausePropertiesGroupingParams;
}

/**
 * A data structure for defining label grouping params.
 * @beta
 */
export interface ECSqlSelectClauseLabelGroupingBaseParams {
  /** Label grouping option that determines whether to group nodes or to merge them. Defaults to "group".*/
  action?: "group" | "merge";
  /** Id that needs to match for nodes to be grouped or merged.*/
  groupId?: string | ECSqlValueSelector;
}

/**
 * A data structure for defining label merging.
 * @beta
 */
export interface ECSqlSelectClauseLabelGroupingMergeParams extends ECSqlSelectClauseLabelGroupingBaseParams {
  action: "merge";
}

/**
 * A data structure for defining label grouping.
 * @beta
 */
export interface ECSqlSelectClauseLabelGroupingGroupParams extends ECSqlSelectClauseLabelGroupingBaseParams, ECSqlSelectClauseGroupingParamsBase {
  action?: "group";
}

/**
 * A data structure for defining possible label grouping types.
 * @beta
 */
export type ECSqlSelectClauseLabelGroupingParams =
  | boolean
  | ECSqlValueSelector
  | ECSqlSelectClauseLabelGroupingMergeParams
  | ECSqlSelectClauseLabelGroupingGroupParams;

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
 * A data structure for defining properties grouping.
 * @beta
 */
export interface ECSqlSelectClausePropertiesGroupingParams extends ECSqlSelectClauseGroupingParamsBase {
  /**
   * Full name of a class whose properties are used to group the node. Only has effect if the node
   * represents an instance of that class.
   *
   * Full class name format: `SchemaName.ClassName`.
   */
  propertiesClassName: string;
  /**
   * Property grouping option that determines whether to group nodes whose grouping value is not set or is set to an empty string.
   *
   * Label of the created grouping node will be `Not Specified`.
   */
  createGroupForUnspecifiedValues?: boolean | ECSqlValueSelector;
  /**
   * Property grouping option that determines whether to group nodes whose grouping value doesn't fit within any of the provided
   * ranges, or is not a numeric value.
   *
   * Label of the created grouping node will be `Other`.
   */
  createGroupForOutOfRangeValues?: boolean | ECSqlValueSelector;
  /**
   * Properties of the specified class, by which the nodes should be grouped.
   *
   * Example usage:
   * ```ts
   * propertyGroups: [
   *   {
   *     propertyName: "type",
   *     propertyClassAlias: "this"
   *   },
   *   {
   *     propertyName: "length",
   *     propertyClassAlias: "x",
   *     ranges: [
   *       { fromValue: 1, toValue: 10, rangeLabel: "Small" },
   *       { fromValue: 11, toValue: 20, rangeLabel: "Medium" }
   *     ]
   *   },
   * ]
   * ```
   */
  propertyGroups: Array<ECSqlSelectClausePropertyGroup>;
}

/**
 * A data structure for defining specific properties' grouping params.
 * @beta
 */
export interface ECSqlSelectClausePropertyGroup {
  /** A string indicating the name of the property to group by. */
  propertyName: string;
  /** Alias to of the class containing the property. Used to select the property value. */
  propertyClassAlias: string;
  /** Ranges are used to group nodes by numeric properties which are within specified bounds. */
  ranges?: Array<ECSqlSelectClausePropertyValueRange>;
}

/**
 * A data structure for defining boundaries for a value.
 * @beta
 */
export interface ECSqlSelectClausePropertyValueRange {
  /** Defines the lower bound of the range. */
  fromValue: number | ECSqlValueSelector;
  /** Defines the upper bound of the range. */
  toValue: number | ECSqlValueSelector;
  /** Defines the range label. Will be used as grouping node's display label. */
  rangeLabel?: string | ECSqlValueSelector;
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
  private _metadataProvider: IECMetadataProvider;
  private _classHierarchy: IECClassHierarchyInspector;

  public constructor(props: { metadataProvider: IECMetadataProvider; classHierarchyInspector?: IECClassHierarchyInspector }) {
    this._metadataProvider = props.metadataProvider;
    this._classHierarchy = props.classHierarchyInspector ?? createCachingECClassHierarchyInspector({ metadataProvider: props.metadataProvider });
  }

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
   * - `where` is set to a `WHERE` clause (without the `WHERE` keyword) that filters instances by classes on
   * `def.filterClassNames` and by properties as described by `def.rules`.
   *
   * Special cases:
   * - If `def` is `undefined`, `joins` and `where` are set to empty strings and `from` is set to `contentClass.fullName`.
   * - If the provided content class doesn't intersect with the property class in provided filter, a special result
   * is returned to make sure the resulting query is valid and doesn't return anything.
   */
  public async createFilterClauses(
    def: GenericInstanceFilter | undefined,
    contentClass: { fullName: string; alias: string },
  ): Promise<{ from: string; where: string; joins: string }> {
    if (!def) {
      // undefined filter means we don't want any filtering to be applied
      return { from: contentClass.fullName, joins: "", where: "" };
    }

    const from = await specializeContentClass({
      classHierarchyInspector: this._classHierarchy,
      contentClassName: contentClass.fullName,
      filterClassNames: def.propertyClassNames,
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
        ECSql.createRelationshipPathJoinClause({
          metadata: this._metadataProvider,
          path: assignRelationshipPathAliases(rel.path, i, contentClass.alias, rel.alias),
        }),
      ),
    );

    const whereConditions = new Array<string>();
    if (def.filteredClassNames && def.filteredClassNames.length > 0) {
      whereConditions.push(
        `${ECSql.createRawPropertyValueSelector(contentClass.alias, "ECClassId")} IS (
          ${def.filteredClassNames
            .map(parseFullClassName)
            .map(({ schemaName, className }) => `[${schemaName}].[${className}]`)
            .join(", ")}
        )`,
      );
    }
    const classAliasMap = new Map<string, string>([[contentClass.alias, from]]);
    def.relatedInstances.forEach(({ path, alias }) => path.length > 0 && classAliasMap.set(alias, path[path.length - 1].targetClassName));
    const propertiesFilter = await createWhereClause(
      contentClass.alias,
      async (alias) => {
        const aliasClassName = classAliasMap.get(alias);
        return aliasClassName ? getClass(this._metadataProvider, aliasClassName) : undefined;
      },
      def.rules,
    );
    if (propertiesFilter) {
      whereConditions.push(propertiesFilter);
    }

    return {
      from,
      joins: joins.join("\n"),
      where: whereConditions.join(" AND "),
    };
  }
}

function createECSqlValueSelector(input: undefined | PrimitiveValue | ECSqlValueSelector) {
  if (input === undefined) {
    return "NULL";
  }
  if (isSelector(input)) {
    return input.selector;
  }
  return ECSql.createRawPrimitiveValueSelector(input);
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
          : serializeJsonObject(createLabelGroupingBaseParamsSelectors(grouping.byLabel)),
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

  grouping.byProperties &&
    groupingSelectors.push({
      key: "byProperties",
      selector: serializeJsonObject([
        {
          key: "propertiesClassName",
          selector: `${createECSqlValueSelector(grouping.byProperties.propertiesClassName)}`,
        },
        {
          key: "propertyGroups",
          selector: `json_array(${grouping.byProperties.propertyGroups
            .map((propertyGroup) => serializeJsonObject(createPropertyGroupSelectors(propertyGroup)))
            .join(", ")})`,
        },
        ...(grouping.byProperties.createGroupForOutOfRangeValues !== undefined
          ? [
              {
                key: "createGroupForOutOfRangeValues",
                selector: `CAST(${createECSqlValueSelector(grouping.byProperties.createGroupForOutOfRangeValues)} AS BOOLEAN)`,
              },
            ]
          : []),
        ...(grouping.byProperties.createGroupForUnspecifiedValues !== undefined
          ? [
              {
                key: "createGroupForUnspecifiedValues",
                selector: `CAST(${createECSqlValueSelector(grouping.byProperties.createGroupForUnspecifiedValues)} AS BOOLEAN)`,
              },
            ]
          : []),
        ...createBaseGroupingParamSelectors(grouping.byProperties),
      ]),
    });

  return serializeJsonObject(groupingSelectors);
}

function createLabelGroupingBaseParamsSelectors(byLabel: ECSqlSelectClauseLabelGroupingMergeParams | ECSqlSelectClauseLabelGroupingGroupParams) {
  const selectors = new Array<{ key: string; selector: string }>();
  if (byLabel.action !== undefined) {
    selectors.push({
      key: "action",
      selector: `${createECSqlValueSelector(byLabel.action)}`,
    });
  }
  if (byLabel.groupId !== undefined) {
    selectors.push({
      key: "groupId",
      selector: createECSqlValueSelector(byLabel.groupId),
    });
  }
  if (byLabel.action !== "merge") {
    selectors.push(...createBaseGroupingParamSelectors(byLabel));
  }

  return selectors;
}

function createPropertyGroupSelectors(propertyGroup: ECSqlSelectClausePropertyGroup) {
  const selectors = new Array<{ key: string; selector: string }>();
  selectors.push(
    {
      key: "propertyName",
      selector: `${createECSqlValueSelector(propertyGroup.propertyName)}`,
    },
    {
      key: "propertyValue",
      selector: `[${propertyGroup.propertyClassAlias}].[${propertyGroup.propertyName}]`,
    },
  );
  if (propertyGroup.ranges) {
    selectors.push(createRangeParamSelectors(propertyGroup.ranges));
  }
  return selectors;
}

function createRangeParamSelectors(ranges: ECSqlSelectClausePropertyValueRange[]) {
  return {
    key: "ranges",
    selector: `json_array(${ranges
      .map((range) =>
        serializeJsonObject([
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
        ]),
      )
      .join(", ")})`,
  };
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
  contentClassAlias: string,
  classLoader: (alias: string) => Promise<EC.Class | undefined>,
  rule: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup,
): Promise<string | undefined> {
  if (GenericInstanceFilter.isFilterRuleGroup(rule)) {
    const clause = (await Promise.all(rule.rules.map(async (r) => createWhereClause(contentClassAlias, classLoader, r))))
      .filter((c) => !!c)
      .join(` ${getECSqlLogicalOperator(rule.operator)} `);
    return clause ? (rule.operator === "or" ? `(${clause})` : clause) : undefined;
  }
  const sourceAlias = rule.sourceAlias ? rule.sourceAlias : contentClassAlias;
  const propertyValueSelector = ECSql.createRawPropertyValueSelector(sourceAlias, rule.propertyName);
  if (isUnaryRuleOperator(rule.operator)) {
    switch (rule.operator) {
      case "is-true":
        return propertyValueSelector;
      case "is-false":
        return `NOT ${propertyValueSelector}`;
      case "is-null":
        return `${propertyValueSelector} IS NULL`;
      case "is-not-null":
        return `${propertyValueSelector} IS NOT NULL`;
    }
  }
  const ecsqlOperator = getECSqlComparisonOperator(rule.operator);
  if (rule.value === undefined) {
    throw new Error(`Rule "${rule.propertyName}" ${ecsqlOperator} is missing value.`);
  }

  const value = rule.value.rawValue;

  if (rule.operator === "like" && typeof value === "string") {
    return `${propertyValueSelector} ${ecsqlOperator} '${value}' ESCAPE '\\'`;
  }
  const propertyClass = await classLoader(sourceAlias);
  if (!propertyClass) {
    throw new Error(`Class with alias "${sourceAlias}" not found.`);
  }
  const property = await propertyClass.getProperty(rule.propertyName);
  if (!property) {
    throw new Error(`Property "${rule.propertyName}" not found in ECClass "${propertyClass.fullName}".`);
  }
  if (property.isNavigation()) {
    assert(rule.value !== undefined && GenericInstanceFilterRuleValue.isInstanceKey(value));
    return `${propertyValueSelector}.[Id] ${ecsqlOperator} ${ECSql.createRawPrimitiveValueSelector(value.id)}`;
  }
  if (property.isEnumeration()) {
    assert(rule.value !== undefined && !GenericInstanceFilterRuleValue.isInstanceKey(value));
    return `${propertyValueSelector} ${ecsqlOperator} ${ECSql.createRawPrimitiveValueSelector(value)}`;
  }
  if (property.isPrimitive()) {
    assert(rule.value !== undefined && !GenericInstanceFilterRuleValue.isInstanceKey(value));
    switch (property.primitiveType) {
      case "Point2d": {
        assert(rule.operator === "is-equal" || rule.operator === "is-not-equal");
        assert(PrimitiveValue.isPoint2d(value));
        const condition = `
          ${createFloatingPointEqualityClause(`${propertyValueSelector}.[x]`, "is-equal", value.x)}
          AND ${createFloatingPointEqualityClause(`${propertyValueSelector}.[y]`, "is-equal", value.y)}
        `;
        return rule.operator === "is-equal" ? condition : `NOT (${condition})`;
      }
      case "Point3d": {
        assert(rule.operator === "is-equal" || rule.operator === "is-not-equal");
        assert(PrimitiveValue.isPoint3d(value));
        const condition = `
          ${createFloatingPointEqualityClause(`${propertyValueSelector}.[x]`, "is-equal", value.x)}
          AND ${createFloatingPointEqualityClause(`${propertyValueSelector}.[y]`, "is-equal", value.y)}
          AND ${createFloatingPointEqualityClause(`${propertyValueSelector}.[z]`, "is-equal", value.z)}
        `;
        return rule.operator === "is-equal" ? condition : `NOT (${condition})`;
      }
      case "Double": {
        assert(typeof value === "number");
        if (rule.operator === "is-equal" || rule.operator === "is-not-equal") {
          return `${createFloatingPointEqualityClause(propertyValueSelector, rule.operator, value)}`;
        }
        return `${propertyValueSelector} ${ecsqlOperator} ${ECSql.createRawPrimitiveValueSelector(value)}`;
      }
      default: {
        return `${propertyValueSelector} ${ecsqlOperator} ${ECSql.createRawPrimitiveValueSelector(value)}`;
      }
    }
  }
  throw new Error("Struct and array properties are not supported for filtering");
}

function createFloatingPointEqualityClause(valueSelector: string, operator: "is-equal" | "is-not-equal", value: number) {
  const [from, to] = getFloatingPointValueRange(value);
  return `${valueSelector} ${operator === "is-not-equal" ? "NOT " : ""} BETWEEN ${from} AND ${to}`;
}

function getFloatingPointValueRange(value: number): [number, number] {
  return [value - Number.EPSILON, value + Number.EPSILON];
}

function getECSqlLogicalOperator(op: GenericInstanceFilterRuleGroupOperator) {
  switch (op) {
    case "and":
      return "AND";
    case "or":
      return "OR";
  }
}

function isUnaryRuleOperator(
  op: GenericInstanceFilterRuleOperator,
): op is Extract<GenericInstanceFilterRuleOperator, "is-true" | "is-false" | "is-null" | "is-not-null"> {
  return op === "is-true" || op === "is-false" || op === "is-null" || op === "is-not-null";
}

function getECSqlComparisonOperator(op: Exclude<GenericInstanceFilterRuleOperator, "is-true" | "is-false" | "is-null" | "is-not-null">) {
  switch (op) {
    case "is-equal":
      return `=`;
    case "is-not-equal":
      return `<>`;
    case "greater":
      return `>`;
    case "greater-or-equal":
      return `>=`;
    case "less":
      return `<`;
    case "less-or-equal":
      return `<=`;
    case "like":
      return `LIKE`;
  }
}

type JoinRelationshipPath = Parameters<typeof ECSql.createRelationshipPathJoinClause>[0]["path"];
function assignRelationshipPathAliases(
  path: GenericInstanceFilterRelationshipStep[],
  pathIndex: number,
  sourceAlias: string,
  targetAlias: string,
): JoinRelationshipPath {
  function createAlias(fullClassName: string, index: number) {
    return `rel_${pathIndex}_${fullClassName.replaceAll(/[\.:]/g, "_")}_${index}`;
  }
  const result: JoinRelationshipPath = [];
  path.forEach((step, i) => {
    result.push({
      targetClassName: step.targetClassName,
      relationshipName: step.relationshipClassName,
      sourceClassName: step.sourceClassName,
      relationshipReverse: !step.isForwardRelationship,
      sourceAlias: i === 0 ? sourceAlias : result[i - 1].targetAlias,
      relationshipAlias: createAlias(step.relationshipClassName, i),
      targetAlias: i === path.length - 1 ? targetAlias : createAlias(step.targetClassName, i),
      joinType: "inner",
    });
  });
  return result;
}

interface SpecializeContentClassProps {
  classHierarchyInspector: IECClassHierarchyInspector;
  contentClassName: string;
  filterClassNames: string[];
}
async function specializeContentClass(props: SpecializeContentClassProps): Promise<string | undefined> {
  const filterClass = await getSpecializedPropertyClass(props.classHierarchyInspector, props.filterClassNames);
  if (!filterClass) {
    return props.contentClassName;
  }
  if (await props.classHierarchyInspector.classDerivesFrom(filterClass, props.contentClassName)) {
    return filterClass;
  }
  if (await props.classHierarchyInspector.classDerivesFrom(props.contentClassName, filterClass)) {
    return props.contentClassName;
  }
  return undefined;
}

async function getSpecializedPropertyClass(classHierarchyInspector: IECClassHierarchyInspector, classes: string[]): Promise<string | undefined> {
  if (classes.length === 0) {
    return undefined;
  }
  const [currClassName, ...restClasses] = classes;
  let resolvedClassName = currClassName;
  for (const propClassName of restClasses) {
    if (await classHierarchyInspector.classDerivesFrom(propClassName, resolvedClassName)) {
      resolvedClassName = propClassName;
    }
  }
  return resolvedClassName;
}
