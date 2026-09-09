/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { getOrCreate } from "./InternalUtils.js";
import { serializeRelationshipPath } from "./model/Utils.js";

import type { ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { CardinalityHint } from "./ContentTarget.js";

/**
 * Determines the effective cardinality of a relationship path — whether each target instance reaches
 * at most one related instance (`"one"`) or possibly many (`"many"`).
 *
 * A caller-supplied `cardinalityHint` always wins (schema multiplicity is frequently over-declared as
 * `many` where the data is effectively 1:1). Without a hint, the path is `"many"` when any step's
 * traversed constraint has an unbounded upper multiplicity limit or an upper limit greater than one, honoring
 * `relationshipReverse` to pick the constraint the traversal lands on.
 *
 * @internal
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
 *
 * @internal
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
 * Each verdict reflects one declaration's view of a path. Declarations that disagree about a shared
 * path produce fields that `mergePropertyFieldsByIdentity` reconciles into one.
 *
 * @internal
 */
export function createPathCardinalityClassifier(imodelAccess: ECSchemaProvider): PathCardinalityClassifier {
  const cache = new Map<string, Promise<CardinalityHint>>();
  return {
    async classify({ path, declaredPath, hint }) {
      const applicableHint = hint === "many" && path.length < declaredPath.length ? undefined : hint;
      return getOrCreate({
        map: cache,
        key: `${serializeRelationshipPath({ path })}|${applicableHint ?? ""}`,
        createFunc: async () =>
          classifyPathCardinality({ schemaProvider: imodelAccess, path, cardinalityHint: applicableHint }),
      });
    },
  };
}
