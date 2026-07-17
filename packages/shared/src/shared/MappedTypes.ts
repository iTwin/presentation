/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * An utility `Omit` type which works with union types.
 * @public
 */
export type OmitOverUnion<T, K extends PropertyKey> = T extends T ? Omit<T, K> : never;

/**
 * An utility generic type to get array element's type.
 * @public
 */
export type ArrayElement<ArrayType extends readonly unknown[]> = ArrayType extends readonly (infer ElementType)[]
  ? ElementType
  : never;

/**
 * Extracts the union of parameter tuples from a function type, including all of its
 * overload signatures.
 *
 * `Parameters` from the standard library only ever reflects the last overload signature,
 * so this helper matches against up to four call signatures to recover the full set.
 * @public
 */
type OverloadParameters<TFunc> = TFunc extends {
  (...args: infer A1): any;
  (...args: infer A2): any;
  (...args: infer A3): any;
  (...args: infer A4): any;
}
  ? A1 | A2 | A3 | A4
  : TFunc extends { (...args: infer A1): any; (...args: infer A2): any; (...args: infer A3): any }
    ? A1 | A2 | A3
    : TFunc extends { (...args: infer A1): any; (...args: infer A2): any }
      ? A1 | A2
      : TFunc extends (...args: infer A1) => any
        ? A1
        : never;

/**
 * Maps a single parameter tuple to the type of its lone object argument, preserving
 * `undefined` when the argument is optional.
 * @public
 */
type PropsFromParameters<TParams> = TParams extends [infer TProps]
  ? Exclude<TProps, undefined> extends object
    ? TProps
    : never
  : TParams extends [(infer TProps)?]
    ? Exclude<TProps, undefined> extends object
      ? TProps | undefined
      : never
    : never;

/**
 * Returns type of `TFunc` parameter, when `TFunc` accepts exactly one object argument
 * that can also be `undefined` / optional.
 *
 * When `TFunc` is an overloaded function, the result is a union of the parameter types
 * across all of its overload signatures.
 * @public
 */
export type Props<TFunc extends (...args: any[]) => any> = PropsFromParameters<OverloadParameters<TFunc>>;
