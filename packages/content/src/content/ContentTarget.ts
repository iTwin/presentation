/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { Id64String } from "@itwin/core-bentley";
import type { EC, ECSqlBinding, RelationshipPath } from "@itwin/presentation-shared";
import type { BaseFieldsProvider } from "./extensions/BaseFieldsProvider.js";

/**
 * Hint about the effective cardinality of a relationship path.
 *
 * - `"one"`: each target instance joins to at most one related instance.
 * - `"many"`: each target instance may join to multiple related instances.
 *
 * @public
 */
export type CardinalityHint = "one" | "many";

/**
 * The starting point for a content request, scoped to a single EC class.
 *
 * Answers the question: "what am I getting properties for?"
 *
 * When the consumer selects instances of multiple different classes,
 * this becomes multiple content targets — one per distinct class.
 *
 * @public
 */
export interface ContentTarget {
  /**
   * Full class name of the primary class whose properties we want (e.g., "BisCore.Element").
   */
  primaryClass: EC.FullClassName;

  /**
   * Optional set of instance IDs to scope to specific instances.
   * When provided, source resolution queries only these instances to determine
   * which relationship paths are relevant.
   * When omitted, all instances of the class are queried.
   */
  instanceIds?: Id64String[];

  /**
   * Optional filter predicate to further restrict which instances are in scope.
   * Applied during source resolution (Stage 1) — affects which paths are discovered.
   */
  instanceFilter?: {
    /**
     * ECSQL WHERE clause expression (without the WHERE keyword).
     *
     * Use `primaryClassAlias` (defaults to `"this"`) followed by a dot to reference properties
     * of the primary class. At query generation time, the pipeline performs
     * a literal replacement of all `{primaryClassAlias}.` occurrences with the actual query alias.
     *
     * @example
     * ```
     * expression: "this.Area > :minArea"
     * ```
     */
    expression: string;

    /**
     * The placeholder used in `expression` to reference the primary class (`primaryClass`).
     * Every occurrence of `{primaryClassAlias}.` in the expression will be replaced with the
     * actual query alias at query generation time.
     *
     * @default "this"
     */
    primaryClassAlias?: string;

    /**
     * Bind values for the expression, keyed by parameter name.
     */
    bindings?: Record<string, ECSqlBinding>;
  };
}

/**
 * A resolved join shape for a single content target.
 * Output of source resolution (Stage 1). Contains the target and the concrete
 * relationship paths discovered by querying iModel's data.
 *
 * @public
 */
export interface ContentSource {
  /** The content target this source was resolved from. */
  target: ContentTarget;

  /**
   * Resolved declaration groups — one per provider declaration that produced
   * concrete paths during resolution.
   *
   * Each group links back to its originating provider and declaration index,
   * allowing Stage 2 to re-fetch the declaration's property specs and
   * cardinality hint without storing them on the cached source.
   */
  resolvedDeclarations: ResolvedDeclarationGroup[];
}

/**
 * A group of concrete relationship paths resolved from a single provider declaration.
 *
 * During source resolution (Stage 1), each provider's `RelatedPropertiesDeclaration`
 * may resolve to one or more concrete paths. This group preserves that association
 * so Stage 2 can look up the declaration's property specs and cardinality hint
 * by re-calling the provider.
 *
 * @public
 */
interface ResolvedDeclarationGroup {
  /** ID of the provider that contributed the originating declaration. */
  providerId: BaseFieldsProvider["id"];

  /**
   * 0-based index into the `relatedProperties` array of the `FieldsProviderContribution`
   * returned by the `IModelFieldsProvider.getContribution()` call.
   */
  declarationIndex: number;

  /**
   * Concrete relationship paths resolved from the declaration's generic path.
   * All classes are concrete — no base classes.
   */
  paths: RelationshipPath[];
}
