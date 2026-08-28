/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Content pipeline overview
 * =========================
 *
 * Stage 1 — Source resolution (`resolveContentSources`)
 *   - Calls `IModelFieldsProvider.getContribution()` for each target.
 *   - Performs schema introspection and resolves relationship paths
 *     (including provider-declared related properties).
 *   - Nested expansion: for every provider opted in via `applyRecursively`, re-invokes
 *     `getContribution` with a synthesized `{ primaryClass: anchorClassName }` target at each
 *     *nested anchor* — a related-instance class surfaced by any resolved related-properties path
 *     (final step when the producing declaration omits `properties`, else steps selecting all target
 *     properties, optionally with an `exclude` subset). Steps using `include` or `"none"` do not
 *     anchor nested contributions. Nested declarations are still resolved as the **full path from
 *     the original target** (concrete prefix + declared suffix), never from the anchor class alone,
 *     so instance scoping (`instanceIds`/`instanceFilter`) is preserved. Recursive and unbounded —
 *     data-driven termination, guarded per branch by `(providerId, anchorClassName)` against cyclic
 *     instance graphs. See `IModelFieldsProvider.applyRecursively` and
 *     `ResolvedDeclarationGroup.nested`.
 *   - Output: `ContentSource[]` — serializable, cacheable.
 *
 * Stage 2 — Descriptor building (`createContentProvider` → `getContentDescriptor`)
 *   - Enumerates iModel fields from the resolved sources.
 *   - For a `nested` declaration group, recovers the declaration from the contribution returned
 *     for the synthesized anchor target (not the source's own target), offsetting per-step
 *     property specs by `nested.prefixStepCount` — only `relatedProperties` (and any `categories`
 *     they reference) apply to nested groups; `calculatedFields` never do.
 *   - Appends `ExternalFieldsProvider.fields` declarations.
 *   - Runs `DescriptorTransformer.transform()` asynchronously in ascending priority order.
 *   - Output: frozen `ContentDescriptor`.
 *
 * Stage 3 — Query building (`getItems` / `getSize` / `getInstanceKeys`)
 *   - Calls `QueryFilterer.getFilterClauses()` to inject WHERE/JOIN clauses.
 *   - Applies `ContentValueFilter` entries as additional WHERE clauses.
 *   - Builds ECSQL.
 *     - `getSize` and `getInstanceKeys` depend only on Stage 1 (resolved sources).
 *     - `getItems` additionally requires Stage 2 (the descriptor) to know which
 *       columns to SELECT.
 *   - A `nested` group's `paths` are already full concrete paths from the source's target, so a
 *     value-query implementation can join `group.paths[i].path` (or a field's `pathFromTarget`) as
 *     for any other group — no anchor-specific handling is needed here. When a hint is needed for
 *     join/loading strategy, prefer `nested.effectiveCardinalityHint` (already the combined hint
 *     across the whole path) over re-deriving it from just the nested declaration.
 *
 * Stage 4 — Query execution and value population (`getItems`)
 *   - Executes the built ECSQL query.
 *   - Calls `ExternalFieldsProvider.getValues()` per batch of items.
 *   - Merges external values into the final `ContentItem` accessors.
 */

import { createContentProviderImpl } from "./CreateContentProvider.js";
import { resolveContentSourcesImpl } from "./ResolveContentSources.js";

import type {
  ECSchemaProvider,
  ECSqlQueryExecutor,
  InstanceKey,
  Point2dValue,
  Point3dValue,
  PrimitiveValue,
} from "@itwin/presentation-shared";
import type { ContentSource, ContentTarget } from "./ContentTarget.js";
import type { DescriptorTransformer } from "./extensions/DescriptorTransformer.js";
import type { ExternalFieldsProvider } from "./extensions/ExternalFieldsProvider.js";
import type { IModelFieldsProvider } from "./extensions/IModelFieldsProvider.js";
import type { QueryFilterer } from "./extensions/QueryFilterer.js";
import type { ReadonlyContentDescriptor } from "./model/ContentDescriptor.js";
import type { ContentItem } from "./model/ContentItem.js";
import type { CalculatedField, PropertyField } from "./model/Field.js";

/**
 * Sorting specification for content value requests.
 *
 * @public
 */
interface ContentSortSpec {
  /** The field to sort by. */
  field: PropertyField | CalculatedField;
  /** Sort direction. */
  direction: "asc" | "desc";
}

/**
 * The field targeted by a value filter. Filters may target calculated or property fields.
 * When targeting a struct or point property field, specify `member` to identify the member to compare.
 *
 * @public
 */
type ContentValueFilterTarget =
  | {
      /**
       * The property field to filter on. Filter can only target primitive, navigation and struct properties.
       * Array properties are not supported.
       */
      field: PropertyField;
      /**
       * For composite property fields (structs, points), the member to compare.
       * Example: `"x"` for a Point3d field, `"Street"` for an Address struct.
       * Omit for scalar fields.
       * For struct properties and `Point2d`/`Point3d`, the member must be provided — filtering on a struct or point as a whole is not supported.
       */
      member?: string;
    }
  | {
      /** The calculated field to filter on. Calculated fields are scalar, so `member` does not apply. */
      field: CalculatedField;
      member?: never;
    };

/** @public */
type ScalarValueFilterOperator = Exclude<ValueFilterOperator, "is-null" | "is-not-null" | "is-in" | "is-not-in">;

/**
 * A value filter applied during query building (Stage 3).
 * Adds a WHERE clause to the final query — does not affect which fields
 * exist in the descriptor (only which rows are returned).
 *
 * @public
 */
export type ContentValueFilter =
  | (ContentValueFilterTarget & {
      /** The filter operator. */
      operator: ScalarValueFilterOperator;
      /** The scalar value to compare against. Points are filtered per-coordinate via `member`, so a whole-point value is not accepted. */
      value: Exclude<PrimitiveValue, Point2dValue | Point3dValue>;
    })
  | (ContentValueFilterTarget & {
      /** The filter operator. */
      operator: "is-in" | "is-not-in";
      /** The values to compare against. */
      value: Exclude<PrimitiveValue, Point2dValue | Point3dValue>[];
    })
  | (ContentValueFilterTarget & {
      /** The filter operator. */
      operator: "is-null" | "is-not-null";
      /** Null checks do not accept values. */
      value?: never;
    });

/** @public */
type ValueFilterOperator =
  | "is-equal"
  | "is-not-equal"
  | "is-null"
  | "is-not-null"
  | "less-than"
  | "less-than-or-equal"
  | "greater-than"
  | "greater-than-or-equal"
  | "like"
  | "is-in"
  | "is-not-in";

/**
 * Request options passed alongside the descriptor when loading values.
 * Controls _how_ to query, not _what fields exist_.
 *
 * The same descriptor can be reused with different request options
 * (different pages, sort orders, filters).
 *
 * @public
 */
interface ContentRequestOptions {
  /** Sorting specification. Applied as ORDER BY in the generated query. */
  sorting?: ContentSortSpec[];

  /**
   * Value filters. Applied as additional WHERE clauses during query building.
   * Multiple filters are ANDed together.
   * Does not affect the descriptor — only which rows are returned.
   */
  filters?: ContentValueFilter[];
}

/**
 * App-level extension point registration shared by both `resolveContentSources`
 * and `createContentProvider`.
 *
 * @public
 */
export interface ContentConfiguration {
  /** iModel fields providers (contribute related properties and calculated fields). */
  imodelFieldsProviders?: IModelFieldsProvider[];

  /** External fields providers (declare + populate fields from outside the iModel). */
  externalFieldsProviders?: ExternalFieldsProvider[];

  /** Descriptor transformers (modify descriptor after field enumeration). */
  descriptorTransformers?: DescriptorTransformer[];

  /** Query filterers (inject WHERE clauses into built queries). */
  queryFilterers?: QueryFilterer[];
}

/**
 * Props for resolving content sources.
 *
 * @public
 */
interface ResolveContentSourcesProps {
  /** Access to the iModel for schema introspection, class-hierarchy inspection, and path resolution. */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  /** The content targets to resolve. */
  targets: ContentTarget[];
  /** Extension point configuration (only `imodelFieldsProviders` is used for resolution). */
  config?: Pick<ContentConfiguration, "imodelFieldsProviders">;
}

/**
 * Resolve content sources for the given targets and provider declarations.
 *
 * This is the expensive step — performs schema introspection and data-driven
 * path resolution for all targets and provider-declared related properties.
 *
 * The returned sources capture the fully-resolved join shapes (including
 * provider-declared related properties). They are serializable and can be
 * cached to disk for reuse — skipping the expensive resolution on subsequent loads.
 *
 * Cache invalidation: sources become stale when the iModel schema changes
 * or provider declarations change.
 *
 * @public
 */
export async function resolveContentSources(props: ResolveContentSourcesProps): Promise<ContentSource[]> {
  return resolveContentSourcesImpl({
    imodelAccess: props.imodelAccess,
    targets: props.targets,
    imodelFieldsProviders: props.config?.imodelFieldsProviders ?? [],
  });
}

/**
 * Configuration for creating a content provider from pre-resolved sources.
 *
 * @public
 */
interface ContentProviderProps {
  /** Access to the iModel for running ECSQL queries, schema introspection, and class-hierarchy checks. */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;

  /** Pre-resolved content sources (output of `resolveContentSources`). */
  sources: ContentSource[];

  /** Extension point configuration. */
  config?: ContentConfiguration;
}

/**
 * A stateful content provider built from pre-resolved sources.
 *
 * Created via `createContentProvider`, which builds the descriptor from the
 * resolved sources. The descriptor is exposed for inspection/modification
 * before querying items.
 *
 * Methods that only need source/filter information (`getSize`, `getInstanceKeys`,
 * `getDistinctValues`) do not depend on the descriptor. Only `getItems` uses it.
 *
 * @public
 */
export interface ContentProvider {
  /**
   * Get the content descriptor for the configured sources.
   * Built lazily on first call and cached for subsequent calls.
   *
   * The descriptor reflects all fields providers and descriptor transformers
   * from the content configuration. It is deeply readonly — modify it by registering a
   * `DescriptorTransformer`, not by mutating the returned object.
   */
  getContentDescriptor(): Promise<ReadonlyContentDescriptor>;

  /**
   * Get the total number of content items matching the configured sources.
   *
   * @param options - Optional filters (affects the count).
   */
  getSize(options?: Pick<ContentRequestOptions, "filters">): Promise<number>;

  /**
   * Get instance keys for all items matching the configured sources.
   *
   * A key may be returned more than once when configured sources overlap.
   *
   * @param options - Optional filters (affects which keys are returned).
   */
  getInstanceKeys(options?: Pick<ContentRequestOptions, "filters">): AsyncIterable<InstanceKey>;

  /**
   * Load content items using the descriptor.
   *
   * Returns an async iterator over ContentItem accessors. Internally pages
   * using cursor-based pagination; consumers simply `for await` over items.
   *
   * @param options - Sorting and filtering options.
   */
  getItems(options?: ContentRequestOptions): AsyncIterable<ContentItem>;
}

/**
 * Create a content provider from pre-resolved sources.
 * The descriptor is built lazily on the first call to `getContentDescriptor`.
 *
 * @public
 */
export function createContentProvider(props: ContentProviderProps): ContentProvider {
  return createContentProviderImpl(props);
}
