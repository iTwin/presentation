/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { CategoryDefinition } from "../model/Category.js";
import { collectClassPropertyFields } from "./ClassPropertyFields.js";

import type { EC, ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { IModelFieldsProvider, RelatedPropertiesDeclaration } from "../extensions/IModelFieldsProvider.js";
import type { PropertyField } from "../model/Field.js";
import type { ClassPropertySpec, StepPropertySpec } from "../model/PropertySpec.js";
import type { GetContribution } from "./ContributionMemoizer.js";

/**
 * Enumerates the **related** property fields of a content source — the properties reached by
 * navigating each of the source's resolved relationship paths.
 *
 * Each of the source's `resolvedDeclarations` links back to the provider and declaration that
 * produced it during source resolution (Stage 1). This re-reads that declaration (via
 * `getContribution`) to recover its per-step property specs, then enumerates fields for every
 * concrete path the declaration resolved to:
 *
 * - When the declaration omits `properties`, all properties of each path's final-step target class
 *   are loaded (nothing from intermediate steps or relationship classes).
 * - When `properties` is provided, only the classes explicitly named by each step's `target`
 *   (the step's target class) and `relationship` (the step's relationship class) are loaded —
 *   omitted classes and unlisted steps contribute nothing.
 *
 * A field's `pathFromTarget` is the sub-path from the content target up to and including the step
 * whose class supplies the property, and its `valueClassNames` are that step's concrete class.
 * Each field is paired with the contributing provider so the merge step can resolve cross-provider
 * metadata conflicts. Any EC schema property categories the fields reference are returned so they
 * can be registered with the descriptor's category registry.
 *
 * @internal
 */
export async function collectRelatedPropertyFields(props: {
  imodelAccess: ECSchemaProvider;
  source: ContentSource;
  getContribution: GetContribution;
  imodelFieldsProvidersById: ReadonlyMap<IModelFieldsProvider["id"], IModelFieldsProvider>;
}): Promise<{
  fields: Array<{ field: PropertyField; provider: IModelFieldsProvider }>;
  categories: CategoryDefinition[];
}> {
  const { imodelAccess, source, getContribution, imodelFieldsProvidersById } = props;
  const fields: Array<{ field: PropertyField; provider: IModelFieldsProvider }> = [];
  // Referenced schema property categories are concatenated (with possible duplicates) through the
  // helpers below and deduplicated by id here, once, at the end.
  const categories = new Map<CategoryDefinition["id"], CategoryDefinition>();
  await Promise.all(
    source.resolvedDeclarations.map(async (group) => {
      const provider = imodelFieldsProvidersById.get(group.providerId);
      if (!provider) {
        throw new Error(
          `Content configuration is missing the iModel fields provider "${group.providerId}" that resolved a related-properties declaration for target "${source.target.primaryClass}".`,
        );
      }
      const contribution = await getContribution(provider, source.target);
      const declaration = contribution?.relatedProperties?.[group.declarationIndex];
      if (!declaration) {
        throw new Error(
          `iModel fields provider "${group.providerId}" no longer returns the related-properties declaration at index ${group.declarationIndex} for target "${source.target.primaryClass}".`,
        );
      }
      const perPath = await Promise.all(
        group.paths.map(async ({ path }) =>
          createFieldsForPath({ imodelAccess, path, properties: declaration.properties }),
        ),
      );
      for (const result of perPath) {
        for (const field of result.fields) {
          fields.push({ field, provider });
        }
        for (const category of result.categories) {
          categories.set(category.id, category);
        }
      }
    }),
  );
  return { fields, categories: [...categories.values()] };
}

/** Enumerates the property fields (and referenced schema categories) of a single concrete relationship path. */
async function createFieldsForPath(props: {
  imodelAccess: ECSchemaProvider;
  path: RelationshipPath;
  properties: RelatedPropertiesDeclaration["properties"];
}): Promise<{ fields: PropertyField[]; categories: CategoryDefinition[] }> {
  const { imodelAccess, path, properties } = props;

  // Default (no per-step specs): all properties of the final step's target class.
  if (properties === undefined) {
    const lastStep = path[path.length - 1];
    return collectRelatedClassFields({
      imodelAccess,
      className: lastStep.targetClassName,
      pathFromTarget: path,
      valueClassNames: [lastStep.targetClassName],
      spec: { select: "all" },
    });
  }

  // Opt-in: only the classes explicitly named by each step's `target`/`relationship`.
  const perStep = await Promise.all(
    properties.map(async (stepSpec) => createFieldsForStep({ imodelAccess, path, stepSpec })),
  );
  return {
    fields: perStep.flatMap(({ fields }) => fields),
    categories: perStep.flatMap(({ categories }) => categories),
  };
}

/** Enumerates the target-class and relationship-class fields opted in by a single `StepPropertySpec`. */
async function createFieldsForStep(props: {
  imodelAccess: ECSchemaProvider;
  path: RelationshipPath;
  stepSpec: StepPropertySpec;
}): Promise<{ fields: PropertyField[]; categories: CategoryDefinition[] }> {
  const { imodelAccess, path, stepSpec } = props;
  const step = path[stepSpec.stepIndex];
  const pathFromTarget = path.slice(0, stepSpec.stepIndex + 1);
  const fields: PropertyField[] = [];
  const categories: CategoryDefinition[] = [];
  if (stepSpec.target) {
    const result = await collectRelatedClassFields({
      imodelAccess,
      className: step.targetClassName,
      pathFromTarget,
      valueClassNames: [step.targetClassName],
      spec: stepSpec.target,
    });
    fields.push(...result.fields);
    categories.push(...result.categories);
  }
  if (stepSpec.relationship) {
    // Known limitation: `step.relationshipName` is the *declared* relationship class — Stage 1
    // resolves concrete entity endpoints (`sourceClassName`/`targetClassName`) from the data, but
    // not the relationship class. So for a polymorphic relationship these `valueClassNames` may be
    // a non-concrete (base/abstract) relationship class rather than the concrete classes present in
    // the data. Tracked with https://github.com/iTwin/presentation/issues/1442.
    const result = await collectRelatedClassFields({
      imodelAccess,
      className: step.relationshipName,
      pathFromTarget,
      valueClassNames: [step.relationshipName],
      spec: stepSpec.relationship,
    });
    fields.push(...result.fields);
    categories.push(...result.categories);
  }
  return { fields, categories };
}

/**
 * Enumerates a related class's property fields, nesting any EC schema property categories the fields
 * reference under the class-based category of `pathFromTarget`. `collectClassPropertyFields` emits
 * schema categories top-level; re-parenting them per related path is a related-fields concern, and
 * re-scoping their ids (`${pathCategoryId}/${schemaCategoryId}`) keeps the same schema category
 * distinct under each path it is reached through.
 */
async function collectRelatedClassFields(props: {
  imodelAccess: ECSchemaProvider;
  className: EC.FullClassName;
  pathFromTarget: RelationshipPath;
  valueClassNames: EC.FullClassName[];
  spec: ClassPropertySpec;
}): Promise<{ fields: PropertyField[]; categories: CategoryDefinition[] }> {
  const { fields, categories } = await collectClassPropertyFields(props);
  if (categories.length === 0) {
    return { fields, categories };
  }
  const parentId = CategoryDefinition.computeId({ path: props.pathFromTarget });
  const nestedIdsBySchemaId = new Map<CategoryDefinition["id"], CategoryDefinition["id"]>();
  for (const category of categories) {
    const nestedId = `${parentId}/${category.id}`;
    nestedIdsBySchemaId.set(category.id, nestedId);
    category.id = nestedId;
    category.parentId = parentId;
  }
  for (const field of fields) {
    const nestedId = field.categoryId !== undefined ? nestedIdsBySchemaId.get(field.categoryId) : undefined;
    if (nestedId !== undefined) {
      field.categoryId = nestedId;
    }
  }
  return { fields, categories };
}
