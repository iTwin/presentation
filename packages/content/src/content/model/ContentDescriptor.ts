/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { compareFullClassNames } from "@itwin/presentation-shared";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { CategoryDefinition } from "./Category.js";
import type { Field, PropertyField, RelatedFieldGroup } from "./Field.js";

/**
 * The schema of the content result. Computed before loading any values.
 * Describes what fields exist — purely structural. Does not carry request-level
 * concerns like sorting, filtering, or paging.
 *
 * The descriptor is the contract between the "what exists" phase and the "load values" phase.
 * Consumers can inspect and modify it (hide fields, remove fields, override categories)
 * before passing it to value loading.
 *
 * @public
 */
export interface ContentDescriptor {
  /** The content sources used to compute this descriptor (one per target class). */
  sources: ContentSource[];

  /**
   * Direct fields — property fields and calculated fields that belong to the
   * target class directly (no relationship path).
   */
  directFields: Field[];

  /**
   * Related field groups — containers that group fields loaded via a specific
   * relationship path. Groups can nest for multi-step paths.
   */
  relatedFieldGroups: RelatedFieldGroup[];

  /**
   * All category definitions referenced by fields in this descriptor, keyed by category ID.
   */
  categories: Record<string, CategoryDefinition>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ContentDescriptor {
  /**
   * Collect all fields from a descriptor into a flat array.
   */
  export function collectAllFields(descriptor: ContentDescriptor): Field[] {
    return [...iterateFields(descriptor)];
  }

  /**
   * Find a field in the descriptor by its identity.
   */
  export function findFieldByIdentity(descriptor: ContentDescriptor, identity: string): Field | undefined {
    for (const field of iterateFields(descriptor)) {
      if (field.identity === identity) {
        return field;
      }
    }
    return undefined;
  }

  /**
   * Find a property field by source class full name and property name.
   *
   * When the same property appears multiple times via different relationship paths,
   * supply `pathFromTarget` to disambiguate. Without it, the first match is returned.
   */
  export function findFieldByProperty(
    descriptor: ContentDescriptor,
    sourceClassName: EC.FullClassName,
    propertyName: string,
    pathFromTarget?: RelationshipPath,
  ): PropertyField | undefined {
    for (const field of iterateFields(descriptor)) {
      if (
        field.kind === "property" &&
        field.sourceClassName === sourceClassName &&
        field.propertyName === propertyName &&
        (!pathFromTarget || relationshipPathsEqual(field.pathFromTarget, pathFromTarget))
      ) {
        return field;
      }
    }
    return undefined;
  }

  function relationshipPathsEqual(a: RelationshipPath, b: RelationshipPath): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return a.every(
      (step, i) =>
        compareFullClassNames(step.sourceClassName, b[i].sourceClassName) === 0 &&
        compareFullClassNames(step.targetClassName, b[i].targetClassName) === 0 &&
        compareFullClassNames(step.relationshipName, b[i].relationshipName) === 0 &&
        (step.relationshipReverse ?? false) === (b[i].relationshipReverse ?? false),
    );
  }

  function* iterateFields(descriptor: ContentDescriptor): Iterable<Field> {
    yield* descriptor.directFields;
    yield* iterateGroups(descriptor.relatedFieldGroups);
  }

  function* iterateGroups(groups: RelatedFieldGroup[]): Iterable<Field> {
    for (const group of groups) {
      yield* group.fields;
      if (group.nestedGroups) {
        yield* iterateGroups(group.nestedGroups);
      }
    }
  }
}
