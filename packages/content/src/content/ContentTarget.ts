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
  primaryClass: EC.FullClassNameDotNotation;

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
   * Concrete primary classes present in the data under the target's `primaryClass`,
   * discovered by a data-driven distinct-class scan during source resolution.
   *
   * - When `primaryClass` is a leaf (has no derived classes), the scan is skipped and this
   *   is the normalized `primaryClass` (dot-notation).
   * - When `primaryClass` is polymorphic, this lists the concrete subclasses that actually
   *   have instances in scope, respecting the target's `instanceIds` / `instanceFilter`. This
   *   may be empty when no instances match.
   * - Also empty when enumeration was not performed (e.g. no iModel fields providers configured).
   *
   * The library uses this to populate a direct field's `valueClassNames`, so overrides can be
   * scoped below a polymorphically-selected base primary via `TransformableDescriptor.forkField`.
   */
  resolvedPrimaryClasses: EC.FullClassNameDotNotation[];

  /**
   * Resolved declaration groups — one per provider declaration that produced
   * concrete paths during resolution.
   *
   * Each group links back to its originating provider and declaration index,
   * allowing Stage 2 to re-fetch the declaration's property specs and
   * cardinality hint without storing them on the cached source.
   *
   * Groups without `nested` are declarations applied directly on this source's target — the
   * declaration is recovered by re-calling `providerId`'s `getContribution` with this source's
   * `target`. Groups with `nested` are declarations applied on a *nested anchor* — a related-instance
   * class surfaced by some resolved related-properties path — via a provider opted in with
   * `IModelFieldsProvider.applyRecursively`; the declaration is instead recovered by re-calling
   * `providerId`'s `getContribution` with a synthesized `{ primaryClass: nested.anchorClassName }`
   * target. Base groups are ordered first (by provider then declaration order), followed by nested
   * groups in breadth-first expansion order (shallower anchors first); the array is otherwise
   * deterministic and stable across runs for the same inputs, keeping serialized sources cacheable.
   */
  resolvedDeclarations: ResolvedDeclarationGroup[];
}

/**
 * A single concrete relationship path resolved from a declaration, paired with the
 * concrete content-target classes it applies to.
 *
 * @public
 */
export interface ResolvedPath {
  /**
   * The concrete relationship path from the content target to the related property source.
   *
   * Every class on each step is concrete — the step's `sourceClassName`, `targetClassName` and
   * `relationshipName` are all resolved from the scanned data, never a polymorphically-selected base.
   * For a polymorphic relationship this means the concrete relationship subclass(es) actually present
   * in the data; distinct subclasses are reported as separate `ResolvedPath` entries.
   */
  path: RelationshipPath;

  /**
   * Concrete content-target (near-end primary) classes — a subset of
   * `ContentSource.resolvedPrimaryClasses` — whose instances actually connect to this `path`.
   *
   * Discovered by a data-driven scan during source resolution, so it lists only the concrete
   * classes that participate in this path, never a polymorphically-selected base.
   */
  targetClassNames: EC.FullClassNameDotNotation[];
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
   * Concrete relationship paths resolved from the declaration's generic path, each with the
   * concrete content-target classes it applies to. All path classes are concrete — no base classes.
   *
   * For a `nested` group, every path is the *full* concrete path from this source's target — the
   * concrete prefix up to and including the anchor step, followed by the nested declaration's own
   * (now concrete) suffix steps — not just the nested declaration's suffix. `targetClassNames`
   * remains the near-end (true primary) classes throughout, so `PropertyField.primaryClassNames`
   * semantics are unchanged for nested fields.
   */
  paths: ResolvedPath[];

  /**
   * Present when this declaration was applied on a **nested anchor** rather than directly on this
   * source's target — i.e. the declaration comes from a provider opted in via
   * `IModelFieldsProvider.applyRecursively`, applied at a related-instance class surfaced by some
   * (possibly different) provider's resolved related-properties path.
   */
  nested?: {
    /**
     * The concrete anchor class the contribution was applied on. Stage 2 re-fetches the declaration
     * by calling `getContribution` with a synthesized `{ primaryClass: anchorClassName }` target
     * (no `instanceIds` / `instanceFilter`).
     */
    anchorClassName: EC.FullClassNameDotNotation;

    /**
     * How many leading steps of each `paths[i].path` belong to the prefix — the path from this
     * source's target to the anchor. The remaining (suffix) steps are the nested declaration's own
     * path. Per-step property specs (`StepPropertySpec.stepIndex`) on the nested declaration are
     * relative to the suffix; add `prefixStepCount` to translate into an index of the full path.
     */
    prefixStepCount: number;

    /**
     * The effective cardinality of the full path — `"many"` if either the parent path's producing
     * declaration or this nested declaration hints `"many"`; `"one"` only when **both** hint `"one"`;
     * `undefined` otherwise (a `"one"` promise can't be made for a chain containing an unhinted —
     * possibly many — segment, so consumers should fall back to schema-multiplicity inspection of
     * the full path, exactly as they would for a hint-less base declaration).
     *
     * Computed here (rather than left to Stage 2/3) because, once a nested declaration is itself
     * nested further, later stages no longer have cheap access to every ancestor declaration in the
     * chain.
     */
    effectiveCardinalityHint?: CardinalityHint;
  };
}
