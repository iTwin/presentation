/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type {
  ECSqlQueryExecutor,
  ECSchemaProvider,
  RelationshipPath,
  ValueDescriptor,
} from "@itwin/presentation-shared";
import type { CardinalityHint, ContentTarget } from "../ContentTarget.js";
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
  categories?: Record<string, CategoryDefinition>;
}

/**
 * A declaration of related properties to load via a relationship path.
 *
 * @public
 */
interface RelatedPropertiesDeclaration {
  /**
   * The relationship path to navigate (possibly generic — e.g., targeting a base class).
   * Will be resolved to concrete paths by querying the data.
   */
  path: RelationshipPath;

  /**
   * Per-step property specifications. Sparse — only list steps that need customization.
   * Steps without a spec use defaults: final step = "all", earlier steps = "none".
   */
  properties?: StepPropertySpec[];

  /** Hint about expected cardinality (affects loading strategy). */
  cardinalityHint?: CardinalityHint;

  /**
   * Optional custom resolution callback. When provided, the system delegates
   * path resolution to this callback instead of using default discovery.
   *
   * The callback receives the iModel accessor and target, and returns concrete paths.
   * The declaration's `properties` are carried forward to each returned path.
   */
  resolve?(props: {
    imodelAccess: ECSqlQueryExecutor | ECSchemaProvider;
    target: ContentTarget;
  }): Promise<RelationshipPath[]>;
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
   * of the content target class. At query generation time, the pipeline performs a literal
   * replacement of all `{targetAlias}.` occurrences with the actual query alias.
   *
   * @example
   * ```
   * expression: "this.FlowRate * 15850.3"
   * ```
   */
  expression: string;
  /**
   * The placeholder used in `expression` to reference the content target class.
   * Every occurrence of `{targetAlias}.` in the expression will be replaced with the
   * actual query alias at query generation time.
   *
   * @default "this"
   */
  targetAlias?: string;
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
 *       calculatedFields: [{ id: "calc1", label: "Calc", expression: "...", type: { kind: "primitive", primitiveType: "double" } }],
 *     };
 *   },
 * });
 * ```
 *
 * @public
 */
export function defineIModelFieldsProvider(provider: IModelFieldsProvider): IModelFieldsProvider {
  return provider;
}
