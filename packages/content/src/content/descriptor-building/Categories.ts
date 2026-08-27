/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { DEFAULT_FIELDS_PROVIDER_PRIORITY } from "../extensions/BaseFieldsProvider.js";
import { collectInParallel, getClassLabel } from "../InternalUtils.js";
import { CategoryDefinition } from "../model/Category.js";

import type { EC, ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { ExternalFieldsProvider } from "../extensions/ExternalFieldsProvider.js";
import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";
import type { Field, PropertyField } from "../model/Field.js";
import type { CategorizedField, FieldCategorization } from "./ClassPropertyFields.js";
import type { GetAnchorContributionFn, GetContributionFn } from "./ContributionMemoizer.js";

/**
 * Assembles the descriptor's category registry and assigns every property field's `categoryId` — the
 * single place where categorization happens. Field enumeration only reports each field's raw
 * {@link FieldCategorization} facts; this pass turns those facts into concrete category ids, builds
 * the category tree, and wires each field to its category:
 *
 * 1. Registers every `CategoryDefinition` contributed by the configured iModel fields providers (for
 *    each source's target) and external fields providers, deduplicated by `id` (highest provider
 *    priority wins; ties keep the first seen).
 * 2. Resolves each field's `categoryId` with one precedence rule — spec override, else EC schema
 *    property category, else the field's class-based (anchor) category — and collects the class-based
 *    and schema categories that need to exist:
 *    - a **target-class** field anchors to its path category (`CategoryDefinition.computeId({ path })`,
 *      labelled by the target class); a **relationship-class** field anchors to the target-independent
 *      relationship category (`omitTargetClass`, labelled by the relationship class);
 *    - an EC schema property category nests under the field's anchor (or is top-level for a direct
 *      field), keeping the same schema category distinct under each anchor it is reached through.
 * 3. Creates those categories with the right tree edges: each class-based category nests under its
 *    nearest existing ancestor in the path's `rel_0 → tgt_0 → rel_1 → tgt_1 → …` chain — a step's
 *    target under its relationship, and each step under the previous step's target. So over
 *    `a-[ab]→b-[bc]→c`, showing `b` and `bc` properties yields `b` (top-level) with `bc` nested
 *    under it; and field-less steps are skipped. Provider-declared categories with the same id win.
 *
 * Mutates the passed `fields` (assigns `categoryId`). Categories left unreferenced are pruned later.
 *
 * @internal
 */
export async function collectCategories(props: {
  imodelAccess: ECSchemaProvider;
  sources: ContentSource[];
  imodelFieldsProviders: IModelFieldsProvider[];
  externalFieldsProviders: ExternalFieldsProvider[];
  getContribution: GetContributionFn;
  getAnchorContribution: GetAnchorContributionFn;
  fields: CategorizedField[];
}): Promise<Record<CategoryDefinition["id"], CategoryDefinition>> {
  const {
    imodelAccess,
    sources,
    imodelFieldsProviders,
    externalFieldsProviders,
    getAnchorContribution,
    getContribution,
    fields,
  } = props;
  const registry = new Map<CategoryDefinition["id"], { category: CategoryDefinition; priority: number }>();
  const imodelFieldsProvidersById = new Map(imodelFieldsProviders.map((provider) => [provider.id, provider]));

  // 1. Provider-contributed categories (higher priority wins on conflict) — from each source's own
  //    target, and from every nested anchor referenced by a `nested` declaration group. A nested
  //    group's contribution is the one its declaring provider returns for the anchor class (not the
  //    source's target); `categories` returned there apply just the same as a base contribution's do.
  //    `getAnchorContribution` is memoized per `(provider, anchor class)`, so repeated anchors across
  //    groups and sources cost a single provider invocation.
  const [contributed, nestedContributed] = await Promise.all([
    collectInParallel({
      inputs: sources,
      expand: async (source) =>
        collectInParallel({
          inputs: imodelFieldsProviders,
          expand: async (provider) => {
            const contribution = await getContribution({ provider, target: source.target });
            if (!contribution?.categories) {
              return [];
            }
            const priority = provider.priority ?? DEFAULT_FIELDS_PROVIDER_PRIORITY;
            return Object.values(contribution.categories).map((category) => ({ category, priority }));
          },
        }),
    }),
    collectInParallel({
      inputs: sources.flatMap((source) => source.resolvedDeclarations),
      expand: async (group) => {
        const provider = group.nested ? imodelFieldsProvidersById.get(group.providerId) : undefined;
        if (!group.nested || !provider) {
          return [];
        }
        const contribution = await getAnchorContribution({ provider, anchorClassName: group.nested.anchorClassName });
        if (!contribution?.categories) {
          return [];
        }
        const priority = provider.priority ?? DEFAULT_FIELDS_PROVIDER_PRIORITY;
        return Object.values(contribution.categories).map((category) => ({ category, priority }));
      },
    }),
  ]);
  const externalContributed = externalFieldsProviders.flatMap((provider) =>
    provider.categories
      ? Object.values(provider.categories).map((category) => ({
          category,
          priority: provider.priority ?? DEFAULT_FIELDS_PROVIDER_PRIORITY,
        }))
      : [],
  );
  for (const { category, priority } of [...contributed, ...nestedContributed, ...externalContributed]) {
    const existing = registry.get(category.id);
    if (!existing || priority > existing.priority) {
      registry.set(category.id, { category, priority });
    }
  }

  // 2. Resolve each field's category from its facts, collecting the class-based (target/relationship)
  //    anchor categories and schema (sub-)categories that need to exist.
  const targetAnchorPaths = new Map<CategoryDefinition["id"], RelationshipPath>();
  const relationshipAnchorPaths = new Map<CategoryDefinition["id"], RelationshipPath>();
  const schemaCategories = new Map<CategoryDefinition["id"], CategoryDefinition>();
  for (const { field, categorization } of fields) {
    const category = categorization.category;
    if (category?.source === "override") {
      // Explicit override points at a (provider) category and fully controls placement.
      field.categoryId = category.id;
      continue;
    }

    const anchorId = computeAnchorId(field, categorization);
    if (category?.source === "schema") {
      const scopedId = anchorId !== undefined ? `${anchorId}/${category.id}` : category.id;
      const schemaCategory: CategoryDefinition = { id: scopedId, label: category.label };
      if (anchorId !== undefined) {
        schemaCategory.parentId = anchorId;
      }
      schemaCategories.set(scopedId, schemaCategory);
      field.categoryId = scopedId;
    } else if (anchorId !== undefined) {
      field.categoryId = anchorId;
    } else {
      // Direct field with no schema category — it has no category.
      continue;
    }

    // The anchor category is referenced (directly or as a schema-category parent); remember to create
    // it. A direct field's schema category is top-level, so it has no anchor to record.
    if (anchorId !== undefined) {
      const anchorPaths = categorization.anchor === "relationshipClass" ? relationshipAnchorPaths : targetAnchorPaths;
      anchorPaths.set(anchorId, field.pathFromTarget);
    }
  }

  // 3. Create the referenced relationship/target categories, then the schema (sub-)categories. Each
  //    class-based category nests under its nearest existing ancestor in the path's
  //    `rel_0 → tgt_0 → rel_1 → tgt_1 → …` chain (a step's target nests under its relationship; a
  //    step nests under the previous step's target).
  const labelsToResolve: Array<{ category: CategoryDefinition; className: EC.FullClassNameDotNotation }> = [];
  const registerAnchorCategory = (
    id: CategoryDefinition["id"],
    path: RelationshipPath,
    kind: "relationship" | "target",
  ): void => {
    if (registry.has(id)) {
      return;
    }
    const category: CategoryDefinition = { id, label: "" };
    const parentId = findAnchorParentId({ path, kind, targetAnchorPaths, relationshipAnchorPaths });
    if (parentId !== undefined) {
      category.parentId = parentId;
    }
    registry.set(id, { category, priority: DEFAULT_FIELDS_PROVIDER_PRIORITY });
    const lastStep = path[path.length - 1];
    labelsToResolve.push({
      category,
      className: kind === "relationship" ? lastStep.relationshipName : lastStep.targetClassName,
    });
  };
  for (const [id, path] of relationshipAnchorPaths) {
    registerAnchorCategory(id, path, "relationship");
  }
  for (const [id, path] of targetAnchorPaths) {
    registerAnchorCategory(id, path, "target");
  }
  // Schema categories carry their own labels; register the ones not already provider-declared.
  for (const [id, category] of schemaCategories) {
    if (!registry.has(id)) {
      registry.set(id, { category, priority: DEFAULT_FIELDS_PROVIDER_PRIORITY });
    }
  }
  // The category objects registered above are the same references, so resolving labels here updates
  // them in place.
  await Promise.all(
    labelsToResolve.map(async ({ category, className }) => {
      category.label = await getClassLabel({ imodelAccess, className });
    }),
  );

  return Object.fromEntries(Array.from(registry, ([id, { category }]) => [id, category]));
}

/** The id of a field's class-based (anchor) category, or `undefined` when it has none (a direct field). */
function computeAnchorId(
  field: PropertyField,
  categorization: FieldCategorization,
): CategoryDefinition["id"] | undefined {
  switch (categorization.anchor) {
    case "none":
      return undefined;
    case "targetClass":
      return CategoryDefinition.computeId({ path: field.pathFromTarget });
    case "relationshipClass":
      return CategoryDefinition.computeId({ path: field.pathFromTarget, omitTargetClass: true });
  }
}

/**
 * Drops categories that no field references. A category is kept when a field targets it directly or
 * it is an ancestor (via `parentId`) of such a category — so a referenced category's whole parent
 * chain survives.
 *
 * @internal
 */
export function pruneUnreferencedCategories(props: {
  fields: Record<Field["id"], Field>;
  categories: Record<CategoryDefinition["id"], CategoryDefinition>;
}): Record<CategoryDefinition["id"], CategoryDefinition> {
  const { fields, categories } = props;
  const referenced = new Set<CategoryDefinition["id"]>();
  for (const field of Object.values(fields)) {
    let id: CategoryDefinition["id"] | undefined = field.categoryId;
    // Walk the parent chain, stopping at the root, an already-visited category, or a dangling
    // reference (a `categoryId`/`parentId` pointing at a category that no longer exists).
    while (id !== undefined && !referenced.has(id) && id in categories) {
      referenced.add(id);
      id = categories[id].parentId;
    }
  }
  return Object.fromEntries(Object.entries(categories).filter(([id]) => referenced.has(id)));
}

/**
 * The nearest *existing* ancestor category of a class-based (anchor) category, walking its path's
 * `rel_0 → tgt_0 → rel_1 → tgt_1 → …` chain from nearest to farthest: a target category's own
 * relationship category first, then, for each shorter path prefix, that prefix's target category
 * before its relationship category (so a step nests under the previous step's target, which nests
 * under its relationship). "Existing" means the candidate is referenced by some field (present in the
 * corresponding anchor map). Returns `undefined` when the category is top-level.
 */
function findAnchorParentId(props: {
  path: RelationshipPath;
  kind: "relationship" | "target";
  targetAnchorPaths: ReadonlyMap<CategoryDefinition["id"], RelationshipPath>;
  relationshipAnchorPaths: ReadonlyMap<CategoryDefinition["id"], RelationshipPath>;
}): CategoryDefinition["id"] | undefined {
  const { path, kind, targetAnchorPaths, relationshipAnchorPaths } = props;
  const existingAnchorId = (
    candidatePath: RelationshipPath,
    candidateKind: "relationship" | "target",
  ): CategoryDefinition["id"] | undefined => {
    const id =
      candidateKind === "target"
        ? CategoryDefinition.computeId({ path: candidatePath })
        : CategoryDefinition.computeId({ path: candidatePath, omitTargetClass: true });
    const anchorPaths = candidateKind === "target" ? targetAnchorPaths : relationshipAnchorPaths;
    return anchorPaths.has(id) ? id : undefined;
  };

  // A target category nests under its own step's relationship category first.
  if (kind === "target") {
    const relationshipId = existingAnchorId(path, "relationship");
    if (relationshipId !== undefined) {
      return relationshipId;
    }
  }
  // Then walk shorter prefixes; at each depth the target precedes the relationship in the chain.
  for (let length = path.length - 1; length >= 1; length--) {
    const prefix = path.slice(0, length);
    const targetId = existingAnchorId(prefix, "target");
    if (targetId !== undefined) {
      return targetId;
    }
    const relationshipId = existingAnchorId(prefix, "relationship");
    if (relationshipId !== undefined) {
      return relationshipId;
    }
  }
  return undefined;
}
