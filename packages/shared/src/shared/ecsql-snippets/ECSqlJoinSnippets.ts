/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "../Metadata.js";
import { createClassSelector, createRawPropertyValueSelector } from "./ECSqlValueSelectorSnippets.js";

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
 * Props for `createRelationshipPathJoinClause` and `createRelationshipPathJoinInfo`.
 * @public
 */
export interface CreateRelationshipPathJoinClauseProps {
  schemaProvider: ECSchemaProvider;
  path: JoinRelationshipPath;
}

/**
 * A join onto a plain class table.
 * @public
 */
interface JoinTargetClass {
  kind: "class";
  className: EC.FullClassNameDotNotation;
}

/**
 * A join onto a pre-joined relationship subquery (the outer link-table case), i.e.
 * `(SELECT [rel].* FROM [relationship] [rel] INNER JOIN [target] [t] ON <innerJoinCondition>)`.
 * Rendering emits the subquery; the outer target is a separate `RelationshipJoinInfo` entry.
 * @public
 */
interface JoinTargetRelationshipSelect {
  kind: "relationship-select";
  relationshipClassName: EC.FullClassNameDotNotation;
  relationshipAlias: string;
  /** The class inner-joined inside the subquery, its alias, and the inner `ON` condition. */
  innerTarget: JoinTargetClass;
  innerTargetAlias: string;
  innerJoinCondition: string;
}

/**
 * One concrete JOIN clause rendered as either `INNER JOIN ... ON ...` or `LEFT OUTER JOIN ... ON ...`.
 * @public
 */
interface RelationshipJoinInfo {
  joinType: "inner" | "outer";
  /** What is joined: a class table, or (outer link-table case) a nested relationship SELECT. */
  joinTarget: JoinTargetClass | JoinTargetRelationshipSelect;
  /** Alias assigned to the joined table. */
  joinAlias: string;
  /** The `ON` condition expression (without the `ON` keyword). */
  joinCondition: string;
}

/**
 * Per-path-step resolution info that is not tied to a specific JOIN clause.
 * @public
 */
interface RelationshipPathStepJoinInfo {
  /**
   * The ordered JOIN clauses to emit — one entry per JOIN. A path step contributes 1 (navigation
   * property) or 2 (link-table) entries. Note the join-table count is not `joins.length`: an
   * outer link-table entry (`JoinTargetRelationshipSelect`) wraps a subquery that itself joins the
   * relationship + target.
   */
  joins: RelationshipJoinInfo[];
  /**
   * An ECSQL selector that yields the step's concrete relationship `ECClassId` for the actual data
   * row being traversed. The concept is the same for every step; only the expression differs by how
   * the relationship is represented:
   * - link-table step: `[relationship_alias].[ECClassId]` (the joined relationship table),
   * - navigation-property step: `[owner_alias].[navigation_property_name].[RelECClassId]`, where the
   *   owner alias is the source or target of the step depending on the navigation property direction.
   *
   * Note: for `outer` joins the relationship row / navigation value may be `NULL` when nothing is
   * related, in which case this selector yields `NULL`.
   */
  relationshipClassIdSelector: string;
  /**
   * An ECSQL selector that yields the step's concrete source `ECClassId` for the actual data row
   * being traversed, i.e. `[source_alias].[ECClassId]` of the class the step is joined from.
   */
  sourceClassIdSelector: string;
  /**
   * An ECSQL selector that yields the step's concrete target `ECClassId` for the actual data row
   * being traversed, i.e. `[target_alias].[ECClassId]` of the class the step is joined to.
   *
   * Note: for `outer` joins the target row may be `NULL` when nothing is related, in which case this
   * selector yields `NULL`.
   */
  targetClassIdSelector: string;
}

/**
 * A resolved, render-ready description of a relationship-path JOIN, as a flat, ordered list of
 * concrete join clauses. Produced by `createRelationshipPathJoinInfo`; consumed by the
 * `createRelationshipPathJoinClause` render overload.
 * @public
 */
interface RelationshipPathJoinInfo {
  /** Per-path-step resolution info, one entry per input path step, in path order. */
  steps: RelationshipPathStepJoinInfo[];
  /** `instanceFilter` bindings collected across all steps, or `undefined` when none. */
  bindings?: Record<string, ECSqlBinding>;
}

