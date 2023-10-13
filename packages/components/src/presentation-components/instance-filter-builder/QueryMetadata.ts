import { PrimitiveValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyFilterRuleGroupOperator, PropertyFilterRuleOperator } from "@itwin/components-react";
import { ClassInfo, NestedContentField, PropertiesField, RelationshipPath } from "@itwin/presentation-common";
import { deserializeDisplayValueGroupArray } from "../common/Utils";
import { PresentationInstanceFilter, PresentationInstanceFilterCondition, PresentationInstanceFilterConditionGroup } from "./Types";

export interface QueryMetadata {
  rules: QueryRule | QueryRuleGroup;
  relatedInstances: RelatedInstanceDescription[];
  propertyClasses: ClassInfo[];
}

export interface QueryRule {
  sourceAlias: string;
  propertyName: string;
  operator: PropertyFilterRuleOperator;
  value?: PrimitiveValue;
  propertyTypeName: string;
}

export interface QueryRuleGroup {
  operator: PropertyFilterRuleGroupOperator;
  rules: Array<QueryRule | QueryRuleGroup>;
}

export interface RelatedInstanceDescription {
  path: RelationshipPath;
  alias: string;
}

interface ConvertContext {
  relatedInstances: RelatedInstanceDescription[];
  propertyClasses: ClassInfo[];
}

export function createQueryMetadata(filter: PresentationInstanceFilter): QueryMetadata {
  const context: ConvertContext = { relatedInstances: [], propertyClasses: [] };

  const rules = createMetadataFromFilter(filter, context);
  return { rules, relatedInstances: context.relatedInstances, propertyClasses: context.propertyClasses };
}

function createMetadataFromFilter(filter: PresentationInstanceFilter, ctx: ConvertContext) {
  if (isFilterConditionGroup(filter)) {
    return createMetadataFromGroup(filter, ctx);
  }
  const result = traverseUniqueValuesCondition(filter, ctx);
  if (result !== undefined) {
    return result;
  }
  return createMetadataFromCondition(filter, ctx);
}

function traverseUniqueValuesCondition(filter: PresentationInstanceFilterCondition, ctx: ConvertContext) {
  // Unique values works only with `IsEqual` and `IsNotEqual` operators.
  if (filter.operator !== PropertyFilterRuleOperator.IsEqual && filter.operator !== PropertyFilterRuleOperator.IsNotEqual) {
    return undefined;
  }
  if (typeof filter.value?.value !== "string" || typeof filter.value?.displayValue !== "string") {
    return undefined;
  }
  const result = handleStringifiedUniqueValues(filter, filter.value.displayValue, filter.value.value);
  if (result === undefined) {
    return undefined;
  }
  return createMetadataFromGroup(result, ctx);
}

function createMetadataFromGroup(group: PresentationInstanceFilterConditionGroup, ctx: ConvertContext): QueryRuleGroup {
  const convertedConditions = group.conditions.map((condition) => createMetadataFromFilter(condition, ctx));
  return {
    operator: group.operator,
    rules: convertedConditions,
  };
}

function createMetadataFromCondition(condition: PresentationInstanceFilterCondition, ctx: ConvertContext): QueryRule {
  const { field, operator, value } = condition;
  const property = field.properties[0].property;
  const relatedInstance = getRelatedInstanceDescription(field, property.classInfo.name, ctx);
  addClassInfoToContext(relatedInstance ? relatedInstance.path[0].sourceClassInfo : property.classInfo, ctx);
  const propertyAlias = relatedInstance?.alias ?? "this";

  return {
    operator,
    value,
    sourceAlias: propertyAlias,
    propertyName: property.name,
    propertyTypeName: field.type.typeName,
  };
}

function addClassInfoToContext(classInfo: ClassInfo, ctx: ConvertContext) {
  if (ctx.propertyClasses.find((existing) => existing.id === classInfo.id)) {
    return;
  }

  ctx.propertyClasses.push(classInfo);
}

function getRelatedInstanceDescription(field: PropertiesField, propClassName: string, ctx: ConvertContext): RelatedInstanceDescription | undefined {
  if (!field.parent) {
    return undefined;
  }

  const pathToProperty = RelationshipPath.reverse(getPathToPrimaryClass(field.parent));
  const existing = ctx.relatedInstances.find((instance) => RelationshipPath.equals(pathToProperty, instance.path));
  if (existing) {
    return existing;
  }

  const newRelated = {
    path: pathToProperty,
    alias: `rel_${propClassName.split(":")[1]}`,
  };

  ctx.relatedInstances.push(newRelated);
  return newRelated;
}

function getPathToPrimaryClass(field: NestedContentField): RelationshipPath {
  if (field.parent) {
    return [...field.pathToPrimaryClass, ...getPathToPrimaryClass(field.parent)];
  }
  return [...field.pathToPrimaryClass];
}

function isFilterConditionGroup(obj: PresentationInstanceFilter): obj is PresentationInstanceFilterConditionGroup {
  return (obj as PresentationInstanceFilterConditionGroup).conditions !== undefined;
}

function handleStringifiedUniqueValues(filter: PresentationInstanceFilterCondition, serializedDisplayValues: string, serializedGroupedRawValues: string) {
  const { field, operator } = filter;

  let selectedValueIndex = 0;

  const { displayValues, groupedRawValues } = deserializeDisplayValueGroupArray(serializedDisplayValues, serializedGroupedRawValues);
  if (displayValues === undefined || groupedRawValues === undefined) {
    return undefined;
  }

  const conditionGroup: PresentationInstanceFilterConditionGroup = {
    operator: operator === PropertyFilterRuleOperator.IsEqual ? PropertyFilterRuleGroupOperator.Or : PropertyFilterRuleGroupOperator.And,
    conditions: [],
  };
  for (const displayValue of displayValues) {
    for (const value of groupedRawValues[selectedValueIndex]) {
      conditionGroup.conditions.push({
        field,
        operator,
        value: { valueFormat: PropertyValueFormat.Primitive, displayValue, value },
      });
    }
    selectedValueIndex++;
  }
  return conditionGroup;
}
