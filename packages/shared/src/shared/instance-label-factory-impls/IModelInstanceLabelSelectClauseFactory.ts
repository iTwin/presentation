/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
// cspell:words rilt

import { assert } from "@itwin/core-bentley";
import { createRelationshipPathJoinClause } from "../ecsql-snippets/ECSqlJoinSnippets.js";
import {
  createConcatenatedValueJsonSelector,
  createRawPropertyValueSelector,
} from "../ecsql-snippets/ECSqlValueSelectorSnippets.js";
import { getClass } from "../Metadata.js";
import { parseFullClassName } from "../Utils.js";
import { createBisInstanceLabelSelectClauseFactory } from "./BisInstanceLabelSelectClauseFactory.js";
import { createClassBasedInstanceLabelSelectClauseFactory } from "./ClassBasedInstanceLabelSelectClauseFactory.js";
import { ALIAS_PREFIX } from "./Utils.js";

import type { TypedValueSelectClauseProps } from "../ecsql-snippets/ECSqlValueSelectorSnippets.js";
import type { ECSqlQueryExecutor } from "../ECSqlCore.js";
import type {
  CreateInstanceLabelSelectClauseProps,
  IInstanceLabelSelectClauseFactory,
} from "../InstanceLabelSelectClauseFactory.js";
import type { EC, ECClassHierarchyInspector, ECSchemaProvider } from "../Metadata.js";
import type { ClassBasedLabelSelectClause } from "./ClassBasedInstanceLabelSelectClauseFactory.js";
import type {
  InstanceLabelOverride,
  InstanceLabelOverrideCompositeValueSpecification,
  InstanceLabelOverrideValueSpecification,
  RelationshipPathSpecification,
  RelationshipStepSpecification,
  RuleBase,
} from "./IModelInstanceLabelSelectClauseFactory.Rules.js";

/**
 * Props for `createIModelInstanceLabelSelectClauseFactory`.
 * @public
 */
interface IModelInstanceLabelSelectClauseFactoryProps {
  /**
   * Combined access to the iModel for querying PresentationRules rulesets and inspecting class hierarchy.
   * Follows the same combined-access pattern as other iModel-backed factories in this package.
   */
  imodelAccess: ECSqlQueryExecutor & ECClassHierarchyInspector & ECSchemaProvider;

  /**
   * A fallback label clause factory used when no applicable `InstanceLabelOverride` rules are found
   * or when the `PresentationRules` schema is absent from the iModel.
   * Defaults to the result of `createBisInstanceLabelSelectClauseFactory`.
   */
  defaultClauseFactory?: IInstanceLabelSelectClauseFactory;
}

/**
 * Creates an instance label select clause factory that reads `InstanceLabelOverride` rules from
 * `PresentationRules` rulesets stored in the iModel and compiles them into ECSQL label selectors.
 *
 * Rules are loaded lazily on first use and cached per factory instance. Rulesets are discovered
 * by querying `PresentationRules.Ruleset`. When the `PresentationRules` schema is not imported
 * into the iModel the factory transparently falls back to `defaultClauseFactory` (defaults
 * to `createBisInstanceLabelSelectClauseFactory`).
 *
 * @public
 */
export function createIModelInstanceLabelSelectClauseFactory(
  props: IModelInstanceLabelSelectClauseFactoryProps,
): IInstanceLabelSelectClauseFactory {
  let factoryCache: Promise<IInstanceLabelSelectClauseFactory> | undefined;
  async function getCachedFactory(): Promise<IInstanceLabelSelectClauseFactory> {
    if (!factoryCache) {
      factoryCache = createIModelInstanceLabelSelectClauseFactoryImpl(props);
    }
    return factoryCache;
  }

  return {
    async createSelectClause(clauseProps: CreateInstanceLabelSelectClauseProps): Promise<string> {
      const factory = await getCachedFactory();
      return factory.createSelectClause(clauseProps);
    },
  };
}

