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
  compareFullClassNames,
  EC,
  ECClassHierarchyInspector,
  ECSchemaProvider,
  ECSql,
  getClass,
  IInstanceLabelSelectClauseFactory,
  parseFullClassName,
  PrimitiveValue,
  Props,
} from "@itwin/presentation-shared";
import { HierarchyNodeAutoExpandProp } from "./IModelHierarchyNode.js";

/**
 * Column names of the SELECT clause created by `NodeSelectClauseFactory`. Order of the names matches the order of columns
 * created by the factory.
 *
 * @public
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
 * @public
 */
interface ECSqlValueSelector {
  selector: string;
}

/**
 * Props for `NodeSelectClauseFactory.createSelectClause`.
 * @public
 */
interface NodeSelectClauseProps {
  ecClassId: ECSqlValueSelector;
  ecInstanceId: ECSqlValueSelector;
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
 * @public
 */
interface ECSqlSelectClauseGroupingParams {
  byLabel?: ECSqlSelectClauseLabelGroupingParams;
  byClass?: boolean | ECSqlSelectClauseGroupingParamsBase | ECSqlValueSelector;
  byBaseClasses?: ECSqlSelectClauseBaseClassGroupingParams;
  byProperties?: ECSqlSelectClausePropertiesGroupingParams;
}

/**
 * A data structure for defining label grouping params.
 * @public
 */
interface ECSqlSelectClauseLabelGroupingBaseParams {
  /** Label grouping option that determines whether to group nodes or to merge them. Defaults to "group".*/
  action?: "group" | "merge";
  /** Id that needs to match for nodes to be grouped or merged.*/
  groupId?: string | ECSqlValueSelector;
}

/**
 * A data structure for defining label merging.
 * @public
 */
interface ECSqlSelectClauseLabelGroupingMergeParams extends ECSqlSelectClauseLabelGroupingBaseParams {
  action: "merge";
}

/**
 * A data structure for defining label grouping.
 * @public
 */
interface ECSqlSelectClauseLabelGroupingGroupParams extends ECSqlSelectClauseLabelGroupingBaseParams, ECSqlSelectClauseGroupingParamsBase {
  action?: "group";
}

/**
 * A data structure for defining possible label grouping types.
 * @public
 */
type ECSqlSelectClauseLabelGroupingParams =
  | boolean
  | ECSqlValueSelector
  | ECSqlSelectClauseLabelGroupingMergeParams
  | ECSqlSelectClauseLabelGroupingGroupParams;

/**
 * A data structure for defining base grouping parameters shared across all types of grouping.
 * @public
 */
interface ECSqlSelectClauseGroupingParamsBase {
  hideIfNoSiblings?: boolean | ECSqlValueSelector;
  hideIfOneGroupedNode?: boolean | ECSqlValueSelector;
  autoExpand?: HierarchyNodeAutoExpandProp | ECSqlValueSelector;
}

/**
 * A data structure for defining properties grouping.
 * @public
 */
interface ECSqlSelectClausePropertiesGroupingParams extends ECSqlSelectClauseGroupingParamsBase {
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
  propertyGroups: ECSqlSelectClausePropertyGroup[];
}

/**
 * A data structure for defining specific properties' grouping params.
 * @public
 */
interface ECSqlSelectClausePropertyGroup {
  /** A string indicating the name of the property to group by. */
  propertyName: string;
  /** Alias to of the class containing the property. Used to select the property value. */
  propertyClassAlias: string;
  /** Ranges are used to group nodes by numeric properties which are within specified bounds. */
  ranges?: ECSqlSelectClausePropertyValueRange[];
}

/**
 * A data structure for defining boundaries for a value.
 * @public
 */
interface ECSqlSelectClausePropertyValueRange {
  /** Defines the lower bound of the range. */
  fromValue: number | ECSqlValueSelector;
  /** Defines the upper bound of the range. */
  toValue: number | ECSqlValueSelector;
  /** Defines the range label. Will be used as grouping node's display label. */
  rangeLabel?: string | ECSqlValueSelector;
}

/**
 * A data structure for defining base class grouping.
 * @public
 */
interface ECSqlSelectClauseBaseClassGroupingParams extends ECSqlSelectClauseGroupingParamsBase {
  fullClassNames: string[] | ECSqlValueSelector[];
}

/**
 * An interface of a factory that knows how to create nodes' select ECSQL query.
 * @public
 */
export interface NodesQueryClauseFactory {
  /** Create a SELECT clause in a format understood by nodes query parser used by `HierarchyProvider`. */
  createSelectClause(props: NodeSelectClauseProps): Promise<string>;

