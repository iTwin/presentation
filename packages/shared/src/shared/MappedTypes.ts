/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Event } from "./Event.js";

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
 * Returns type of the first `TFunc` parameter.
 * @public
 */
export type Props<TFunc extends (...args: any[]) => any> = Parameters<TFunc>[0];

/**
 * Returns type of the given `Event` listener.
 * @public
 */
export type EventListener<TEvent extends {}> = TEvent extends Event<infer TListener> ? TListener : never;

/**
 * Returns type of the given `Event` arguments.
 * @public
 */
export type EventArgs<TEvent extends {}> = Props<EventListener<TEvent>>;
