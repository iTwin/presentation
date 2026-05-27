/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  normalizeFullClassName,
  type EC,
  type RelationshipPath,
  type ValueDescriptor,
} from "@itwin/presentation-shared";

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
  /** Full class name of the class that owns this property (e.g., "BisCore.Element"). */
  sourceClassName: EC.FullClassName;
  /** The EC property name within the source class. */
  propertyName: string;
  /**
   * Relationship path from the content target to this field's source class.
   * Empty array means the field belongs to the target class directly.
   */
  pathFromTarget: RelationshipPath;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace PropertyField {
  /**
   * Computes the ID of a property field from its source class, property name,
   * and relationship path from the target. Use this to look up property fields
   * directly in `descriptor.fields`.
   */
  export function computeId(props: {
    propertyClassName: EC.FullClassName;
    propertyName: string;
    pathFromTarget?: RelationshipPath;
  }): string {
    let identity = `${normalizeFullClassName(props.propertyClassName)}.${props.propertyName}`;
    if (props.pathFromTarget && props.pathFromTarget.length > 0) {
      identity += "(";
      props.pathFromTarget.forEach((step, i) => {
        const separator = step.relationshipReverse ? "<-" : "->";
        if (i === 0) {
          identity += normalizeFullClassName(step.sourceClassName);
        }
        identity += `${separator}${normalizeFullClassName(step.relationshipName)}${separator}${normalizeFullClassName(step.targetClassName)}`;
      });
      identity += ")";
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
