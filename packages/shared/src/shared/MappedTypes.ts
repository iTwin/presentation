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
export type ArrayElement<ArrayType extends readonly unknown[]> = ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

/**
 * Returns type of `TFunc` parameter, when `TFunc` accepts exactly one object argument
 * that can also be `undefined` / optional.
 * @public
 */
export type Props<TFunc extends (...args: any[]) => any> =
  Parameters<TFunc> extends [infer TProps]
    ? Exclude<TProps, undefined> extends object
      ? TProps
      : never
    : Parameters<TFunc> extends [(infer TProps)?]
      ? Exclude<TProps, undefined> extends object
        ? TProps | undefined
        : never
      : never;