/**
 * Resolves a relationship path into a `RelationshipPathJoinInfo` (schema-reading pass; produces no ECSQL).
 * @public
 */
export async function createRelationshipPathJoinInfo(
  props: CreateRelationshipPathJoinClauseProps,
): Promise<RelationshipPathJoinInfo> {
  if (props.path.length === 0) {
    return { steps: [] };
  }
  let prev = {
    alias: props.path[0].sourceAlias,
    joinPropertyName: "ECInstanceId",
    className: props.path[0].sourceClassName,
  };
  const steps: RelationshipPathStepJoinInfo[] = [];
  const bindings: Record<string, ECSqlBinding> = {};
  for (const stepDef of props.path) {
    const step = await getRelationshipPathStepClasses(props.schemaProvider, stepDef);
    const navigationProperty = getNavigationProperty(step);
    const filterCondition = resolveInstanceFilterCondition(step);
    // Source/target `ECClassId` selectors are resolved the same way regardless of how the
    // relationship is represented: read from the source/target aliases actually joined for this step.
    const sourceClassIdSelector = createRawPropertyValueSelector(prev.alias, "ECClassId");
    const targetClassIdSelector = createRawPropertyValueSelector(step.targetAlias, "ECClassId");
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
      // The navigation value (`.Id` and `.RelECClassId`) lives on the same alias that holds the
      // navigation property in the join condition below.
      const navigationValueAlias =
        isNavigationPropertyForward === !step.relationshipReverse ? prev.alias : step.targetAlias;

      const joinCondition =
        isNavigationPropertyForward === !step.relationshipReverse
          ? `${createRawPropertyValueSelector(step.targetAlias, "ECInstanceId")} = ${createRawPropertyValueSelector(prev.alias, navigationProperty.name, "Id")}${filterCondition}`
          : `${createRawPropertyValueSelector(step.targetAlias, navigationProperty.name, "Id")} = ${createRawPropertyValueSelector(prev.alias, prev.joinPropertyName)}${filterCondition}`;
      steps.push({
        relationshipClassIdSelector: createRawPropertyValueSelector(
          navigationValueAlias,
          navigationProperty.name,
          "RelECClassId",
        ),
        sourceClassIdSelector,
        targetClassIdSelector,
        joins: [
          {
            joinType: step.joinType ?? "inner",
            joinTarget: { kind: "class", className: step.target.fullName },
            joinAlias: step.targetAlias,
            joinCondition,
          },
        ],
      });
    } else {
      const joins: RelationshipJoinInfo[] = [];
      const relPropNames = !step.relationshipReverse
        ? { this: "SourceECInstanceId", next: "TargetECInstanceId" }
        : { this: "TargetECInstanceId", next: "SourceECInstanceId" };
      const targetJoinCondition = `${createRawPropertyValueSelector(step.targetAlias, "ECInstanceId")} = ${createRawPropertyValueSelector(step.relationshipAlias, relPropNames.next)}${filterCondition}`;
      if (step.joinType === "outer") {
        joins.push({
          joinType: "outer",
          joinTarget: {
            kind: "relationship-select",
            relationshipClassName: step.relationship.fullName,
            relationshipAlias: step.relationshipAlias,
            innerTarget: { kind: "class", className: step.target.fullName },
            innerTargetAlias: step.targetAlias,
            innerJoinCondition: targetJoinCondition,
          },
          joinAlias: step.relationshipAlias,
          joinCondition: `${createRawPropertyValueSelector(step.relationshipAlias, relPropNames.this)} = ${createRawPropertyValueSelector(prev.alias, prev.joinPropertyName)}`,
        });
      } else {
        joins.push({
          joinType: "inner",
          joinTarget: { kind: "class", className: step.relationship.fullName },
          joinAlias: step.relationshipAlias,
          joinCondition: `${createRawPropertyValueSelector(step.relationshipAlias, relPropNames.this)} = ${createRawPropertyValueSelector(prev.alias, prev.joinPropertyName)}`,
        });
      }
      joins.push({
        joinType: step.joinType ?? "inner",
        joinTarget: { kind: "class", className: step.target.fullName },
        joinAlias: step.targetAlias,
        joinCondition: targetJoinCondition,
      });

      steps.push({
        relationshipClassIdSelector: createRawPropertyValueSelector(step.relationshipAlias, "ECClassId"),
        sourceClassIdSelector,
        targetClassIdSelector,
        joins,
      });
    }
    prev = { alias: step.targetAlias, className: step.target.fullName, joinPropertyName: "ECInstanceId" };
  }
  return { steps, bindings: Object.keys(bindings).length > 0 ? bindings : undefined };
}