  /**
   * Creates the necessary ECSQL snippets to create an instance filter described by the given `GenericInstanceFilter` argument.
   * - `from` is set to either the `contentClass.fullName` or one of `filter.propertyClassNames`, depending on which is more specific.
   * - `joins` is set to a number of `JOIN` clauses required to join all relationships described by `filter.relatedInstances`.
   * - `where` is set to a `WHERE` clause (without the `WHERE` keyword) that filters instances by classes on
   * `filter.filterClassNames` and by properties as described by `filter.rules`.
   *
   * Special cases:
   * - If `filter` is `undefined`, `joins` and `where` are set to empty strings and `from` is set to `contentClass.fullName`.
   * - If the provided content class doesn't intersect with the property class in provided filter, a special result
   * is returned to make sure the resulting query is valid and doesn't return anything.
   */
  createFilterClauses(props: {
    contentClass: { fullName: string; alias: string };
    filter?: GenericInstanceFilter;
  }): Promise<{ from: string; where: string; joins: string }>;
}

/**
 * Creates an instance of `NodeSelectQueryFactory`.
 * @public
 */
export function createNodesQueryClauseFactory(props: {
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector;
  instanceLabelSelectClauseFactory: IInstanceLabelSelectClauseFactory;
}): NodesQueryClauseFactory {
  return new NodeSelectQueryFactory(props);
}

/** A factory for creating a nodes' select ECSQL query. */
class NodeSelectQueryFactory {
  private _imodelAccess: ECSchemaProvider & ECClassHierarchyInspector;
  private _instanceLabelSelectClauseFactory: IInstanceLabelSelectClauseFactory;

  public constructor(props: {
    imodelAccess: ECSchemaProvider & ECClassHierarchyInspector;
    instanceLabelSelectClauseFactory: IInstanceLabelSelectClauseFactory;
  }) {
    this._imodelAccess = props.imodelAccess;
    this._instanceLabelSelectClauseFactory = props.instanceLabelSelectClauseFactory;
  }

