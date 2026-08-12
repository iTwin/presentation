/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "./Emitter.js";
import { parse } from "./Parser.js";

import type { Id64String } from "@itwin/core-bentley";
import type { EC, ECSqlBinding, IInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
import type { SymbolValues } from "./Emitter.js";

/**
 * Properties for `convertECExpressionToECSql`.
 * @internal
 */
export interface ConvertECExpressionToECSqlProps {
  /**
   * The presentation ECExpression to convert.
   */
  expression: string;

  /**
   * Alias used for the primary (`this`) instance in the produced ECSQL. Defaults to `"this"`.
   */
  primaryClassAlias?: string;

  /**
   * Full name of the primary (`this`) class. When provided, instance label select clauses generated for
   * the primary instance can be more efficient.
   */
  primaryClassName?: EC.FullClassNameDotNotation;

  /**
   * Factory used to generate instance label select clauses for `GetDisplayLabel` and related-instance label functions.
   * Required only when the expression uses those functions.
   */
  labelSelectClauseFactory?: IInstanceLabelSelectClauseFactory;

  /**
   * Hooks for resolving context-dependent symbols used by some ECExpression functions.
   */
  context?: {
    /** Returns the currently selected instance ids, used by `SelectedInstanceKeys`. */
    getSelectedInstanceIds?: () => Id64String[];
    /**
     * Resolves a symbol root (e.g. `ParentNode`) to a nested map of its member values. Leaf members are
     * `string` or `number`; nested objects represent further member access (e.g. `{ ECInstanceId: "0x10" }`
     * for `ParentNode.ECInstanceId`). Returning `undefined` leaves the root unresolved, so the access is
     * emitted as a regular property reference.
     */
    resolveRoot?: (root: string) => SymbolValues | undefined;
  };
}

/**
 * Result of `convertECExpressionToECSql`.
 * @internal
 */
export interface ConvertECExpressionToECSqlResult {
  /** The generated ECSQL fragment. */
  ecsql: string;
  /** Bindings generated for literal and resolved values, keyed by binding name. Omitted when empty. */
  bindings?: Record<string, ECSqlBinding>;
}

/**
 * Converts a presentation ECExpression into an equivalent standard ECSQL fragment together with any generated bindings.
 *
 * Throws an `Error` for constructs that have no portable ECSQL equivalent (e.g. presentation-runtime-only
 * functions, DateTime literals, array indexing, unsupported operators).
 * @internal
 */
export async function convertECExpressionToECSql(
  props: ConvertECExpressionToECSqlProps,
): Promise<ConvertECExpressionToECSqlResult> {
  const { expression, ...emitterProps } = props;
  const ast = parse(expression);
  return Emitter.convert(ast, emitterProps);
}
