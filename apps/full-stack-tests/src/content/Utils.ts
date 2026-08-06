/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContentProvider, PropertyField, resolveContentSources } from "@itwin/presentation-content";
import {
  createECSchemaProvider as createECSchemaProviderInterop,
  createECSqlQueryExecutor,
} from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createSchemaContext } from "../IModelUtils.js";

import type { ECDb } from "@itwin/core-backend";
import type {
  CalculatedField,
  ContentConfiguration,
  ContentTarget,
  ExternalField,
  Field,
} from "@itwin/presentation-content";
import type { RelationshipPath } from "@itwin/presentation-shared";

/**
 * Builds the `imodelAccess` object (schema provider + class-hierarchy inspector + ECSQL query executor)
 * required by the content pipeline APIs.
 */
export function createContentIModelAccess(ecdb: ECDb) {
  const schemaProvider = createECSchemaProviderInterop(createSchemaContext(ecdb));
  const classHierarchyInspector = createCachingECClassHierarchyInspector({ schemaProvider });
  const queryExecutor = createECSqlQueryExecutor(ecdb);
  return { ...schemaProvider, ...classHierarchyInspector, ...queryExecutor };
}

export type ContentIModelAccess = ReturnType<typeof createContentIModelAccess>;

type Descriptor = Awaited<ReturnType<ReturnType<typeof createContentProvider>["getContentDescriptor"]>>;

/**
 * Convenience wrapper running the two wired pipeline stages:
 * source resolution (`resolveContentSources`) followed by descriptor building
 * (`createContentProvider(...).getContentDescriptor()`).
 */
export async function buildDescriptor(props: {
  imodelAccess: ContentIModelAccess;
  targets: ContentTarget[];
  config?: ContentConfiguration;
}): Promise<Descriptor> {
  const { imodelAccess, targets, config } = props;
  const sources = await resolveContentSources({ imodelAccess, targets, config });
  const provider = createContentProvider({ imodelAccess, sources, config });
  const descriptor = await provider.getContentDescriptor();
  return descriptor;
}

/** Returns the descriptor's fields as an array. */
export function getFields(descriptor: Descriptor): Descriptor["fields"][number][] {
  return Object.values(descriptor.fields);
}

/** Returns all property fields. */
export function getPropertyFields(descriptor: Descriptor): PropertyField[] {
  return getFields(descriptor).filter((f): f is PropertyField => f.kind === "property");
}

/** Returns all calculated fields. */
export function getCalculatedFields(descriptor: Descriptor): CalculatedField[] {
  return getFields(descriptor).filter((f): f is CalculatedField => f.kind === "calculated");
}

/** Returns all external fields. */
export function getExternalFields(descriptor: Descriptor): ExternalField[] {
  return getFields(descriptor).filter((f): f is ExternalField => f.kind === "external");
}

/** Returns all property fields matching the given property name (may span classes/paths). */
export function getPropertyFieldsByName(descriptor: Descriptor, propertyName: string): PropertyField[] {
  return getPropertyFields(descriptor).filter((f) => f.propertyName === propertyName);
}

/** Finds a single property field by property name (throws when ambiguous or missing). */
export function getPropertyFieldByName(descriptor: Descriptor, propertyName: string): PropertyField {
  const matches = getPropertyFieldsByName(descriptor, propertyName);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one property field named "${propertyName}", found ${matches.length}.`);
  }
  return matches[0];
}

/** Returns the direct (non-related) property fields — those with an empty `pathFromTarget`. */
export function getDirectPropertyFields(descriptor: Descriptor): PropertyField[] {
  return getPropertyFields(descriptor).filter((f) => f.pathFromTarget.length === 0);
}

/** Returns the related property fields — those with a non-empty `pathFromTarget`. */
export function getRelatedPropertyFields(descriptor: Descriptor): PropertyField[] {
  return getPropertyFields(descriptor).filter((f) => f.pathFromTarget.length > 0);
}

/** Finds a single calculated field by its label (throws when ambiguous or missing). */
export function getCalculatedFieldByLabel(descriptor: Descriptor, label: string): CalculatedField {
  const matches = getCalculatedFields(descriptor).filter((f) => f.label === label);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one calculated field labeled "${label}", found ${matches.length}.`);
  }
  return matches[0];
}

/** Returns the category a field is assigned to, or `undefined` when it has none. */
export function getFieldCategory(descriptor: Descriptor, field: Field) {
  return field.categoryId ? descriptor.categories[field.categoryId] : undefined;
}

/** Looks up a field by its stable ID (e.g. one produced by `PropertyField.computeId`). */
export function getFieldById(descriptor: Descriptor, id: string): Descriptor["fields"][string] | undefined {
  return descriptor.fields[id];
}

/**
 * Returns the related property fields whose resolved `pathFromTarget` matches the given path. A field
 * is considered to be on `path` when recomputing its ID with that path (via `PropertyField.computeId`)
 * reproduces the field's own ID — i.e. the field's canonical path serialization equals `path`'s. Use
 * this to distinguish related fields that share a property name but reach it via different paths.
 */
export function getRelatedPropertyFieldsByPath(descriptor: Descriptor, path: RelationshipPath): PropertyField[] {
  return getRelatedPropertyFields(descriptor).filter(
    (f) =>
      f.id === PropertyField.computeId({ propertyClassName: f.propertyClassName, propertyName: f.propertyName, pathFromTarget: path }),
  );
}

/**
 * Walks a category's parent chain and returns the categories from the given leaf up to the root
 * (i.e. `[leaf, ..., root]`). Stops when a category has no `parentId` or the parent is missing from
 * the descriptor. Use this to assert nested category hierarchies such as `[Custom > Default]`.
 */
export function getCategoryChain(descriptor: Descriptor, categoryId: string): Array<Descriptor["categories"][string]> {
  const chain: Array<Descriptor["categories"][string]> = [];
  let id: string | undefined = categoryId;
  const seen = new Set<string>();
  while (id !== undefined && !seen.has(id) && id in descriptor.categories) {
    seen.add(id);
    const category: Descriptor["categories"][string] = descriptor.categories[id];
    chain.push(category);
    id = category.parentId;
  }
  return chain;
}

/**
 * Convenience for hierarchy assertions: returns the labels of a field's category chain from leaf to
 * root (e.g. `["Custom", "Default"]`). Throws if the field has no category.
 */
export function getCategoryLabelChain(descriptor: Descriptor, field: Field): string[] {
  if (!field.categoryId) {
    throw new Error(`Expected field "${field.id}" to have a category.`);
  }
  return getCategoryChain(descriptor, field.categoryId).map((category) => category.label);
}