async function createIModelInstanceLabelSelectClauseFactoryImpl(
  props: IModelInstanceLabelSelectClauseFactoryProps,
): Promise<IInstanceLabelSelectClauseFactory> {
  const defaultClauseFactory =
    props.defaultClauseFactory ??
    createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: props.imodelAccess });

  const rules = await loadOverrideRules(props.imodelAccess);
  if (rules.length === 0) {
    return defaultClauseFactory;
  }

  rules.sort((lhs, rhs) => (rhs.priority ?? 1000) - (lhs.priority ?? 1000));
  const clauses: ClassBasedLabelSelectClause[] = rules.map((rule) => ({
    className: `${rule.class.schemaName}.${rule.class.className}`,
    clause: async (clauseProps) =>
      compileOverrideClause({
        rule,
        clauseProps,
        // `innerFactory` is declared below but is already assigned by the time this callback is invoked (never called synchronously)
        labelFactory: innerFactory,
        schemaProvider: props.imodelAccess,
      }),
  }));
  const innerFactory = createClassBasedInstanceLabelSelectClauseFactory({
    classHierarchyInspector: props.imodelAccess,
    clauses,
    defaultClauseFactory,
  });
  return innerFactory;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const CLASS_NAME_PresentationRules = "PresentationRules.Ruleset";

async function loadOverrideRules(executor: ECSqlQueryExecutor): Promise<InstanceLabelOverride[]> {
  const rules: InstanceLabelOverride[] = [];
  try {
    const reader = executor.createQueryReader({
      ecsql: `SELECT json_extract(JsonProperties, '$.jsonProperties') AS jsonProperties FROM ${CLASS_NAME_PresentationRules}`,
    });
    for await (const row of reader) {
      const payload: string | null | undefined = row.jsonProperties;
      if (payload === null || payload === undefined) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object") {
        continue;
      }
      const rulesetObj = parsed as Record<string, unknown>;

      // Collect from top-level rules[]
      const topRules = Array.isArray(rulesetObj.rules) ? rulesetObj.rules : [];
      for (const rule of topRules) {
        const normalized = normalizeInstanceLabelOverrideRule(rule);
        if (normalized) {
          rules.push(normalized);
        }
      }
    }
  } catch (e) {
    if (isPresentationRulesSchemaAbsenceError(e)) {
      return [];
    }
    throw e;
  }
  return rules;
}

function isPresentationRulesSchemaAbsenceError(e: unknown): boolean {
  if (!(e instanceof Error)) {
    return false;
  }
  return e.message.includes(`'${CLASS_NAME_PresentationRules}' does not exist`);
}

function isInstanceLabelOverrideRule(rule: RuleBase): rule is InstanceLabelOverride {
  return rule.ruleType === "InstanceLabelOverride";
}

function normalizeInstanceLabelOverrideRule(rule: RuleBase): InstanceLabelOverride | undefined {
  if (!isInstanceLabelOverrideRule(rule)) {
    return undefined;
  }

  if (rule.values.length === 0) {
    return undefined;
  }

  return rule;
}

type ExtendedCreateInstanceLabelSelectClauseProps = CreateInstanceLabelSelectClauseProps & {
  visitedClasses?: Set<EC.FullClassName>;
  depth?: number;
};

interface CompileContext {
  classAlias: string;
  selectorsConcatenator: NonNullable<CreateInstanceLabelSelectClauseProps["selectorsConcatenator"]>;
  labelFactory: IInstanceLabelSelectClauseFactory;
  visitedClasses: Set<EC.FullClassName>;
  schemaProvider: ECSchemaProvider;
  ruleClassName: EC.FullClassName;
  depth: number;
}

async function compileOverrideClause(props: {
  rule: InstanceLabelOverride;
  clauseProps: ExtendedCreateInstanceLabelSelectClauseProps;
  labelFactory: IInstanceLabelSelectClauseFactory;
  schemaProvider: ECSchemaProvider;
}) {
  const { rule, clauseProps, labelFactory, schemaProvider } = props;
  assert(rule.values.length > 0);

  const ctx: CompileContext = {
    classAlias: clauseProps.classAlias,
    selectorsConcatenator: clauseProps.selectorsConcatenator ?? createConcatenatedValueJsonSelector,
    labelFactory,
    visitedClasses: clauseProps.visitedClasses ?? new Set(),
    schemaProvider,
    ruleClassName: `${rule.class.schemaName}.${rule.class.className}`,
    depth: clauseProps.depth ?? 0,
  };
  const compiledSpecs = await Promise.all(rule.values.map(async (spec) => compileValueSpec(spec, ctx)));
  if (compiledSpecs.length === 1) {
    return compiledSpecs[0];
  }
  return `COALESCE(${compiledSpecs.join(", ")})`;
}

