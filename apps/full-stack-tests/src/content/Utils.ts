/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContentProvider, PropertyField, resolveContentSources } from "@itwin/presentation-content";
import {
  createECSchemaProvider as createECSchemaProviderInterop,
  createECSqlQueryExecutor,
} from "@itwin/presentation-core-interop";
import { unifyIModelAPIs } from "../IModelUtils.js";

import type { ECDb, IModelDb } from "@itwin/core-backend";
import type { IModelConnection } from "@itwin/core-frontend";
import type {
  CalculatedField,
  ContentConfiguration,
  ContentTarget,
  ExternalField,
  Field,
} from "@itwin/presentation-content";
import type { RelationshipPath } from "@itwin/presentation-shared";

/**
 * Builds the `imodelAccess` object (schema provider + ECSQL query executor)
 * required by the content pipeline APIs.
 */
export function createContentIModelAccess(imodel: IModelConnection | IModelDb | ECDb) {
  const schemaProvider = createECSchemaProviderInterop(unifyIModelAPIs(imodel));
  const queryExecutor = createECSqlQueryExecutor(imodel);
  return { ...schemaProvider, ...queryExecutor };
}

export type ContentIModelAccess = ReturnType<typeof createContentIModelAccess>;

export type Descriptor = Awaited<ReturnType<ReturnType<typeof createContentProvider>["getContentDescriptor"]>>;

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

/**
 * Returns the property fields whose resolved `pathFromTarget` matches the given path (an empty path,
 * the default, means the direct/target-class fields). A field is considered to be on `path` when
 * recomputing its ID with that path (via `PropertyField.computeId`) reproduces the field's own ID —
 * i.e. the field's canonical path serialization equals `path`'s. Use this to distinguish related
 * fields that share a property name but reach it via different paths.
 */
export function getPropertyFieldsByPath(descriptor: Descriptor, path: RelationshipPath = []): PropertyField[] {
  return getPropertyFields(descriptor).filter(
    (f) =>
      f.id ===
      PropertyField.computeId({
        propertyClassName: f.propertyClassName,
        propertyName: f.propertyName,
        pathFromTarget: path,
      }),
  );
}

/**
 * Returns the *visible* property fields at `path` (an empty path, the default, means the
 * direct/target-class fields) — i.e. `getPropertyFieldsByPath` filtered down to fields for which
 * `!field.hidden`. Schema-hidden fields are intentionally excluded here: this helper backs test
 * assertions that only care about a descriptor's user-facing (visible) field shape, not its
 * complete (visible + hidden) contents.
 */
export function getVisiblePropertyFieldsByPath(descriptor: Descriptor, path: RelationshipPath = []): PropertyField[] {
  return getPropertyFieldsByPath(descriptor, path).filter((f) => !f.hidden);
}

/** Returns the direct (non-related) property fields — those with an empty `pathFromTarget`. */
export function getDirectPropertyFields(descriptor: Descriptor): PropertyField[] {
  return getPropertyFieldsByPath(descriptor, []);
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
  return getPropertyFieldsByPath(descriptor, path);
}

/**
 * Formats a relationship path compactly for use in validator error messages, e.g.
 * `"BisCore.PhysicalElement -[BisCore.ElementOwnsUniqueAspect]-> MySchema.MyUniqueAspect"`. An empty
 * path (the direct/target-class fields) formats as `"<direct>"`. Reversed steps are rendered with a
 * `<-` arrow to reflect that the step's traversal direction is opposite the relationship's own.
 */
export function formatRelationshipPath(path: RelationshipPath): string {
  if (path.length === 0) {
    return "<direct>";
  }
  const [{ sourceClassName }] = path;
  const steps = path
    .map(
      (step) =>
        `${step.relationshipReverse ? "<-" : "-"}[${step.relationshipName}]${step.relationshipReverse ? "-" : "->"} ${step.targetClassName}`,
    )
    .join(" ");
  return `${sourceClassName} ${steps}`;
}
