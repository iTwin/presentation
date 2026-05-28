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
 *   - Output: `ContentSource[]` — serializable, cacheable.
 *
 * Stage 2 — Descriptor building (`createContentProvider` → `getContentDescriptor`)
 *   - Enumerates iModel fields from the resolved sources.
 *   - Appends `ExternalFieldsProvider.fields` declarations.
 *   - Runs `DescriptorTransformer.transform()` in ascending priority order.
 *   - Output: frozen `ContentDescriptor`.
 *
 * Stage 3 — Query building (`getItems` / `getSize` / `getInstanceKeys`)
 *   - Calls `QueryFilterer.getFilterClauses()` to inject WHERE/JOIN clauses.
 *   - Applies `ContentValueFilter` entries as additional WHERE clauses.
 *   - Builds ECSQL.
 *     - `getSize` and `getInstanceKeys` depend only on Stage 1 (resolved sources).
 *     - `getItems` additionally requires Stage 2 (the descriptor) to know which
 *       columns to SELECT.
 *
 * Stage 4 — Query execution and value population (`getItems`)
 *   - Executes the built ECSQL query.
 *   - Calls `ExternalFieldsProvider.getValues()` per batch of items.
 *   - Merges external values into the final `ContentItem` accessors.
 */

import { resolveContentSources as resolveContentSourcesImpl } from "./ResolveContentSources.js";

import type { ECSchemaProvider, ECSqlQueryExecutor, InstanceKey, Value } from "@itwin/presentation-shared";
import type { ContentSource, ContentTarget } from "./ContentTarget.js";
import type { DescriptorTransformer } from "./extensions/DescriptorTransformer.js";
import type { ExternalFieldsProvider } from "./extensions/ExternalFieldsProvider.js";
import type { IModelFieldsProvider } from "./extensions/IModelFieldsProvider.js";
import type { QueryFilterer } from "./extensions/QueryFilterer.js";
import type { ContentDescriptor } from "./model/ContentDescriptor.js";
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
 * A value filter applied during query building (Stage 3).
 * Adds a WHERE clause to the final query — does not affect which fields
 * exist in the descriptor (only which rows are returned).
 *
 * @public
 */
export interface ContentValueFilter {
  /** The field to filter on. */
  field: PropertyField | CalculatedField;
  /**
   * For composite fields (structs, points), the member to compare.
   * Example: `"x"` for a Point3d field, `"Street"` for an Address struct.
   * Omit for scalar fields.
   */
  member?: string;
  /** The filter operator. */
  operator: ValueFilterOperator;
  /** The value(s) to compare against. */
  value: Value;
}

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
  | "is-in";

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
  fieldsProviders?: IModelFieldsProvider[];

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
  /** Access to the iModel for schema introspection and path resolution. */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  /** The content targets to resolve. */
  targets: ContentTarget[];
  /** Extension point configuration (only `fieldsProviders` is used for resolution). */
  config?: Pick<ContentConfiguration, "fieldsProviders">;
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
    fieldsProviders: props.config?.fieldsProviders ?? [],
  });
}

/**
 * Configuration for creating a content provider from pre-resolved sources.
 *
 * @public
 */
interface ContentProviderProps {
  /** Access to the iModel for running ECSQL queries. */
  imodelAccess: ECSqlQueryExecutor | ECSchemaProvider;

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
interface ContentProvider {
  /**
   * Get the content descriptor for the configured sources.
   * Built lazily on first call and cached for subsequent calls.
   *
   * The descriptor reflects all fields providers and descriptor transformers
   * from the content configuration.
   */
  getContentDescriptor(): Promise<Readonly<ContentDescriptor>>;

  /**
   * Get the total number of content items matching the configured sources.
   *
   * @param options - Optional filters (affects the count).
   */
  getSize(options?: Pick<ContentRequestOptions, "filters">): Promise<number>;

  /**
   * Get instance keys for all items matching the configured sources.
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
/* v8 ignore next 3 */
export function createContentProvider(_props: ContentProviderProps): ContentProvider {
  throw new Error("Not implemented");
}
