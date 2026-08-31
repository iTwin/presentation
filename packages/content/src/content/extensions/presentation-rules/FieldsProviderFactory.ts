/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { getClassLabel, stableStringify } from "../../InternalUtils.js";
import { CategoryDefinition } from "../../model/Category.js";
import { hashString } from "../../model/Utils.js";
import { convertECExpressionToECSql } from "../ecexpressions/ECExpressionToECSql.js";
import { checkRequiredSchemas, classMatchesSpec, mapPropertyCategories, resolveCategoryId } from "./Utils.js";

import type {
  EC,
  ECSchemaProvider,
  PrimitiveValueDescriptor,
  RelationshipPath,
  ValueDescriptor,
} from "@itwin/presentation-shared";
import type { ClassPropertySpec, StepPropertySpec } from "../../model/PropertySpec.js";
import type { IModelFieldsProvider } from "../IModelFieldsProvider.js";
import type * as PresentationRules from "./PresentationRules.js";

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
 */
interface CreateFieldsProviderFromContentModifierRuleProps {
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
 * - Maps `rule.applyOnNestedContent` onto the provider's `applyRecursively` — mirroring native
 *   `ContentModifier.applyOnNestedContent`, this lets the rule's `relatedProperties` (only)
 *   additionally apply on nested-content anchors reached by any resolved related-properties path, not
 *   just the original content target.
 * - Returns `undefined` when the rule produces no fields or categories.
 */
export function createFieldsProviderFromContentModifierRule(
  props: CreateFieldsProviderFromContentModifierRuleProps,
): IModelFieldsProvider {
  const { rule } = props;
  return {
    id: `FieldsProviderFromContentModifierRule_${hashString(stableStringify(rule)).padStart(8, "0")}_v${FACTORY_VERSION}`,
    priority: rule.priority,
    applyRecursively: rule.applyOnNestedContent,
    async getContribution({ imodelAccess, target }) {
      if (!(await checkRequiredSchemas(imodelAccess, rule.requiredSchemas))) {
        return undefined;
      }
      if (!(await classMatchesSpec(imodelAccess, target.primaryClass, rule.class))) {
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
        calculatedFields = await mapCalculatedProperties(rule.calculatedProperties);
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

// ── Relationship path mapping ────────────────────────────────────────

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
  let select: ClassPropertySpec["select"] | undefined;
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

  return {
    select: select ?? "all",
    defaultOverrides,
    overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  };
}

/**
 * A `RelatedPropertiesSpecification` with the relationship path resolved to `propertiesSource`.
 * The deprecated relationship attributes are normalized into `propertiesSource` before mapping (see
 * `normalizeRelatedPropertiesSpecs`).
 */
interface NormalizedRelatedPropertiesSpec {
  propertiesSource: PresentationRules.RelationshipPathSpecification;
  instanceFilter?: string;
  nestedRelatedProperties?: PresentationRules.RelatedPropertiesSpecification[];
  properties?: PresentationRules.RelatedPropertiesSpecification["properties"];
  relationshipProperties?: PresentationRules.RelatedPropertiesSpecification["relationshipProperties"];
  forceCreateRelationshipCategory?: boolean;
  propertyNames?: PresentationRules.RelatedPropertiesSpecification["propertyNames"];
}

/**
 * Maps a single `NormalizedRelatedPropertiesSpec` (excluding its `nestedRelatedProperties`, which are
 * handled by `flattenRelatedPropertiesSpecs`) to a `RelatedPropertiesDeclaration` and the
 * `CategoryDefinition`s it produces: a target category for the last step's target class, plus a
 * relationship category when `forceCreateRelationshipCategory` is set or relationship properties are
 * requested.
 */
async function mapRelatedPropertiesSpec(props: {
  imodelAccess: ECSchemaProvider;
  spec: NormalizedRelatedPropertiesSpec;
  /** Full class name of the source for the first path step */
  sourceClassName: EC.FullClassNameDotNotation;
  /** Category of the parent scope, used when flattening nested specs */
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
    let targetClassName: EC.FullClassNameDotNotation;
    if (step.targetClass) {
      targetClassName = `${step.targetClass.schemaName}.${step.targetClass.className}`;
    } else {
      const relClassName: EC.FullClassNameDotNotation = `${step.relationship.schemaName}.${step.relationship.className}`;
      const relClass = await getClass(imodelAccess, relClassName);
      if (!relClass.isRelationshipClass()) {
        throw new Error(`"${relClassName}" is not a relationship class`);
      }
      const constraint = step.direction === "Forward" ? relClass.target : relClass.source;
      const constraintClass = constraint.abstractConstraint;
      if (!constraintClass) {
        throw new Error(`Cannot determine target class for relationship "${relClassName}"`);
      }
      targetClassName = constraintClass.fullName;
    }

    let instanceFilter: RelationshipPath[number]["instanceFilter"];
    if (isLastStep && spec.instanceFilter) {
      const { ecsql, bindings } = await convertECExpressionToECSql({ expression: spec.instanceFilter });
      instanceFilter = { expression: ecsql, ...(bindings ? { bindings } : undefined) };
    }

    path.push({
      sourceClassName: currentSourceClassName,
      targetClassName,
      relationshipName: `${step.relationship.schemaName}.${step.relationship.className}`,
      relationshipReverse: step.direction === "Backward",
      instanceFilter,
    });

    currentSourceClassName = targetClassName;
  }

  // Always create a target category for the last step's target class.
  const baseId = CategoryDefinition.computeId({ path });
  const targetCategory: CategoryDefinition = {
    id: `${baseId}/target`,
    label: await getClassLabel({ imodelAccess, className: currentSourceClassName }),
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
      label: await getClassLabel({
        imodelAccess,
        className: `${lastStep.relationship.schemaName}.${lastStep.relationship.className}`,
      }),
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
  sourceClassName: EC.FullClassNameDotNotation;
  parentCategoryId?: CategoryDefinition["id"];
}): Promise<{
  declarations: RelatedPropertiesDeclaration[];
  categories: Record<CategoryDefinition["id"], CategoryDefinition>;
}> {
  const { imodelAccess, specs, sourceClassName, parentCategoryId } = props;
  const declarations: RelatedPropertiesDeclaration[] = [];
  const categories: Record<CategoryDefinition["id"], CategoryDefinition> = {};

  for (const spec of specs) {
    for (const normalizedSpec of normalizeRelatedPropertiesSpec(spec)) {
      const result = await mapRelatedPropertiesSpec({
        imodelAccess,
        spec: normalizedSpec,
        sourceClassName,
        parentCategoryId,
      });
      Object.assign(categories, result.categories);
      declarations.push(result.declaration);

      // Recursively flatten nestedRelatedProperties.
      if (normalizedSpec.nestedRelatedProperties && normalizedSpec.nestedRelatedProperties.length > 0) {
        // The nested specs start from where this spec's path ends.
        const lastTargetClassName = result.declaration.path[result.declaration.path.length - 1].targetClassName;

        const nested = await flattenRelatedPropertiesSpecs({
          imodelAccess,
          specs: normalizedSpec.nestedRelatedProperties,
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
  }

  return { declarations, categories };
}

/**
 * Normalizes a `RelatedPropertiesSpecification` into one or more `NormalizedRelatedPropertiesSpec`s
 * whose relationship path is always expressed via `propertiesSource`.
 *
 * Specs that already use `propertiesSource` are returned unchanged. Specs that use the deprecated
 * `relationships` / `relationshipClassNames` + `relatedClasses` / `relatedClassNames` +
 * `requiredDirection` attributes are expanded into a single-step `propertiesSource` per combination of
 * relationship class × target class × direction, where `requiredDirection` of `"Both"` (or omitted)
 * expands into both `"Forward"` and `"Backward"`.
 */
function normalizeRelatedPropertiesSpec(
  spec: PresentationRules.RelatedPropertiesSpecification,
): NormalizedRelatedPropertiesSpec[] {
  // Current form: the relationship path is already expressed via `propertiesSource`.
  if (spec.propertiesSource !== undefined) {
    return [spec];
  }

  const common: Omit<NormalizedRelatedPropertiesSpec, "propertiesSource"> = {
    instanceFilter: spec.instanceFilter,
    nestedRelatedProperties: spec.nestedRelatedProperties,
    properties: spec.properties,
    relationshipProperties: spec.relationshipProperties,
    forceCreateRelationshipCategory: spec.forceCreateRelationshipCategory,
    propertyNames: spec.propertyNames,
  };

  // `requiredDirection` defaults to "Both", which expands into both traversal directions.
  const directions: Array<"Forward" | "Backward"> =
    spec.requiredDirection === "Forward" || spec.requiredDirection === "Backward"
      ? [spec.requiredDirection]
      : ["Forward", "Backward"];

  const relationships = resolveDeprecatedClasses(spec.relationships, spec.relationshipClassNames);
  if (relationships.length === 0) {
    throw new Error(
      `\`relationships\` or \`relationshipClassNames\` must be specified when \`propertiesSource\` is not used`,
    );
  }

  const relatedClasses = resolveDeprecatedClasses(spec.relatedClasses, spec.relatedClassNames);
  // When no target class is specified, the target is derived from the relationship constraint.
  const targetClasses: Array<PresentationRules.SingleSchemaClassSpecification | undefined> =
    relatedClasses.length > 0 ? relatedClasses : [undefined];

  const result: NormalizedRelatedPropertiesSpec[] = [];
  for (const relationship of relationships) {
    for (const targetClass of targetClasses) {
      for (const direction of directions) {
        result.push({ ...common, propertiesSource: { relationship, direction, targetClass } });
      }
    }
  }
  return result;
}

/**
 * Resolves the deprecated relationship/related-class specifiers into a flat list of single-class
 * specifications. Prefers the structured `MultiSchemaClassesSpecification` form and falls back to the
 * legacy string form (`{schemaName1}:{className1},{className2};{schemaName2}:{className3},...`).
 */
function resolveDeprecatedClasses(
  structured:
    | PresentationRules.MultiSchemaClassesSpecification
    | PresentationRules.MultiSchemaClassesSpecification[]
    | undefined,
  stringForm: string | undefined,
): PresentationRules.SingleSchemaClassSpecification[] {
  if (structured !== undefined) {
    const specs = Array.isArray(structured) ? structured : [structured];
    return specs.flatMap((s) => s.classNames.map((className) => ({ schemaName: s.schemaName, className })));
  }
  if (stringForm !== undefined) {
    return parseClassNamesString(stringForm);
  }
  return [];
}

/**
 * Parses the legacy class names string format
 * `{schemaName1}:{className1},{className2};{schemaName2}:{className3},...` into a list of single-class
 * specifications.
 */
function parseClassNamesString(value: string): PresentationRules.SingleSchemaClassSpecification[] {
  const result: PresentationRules.SingleSchemaClassSpecification[] = [];
  for (const group of value.split(";")) {
    const trimmedGroup = group.trim();
    if (trimmedGroup.length === 0) {
      continue;
    }
    const separatorIndex = trimmedGroup.indexOf(":");
    if (separatorIndex < 0) {
      throw new Error(
        `Invalid class names string "${value}". Expected format: "{schemaName}:{className1},{className2};...".`,
      );
    }
    const [schemaName, classNamesStr] = trimmedGroup.split(":");
    const schemaNameTrimmed = schemaName.trim();
    for (const className of classNamesStr.split(",")) {
      const trimmedClassName = className.trim();
      if (trimmedClassName.length > 0) {
        result.push({ schemaName: schemaNameTrimmed, className: trimmedClassName });
      }
    }
  }
  return result;
}

// ── Calculated fields mapping ────────────────────────────────────────

const CALC_TYPE_MAP: Record<
  NonNullable<PresentationRules.CalculatedPropertiesSpecification["type"]>,
  PrimitiveValueDescriptor["type"]
> = { int: "Integer", long: "Long", double: "Double", bool: "Boolean", ["string"]: "String" };

/**
 * Maps an array of `CalculatedPropertiesSpecification` into `CalculatedFieldDeclaration[]`.
 * Generates a stable `id` for each field based on its index.
 */
async function mapCalculatedProperties(
  specs: PresentationRules.CalculatedPropertiesSpecification[],
): Promise<CalculatedFieldDeclaration[]> {
  return Promise.all(
    specs.map(async (spec, i) => {
      const { ecsql, bindings } = await convertECExpressionToECSql({ expression: spec.value });
      return {
        id: `calc_${i}`,
        label: spec.label,
        expression: ecsql,
        ...(bindings ? { bindings } : undefined),
        type: { kind: "primitive", type: CALC_TYPE_MAP[spec.type ?? "string"] } satisfies ValueDescriptor,
        categoryId: resolveCategoryId(spec.categoryId),
      };
    }),
  );
}