async function compileValueSpec(spec: InstanceLabelOverrideValueSpecification, ctx: CompileContext) {
  switch (spec.specType) {
    case "String": {
      return ctx.selectorsConcatenator([{ value: spec.value, type: "String" }]);
    }
    case "Property": {
      if (spec.propertySource) {
        const steps = normalizeRelationshipPath(spec.propertySource);
        if (steps.length === 0) {
          return "NULL";
        }
        const finalTargetAlias = subqueryAlias(PROPERTY_SOURCE_TARGET_ALIAS, ctx.depth);
        const subquery = await buildRelationshipPathSubquery({
          schemaProvider: ctx.schemaProvider,
          steps,
          ruleClassName: ctx.ruleClassName,
          classAlias: ctx.classAlias,
          selectExpression: createRawPropertyValueSelector(finalTargetAlias, spec.propertyName),
          finalTargetAlias,
          depth: ctx.depth,
        });
        return subquery;
      }
      return createRawPropertyValueSelector(ctx.classAlias, spec.propertyName);
    }
    case "ClassName": {
      return `ec_classname(${createRawPropertyValueSelector(ctx.classAlias, "ECClassId")}, '${spec.full ? "s.c" : "c"}')`;
    }
    case "ClassLabel": {
      return `(
        SELECT COALESCE(
          ${createRawPropertyValueSelector("c", "DisplayLabel")},
          ${createRawPropertyValueSelector("c", "Name")}
        )
        FROM [meta].[ECClassDef] AS [c]
        WHERE [c].[ECInstanceId] = ${createRawPropertyValueSelector(ctx.classAlias, "ECClassId")}
      )`;
    }
    case "BriefcaseId": {
      return `CAST(base36(${createRawPropertyValueSelector(ctx.classAlias, "ECInstanceId")} >> 40) AS TEXT)`;
    }
    case "LocalId": {
      return `CAST(base36(${createRawPropertyValueSelector(ctx.classAlias, "ECInstanceId")} & ((1 << 40) - 1)) AS TEXT)`;
    }
    case "Composite": {
      return compileCompositeSpec(spec, ctx);
    }
    case "RelatedInstanceLabel": {
      const steps = normalizeRelationshipPath(spec.pathToRelatedInstance);
      if (steps.length === 0) {
        return "NULL";
      }

      const lastStep = steps[steps.length - 1];
      let targetClassName: EC.FullClassName;
      if (lastStep.targetClass) {
        targetClassName = `${lastStep.targetClass.schemaName}.${lastStep.targetClass.className}`;
      } else {
        const relName: EC.FullClassName = `${lastStep.relationship.schemaName}.${lastStep.relationship.className}`;
        const relClass = await getClass(ctx.schemaProvider, relName);
        if (!relClass.isRelationshipClass()) {
          throw new Error(`Class ${relName} is not a relationship class`);
        }
        const endpoint = lastStep.direction === "Backward" ? relClass.source : relClass.target;
        const constraintClass = await endpoint.abstractConstraint;
        if (!constraintClass) {
          return "''";
        }
        targetClassName = constraintClass.fullName;
      }

      if (ctx.visitedClasses.has(targetClassName)) {
        return "NULL";
      }

      const finalTargetAlias = subqueryAlias(RELATED_INSTANCE_LABEL_TARGET_ALIAS, ctx.depth);
      const selectClauseProps: ExtendedCreateInstanceLabelSelectClauseProps = {
        classAlias: finalTargetAlias,
        className: targetClassName,
        selectorsConcatenator: ctx.selectorsConcatenator,
        visitedClasses: new Set(ctx.visitedClasses).add(targetClassName),
        depth: ctx.depth + 1,
      };
      const subquery = await buildRelationshipPathSubquery({
        schemaProvider: ctx.schemaProvider,
        steps,
        ruleClassName: ctx.ruleClassName,
        classAlias: ctx.classAlias,
        selectExpression: await ctx.labelFactory.createSelectClause(selectClauseProps),
        finalTargetAlias,
        depth: ctx.depth,
      });
      return subquery;
    }
  }
}

async function compileCompositeSpec(
  spec: InstanceLabelOverrideCompositeValueSpecification,
  ctx: CompileContext,
): Promise<string> {
  if (spec.parts.length === 0) {
    return "''";
  }

  const separator = spec.separator ?? " ";
  const compiledParts: Array<{ selector: string; isRequired: boolean }> = await Promise.all(
    spec.parts.map(async (part) => ({
      selector: await compileValueSpec(part.spec, ctx),
      isRequired: !!part.isRequired,
    })),
  );

  const selectors: TypedValueSelectClauseProps[] = [];
  compiledParts.forEach(({ selector }, index) => {
    if (index > 0 && separator) {
      selectors.push({ value: separator, type: "String" });
    }
    selectors.push({ selector });
  });

  const checkSelectors = compiledParts.filter((p) => p.isRequired).map((p) => `IFNULL(${p.selector}, '') <> ''`);
  const checkSelector = checkSelectors.length > 0 ? checkSelectors.join(" AND ") : undefined;

  return ctx.selectorsConcatenator(selectors, checkSelector);
}