  /** Create a SELECT clause in a format understood by results reader of the library. */
  public async createSelectClause(props: NodeSelectClauseProps) {
    // note: the columns order must match the order in `NodeSelectClauseColumnNames`
    return `
      ec_ClassName(${props.ecClassId.selector}) AS ${NodeSelectClauseColumnNames.FullClassName},
      ${props.ecInstanceId.selector} AS ${NodeSelectClauseColumnNames.ECInstanceId},
      ${createECSqlValueSelector(props.nodeLabel)} AS ${NodeSelectClauseColumnNames.DisplayLabel},
      CAST(${createECSqlValueSelector(props.hasChildren)} AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
      CAST(${createECSqlValueSelector(props.hideIfNoChildren)} AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
      CAST(${createECSqlValueSelector(props.hideNodeInHierarchy)} AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
      ${props.grouping ? await createGroupingSelector(props.grouping, this._imodelAccess, this._instanceLabelSelectClauseFactory) : "CAST(NULL AS TEXT)"} AS ${NodeSelectClauseColumnNames.Grouping},
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
   * Creates the necessary ECSQL snippets to create an instance filter described by the `filter` argument.
   * - `from` is set to either the `contentClass.fullName` or one of `filter.propertyClassNames`, depending on which is more specific.
   * - `joins` is set to a number of `JOIN` clauses required to join all relationships described by `filter.relatedInstances`.
   * - `where` is set to a `WHERE` clause (without the `WHERE` keyword) that filters instances by classes on
   * `filter.filterClassNames` and by properties as described by `filter.rules`.
   *
   * Special cases:
   * - If `filter` is `undefined`, `joins` and `where` are set to empty strings and `from` is set to `contentClass.fullName`.
   * - If the provided content class doesn't intersect with the property class in provided filter, a special result
   * is returned to make sure the resulting query is valid and doesn't return anything.
   */
  public async createFilterClauses(props: {
    contentClass: { fullName: string; alias: string };
    filter?: GenericInstanceFilter;
  }): Promise<{ from: string; where: string; joins: string }> {
    const { contentClass, filter } = props;
    const { from, joins, where } = filter
      ? await createInstanceFilterClauses({ imodelAccess: this._imodelAccess, contentClass, filter })
      : {
          from: contentClass.fullName,
          joins: [],
          where: [],
        };

    const fromClass = await getClass(this._imodelAccess, from);
    const hiddenClasses = await getHiddenClassesTree(fromClass);
    const hiddenClassesWhereClause = createWhereClauseForHiddenClasses(hiddenClasses, contentClass.alias);
    hiddenClassesWhereClause.hideClause && where.push(hiddenClassesWhereClause.hideClause);
    assert(!hiddenClassesWhereClause.showClause, "`showClause` is expected to always be empty here");

    return {
      from,
      joins: joins.join("\n"),
      where: where.join(" AND "),
    };
  }
}

/**
 * Creates the necessary ECSQL snippets to create an instance filter described by the `filter` argument.
 * - `from` is set to either the `contentClass.fullName` or one of `filter.propertyClassNames`, depending on which is more specific.
 * - `joins` is set to a number of `JOIN` clauses required to join all relationships described by `filter.relatedInstances`.
 * - `where` is set to a `WHERE` clause (without the `WHERE` keyword) that filters instances by classes on
 * `filter.filterClassNames` and by properties as described by `filter.rules`.
 *
 * Special cases:
 * - If `filter` is `undefined`, `joins` and `where` are set to empty strings and `from` is set to `contentClass.fullName`.
 * - If the provided content class doesn't intersect with the property class in provided filter, a special result
 * is returned to make sure the resulting query is valid and doesn't return anything.
 */
async function createInstanceFilterClauses(props: {
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector;
  contentClass: { fullName: string; alias: string };
  filter: GenericInstanceFilter;
}): Promise<{ from: string; where: string[]; joins: string[] }> {
  const { imodelAccess, contentClass, filter } = props;

  const from = await specializeContentClass({
    classHierarchyInspector: imodelAccess,
    contentClassName: contentClass.fullName,
    filterClassNames: filter.propertyClassNames,
  });
  if (!from) {
    // filter class doesn't intersect with content class - make sure the query returns nothing by returning a `FALSE` WHERE clause
    return { from: contentClass.fullName, joins: [], where: ["FALSE"] };
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
    filter.relatedInstances.map(async (rel, i) =>
      ECSql.createRelationshipPathJoinClause({
        schemaProvider: imodelAccess,
        path: assignRelationshipPathAliases(rel.path, i, contentClass.alias, rel.alias),
      }),
    ),
  );

  const where = new Array<string>();
  if (filter.filteredClassNames && filter.filteredClassNames.length > 0) {
    where.push(
      `${ECSql.createRawPropertyValueSelector(contentClass.alias, "ECClassId")} IS (
          ${filter.filteredClassNames
            .map(parseFullClassName)
            .map(({ schemaName, className }) => `[${schemaName}].[${className}]`)
            .join(", ")}
        )`,
    );
  }
  const classAliasMap = new Map<string, string>([[contentClass.alias, from]]);
  filter.relatedInstances.forEach(({ path, alias }) => path.length > 0 && classAliasMap.set(alias, path[path.length - 1].targetClassName));
  const propertiesFilter = await createWhereClause(
    contentClass.alias,
    async (alias) => {
      const aliasClassName = classAliasMap.get(alias);
      return aliasClassName ? getClass(imodelAccess, aliasClassName) : undefined;
    },
    filter.rules,
  );
  if (propertiesFilter) {
    where.push(propertiesFilter);
  }

  return { from, joins, where };
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

async function createGroupingSelector(
  grouping: ECSqlSelectClauseGroupingParams,
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector,
  instanceLabelSelectClauseFactory: IInstanceLabelSelectClauseFactory,
): Promise<string> {
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

  if (grouping.byProperties) {
    const propertyClass = await getClass(imodelAccess, grouping.byProperties.propertiesClassName);
    groupingSelectors.push({
      key: "byProperties",
      selector: serializeJsonObject([
        {
          key: "propertiesClassName",
          selector: `${createECSqlValueSelector(grouping.byProperties.propertiesClassName)}`,
        },
        {
          key: "propertyGroups",
          selector: `json_array(${(
            await Promise.all(
              grouping.byProperties.propertyGroups.map(async (propertyGroup) =>
                serializeJsonObject(await createPropertyGroupSelectors(propertyGroup, propertyClass, instanceLabelSelectClauseFactory)),
              ),
            )
          ).join(", ")})`,
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
  }

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

async function createPropertyGroupSelectors(
  propertyGroup: ECSqlSelectClausePropertyGroup,
  propertyClass: EC.Class,
  instanceLabelSelectClauseFactory: IInstanceLabelSelectClauseFactory,
) {
  const selectors = new Array<{ key: string; selector: string }>();
  selectors.push({
    key: "propertyName",
    selector: `${createECSqlValueSelector(propertyGroup.propertyName)}`,
  });

  const property = await propertyClass.getProperty(propertyGroup.propertyName);
  if (!property) {
    throw new Error(`Property "${propertyGroup.propertyName}" not found in ECClass "${propertyClass.fullName}".`);
  }

  if (property.isNavigation()) {
    const relationshipClass = await property.relationshipClass;
    const abstractConstraint =
      property.direction === "Forward" ? await relationshipClass.target.abstractConstraint : await relationshipClass.source.abstractConstraint;
    if (!abstractConstraint) {
      throw new Error(`Could not determine class name for navigation property with direction "${property.direction}".`);
    }

    const fullName = abstractConstraint.fullName;
    const targetAlias = "target";
    selectors.push({
      key: "propertyValue",
      selector: `(
          SELECT ${await instanceLabelSelectClauseFactory.createSelectClause({ className: fullName, classAlias: targetAlias })}
          FROM ${fullName} AS ${targetAlias}
          WHERE [${targetAlias}].[ECInstanceId] = [${propertyGroup.propertyClassAlias}].[${propertyGroup.propertyName}].[Id]
        )`,
    });
  } else {
    selectors.push({
      key: "propertyValue",
      selector: `[${propertyGroup.propertyClassAlias}].[${propertyGroup.propertyName}]`,
    });
  }

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
    const escapedValue = value.replace(/[%_\\]/g, "\\$&");
    return `${propertyValueSelector} ${ecsqlOperator} '%${escapedValue}%' ESCAPE '\\'`;
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

type JoinRelationshipPath = Props<typeof ECSql.createRelationshipPathJoinClause>["path"];
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
  classHierarchyInspector: ECClassHierarchyInspector;
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

async function getSpecializedPropertyClass(classHierarchyInspector: ECClassHierarchyInspector, classes: string[]): Promise<string | undefined> {
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

interface HiddenClassNode {
  fullName: string;
  state: "hide" | "show";
  children: HiddenClassNode[];
}

async function getHiddenClassesTree(selectClass: EC.Class, selectClassAttribute: "show" | "hide" = "show"): Promise<HiddenClassNode[]> {
  const derivedClasses = await getDirectDerivedClasses(selectClass);

  const derivedClassSchemas = derivedClasses.reduce(
    (acc, ecClass) => {
      if (!acc.set.has(ecClass.schema.name)) {
        acc.schemas.push(ecClass.schema);
        acc.set.add(ecClass.schema.name);
      }
      return acc;
    },
    { set: new Set<string>(), schemas: new Array<EC.Schema>() },
  ).schemas;
  const hiddenSchemas = new Map<string, "hide" | "show" | undefined>();
  await Promise.all(
    derivedClassSchemas.map(async (ecSchema) => {
      hiddenSchemas.set(ecSchema.name, await getHiddenSchemaAttribute(ecSchema));
    }),
  );

  const tree = (
    await Promise.all(
      derivedClasses.map(async (ecClass): Promise<HiddenClassNode[]> => {
        const hiddenClassAttr = await getHiddenClassAttribute(ecClass);
        const attr = hiddenClassAttr ?? hiddenSchemas.get(ecClass.schema.name);
        if (!attr || attr === selectClassAttribute) {
          return getHiddenClassesTree(ecClass, selectClassAttribute);
        }
        return [
          {
            fullName: ecClass.fullName,
            state: attr,
            children: await getHiddenClassesTree(ecClass, attr),
          },
        ];
      }),
    )
  ).flat();
  return tree;
}

async function getDirectDerivedClasses(ecClass: EC.Class): Promise<EC.Class[]> {
  const allDerived = await ecClass.getDerivedClasses();
  return (await Promise.all(allDerived.map(async (c) => ({ derived: c, base: await c.baseClass }))))
    .filter(({ base }) => base && compareFullClassNames(base.fullName, ecClass.fullName) === 0)
    .map(({ derived }) => derived);
}

async function getHiddenClassAttribute(ecClass: EC.Class): Promise<"hide" | "show" | undefined> {
  const customAttributes = await ecClass.getCustomAttributes();
  const hiddenClassAttribute = customAttributes.get("CoreCustomAttributes.HiddenClass");
  return hiddenClassAttribute ? (hiddenClassAttribute.Show ? "show" : "hide") : undefined;
}

async function getHiddenSchemaAttribute(ecSchema: EC.Schema): Promise<"hide" | "show" | undefined> {
  const customAttributes = await ecSchema.getCustomAttributes();
  const hiddenSchemaAttribute = customAttributes.get("CoreCustomAttributes.HiddenSchema");
  return hiddenSchemaAttribute ? (hiddenSchemaAttribute.ShowClasses ? "show" : "hide") : undefined;
}

function createWhereClauseForHiddenClasses(hiddenClasses: HiddenClassNode[], selectAlias: string): { showClause?: string; hideClause?: string } {
  const res: { showClause?: string; hideClause?: string } = {};

  const show = hiddenClasses.filter(({ state }) => state === "show");
  if (show.length > 0) {
    let showClause = `[${selectAlias}].[ECClassId] IS (${show
      .map(({ fullName }) => parseFullClassName(fullName))
      .map(({ schemaName, className }) => `[${schemaName}].[${className}]`)
      .join(", ")})`;
    const childClauses = createWhereClauseForHiddenClasses(
      show.flatMap(({ children }) => children),
      selectAlias,
    );
    if (childClauses.hideClause) {
      showClause = `(${showClause} AND ${childClauses.hideClause})`;
    }
    res.showClause = showClause;
  }

  const hide = hiddenClasses.filter(({ state }) => state === "hide");
  if (hide.length > 0) {
    let hideClause = `[${selectAlias}].[ECClassId] IS NOT (${hide
      .map(({ fullName }) => parseFullClassName(fullName))
      .map(({ schemaName, className }) => `[${schemaName}].[${className}]`)
      .join(", ")})`;
    const childClauses = createWhereClauseForHiddenClasses(
      hide.flatMap(({ children }) => children),
      selectAlias,
    );
    if (childClauses.showClause) {
      hideClause = `(${hideClause} OR ${childClauses.showClause})`;
    }
    res.hideClause = hideClause;
  }

  return res;
}
