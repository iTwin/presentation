/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { getOrCreate } from "./InternalUtils.js";
import { serializeRelationshipPath } from "./model/Utils.js";

import type { ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { CardinalityHint } from "./ContentTarget.js";
import type { ExternalInput } from "./definition-building/ExternalProviders.js";
import type { ContentDescriptor } from "./model/ContentDescriptor.js";

/**
 * Determines the effective cardinality of a relationship path — whether each target instance reaches
 * at most one related instance (`"one"`) or possibly many (`"many"`).
 *
 * A caller-supplied `cardinalityHint` always wins (schema multiplicity is frequently over-declared as
 * `many` where the data is effectively 1:1). Without a hint, the path is `"many"` when any step's
 * traversed constraint has an unbounded upper multiplicity limit or an upper limit greater than one, honoring
 * `relationshipReverse` to pick the constraint the traversal lands on.
 */
export async function classifyPathCardinality(props: {
  schemaProvider: ECSchemaProvider;
  path: RelationshipPath;
  cardinalityHint?: CardinalityHint;
}): Promise<CardinalityHint> {
  if (props.cardinalityHint) {
    return props.cardinalityHint;
  }
  for (const step of props.path) {
    const relationship = await getClass(props.schemaProvider, step.relationshipName);
    if (!relationship.isRelationshipClass()) {
      throw new Error(`Class ${step.relationshipName} is not a relationship class.`);
    }
    // Traversing the relationship in its declared direction lands on the `target` constraint; a
    // reversed step lands on the `source` constraint. The upper multiplicity limit of that landing
    // end says how many related instances a single source instance reaches.
    const landingConstraint = step.relationshipReverse ? relationship.source : relationship.target;
    const { upperLimit } = landingConstraint.multiplicity;
    if (upperLimit === "unbounded" || upperLimit > 1) {
      return "many";
    }
  }
  return "one";
}

/**
 * Classifies the paths a declaration's fields are reached over, so field enumeration can stamp each
 * field with the cardinality of its own path.
 */
export interface PathCardinalityClassifier {
  /**
   * Classifies `path` as reaching at most one related instance (`"one"`) or possibly several (`"many"`).
   *
   * `declaredPath` is the full path the owning declaration resolved to; `path` may be a shorter prefix
   * of it when a per-step spec selects properties from an intermediate step. A `"one"` hint covers
   * every prefix (if the whole traversal reaches at most one instance, so does any prefix), but a
   * `"many"` hint says nothing about a prefix, so a prefix falls back to schema multiplicity.
   *
   * Verdicts are memoized, so a path shared by several declarations is read from the schema once.
   */
  classify(props: {
    path: RelationshipPath;
    declaredPath: RelationshipPath;
    hint?: CardinalityHint;
  }): Promise<CardinalityHint>;
}

/**
 * Creates a {@link PathCardinalityClassifier} over the given schema.
 *
 * Each declaration uses its own hint, falling back to schema multiplicity when that hint does not
 * apply. Sharing a query path does not change a declaration's value shape.
 */
export function createPathCardinalityClassifier(imodelAccess: ECSchemaProvider): PathCardinalityClassifier {
  const cache = new Map<string, Promise<CardinalityHint>>();
  return {
    async classify({ path, declaredPath, hint }) {
      const applicableHint = hint === "many" && path.length < declaredPath.length ? undefined : hint;
      return getOrCreate({
        map: cache,
        key: `${serializeRelationshipPath({ path, includeInstanceFilters: false })}|${applicableHint ?? ""}`,
        createFunc: async () =>
          classifyPathCardinality({ schemaProvider: imodelAccess, path, cardinalityHint: applicableHint }),
      });
    },
  };
}

/**
 * Folds effective cardinality verdicts into one: `"many"` wins if any of them says so.
 * Shared by `mergePropertyFieldsByIdentity` for candidates of the same property field and
 * `collectPathCardinalities` for declarations using the same query path. Combining query cardinalities
 * does not change individual fields' or external inputs' value shapes.
 */
export function resolveCardinality(cardinalities: Iterable<CardinalityHint>): CardinalityHint {
  for (const cardinality of cardinalities) {
    if (cardinality === "many") {
      return "many";
    }
  }
  return "one";
}

/**
 * Derives per-path cardinality hints from a descriptor's property fields and, since an
 * external-input-only path has no field to consult, from prepared external inputs,
 * keyed by `serializeRelationshipPath(pathFromTarget)`. Pass the result to
 * `buildBaseQuery` as `cardinalityHints`.
 *
 * The shared query uses `"many"` if any consumer needs it. Each field and external input keeps its
 * own value shape, and loading fails for a `"one"` consumer only when it reaches multiple instances.
 */
export function collectPathCardinalities(
  descriptor: ContentDescriptor,
  externalInputs: Iterable<ExternalInput> = [],
): Map<string, CardinalityHint> {
  const declarations: Array<{ path: RelationshipPath; cardinality: CardinalityHint }> = [];
  for (const field of Object.values(descriptor.fields)) {
    if (field.kind === "property" && field.pathFromTarget.length > 0) {
      declarations.push({ path: field.pathFromTarget, cardinality: field.pathCardinality });
    }
  }
  for (const input of externalInputs) {
    if (input.pathFromTarget && input.pathFromTarget.length > 0) {
      declarations.push({ path: input.pathFromTarget, cardinality: input.cardinality });
    }
  }

  const cardinalitiesByKey = new Map<string, CardinalityHint[]>();
  for (const { path, cardinality } of declarations) {
    const key = serializeRelationshipPath({ path, includeInstanceFilters: true });
    getOrCreate({ map: cardinalitiesByKey, key, createFunc: () => [] }).push(cardinality);
  }
  const hints = new Map<string, CardinalityHint>();
  for (const [key, cardinalities] of cardinalitiesByKey) {
    // `"many"` wins if any declaration for this path says so (see `resolveCardinality`).
    hints.set(key, resolveCardinality(cardinalities));
  }
  for (const { path, cardinality } of declarations) {
    if (cardinality !== "one") {
      continue;
    }
    // A whole traversal reaching at most one instance means every prefix does too, so seed every
    // strict prefix that has no verdict of its own yet — same rule `PathCardinalityClassifier` applies.
    // A `"many"` traversal implies nothing about a prefix, so it seeds nothing here.
    for (let length = 1; length < path.length; ++length) {
      const prefixKey = serializeRelationshipPath({ path: path.slice(0, length), includeInstanceFilters: true });
      if (!hints.has(prefixKey)) {
        hints.set(prefixKey, "one");
      }
    }
  }
  return hints;
}
