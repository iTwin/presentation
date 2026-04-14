/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ConcatenatedValue } from "./ConcatenatedValue.js";
import type { TypedValueSelectClauseProps } from "./ecsql-snippets/ECSqlValueSelectorSnippets.js";
import type { EC } from "./Metadata.js";

/**
 * Props for `IInstanceLabelSelectClauseFactory.createSelectClause`.
 * @public
 */
export interface CreateInstanceLabelSelectClauseProps {
  /**
   * Alias of an ECSQL class referring to the target instance whose label should be selected.
   *
   * Example:
   * ```ts
   * const selectClause = `
   *   SELECT ${await factory.createSelectClause({ classAlias: "x" })}
   *   FROM bis.GeometricElement3d AS x
   * `;
   * ```
   */
  classAlias: string;

  /**
   * An optional full name of the class whose instance label is to be selected.
   *
   * The attribute's purpose is purely for optimization and `IInstanceLabelSelectClauseFactory` should not
   * rely on this to be set to a leaf class or set at all. However, when this name is provided, some factory
   * implementations may be able to create a more efficient select clause (e.g. drop some pieces of clause
   * that don't apply for given class).
   */
  className?: EC.FullClassName;

  /**
   * An optional function for concatenating multiple `TypedValueSelectClauseProps`. Selectors' concatenation
   * is used when a label consists of multiple pieces, e.g.:
   * - `[` - string,
   * - `this.PropertyX` - property value selector,
   * - `]` - string.
   *
   * It's concatenator's job to serialize those pieces into a single selector and, depending on the use case,
   * it may do that in multiple ways. For example:
   *
   * - `createConcatenatedValueJsonSelector` serializes parts into a JSON array selector. This allows the array to
   *   be parsed after the query is run, where each part can be handled individually without losing its metadata.
   *   This is the default value.
   *
   * - `createConcatenatedValueStringSelector` concatenates parts into a string using SQLite's `||` operator. While
   *   this way of concatenation looses metadata (thus disabling formatting of the values), it tries to produce the
   *   value to be as close as possible to the formatted one. This concatenator may be used to create a label for using
   *   in the query `WHERE` clause.
   *
   * @see `createConcatenatedValueJsonSelector`
   * @see `createConcatenatedValueStringSelector`
   */
  selectorsConcatenator?: (selectors: TypedValueSelectClauseProps[], checkSelector?: string) => string;
}

/**
 * An interface for a factory that knows how create instance label select clauses.
 * @see `createDefaultInstanceLabelSelectClauseFactory`
 * @see `createClassBasedInstanceLabelSelectClauseFactory`
 * @see `createBisInstanceLabelSelectClauseFactory`
 * @public
 */
export interface IInstanceLabelSelectClauseFactory {
  /** Creates a select clause for an instance label. */
  createSelectClause(props: CreateInstanceLabelSelectClauseProps): Promise<string>;
}

/**
 * Parses an instance label from query result into a string or a `ConcatenatedValue`. The latter type of result
 * is expected when label selector is created using `IInstanceLabelSelectClauseFactory.createSelectClause` with
 * `createConcatenatedValueJsonSelector`.
 *
 * @public
 */
export function parseInstanceLabel(value: string | undefined): ConcatenatedValue | string {
  if (!value) {
    return "";
  }
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      return JSON.parse(value);
    } catch {
      // fall through
    }
  }
  // not a JSON object/array
  return value;
}
