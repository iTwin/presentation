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
import type { CategorizedField } from "./ClassPropertyFields.js";
import type { GetAnchorContributionFn, GetContributionFn } from "./ContributionMemoizer.js";

interface CollectCategoriesProps {
  imodelAccess: ECSchemaProvider;
  sources: ContentSource[];
  imodelFieldsProviders: IModelFieldsProvider[];
  externalFieldsProviders: ExternalFieldsProvider[];
  getContribution: GetContributionFn;
  getAnchorContribution: GetAnchorContributionFn;
  fields: CategorizedField[];
}

/**
 * Collects provider categories, resolves field placement, and materializes shared category trees.
 * Assigns each field's `categoryId` without mutating provider-owned category definitions.
 */
export async function collectCategories(
  props: CollectCategoriesProps,
): Promise<Record<CategoryDefinition["id"], CategoryDefinition>> {
  const declared = await collectDeclaredCategories(props);
  const requests = resolveFieldCategoryRequests(props.fields, declared);
  const { categories, assignments } = await materializeCategories(declared, requests, props.imodelAccess);
  for (const { field, categoryId } of assignments) {
    if (categoryId !== undefined) {
      field.categoryId = categoryId;
    }
  }
  return categories;
}

/**
 * Collects categories from source-target contributions, nested-anchor contributions, and external
 * providers. For duplicate IDs, higher provider priority wins; the first definition wins ties.
 *
 * Each nested group uses its declaring provider's contribution for the anchor class, not the source
 * target. `getAnchorContribution` is memoized by provider and anchor class, so repeated anchors share
 * one invocation. The returned map retains the provider-owned definitions without modifying them.
 */
async function collectDeclaredCategories({
  sources,
  imodelFieldsProviders,
  externalFieldsProviders,
  getAnchorContribution,
  getContribution,
}: CollectCategoriesProps): Promise<Map<string, CategoryDefinition>> {
  const registry = new Map<CategoryDefinition["id"], { category: CategoryDefinition; priority: number }>();
  const imodelFieldsProvidersById = new Map(imodelFieldsProviders.map((provider) => [provider.id, provider]));

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

  return new Map([...registry].map(([id, { category }]) => [id, category]));
}

type CategoryRequest =
  | { kind: "declared"; id: string }
  | { kind: "class"; id: string; className: EC.FullClassNameDotNotation; parent?: CategoryRequest }
  | {
      kind: "propertyCategory";
      id: string;
      propertyCategoryName: EC.FullClassNameDotNotation;
      label: string;
      parent?: CategoryRequest;
    };

interface FieldCategoryRequest {
  field: PropertyField;
  category?: CategoryRequest;
}

/**
 * Resolves each field's category and parent chain into requests without assigning field category IDs.
 * Overrides reference declared categories; other fields request class or property categories according
 * to their anchor, scope, and enclosing context. Matching declared IDs take precedence over generation.
 *
 * Requests describe placement before equivalent categories are shared and their final IDs are chosen.
 */
function resolveFieldCategoryRequests(
  fields: CategorizedField[],
  declared: ReadonlyMap<string, CategoryDefinition>,
): FieldCategoryRequest[] {
  const requestAnchor = (
    path: RelationshipPath,
    kind: "targetClass" | "relationshipClass",
    parent: CategoryRequest | undefined,
  ): CategoryRequest => {
    const id = CategoryDefinition.computeId({ path, omitTargetClass: kind === "relationshipClass" });
    if (declared.has(id)) {
      return { kind: "declared", id };
    }
    const lastStep = path[path.length - 1];
    const className = kind === "targetClass" ? lastStep.targetClassName : lastStep.relationshipName;
    return { kind: "class", id, className, parent };
  };

  return fields.map(({ field, categorization }) => {
    const { category, propertyCategoryScope, categoryContext } = categorization;
    if (category?.source === "override") {
      return { field, category: { kind: "declared", id: category.id } };
    }
    let anchor: CategoryRequest | undefined;
    for (const context of categoryContext) {
      anchor = requestAnchor(field.pathFromTarget.slice(0, context.stepIndex + 1), context.kind, anchor);
    }
    if (
      categorization.anchor !== "none" &&
      !(propertyCategoryScope === "parent" && category?.source === "propertyCategory")
    ) {
      anchor = requestAnchor(field.pathFromTarget, categorization.anchor, anchor);
    }
    if (category?.source !== "propertyCategory") {
      return { field, category: anchor };
    }
    const id = anchor ? `${anchor.id}/${category.id}` : category.id;
    return {
      field,
      category: declared.has(id)
        ? { kind: "declared", id }
        : { kind: "propertyCategory", id, propertyCategoryName: category.id, label: category.label, parent: anchor },
    };
  });
}