/**
 * Result of `createRelationshipPathJoinClause`.
 * @public
 */
interface RelationshipPathJoinClauseResult {
  joins: string;
  bindings?: Record<string, ECSqlBinding>;
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
 *   LEFT OUTER JOIN (
 *     SELECT [relationship_alias].*
 *     FROM [relationship_schema_name].[relationship_class_name] [relationship_alias]
 *     INNER JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[ECInstanceId] = [relationship_alias].[TargetECInstanceId]
 *   ) [relationship_alias] ON [relationship_alias].[SourceECInstanceId] = [source_alias].[ECInstanceId]
 *   LEFT OUTER JOIN [target_schema_name].[target_class_name] [target_alias] ON [target_alias].[ECInstanceId] = [relationship_alias].[TargetECInstanceId]
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
): Promise<RelationshipPathJoinClauseResult>;
/**
 * Render a pre-resolved `RelationshipPathJoinInfo` into an ECSQL JOIN clause (sync, no schema access).
 * @public
 */
export function createRelationshipPathJoinClause(
  props: RenderRelationshipPathJoinClauseProps,
): RelationshipPathJoinClauseResult;
export function createRelationshipPathJoinClause(
  props: CreateRelationshipPathJoinClauseProps | RenderRelationshipPathJoinClauseProps,
): Promise<RelationshipPathJoinClauseResult> | RelationshipPathJoinClauseResult {
  if ("steps" in props) {
    return renderRelationshipPathJoinClause(props);
  }
  return createRelationshipPathJoinInfo(props).then(renderRelationshipPathJoinClause);
}

/**
 * Props for `createRelationshipPathJoinClause` overload that renders a pre-resolved `RelationshipPathJoinInfo` (sync, no schema access).
 * @public
 */
type RenderRelationshipPathJoinClauseProps = Pick<RelationshipPathJoinInfo, "bindings"> & {
  steps: Array<Pick<RelationshipPathJoinInfo["steps"][number], "joins">>;
};
function renderRelationshipPathJoinClause(
  props: RenderRelationshipPathJoinClauseProps,
): RelationshipPathJoinClauseResult {
  let joins = "";
  const flatJoins = props.steps.flatMap((step) => step.joins);
  for (const entry of flatJoins) {
    const joinKw = entry.joinType === "outer" ? "LEFT OUTER JOIN" : "INNER JOIN";
    if (entry.joinTarget.kind === "class") {
      joins += `
        ${joinKw} ${createClassSelector(entry.joinTarget.className)} [${entry.joinAlias}] ON ${entry.joinCondition}
      `;
    } else {
      const t = entry.joinTarget;
      joins += `
        ${joinKw} (
          SELECT [${t.relationshipAlias}].*
          FROM ${createClassSelector(t.relationshipClassName)} [${t.relationshipAlias}]
          INNER JOIN ${createClassSelector(t.innerTarget.className)} [${t.innerTargetAlias}] ON ${t.innerJoinCondition}
        ) [${entry.joinAlias}] ON ${entry.joinCondition}
      `;
    }
  }
  return { joins, bindings: props.bindings };
}

function resolveInstanceFilterCondition(step: ResolvedRelationshipPathStep): string {
  if (!step.instanceFilter) {
    return "";
  }
  const { expression, targetAlias = "this", relationshipAlias = "rel" } = step.instanceFilter;
  const resolvedExpression = expression
    .replaceAll(`[${targetAlias}].`, `[${step.targetAlias}].`)
    .replaceAll(`${targetAlias}.`, `[${step.targetAlias}].`)
    .replaceAll(`[${relationshipAlias}].`, `[${step.relationshipAlias}].`)
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

function getNavigationProperty(step: ResolvedRelationshipPathStep): EC.NavigationProperty | undefined {
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