type JoinRelationshipPathStep = Parameters<typeof createRelationshipPathJoinClause>[0]["path"][number];

function normalizeRelationshipPath(path: RelationshipPathSpecification): RelationshipStepSpecification[] {
  return Array.isArray(path) ? path : [path];
}

const SUBQUERY_SOURCE_ALIAS = "src";
const PROPERTY_SOURCE_TARGET_ALIAS = "pst";
const RELATED_INSTANCE_LABEL_TARGET_ALIAS = "rilt";
const RELATIONSHIP_ALIAS = "r";
const INTERMEDIATE_TARGET_ALIAS = "m";

function subqueryAlias(prefix: string, depth: number, stepIndex?: number): string {
  const alias = `${ALIAS_PREFIX}${prefix}${depth}`;
  return stepIndex !== undefined ? `${alias}_${stepIndex}` : alias;
}

async function toJoinRelationshipPath(props: {
  schemaProvider: ECSchemaProvider;
  steps: RelationshipStepSpecification[];
  sourceClassName: EC.FullClassName;
  sourceAlias: string;
  finalTargetAlias: string;
  depth: number;
}): Promise<JoinRelationshipPathStep[]> {
  assert(props.steps.length > 0);

  const result: JoinRelationshipPathStep[] = [];
  let currentSourceClassName: EC.FullClassName = props.sourceClassName;
  let currentSourceAlias = props.sourceAlias;

  for (let i = 0; i < props.steps.length; i++) {
    const step = props.steps[i];
    const relationshipName: EC.FullClassName = `${step.relationship.schemaName}.${step.relationship.className}`;
    const relationshipReverse = step.direction === "Backward";

    let targetClassName: EC.FullClassName;
    if (step.targetClass) {
      targetClassName = `${step.targetClass.schemaName}.${step.targetClass.className}`;
    } else {
      const relClass = await getClass(props.schemaProvider, relationshipName);
      if (!relClass.isRelationshipClass()) {
        throw new Error(`Class ${relationshipName} is not a relationship class`);
      }
      const endpoint = relationshipReverse ? relClass.source : relClass.target;
      const constraintClass = await endpoint.abstractConstraint;
      if (!constraintClass) {
        throw new Error(`Relationship's ${relationshipName} endpoint does not have an abstract constraint`);
      }
      targetClassName = constraintClass.fullName;
    }

    const isLastStep = i === props.steps.length - 1;
    const targetAlias = isLastStep ? props.finalTargetAlias : subqueryAlias(INTERMEDIATE_TARGET_ALIAS, props.depth, i);
    const relationshipAlias = subqueryAlias(RELATIONSHIP_ALIAS, props.depth, i);

    result.push({
      sourceClassName: currentSourceClassName,
      targetClassName,
      relationshipName,
      relationshipReverse,
      sourceAlias: currentSourceAlias,
      targetAlias,
      relationshipAlias,
    });

    currentSourceClassName = targetClassName;
    currentSourceAlias = targetAlias;
  }

  return result;
}

async function buildRelationshipPathSubquery(props: {
  schemaProvider: ECSchemaProvider;
  steps: RelationshipStepSpecification[];
  ruleClassName: EC.FullClassName;
  classAlias: string;
  selectExpression: string;
  finalTargetAlias: string;
  depth: number;
}): Promise<string> {
  assert(props.steps.length > 0);
  const sourceAlias = subqueryAlias(SUBQUERY_SOURCE_ALIAS, props.depth);

  const joinPath = await toJoinRelationshipPath({
    schemaProvider: props.schemaProvider,
    steps: props.steps,
    sourceClassName: props.ruleClassName,
    sourceAlias,
    finalTargetAlias: props.finalTargetAlias,
    depth: props.depth,
  });

  const joinClauses = await createRelationshipPathJoinClause({ schemaProvider: props.schemaProvider, path: joinPath });

  const { schemaName, className } = parseFullClassName(props.ruleClassName);

  return `(
    SELECT ${props.selectExpression}
    FROM [${schemaName}].[${className}] [${sourceAlias}]
    ${joinClauses}
    WHERE [${sourceAlias}].[ECInstanceId] = [${props.classAlias}].[ECInstanceId]
    LIMIT 1
  )`;
}