/**
 * Turns field requests into category definitions and field assignments. Automatic target-class,
 * relationship-class, and property categories share an entry when their fully qualified names and
 * shared parents match. Different paths to the same schema item can share; identically named items
 * from different schemas cannot. Labels do not determine identity. Declared categories share by ID
 * and remain separate from automatic entries.
 *
 * The request with the lexicographically smallest ID supplies the shared entry's explicit label or
 * class name for label lookup. Equal IDs retain the first request. This is a tie-breaking rule, not
 * a preference for a particular schema, category origin, or label. Final IDs account for shared parents
 * and distinguish the same path requested under different parents.
 *
 * Resolves class labels and remaps references to shared categories, cloning declared definitions so
 * provider-owned objects remain unchanged. Returns assignments without mutating the fields.
 */
async function materializeCategories(
  declared: ReadonlyMap<string, CategoryDefinition>,
  requests: FieldCategoryRequest[],
  imodelAccess: ECSchemaProvider,
) {
  interface SharedCategory {
    index: number;
    request: CategoryRequest;
    parent?: SharedCategory;
    id?: string;
  }
  const shared = new Map<string, SharedCategory>();
  const aliases = new Map<string, Set<SharedCategory>>();
  const getOrCreateSharedCategory = (request: CategoryRequest): SharedCategory => {
    const parent =
      request.kind !== "declared" && request.parent ? getOrCreateSharedCategory(request.parent) : undefined;
    const key = JSON.stringify(
      request.kind === "declared"
        ? ["declared", request.id]
        : ["automatic", request.kind === "class" ? request.className : request.propertyCategoryName, parent?.index],
    );
    let entry = shared.get(key);
    if (!entry) {
      entry = { index: shared.size, request, parent };
      shared.set(key, entry);
    } else if (request.id < entry.request.id) {
      entry.request = request;
    }
    if (request.kind !== "declared") {
      const entries = aliases.get(request.id) ?? new Set<SharedCategory>();
      entries.add(entry);
      aliases.set(request.id, entries);
    }
    return entry;
  };
  const placements = requests.map(({ field, category }) => ({
    field,
    category: category && getOrCreateSharedCategory(category),
  }));
  const resolveCategoryId = (entry: SharedCategory): string => {
    if (entry.id === undefined) {
      const { request, parent } = entry;
      if (parent && request.kind === "propertyCategory") {
        entry.id = `${resolveCategoryId(parent)}/${request.propertyCategoryName}`;
      } else if (parent && request.kind === "class" && aliases.get(request.id)!.size > 1) {
        entry.id = `${resolveCategoryId(parent)}/${request.id}`;
      } else {
        entry.id = request.id;
      }
    }
    return entry.id;
  };
  // Redirect references to automatic categories merged under another ID; declared and unknown IDs stay unchanged.
  const remapCategoryReference = (id: string) => {
    if (declared.has(id) || !aliases.has(id)) {
      return id;
    }
    const ids = [...aliases.get(id)!].map(resolveCategoryId).sort();
    return ids.includes(id) ? id : ids[0];
  };
  const categories = Object.fromEntries(
    [...declared].map(([id, category]) => [
      id,
      {
        ...category,
        ...(category.parentId !== undefined ? { parentId: remapCategoryReference(category.parentId) } : undefined),
      },
    ]),
  );
  await Promise.all(
    [...shared.values()].map(async (entry) => {
      const { request, parent } = entry;
      const id = resolveCategoryId(entry);
      if (request.kind === "declared" || declared.has(id)) {
        return;
      }
      categories[id] = {
        id,
        label:
          request.kind === "propertyCategory"
            ? request.label
            : await getClassLabel({ imodelAccess, className: request.className }),
        ...(parent ? { parentId: resolveCategoryId(parent) } : undefined),
      };
    }),
  );
  return {
    categories,
    assignments: placements.map(({ field, category }) => ({
      field,
      categoryId:
        category &&
        (category.request.kind === "declared"
          ? remapCategoryReference(resolveCategoryId(category))
          : resolveCategoryId(category)),
    })),
  };
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
