/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type {
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryExecutor,
  RelationshipPath,
  ValueDescriptor,
} from "@itwin/presentation-shared";
import type { CardinalityHint, ContentTarget, ResolvedPath } from "../ContentTarget.js";
import type { CategoryDefinition } from "../model/Category.js";
import type { StepPropertySpec } from "../model/PropertySpec.js";
import type { BaseFieldsProvider } from "./BaseFieldsProvider.js";

/**
 * An iModel fields provider contributes fields for a given content target.
 *
 * **Pipeline stage: 1 (source resolution)**
 *
 * Called by `resolveContentSources` — once per target. Contributions declare
 * related properties and calculated fields, which influence path resolution.
 * The resolved paths are baked into `ContentSource` and reused across requests.
 *
 * Providers are additive — contributions from all applicable providers are
 * collected and merged into a single descriptor.
 *
 * @public
 */
export interface IModelFieldsProvider extends BaseFieldsProvider {
  /**
   * Returns the contribution for the given target, or `undefined` if this
   * provider does not apply to the target.
   * Called once per target during source resolution.
   */
  getContribution(props: {
    imodelAccess: ECSchemaProvider;
    target: ContentTarget;
  }): Promise<FieldsProviderContribution | undefined>;

  /**
   * When `true`, this provider's contribution is recursively applied on every **nested anchor** —
   * the concrete related-instance classes surfaced by any resolved related-properties path (from any
   * provider, including this one). A target step is a nested anchor when its declaration omits
   * `properties`, selects `"all"`, or selects all except an `exclude` subset. An `include` selection
   * and `"none"` do not expose the whole related instance and therefore do not create an anchor.
   *
   * On a nested anchor, `getContribution` is invoked with a synthesized `ContentTarget` containing
   * only `primaryClass` (the anchor class) — `instanceIds` and `instanceFilter` are always
   * `undefined`. Providers that inspect those members should treat their absence as "not scoped to
   * specific instances", exactly as they would for an omitted direct target.
   *
   * Nested declarations are resolved as the full path from the *original* content target (the
   * concrete prefix up to and including the anchor, plus the contribution's declared suffix) — never
   * from the anchor class alone — so instance scoping from the original target's `instanceIds` /
   * `instanceFilter` carries through correctly.
   *
   * Only `relatedProperties` participate in recursive application (and any `categories` they
   * reference) — `calculatedFields` are never applied on nested content, since recursive application
   * exists solely to pull in new related targets, which only `relatedProperties` declarations
   * introduce. Declarations with a custom `resolve` callback are also skipped when used as a nested
   * suffix, because their resolution logic runs from the target class alone and cannot honor the
   * prefix; their resolved paths still land in the content source as regular declarations, so they
   * still anchor other providers' nested contributions when they are themselves a parent.
   *
   * Recursion is unbounded — an anchor surfaced by a nested contribution can itself receive nested
   * contributions from any opted-in provider, including this one. Termination is data-driven: a
   * nested declaration whose full path matches no instances resolves to zero paths and contributes
   * nothing further. As a guard against cyclic instance graphs (e.g. a self-referential
   * relationship), a given `(provider, anchor class)` pair is applied at most once per expansion
   * branch.
   */
  applyRecursively?: boolean;
}

/**
 * The contribution returned by an iModel fields provider.
 * Combines related properties declarations, calculated field declarations,
 * and category definitions.
 *
 * @public
 */
interface FieldsProviderContribution {
  /** Related properties declarations — paths to navigate and properties to load. */
  relatedProperties?: RelatedPropertiesDeclaration[];
  /** Calculated field declarations — ECSQL expressions evaluated in the query. */
  calculatedFields?: CalculatedFieldDeclaration[];
  /** Category definitions contributed by this provider, keyed by category ID. */
  categories?: Record<CategoryDefinition["id"], CategoryDefinition>;
}

/**
 * A declaration of related properties to load via a relationship path.
 *
 * @public
 */
export interface RelatedPropertiesDeclaration {
  /**
   * The relationship path to navigate (possibly generic — e.g., targeting a base class).
   * Will be resolved to concrete paths by querying the data.
   */
  path: RelationshipPath;

  /**
   * Per-step property specifications, opting in the classes to load properties from.
   *
   * When omitted entirely, all properties of the final step's target class are loaded (and nothing
   * from intermediate target classes or relationship classes). When provided, only the classes
   * explicitly named via each step's `target`/`relationship` are loaded — omitted classes and
   * unlisted steps load nothing.
   */
  properties?: StepPropertySpec[];

  /** Hint about expected cardinality (affects loading strategy). */
  cardinalityHint?: CardinalityHint;

  /**
   * Optional custom resolution callback. When provided, the system delegates
   * path resolution to this callback instead of using default discovery.
   *
   * The callback receives the iModel accessor and target, and returns concrete paths, each
   * paired with the concrete content-target classes it applies to. The declaration's
   * `properties` and `cardinalityHint` still apply to each resolved path.
   */
  resolve?(props: {
    imodelAccess: ECSqlQueryExecutor | ECSchemaProvider;
    target: ContentTarget;
  }): Promise<ResolvedPath[]>;
}

/**
 * A calculated field declaration — carries an ECSQL expression that computes
 * the field value in the query. Participates in SQL-level sorting and filtering.
 *
 * @public
 */
interface CalculatedFieldDeclaration {
  /**
   * Local identity for this field. Must be unique within the owning provider.
   * The system derives the global field identity as `${providerId}:${id}`.
   */
  id: string;
  /** Display label. */
  label: string;
  /**
   * ECSQL expression that computes this field's value.
   *
   * Use `targetAlias` (defaults to `"this"`) followed by a dot to reference properties
   * of the content target class. At query generation time, the pipeline replaces all
   * `{targetAlias}.` occurrences (in both their bare `{targetAlias}.` and bracket-quoted
   * `[{targetAlias}].` forms) with the actual query alias.
   *
   * @example
   * ```
   * expression: "this.FlowRate * 15850.3"
   * ```
   */
  expression: string;
  /**
   * The placeholder used in `expression` to reference the content target class.
   * Every occurrence of `{targetAlias}.` in the expression, whether bare (`{targetAlias}.`)
   * or bracket-quoted (`[{targetAlias}].`), will be replaced with the actual query alias at
   * query generation time.
   *
   * @default "this"
   */
  targetAlias?: string;
  /** Bind values for `expression`, keyed by parameter name. */
  bindings?: Record<string, ECSqlBinding>;
  /** The value type of the computed result. */
  type: ValueDescriptor;
  /** Category to assign this field to (references a `CategoryDefinition.id`). */
  categoryId?: string;
}

/**
 * Helper type to define a fields provider inline with type inference.
 *
 * @example
 * ```ts
 * const myProvider = defineIModelFieldsProvider({
 *   id: "my-domain_v1",
 *   async getContribution({ target }) {
 *     if (!target.primaryClass.startsWith("MySchema")) {
 *       return undefined;
 *     }
 *     return {
 *       relatedProperties: [{ path: [...] }],
 *       calculatedFields: [{ id: "calc1", label: "Calc", expression: "...", type: { kind: "primitive", type: "Double" } }],
 *     };
 *   },
 * });
 * ```
 *
 * @public
 */
/* v8 ignore next 3 */
export function defineIModelFieldsProvider(provider: IModelFieldsProvider): IModelFieldsProvider {
  return provider;
}
