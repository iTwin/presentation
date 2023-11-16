/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECClass, ECNavigationProperty, ECRelationshipClass, IMetadataProvider } from "../../ECMetadata";
import { getClass } from "../../internal/Common";
import { RelationshipPath, RelationshipPathStep } from "../../Metadata";
import { createPropertyValueSelector } from "./ECSqlValueSelectorSnippets";

/**
 * Describes a single JOIN step from source to target through a relationship.
 * @beta
 */
export interface JoinRelationshipPathStep extends RelationshipPathStep {
  sourceAlias: string;
  targetAlias: string;
  relationshipAlias: string;
  joinType?: "inner" | "outer";
}

/**
 * Describes a path of JOINs from source to target.
 * @beta
 */
export type JoinRelationshipPath = RelationshipPath<JoinRelationshipPathStep>;

/**
 * Props for [[createRelationshipPathJoinClause]].
 * @beta
 */
export interface CreateRelationshipPathJoinClauseProps {
  metadata: IMetadataProvider;
  path: JoinRelationshipPath;
}
/**
 * Creates an ECSQL JOIN snippet for given relationships' path.
 *
 * Possible results:
 * - When the relationship is represented by a navigation property on either source or target:
 *   ```SQL
 *   INNER JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[navigation_property_name].[Id] = [source_alias].[ECInstanceId]
 *   ```
 * - When outer joining through a non-navigation-property-relationship:
 *   ```SQL
 *   LEFT JOIN (
 *     SELECT [relationship_alias].*
 *     FROM [relationship_schema_name].[relationship_class_name] [relationship_alias]
 *     INNER JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[ECInstanceId] = [relationship_alias].[TargetECInstanceId]
 *   ) [relationship_alias]
 *   LEFT JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[ECInstanceId] = [relationship_alias].[TargetECInstanceId]
 *   ```
 * - When inner joining through a non-navigation-property-relationship:
 *   ```SQL
 *   INNER JOIN [relationship_schema_name].[relationship_class_name] [relationship_alias] ON [relationship_alias].[SourceECInstanceId] = [source_alias].[ECInstanceId]
 *   INNER JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[ECInstanceId] = [relationship_alias].[TargetECInstanceId]
 *   ```
 * @beta
 */
export async function createRelationshipPathJoinClause(props: CreateRelationshipPathJoinClauseProps) {
  let prev = {
    alias: props.path[0].sourceAlias,
    joinPropertyName: "ECInstanceId",
    className: props.path[0].sourceClassName,
  };
  let clause = "";
  for (const stepDef of props.path) {
    const step = await getRelationshipPathStepClasses(props.metadata, stepDef);
    const navigationProperty = await getNavigationProperty(step);
    if (navigationProperty) {
      const joinDirectionMatchesRelationshipDirection = step.direction === navigationProperty.direction;
      clause += `
        ${getJoinClause(step.joinType)} ${getClassSelectClause(step.target, step.targetAlias)}
        ON ${
          joinDirectionMatchesRelationshipDirection
            ? createPropertyValueSelector(step.targetAlias, "ECInstanceId")
            : createPropertyValueSelector(step.targetAlias, navigationProperty.name, "Navigation")[0]
        }
          = ${
            joinDirectionMatchesRelationshipDirection
              ? createPropertyValueSelector(prev.alias, navigationProperty.name, "Navigation")[0]
              : createPropertyValueSelector(prev.alias, prev.joinPropertyName)
          }
      `;
      prev = {
        alias: step.targetAlias,
        className: step.target.fullName,
        joinPropertyName: "ECInstanceId",
      };
    } else {
      const relationshipJoinPropertyNames =
        step.direction === "Forward" ? { this: "SourceECInstanceId", next: "TargetECInstanceId" } : { this: "TargetECInstanceId", next: "SourceECInstanceId" };
      if (step.joinType === "outer") {
        clause += `
          ${getJoinClause("outer")} (
            SELECT [${step.relationshipAlias}].*
            FROM ${getClassSelectClause(step.relationship, step.relationshipAlias)}
            ${getJoinClause("inner")} ${getClassSelectClause(step.target, step.targetAlias)}
              ON ${createPropertyValueSelector(step.targetAlias, "ECInstanceId")}
                = ${createPropertyValueSelector(step.relationshipAlias, relationshipJoinPropertyNames.next)}
          ) [${step.relationshipAlias}]
          ON ${createPropertyValueSelector(step.relationshipAlias, relationshipJoinPropertyNames.this)}
            = ${createPropertyValueSelector(prev.alias, prev.joinPropertyName)}
        `;
      } else {
        clause += `
          ${getJoinClause("inner")} ${getClassSelectClause(step.relationship, step.relationshipAlias)}
            ON ${createPropertyValueSelector(step.relationshipAlias, relationshipJoinPropertyNames.this)}
              = ${createPropertyValueSelector(prev.alias, prev.joinPropertyName)}
        `;
      }
      clause += `
        ${getJoinClause(step.joinType)} ${getClassSelectClause(step.target, step.targetAlias)}
          ON ${createPropertyValueSelector(step.targetAlias, "ECInstanceId")}
            = ${createPropertyValueSelector(step.relationshipAlias, relationshipJoinPropertyNames.next)}
      `;
      prev = {
        alias: step.targetAlias,
        className: step.target.fullName,
        joinPropertyName: "ECInstanceId",
      };
    }
  }
  return clause;
}

type ResolvedRelationshipPathStep = Omit<JoinRelationshipPathStep, "sourceClassName" | "relationshipName" | "targetClassName"> & {
  source: ECClass;
  relationship: ECRelationshipClass;
  target: ECClass;
};

async function getRelationshipPathStepClasses(metadata: IMetadataProvider, step: JoinRelationshipPathStep): Promise<ResolvedRelationshipPathStep> {
  const { sourceClassName, relationshipName, targetClassName, ...rest } = step;
  return {
    ...rest,
    source: await getClass(metadata, sourceClassName),
    relationship: (await getClass(metadata, relationshipName)) as ECRelationshipClass,
    target: await getClass(metadata, targetClassName),
  };
}

async function getNavigationProperty(step: ResolvedRelationshipPathStep): Promise<ECNavigationProperty | undefined> {
  const source = step.direction === "Forward" ? step.source : step.target;
  const target = step.direction === "Forward" ? step.target : step.source;
  for (const prop of await source.getProperties()) {
    if (prop.isNavigation() && prop.direction === "Forward" && (await prop.relationshipClass).fullName === step.relationship.fullName) {
      return prop;
    }
  }
  for (const prop of await target.getProperties()) {
    if (prop.isNavigation() && prop.direction === "Backward" && (await prop.relationshipClass).fullName === step.relationship.fullName) {
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

function getClassSelectClause(ecClass: ECClass, alias?: string) {
  const classSelector = `[${ecClass.schema.name}].[${ecClass.name}]`;
  return alias ? `${classSelector} [${alias}]` : classSelector;
}
