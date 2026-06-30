/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { CategoryDefinition } from "../../model/Category.js";

import type {
  EC,
  ECClassHierarchyInspector,
  ECSchemaProvider,
  PrimitiveValueDescriptor,
  RelationshipPath,
  ValueDescriptor,
} from "@itwin/presentation-shared";
import type { ContentTarget } from "../../ContentTarget.js";
import type { ClassPropertySpec, StepPropertySpec } from "../../model/PropertySpec.js";
import type { PresentationRules } from "./ContentModifierRuleFieldsProviderFactory.PresentationRules.js";
import type { IModelFieldsProvider } from "./IModelFieldsProvider.js";

/** Local alias for the contribution type (not exported from IModelFieldsProvider). */
type Contribution = NonNullable<Awaited<ReturnType<IModelFieldsProvider["getContribution"]>>>;
/** Local alias for a single related-properties declaration. */
type RelatedPropertiesDeclaration = NonNullable<Contribution["relatedProperties"]>[number];
/** Local alias for a single calculated-field declaration. */
type CalculatedFieldDeclaration = NonNullable<Contribution["calculatedFields"]>[number];

/** Mapping algorithm version — bump when factory output shape changes. */
const FACTORY_VERSION = 1;

/**
 * Props for `createFieldsProviderFromContentModifierRule`.
 * @public
 */
interface CreateFieldsProviderFromContentModifierRuleProps {
  /** iModel access used for schema version checks and polymorphic class matching. */
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector;

  /** The content modifier rule. */
  rule: PresentationRules.ContentModifierRule;
}

/**
 * Creates an `IModelFieldsProvider` from a `ContentModifier`-like specification.
 *
 * The returned provider:
 * - Checks `requiredSchemas` (with full version comparison) on every `getContribution` call.
 * - Matches the target class **polymorphically** against `spec.class`.
 * - Maps `relatedProperties`, `calculatedProperties`, and `propertyCategories` into a
 *   `FieldsProviderContribution`.
 * - Returns `undefined` when the rule produces no fields or categories.
 *
 * TODO: We should reconsider if this should really be public. We don't really want to expose all the presentation rule stuff.
 *
 * @public
 */
export function createFieldsProviderFromContentModifierRule(
  props: CreateFieldsProviderFromContentModifierRuleProps,
): IModelFieldsProvider {
  const { imodelAccess, rule } = props;
  return {
    id: `FieldsProviderFromContentModifierRule_${hashString(stableStringify(rule))}_v${FACTORY_VERSION}`,
    priority: rule.priority,
    async getContribution({ target }) {
      if (!(await checkRequiredSchemas(imodelAccess, rule.requiredSchemas))) {
        return undefined;
      }
      if (!(await matchesClass(imodelAccess, target, rule.class))) {
        return undefined;
      }

      const categories: Record<CategoryDefinition["id"], CategoryDefinition> = {};

      let relatedProperties: RelatedPropertiesDeclaration[] | undefined;
      if (rule.relatedProperties && rule.relatedProperties.length > 0) {
        const result = await flattenRelatedPropertiesSpecs({
          imodelAccess,
          specs: rule.relatedProperties,
          sourceClassName: target.primaryClass,
        });
        relatedProperties = result.declarations;
        Object.assign(categories, result.categories);
      }

      let calculatedFields: CalculatedFieldDeclaration[] | undefined;
      if (rule.calculatedProperties && rule.calculatedProperties.length > 0) {
        calculatedFields = mapCalculatedProperties(rule.calculatedProperties);
      }

      if (rule.propertyCategories && rule.propertyCategories.length > 0) {
        Object.assign(categories, mapPropertyCategories(rule.propertyCategories));
      }

      const hasCategories = Object.keys(categories).length > 0;
      if (!relatedProperties && !calculatedFields && !hasCategories) {
        return undefined;
      }
      return { relatedProperties, calculatedFields, categories: hasCategories ? categories : undefined };
    },
  };
}

/**
 * Returns `true` if `version` is at or above `minVersion` (inclusive).
 * Comparison order: write > read > minor.
 */
function isVersionAtLeast(version: EC.SchemaVersion, minVersion: string): boolean {
  const [minRead, minWrite, minMinor] = minVersion.split(".").map(Number);
  if (version.write !== minWrite) {
    return version.write > minWrite;
  }
  if (version.read !== minRead) {
    return version.read > minRead;
  }
  return version.minor >= minMinor;
}

/**
 * Returns `true` if `version` is strictly below `maxVersion` (exclusive).
 * Comparison order: write > read > minor.
 */
