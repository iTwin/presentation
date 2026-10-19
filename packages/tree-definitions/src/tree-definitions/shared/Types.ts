/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { Id64String } from "@itwin/core-bentley";

/** @internal */
export type SubjectId = Id64String;

/**
 * Identifies a model.
 * @beta
 */
export type ModelId = Id64String;

/**
 * Identifies a category.
 * @beta
 */
export type CategoryId = Id64String;

/**
 * Identifies a sub-category.
 * @beta
 */
export type SubCategoryId = Id64String;

/**
 * Identifies a definition container.
 * @beta
 */
export type DefinitionContainerId = Id64String;

/** @internal */
export type ElementId = Id64String;

/**
 * Identifies a classification.
 * @beta
 */
export type ClassificationId = Id64String;

/** @internal */
export type ClassificationTableId = Id64String;

/**
 * Represents a read-only argument that can be an Id64String, an array of Id64Strings, or a set of Id64Strings.
 * @beta
 */
export type ReadonlyId64Arg = Id64String | ReadonlyArray<Id64String> | ReadonlySet<Id64String>;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace ReadonlyId64Arg {
  /** Same as Id64.iterable just accepts ReadonlyId64Arg */
  export function iterable(ids: ReadonlyId64Arg): Iterable<Id64String> {
    return typeof ids === "string" ? [ids] : ids;
  }
}
