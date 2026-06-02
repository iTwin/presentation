/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "../Metadata.js";
import { createRawPropertyValueSelector } from "./ECSqlValueSelectorSnippets.js";

import type { ECSqlBinding } from "../ECSqlCore.js";
import type { EC, ECSchemaProvider, RelationshipPath, RelationshipPathStep } from "../Metadata.js";

/**
 * Describes a single JOIN step from source to target through a relationship.
 * @public
 */
interface JoinRelationshipPathStep extends RelationshipPathStep {
  sourceAlias: string;
  targetAlias: string;
  relationshipAlias: string;
  joinType?: "inner" | "outer";
}

/**
 * Describes a path of JOINs from source to target.
 * @public
 */
type JoinRelationshipPath = RelationshipPath<JoinRelationshipPathStep>;

/**
 * Props for `createRelationshipPathJoinClause`.
 * @public
 */
interface CreateRelationshipPathJoinClauseProps {
  schemaProvider: ECSchemaProvider;
  path: JoinRelationshipPath;
}

/**
 * Creates an ECSQL JOIN snippet for given relationships' path.
 *
 * When a step specifies `instanceFilter`, its resolved expression is appended as an `AND`
 * condition to the target class JOIN's `ON` clause. In the outer-join case the condition also
 * appears on the `INNER JOIN` inside the subquery so the pre-joined subquery is already
 * filtered. Bindings declared in `instanceFilter.bindings` across all steps are collected
 * and returned alongside the SQL string.
 *
 * Possible results:
 * - When the relationship is represented by a navigation property on either source or target:
 *   ```SQL
 *   INNER JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[navigation_property_name].[Id] = [source_alias].[ECInstanceId]
 *   ```
 * - When outer joining through a non-navigation-property relationship:
 *   ```SQL
 *   OUTER JOIN (
 *     SELECT [relationship_alias].*
 *     FROM [relationship_schema_name].[relationship_class_name] [relationship_alias]
 *     INNER JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[ECInstanceId] = [relationship_alias].[TargetECInstanceId]
 *   ) [relationship_alias] ON [relationship_alias].[SourceECInstanceId] = [source_alias].[ECInstanceId]
 *   OUTER JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[ECInstanceId] = [relationship_alias].[TargetECInstanceId]
 *   ```
 * - When inner joining through a non-navigation-property relationship:
 *   ```SQL
 *   INNER JOIN [relationship_schema_name].[relationship_class_name] [relationship_alias] ON [relationship_alias].[SourceECInstanceId] = [source_alias].[ECInstanceId]
 *   INNER JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[ECInstanceId] = [relationship_alias].[TargetECInstanceId]
 *   ```
 *
 * @returns An object containing:
 *   - `joins`: the ECSQL JOIN clause string to embed in a query.
 *   - `bindings`: ECSQL parameter bindings collected from `instanceFilter.bindings` across all steps,
 *     or `undefined` if no step specified any bindings.
 * @public
 */