function isVersionBelow(version: EC.SchemaVersion, maxVersion: string): boolean {
  const [maxRead, maxWrite, maxMinor] = maxVersion.split(".").map(Number);
  if (version.write !== maxWrite) {
    return version.write < maxWrite;
  }
  if (version.read !== maxRead) {
    return version.read < maxRead;
  }
  return version.minor < maxMinor;
}

/**
 * Returns `true` if all required schemas are present in the iModel and satisfy the version constraints.
 */
async function checkRequiredSchemas(
  imodelAccess: ECSchemaProvider,
  requiredSchemas: PresentationRules.RequiredSchemaSpecification[] | undefined,
): Promise<boolean> {
  if (!requiredSchemas || requiredSchemas.length === 0) {
    return true;
  }
  for (const req of requiredSchemas) {
    const schema = await imodelAccess.getSchema(req.name);
    if (!schema) {
      return false;
    }
    if (req.minVersion && !isVersionAtLeast(schema.version, req.minVersion)) {
      return false;
    }
    if (req.maxVersion && !isVersionBelow(schema.version, req.maxVersion)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns `true` if the target's primary class is or derives from the given class spec.
 * When `classSpec` is `undefined` the rule applies to all classes.
 */
async function matchesClass(
  imodelAccess: ECClassHierarchyInspector,
  target: ContentTarget,
  classSpec: PresentationRules.SingleSchemaClassSpecification | undefined,
): Promise<boolean> {
  if (!classSpec) {
    return true;
  }
  return imodelAccess.classDerivesFrom(target.primaryClass, `${classSpec.schemaName}.${classSpec.className}`);
}

// ── Task 4: Relationship path mapping ────────────────────────────────────────

/**
 * Stub: returns the expression unchanged.
 * TODO: Implement proper ECExpression → ECSQL translation.
 */
function convertECExpressionToECSql(expression: string): string {
  // TODO: Implement proper ECExpression → ECSQL conversion.
  return expression;
}

/** Returns the display label of a class. */
async function getClassLabel(imodelAccess: ECSchemaProvider, className: EC.FullClassName): Promise<string> {
  const cls = await getClass(imodelAccess, className);
  return cls.label ?? cls.name;
}

/**
 * Extracts a plain string category ID from a `CategoryIdentifier`.
 * Returns `undefined` for non-string forms and `None`. Throws on types `DefaultParent`, `Root`.
 */
function resolveCategoryId(id: PresentationRules.PropertySpecification["categoryId"]): string | undefined {
  if (id === undefined) {
    return undefined;
  }
  if (typeof id === "string") {
    return id;
  }
  if (id.type === "Id") {
    return id.categoryId;
  }
  return undefined;
}

/**
 * Normalizes the deprecated `propertyNames` field into the shape accepted by `mapPropertiesForStep`.
 * Returns `undefined` when `propertyNames` is not set.
 */
function normalizePropertyNames(
  propertyNames: PresentationRules.RelatedPropertiesSpecification["propertyNames"],
): PresentationRules.RelatedPropertiesSpecification["properties"] | undefined {
  if (propertyNames === undefined) {
    return undefined;
  }
  if (propertyNames === "_none_") {
    return "_none_";
  }
  if (propertyNames === "*") {
    return "*";
  }
  if (Array.isArray(propertyNames)) {
    return propertyNames;
  }
  // Comma-separated string
  return propertyNames
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

/**
 * Maps a `properties` / `relationshipProperties` value to the shape expected by
 * `StepPropertySpec.target` / `StepPropertySpec.relationship`.
 * Returns `undefined` when no customization is needed (pipeline defaults apply).
 */
function mapPropertiesForStep(
  props: PresentationRules.RelatedPropertiesSpecification["properties"],
  forceCategoryId: CategoryDefinition["id"] | undefined,
): StepPropertySpec["target"] {
  const overrides: ClassPropertySpec["overrides"] = {};
  let select: ClassPropertySpec["select"];
  let defaultOverridesFromWildcard: (typeof overrides)[string] | undefined;

  if (props === "_none_") {
    select = "none";
  } else if (props === "*") {
    select = "all";
  } else if (Array.isArray(props)) {
    const include: string[] = [];
    let selectAll = false;
    for (const p of props) {
      if (typeof p === "string") {
        if (p === "*") {
          selectAll = true;
        } else {
          include.push(p);
        }
      } else {
        const spec = p;
        const catId = resolveCategoryId(spec.categoryId);
        const override: (typeof overrides)[string] = {};
        if (spec.labelOverride !== undefined) {
          override.label = spec.labelOverride;
        }
        if (catId !== undefined) {
          override.categoryId = catId;
        }
        if (spec.isDisplayed === false) {
          override.hidden = true;
        }
        if (spec.isReadOnly !== undefined) {
          override.readOnly = spec.isReadOnly;
        }
        if (spec.name === "*") {
          selectAll = true;
          if (Object.keys(override).length > 0) {
            defaultOverridesFromWildcard = override;
          }
        } else {
          include.push(spec.name);
          if (Object.keys(override).length > 0) {
            overrides[spec.name] = override;
          }
        }
      }
    }
    if (selectAll) {
      select = "all";
    } else {
      select = { include };
    }
  }

  if (
    select === undefined &&
    !forceCategoryId &&
    !defaultOverridesFromWildcard &&
    Object.keys(overrides).length === 0
  ) {
    return undefined;
  }

  // Merge wildcard overrides with forceCategoryId into defaultOverrides.
  let defaultOverrides: (typeof overrides)[string] | undefined;
  if (forceCategoryId !== undefined) {
    defaultOverrides = { ...defaultOverridesFromWildcard, categoryId: forceCategoryId };
  }

  return { select, defaultOverrides, overrides: Object.keys(overrides).length > 0 ? overrides : undefined };
}

/**
 * Maps a single `RelatedPropertiesSpecification` (excluding `nestedRelatedProperties`,
 * which is handled in Task 4a) to a `RelatedPropertiesDeclaration` plus any
 * per-step `CategoryDefinition`s produced by `forceCreateRelationshipCategory`.
 *
 * @param sourceClassName - Full class name of the source for the first path step.
 * @param parentCategoryId - Category ID of the parent scope (used when flattening nested specs).
 */
async function mapRelatedPropertiesSpec(props: {
  imodelAccess: ECSchemaProvider;
  spec: PresentationRules.RelatedPropertiesSpecification;
  sourceClassName: EC.FullClassName;
  parentCategoryId?: CategoryDefinition["id"];
}): Promise<{
  declaration: RelatedPropertiesDeclaration;
  categories: Record<CategoryDefinition["id"], CategoryDefinition>;
  targetCategoryId: CategoryDefinition["id"];
}> {
  const { imodelAccess, spec, sourceClassName, parentCategoryId } = props;
  const steps = Array.isArray(spec.propertiesSource) ? spec.propertiesSource : [spec.propertiesSource];
  const path: RelationshipPath = [];
  const categories: Record<CategoryDefinition["id"], CategoryDefinition> = {};
  let currentSourceClassName = sourceClassName;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isLastStep = i === steps.length - 1;

    // Determine targetClassName from the step spec or by looking up the relationship in the schema.
    let targetClassName: EC.FullClassName;
    if (step.targetClass) {
      targetClassName = `${step.targetClass.schemaName}.${step.targetClass.className}`;
    } else {
      const relClassName: EC.FullClassName = `${step.relationship.schemaName}.${step.relationship.className}`;
      const relClass = await getClass(imodelAccess, relClassName);
      if (!relClass.isRelationshipClass()) {
        throw new Error(`"${relClassName}" is not a relationship class`);
      }
      const constraint = step.direction === "Forward" ? relClass.target : relClass.source;
      const constraintClass = await constraint.abstractConstraint;
      if (!constraintClass) {
        throw new Error(`Cannot determine target class for relationship "${relClassName}"`);
      }
      targetClassName = constraintClass.fullName;
    }

    path.push({
      sourceClassName: currentSourceClassName,
      targetClassName,
      relationshipName: `${step.relationship.schemaName}.${step.relationship.className}`,
      relationshipReverse: step.direction === "Backward",
      instanceFilter:
        isLastStep && spec.instanceFilter ? { expression: convertECExpressionToECSql(spec.instanceFilter) } : undefined,
    });

    currentSourceClassName = targetClassName;
  }

  // Always create a target category for the last step's target class.
  const baseId = CategoryDefinition.computeId({ path });
  const targetCategory: CategoryDefinition = {
    id: `${baseId}/target`,
    label: await getClassLabel(imodelAccess, currentSourceClassName),
    parentId: parentCategoryId,
  };
  categories[targetCategory.id] = targetCategory;

  // Create a relationship category when explicitly requested or when relationship properties are actually requested.
  const hasRelationshipProperties =
    spec.relationshipProperties !== undefined &&
    spec.relationshipProperties !== "_none_" &&
    !(Array.isArray(spec.relationshipProperties) && spec.relationshipProperties.length === 0);
  let relationshipCategoryId: CategoryDefinition["id"] | undefined;
  if (spec.forceCreateRelationshipCategory || hasRelationshipProperties) {
    const lastStep = steps[steps.length - 1];
    const relationshipCategory: CategoryDefinition = {
      id: `${baseId}/rel`,
      label: await getClassLabel(
        imodelAccess,
        `${lastStep.relationship.schemaName}.${lastStep.relationship.className}`,
      ),
      parentId: parentCategoryId,
    };
    categories[relationshipCategory.id] = relationshipCategory;
    targetCategory.parentId = relationshipCategory.id;
    relationshipCategoryId = relationshipCategory.id;
  }

  const targetSpec = mapPropertiesForStep(
    spec.properties ?? normalizePropertyNames(spec.propertyNames),
    targetCategory.id,
  );
  const relSpec = mapPropertiesForStep(spec.relationshipProperties, relationshipCategoryId);

  return {
    declaration: { path, properties: [{ stepIndex: steps.length - 1, target: targetSpec, relationship: relSpec }] },
    categories,
    targetCategoryId: targetCategory.id,
  };
}

/**
 * Recursively flattens a `RelatedPropertiesSpecification` and all its `nestedRelatedProperties`
 * into a flat list of `RelatedPropertiesDeclaration`s. Nested specs produce declarations whose
 * paths are the concatenation of the parent's path + the nested spec's own path.
 */
async function flattenRelatedPropertiesSpecs(props: {
  imodelAccess: ECSchemaProvider;
  specs: PresentationRules.RelatedPropertiesSpecification[];
  sourceClassName: EC.FullClassName;
  parentCategoryId?: CategoryDefinition["id"];
}): Promise<{
  declarations: RelatedPropertiesDeclaration[];
  categories: Record<CategoryDefinition["id"], CategoryDefinition>;
}> {
  const { imodelAccess, specs, sourceClassName, parentCategoryId } = props;
  const declarations: RelatedPropertiesDeclaration[] = [];
  const categories: Record<CategoryDefinition["id"], CategoryDefinition> = {};

  for (const spec of specs) {
    const result = await mapRelatedPropertiesSpec({ imodelAccess, spec, sourceClassName, parentCategoryId });
    Object.assign(categories, result.categories);
    declarations.push(result.declaration);

    // Recursively flatten nestedRelatedProperties.
    if (spec.nestedRelatedProperties && spec.nestedRelatedProperties.length > 0) {
      // The nested specs start from where this spec's path ends.
      const lastTargetClassName = result.declaration.path[result.declaration.path.length - 1].targetClassName;

      const nested = await flattenRelatedPropertiesSpecs({
        imodelAccess,
        specs: spec.nestedRelatedProperties,
        sourceClassName: lastTargetClassName,
        parentCategoryId: result.targetCategoryId,
      });
      Object.assign(categories, nested.categories);

      // Prepend the parent's path to each nested declaration.
      for (const nestedDecl of nested.declarations) {
        declarations.push({ ...nestedDecl, path: [...result.declaration.path, ...nestedDecl.path] });
      }
    }
  }

  return { declarations, categories };
}

// ── Task 5: Calculated fields mapping ────────────────────────────────────────

const CALC_TYPE_MAP: Record<
  NonNullable<PresentationRules.CalculatedPropertiesSpecification["type"]>,
  PrimitiveValueDescriptor["type"]
> = { int: "Integer", long: "Long", double: "Double", bool: "Boolean", ["string"]: "String" };

/**
 * Maps an array of `CalculatedPropertiesSpecification` into `CalculatedFieldDeclaration[]`.
 * Generates a stable `id` for each field based on its index.
 */
function mapCalculatedProperties(
  specs: PresentationRules.CalculatedPropertiesSpecification[],
): CalculatedFieldDeclaration[] {
  return specs.map((spec, i) => ({
    id: `calc_${i}`,
    label: spec.label,
    expression: convertECExpressionToECSql(spec.value),
    type: { kind: "primitive", type: CALC_TYPE_MAP[spec.type ?? "string"] } satisfies ValueDescriptor,
    categoryId: resolveCategoryId(spec.categoryId),
  }));
}

// ── Task 6: Category mapping ─────────────────────────────────────────────────

/**
 * Maps an array of `PropertyCategorySpecification` into a `Record<id, CategoryDefinition>`.
 */
function mapPropertyCategories(
  specs: PresentationRules.PropertyCategorySpecification[],
): Record<CategoryDefinition["id"], CategoryDefinition> {
  const categories: Record<CategoryDefinition["id"], CategoryDefinition> = {};
  for (const spec of specs) {
    const cat: CategoryDefinition = {
      id: spec.id,
      label: spec.label,
      parentId: resolveCategoryId(spec.parentId),
      description: spec.description,
    };
    categories[cat.id] = cat;
  }
  return categories;
}

/** Deterministic hash of a string (FNV-1a, 32-bit). Returns an 8-char hex string. */
function hashString(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Produces a stable JSON representation with sorted keys for hashing. */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}
