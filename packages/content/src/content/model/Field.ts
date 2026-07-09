/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  type EC,
  type ECSqlBinding,
  normalizeFullClassName,
  type RelationshipPath,
  type ValueDescriptor,
} from "@itwin/presentation-shared";
import { serializeRelationshipPath } from "./Utils.js";

/**
 * Base attributes shared by all field kinds.
 *
 * @public
 */
interface BaseField {
  /**
   * Stable ID that uniquely identifies this field across descriptor rebuilds.
   * Derived from: sourceClassName + propertyAccessPath (for property fields),
   * or a declared stable name (for calculated/external fields).
   */
  id: string;
  /** Display name shown to the user. */
  label: string;
  /** The value shape for this field. */
  type: ValueDescriptor;
  /** The category this field belongs to (by ID). */
  categoryId?: string;
  /** If true, the field is queried but not displayed in UI. */
  hidden?: boolean;
  /** If true, the field is read-only. */
  readOnly?: boolean;
}

/**
 * A field backed by a real EC property.
 *
 * @public
 */
export interface PropertyField extends BaseField {
  kind: "property";
  /**
   * Full class name of the class that *declares* this property (e.g., "BisCore.Element").
   * Drives the SQL column / property metadata. Distinct from {@link (PropertyField:interface).valueClassNames},
   * which are the concrete *value-supplier* classes this field represents.
   */
  sourceClassName: EC.FullClassName;
  /** The EC property name within the source class. */
  propertyName: string;
  /**
   * Relationship path from the content target to this field's source class.
   * Empty array means the field belongs to the target class directly.
   */
  pathFromTarget: RelationshipPath;
  /**
   * Concrete classes of the instances that supply this field's value (the field's "value origin").
   *
   * For a direct property (empty {@link (PropertyField:interface).pathFromTarget}) these are the
   * primary (selected) classes; for a related property they are the concrete classes at the
   * relationship path's terminal end. For example, `["Stuff.Door", "Stuff.Window"]` for a
   * `Height` declared on `Stuff.Thing`, or `["BisCore.ExternalSourceAspectX",
   * "BisCore.ExternalSourceAspectY"]` for an `Identifier` declared on
   * `BisCore.ExternalSourceAspect` and loaded over a relationship.
   *
   * Do not confuse this with:
   * - {@link (PropertyField:interface).sourceClassName} — the class that *declares* the property.
   * - The content *target* classes (the classes content was requested for). For a direct property the
   *   value classes coincide with the target classes, but for a related property they are the
   *   related-endpoint classes rather than the target.
   *
   * Always non-empty, normalized, de-duplicated, and sorted by normalized full name.
   */
  valueClassNames: EC.FullClassName[];
  /**
   * ID of the {@link ValueSelector} (column) this field reads. Equals this field's *base* id (its
   * {@link (PropertyField:namespace).computeId} result without a `forkKey`), so all fork/override
   * variants of the same underlying property share one selector. Immutable in the transformer view.
   */
  selectorId: string;
}
/** @public */
export namespace PropertyField {
  /**
   * Computes the ID of a property field from its source class, property name,
   * and relationship path from the target. Use this to look up property fields
   * directly in `descriptor.fields`.
   *
   * When a non-empty `forkKey` is provided, it is appended as a `#${forkKey}` suffix so a field
   * that has been carved for a subset of its value-supplier classes gets a distinct, stable ID.
   * An `undefined` or empty `forkKey` leaves the identity unchanged — so a survivor field keeps
   * its original ID.
   */
  export function computeId(props: {
    propertyClassName: EC.FullClassName;
    propertyName: string;
    pathFromTarget?: RelationshipPath;
    forkKey?: string;
  }): Field["id"] {
    let identity = `${normalizeFullClassName(props.propertyClassName)}.${props.propertyName}`;
    if (props.pathFromTarget && props.pathFromTarget.length > 0) {
      identity += `(${serializeRelationshipPath(props.pathFromTarget)})`;
    }
    if (props.forkKey) {
      identity += `#${props.forkKey}`;
    }
    return identity;
  }
}

/**
 * A field whose value is computed by an ECSQL expression evaluated in the query.
 * Participates in SQL-level sorting, filtering, and distinct values.
 *
 * @public
 */
export interface CalculatedField extends BaseField {
  kind: "calculated";
  /**
   * The ECSQL expression that computes this field's value.
   *
   * Use `targetAlias` (defaults to `"this"`) followed by a dot to reference properties
   * of the content target class. At query generation time, the pipeline performs a literal
   * replacement of all `{targetAlias}.` occurrences with the actual query alias.
   *
   * **Important:** The value of `targetAlias` must not appear elsewhere in the expression
   * (e.g., inside string literals or subquery aliases) — every occurrence followed by a dot
   * will be substituted.
   *
   * @example
   * ```
   * expression: "this.CodeValue || '-' || this.UserLabel"
   * // → "e.CodeValue || '-' || e.UserLabel"  (where "e" is the runtime alias)
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
  /**
   * Bind values referenced by `expression`, keyed by parameter name.
   */
  bindings?: Record<string, ECSqlBinding>;
  /**
   * ID of the {@link ValueSelector} (column) this field reads. Equals this field's id
   * (`${providerId}:${localId}`). Immutable in the transformer view.
   */
  selectorId: string;
}

/**
 * A field whose value is populated by an external fields provider
 * (data fetched from outside the iModel).
 * Cannot participate in SQL-level sorting, filtering, or distinct values.
 *
 * @public
 */
export interface ExternalField extends BaseField {
  kind: "external";
  /** The ID of the external fields provider that populates this field. */
  providerId: string;
}

/**
 * A discriminated union of all field kinds.
 *
 * @public
 */
export type Field = PropertyField | CalculatedField | ExternalField;
