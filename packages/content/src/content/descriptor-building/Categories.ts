/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { DEFAULT_FIELDS_PROVIDER_PRIORITY } from "../extensions/BaseFieldsProvider.js";
import { collectInParallel } from "../InternalUtils.js";
import { CategoryDefinition } from "../model/Category.js";

import type { EC, ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";
import type { PropertyField } from "../model/Field.js";

type GetContribution = (
  provider: IModelFieldsProvider,
  target: ContentSource["target"],
) => ReturnType<IModelFieldsProvider["getContribution"]>;

/**
 * Assembles the descriptor's category registry:
 *
 * 1. Collects every `CategoryDefinition` contributed by the configured providers (for each source's
 *    target), deduplicated by `id`. When several providers declare the same `id` with different
 *    metadata, the highest-priority provider wins (ties keep the first seen).
 * 2. Auto-creates categories for **related** property fields that were not assigned a category by a
 *    provider. A category is created at each distinct field path terminal — i.e. where fields
 *    actually attach — and never at intermediate classes that carry no fields. Each such category
 *    nests (via `parentId`) under the longest *other* field-path terminal that is a prefix of it, so
 *    related groups nest by segment. For example, over the physical path `a→b→c→d`, fields attaching
 *    at `a→b` and `a→b→c→d` yield categories `b` (top-level) and `d` (nested under `b`) — no `c`
 *    category. A category's id is derived deterministically from its path (so fields reaching the
 *    same path share one) and its label is the path's terminal class display label. The field's
 *    `categoryId` is set to its full-path category.
 *
 * Mutates the passed `fields` (assigns `categoryId` to auto-categorized related fields). Categories
 * left unreferenced by any field are pruned in a later stage.
 *
 * @internal
 */
export async function collectCategories(props: {
  imodelAccess: ECSchemaProvider;
  sources: ContentSource[];
  providers: IModelFieldsProvider[];
  getContribution: GetContribution;
  fields: Record<PropertyField["id"], PropertyField>;
}): Promise<Record<CategoryDefinition["id"], CategoryDefinition>> {
  const { imodelAccess, sources, providers, getContribution, fields } = props;
  const registry = new Map<CategoryDefinition["id"], { category: CategoryDefinition; priority: number }>();

  // 1. Provider-contributed categories (higher priority wins on conflict).
  const contributed = await collectInParallel(sources, async (source) =>
    collectInParallel(providers, async (provider) => {
      const contribution = await getContribution(provider, source.target);
      if (!contribution?.categories) {
        return [];
      }
      const priority = provider.priority ?? DEFAULT_FIELDS_PROVIDER_PRIORITY;
      return Object.values(contribution.categories).map((category) => ({ category, priority }));
    }),
  );
  for (const { category, priority } of contributed) {
    const existing = registry.get(category.id);
    if (!existing || priority > existing.priority) {
      registry.set(category.id, { category, priority });
    }
  }

  // 2. Auto-create categories at each related field's path terminal, nested by segment. The distinct
  //    field paths are the "segment terminals"; a class with no fields gets no category.
  const terminals = new Map<CategoryDefinition["id"], RelationshipPath>();
  for (const field of Object.values(fields)) {
    if (field.pathFromTarget.length === 0 || field.categoryId !== undefined) {
      continue;
    }
    const id = CategoryDefinition.computeId({ path: field.pathFromTarget });
    field.categoryId = id;
    terminals.set(id, field.pathFromTarget);
  }
  const labelsToResolve: Array<{ category: CategoryDefinition; className: EC.FullClassName }> = [];
  // Process (and search for parents) longest path first, so the parent lookup can return the first
  // matching prefix — which, in this order, is guaranteed to be the longest.
  const terminalsByDepth = Array.from(terminals).sort(([, a], [, b]) => b.length - a.length);
  for (const [id, path] of terminalsByDepth) {
    if (registry.has(id)) {
      continue;
    }
    const category: CategoryDefinition = { id, label: "" };
    const parentId = findParentCategoryId(path, terminalsByDepth);
    if (parentId !== undefined) {
      category.parentId = parentId;
    }
    registry.set(id, { category, priority: DEFAULT_FIELDS_PROVIDER_PRIORITY });
    labelsToResolve.push({ category, className: path[path.length - 1].targetClassName });
  }
  // The category objects pushed above are the same references held by the registry, so resolving
  // and assigning their labels here updates the registered categories in place.
  await Promise.all(
    labelsToResolve.map(async ({ category, className }) => {
      category.label = await getClassLabel(imodelAccess, className);
    }),
  );

  return Object.fromEntries(Array.from(registry, ([id, { category }]) => [id, category]));
}

async function getClassLabel(imodelAccess: ECSchemaProvider, className: EC.FullClassName): Promise<string> {
  const cls = await getClass(imodelAccess, className);
  return cls.label ?? cls.name;
}

/**
 * Finds the id of the longest *other* segment terminal that is a proper prefix of `path` — the
 * category `path`'s category should nest under. `sortedTerminals` must be ordered longest path
 * first, so the first proper-prefix match encountered is the longest. Returns `undefined` when
 * `path` is a top-level segment (no shorter terminal precedes it).
 */
function findParentCategoryId(
  path: RelationshipPath,
  sortedTerminals: ReadonlyArray<[CategoryDefinition["id"], RelationshipPath]>,
): CategoryDefinition["id"] | undefined {
  for (const [candidateId, candidatePath] of sortedTerminals) {
    if (
      candidatePath.length < path.length &&
      CategoryDefinition.computeId({ path: path.slice(0, candidatePath.length) }) === candidateId
    ) {
      return candidateId;
    }
  }
  return undefined;
}
