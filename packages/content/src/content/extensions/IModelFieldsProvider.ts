/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type {
  EC,
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
   * When `true`, this provider's `relatedProperties` also apply to related instances surfaced by other
   * related-properties declarations, recursively. Such a related instance is a nested anchor when its
   * declaration loads all of its properties (`properties` omitted, `"all"`, or an `exclude` selection).
   *
   * For a nested anchor, `getContribution` is called with a target containing only `primaryClass`: the
   * target class of the declared step (e.g. `BisCore.TypeDefinitionElement`), not each concrete class found
   * in the data. As with a direct target, a declaration applies to a subclass only by starting its path
   * at that subclass, and a mixin target (e.g. `BisCore.ISubModeledElement`) is passed as the mixin, so a
   * provider that checks `classDerivesFrom(target.primaryClass, "BisCore.Element")` contributes nothing for
   * it. Anchors of a declaration with a custom `resolve` are the concrete classes it returns.
   *
   * To guarantee termination, a provider is applied at most once per anchor class along a chain of nested
   * anchors. E.g. a `B -> B` declaration expands one level below the first `B` anchor, whichever concrete
   * `B` subclasses the data contains.
   *
   * Calculated fields and declarations with a custom `resolve` aren't applied recursively.
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
export interface FieldsProviderContribution {
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
   *
   * The first step's `sourceClassName` scopes the declaration: it applies to instances of that class and
   * its subclasses within the content target, and not to other instances of the target. It may be
   * narrower than the target's class (e.g. `MySchema.Pump` under a `BisCore.Element` target), in which
   * case only pumps get the related properties; a base class of the target's class applies to the whole
   * target. A class neither deriving from nor being a base of the target's class applies to nothing.
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

  /**
   * Hint about expected cardinality, used to determine this declaration's field shapes.
   * An explicit hint overrides schema multiplicity for this declaration, not for other fields or
   * external inputs on the same path. Without a hint, the declaration uses schema multiplicity.
   * Candidates for the same property field still merge with `"many"` winning.
   * Loading fails when a field with `"one"` cardinality reaches more than one related instance.
   */
  cardinalityHint?: CardinalityHint;

  /**
   * Where the categories of this declaration's properties are placed.
   *
   * - `"relatedClass"` (default): each property appears under its own class's category, nested under
   *   the categories of the classes named at earlier steps of this declaration. A property with
   *   property category `Geometry` of class `C`, on a path `A > B > C` whose step specs name `B`,
   *   appears under `B > C > Geometry`.
   * - `"parent"`: categories attach to the category context enclosing this declaration — the top level
   *   for a declaration applied to the content target, or the inherited context for a declaration
   *   applied recursively (see `IModelFieldsProvider.applyRecursively`). A property with a property
   *   category appears directly under that context (`Geometry` in the example above). A property
   *   without one still appears under its own class's category, but classes at earlier steps no longer
   *   enclose it (`C`). A target-class property remains under its own step's relationship class
   *   category when that relationship class is named. Declarations applied recursively on this
   *   declaration's classes inherit the enclosing context, without this declaration's classes.
   *
   * A property's explicit category override takes precedence over both modes. The setting affects only
   * category placement — not property selection, values or cardinality.
   */
  propertyCategoryScope?: "relatedClass" | "parent";

  /**
   * Optional custom resolution callback. When provided, the system delegates
   * path resolution to this callback instead of using default discovery.
   *
   * The callback receives the iModel accessor and target, and returns concrete paths, each
   * paired with the concrete content-target classes it applies to. The declaration's
   * `properties` and `cardinalityHint` still apply to each resolved path.
   *
   * The callback receives the original target, including its instance IDs and filter. It must honor
   * the first step's `sourceClassName` (see `path`): a returned path starting at a base of it is
   * narrowed to it, and one starting at an unrelated class is rejected with an error.
   *
   * The callback fully replaces default discovery, including its exclusion of hidden target subclasses, so
   * a returned path may end at a hidden class. When loading, each step reaches only instances of its class
   * and subclasses that aren't hidden relative to it, the same as for discovered paths.
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
   * The class `expression` is evaluated against, and the class the field applies to: an instance of
   * this class or any of its subclasses has the field's value. Content for other classes in the
   * requested target has no value for it, but is still returned.
   *
   * The expression must be valid for this class: it may reference its properties. Declare the
   * class that defines the properties used rather than the requested target, e.g. `MySchema.Pump`
   * for `this.FlowRate * 15850.3`, even when the target is `BisCore.Element`. A declaration whose
   * class neither derives from nor is a base of the target's class does not apply to it.
   *
   * Declarations sharing an `id` across targets must declare the same class.
   */
  sourceClassName: EC.FullClassNameDotNotation;
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