export async function createRelationshipPathJoinClause(
  props: CreateRelationshipPathJoinClauseProps,
): Promise<{ joins: string; bindings?: Record<string, ECSqlBinding> }> {
  if (props.path.length === 0) {
    return { joins: "" };
  }
  let prev = {
    alias: props.path[0].sourceAlias,
    joinPropertyName: "ECInstanceId",
    className: props.path[0].sourceClassName,
  };
  let joins = "";
  const bindings: Record<string, ECSqlBinding> = {};
  for (const stepDef of props.path) {
    const step = await getRelationshipPathStepClasses(props.schemaProvider, stepDef);
    const navigationProperty = await getNavigationProperty(step);
    const filterCondition = resolveInstanceFilterCondition(step);
    if (step.instanceFilter?.bindings) {
      for (const [key, value] of Object.entries(step.instanceFilter.bindings)) {
        if (key in bindings) {
          throw new Error(
            `Binding key "${key}" is used in multiple steps of the relationship path. Each binding key must be unique across all steps.`,
          );
        }
        bindings[key] = value;
      }
    }
    if (navigationProperty) {
      const isNavigationPropertyForward = navigationProperty.direction === "Forward";
      const relationshipJoinPropertyNames =
        isNavigationPropertyForward === !step.relationshipReverse
          ? {
              this: createRawPropertyValueSelector(step.targetAlias, "ECInstanceId"),
              next: createRawPropertyValueSelector(prev.alias, navigationProperty.name, "Id"),
            }
          : {
              this: createRawPropertyValueSelector(step.targetAlias, navigationProperty.name, "Id"),
              next: createRawPropertyValueSelector(prev.alias, prev.joinPropertyName),
            };
      joins += `
        ${getJoinClause(step.joinType)} ${getClassSelectClause(step.target, step.targetAlias)}
          ON ${relationshipJoinPropertyNames.this} = ${relationshipJoinPropertyNames.next}${filterCondition}
      `;
      prev = { alias: step.targetAlias, className: step.target.fullName, joinPropertyName: "ECInstanceId" };
    } else {
      const relationshipJoinPropertyNames = !step.relationshipReverse
        ? { this: "SourceECInstanceId", next: "TargetECInstanceId" }
        : { this: "TargetECInstanceId", next: "SourceECInstanceId" };
      if (step.joinType === "outer") {
        joins += `
          ${getJoinClause("outer")} (
            SELECT [${step.relationshipAlias}].*
            FROM ${getClassSelectClause(step.relationship, step.relationshipAlias)}
            ${getJoinClause("inner")} ${getClassSelectClause(step.target, step.targetAlias)}
              ON ${createRawPropertyValueSelector(step.targetAlias, "ECInstanceId")}
                = ${createRawPropertyValueSelector(step.relationshipAlias, relationshipJoinPropertyNames.next)}${filterCondition}
          ) [${step.relationshipAlias}]
          ON ${createRawPropertyValueSelector(step.relationshipAlias, relationshipJoinPropertyNames.this)}
            = ${createRawPropertyValueSelector(prev.alias, prev.joinPropertyName)}
        `;
      } else {
        joins += `
          ${getJoinClause("inner")} ${getClassSelectClause(step.relationship, step.relationshipAlias)}
            ON ${createRawPropertyValueSelector(step.relationshipAlias, relationshipJoinPropertyNames.this)}
              = ${createRawPropertyValueSelector(prev.alias, prev.joinPropertyName)}
        `;
      }
      joins += `
        ${getJoinClause(step.joinType)} ${getClassSelectClause(step.target, step.targetAlias)}
          ON ${createRawPropertyValueSelector(step.targetAlias, "ECInstanceId")}
            = ${createRawPropertyValueSelector(step.relationshipAlias, relationshipJoinPropertyNames.next)}${filterCondition}
      `;
      prev = { alias: step.targetAlias, className: step.target.fullName, joinPropertyName: "ECInstanceId" };
    }
  }
  return { joins, bindings: Object.keys(bindings).length > 0 ? bindings : undefined };
}

function resolveInstanceFilterCondition(step: ResolvedRelationshipPathStep): string {
  if (!step.instanceFilter) {
    return "";
  }
  const { expression, targetAlias = "this", relationshipAlias = "rel" } = step.instanceFilter;
  const resolvedExpression = expression
    .replaceAll(`${targetAlias}.`, `[${step.targetAlias}].`)
    .replaceAll(`${relationshipAlias}.`, `[${step.relationshipAlias}].`);
  return ` AND (${resolvedExpression})`;
}

type ResolvedRelationshipPathStep = Omit<
  JoinRelationshipPathStep,
  "sourceClassName" | "relationshipName" | "targetClassName"
> & { source: EC.Class; relationship: EC.RelationshipClass; target: EC.Class };

async function getRelationshipPathStepClasses(
  schemaProvider: ECSchemaProvider,
  step: JoinRelationshipPathStep,
): Promise<ResolvedRelationshipPathStep> {
  const { sourceClassName, relationshipName, targetClassName, ...rest } = step;
  return {
    ...rest,
    source: await getClass(schemaProvider, sourceClassName),
    relationship: (await getClass(schemaProvider, relationshipName)) as EC.RelationshipClass,
    target: await getClass(schemaProvider, targetClassName),
  };
}

async function getNavigationProperty(step: ResolvedRelationshipPathStep): Promise<EC.NavigationProperty | undefined> {
  const source = !step.relationshipReverse ? step.source : step.target;
  const target = !step.relationshipReverse ? step.target : step.source;
  for (const prop of source.getProperties()) {
    /* v8 ignore else -- @preserve */
    if (
      prop.isNavigation() &&
      prop.direction === "Forward" &&
      prop.relationshipClass.fullName === step.relationship.fullName
    ) {
      return prop;
    }
  }
  for (const prop of target.getProperties()) {
    /* v8 ignore else -- @preserve */
    if (
      prop.isNavigation() &&
      prop.direction === "Backward" &&
      prop.relationshipClass.fullName === step.relationship.fullName
    ) {
      return prop;
    }
  }
  return undefined;
}

function getJoinClause(type: "inner" | "outer" | undefined) {
  if (type === "outer") {
    return "OUTER JOIN";
  }
  return "INNER JOIN";
}

function getClassSelectClause(ecClass: EC.Class, alias: string) {
  const classSelector = `[${ecClass.schema.name}].[${ecClass.name}]`;
  return `${classSelector} [${alias}]`;
}
