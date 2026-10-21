/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { Props } from "./MappedTypes.js";

/**
 * An interface that allows subscribing and unsubscribing listeners that are called upon an event.
 * @public
 */
export interface Event<TListener extends (...args: any[]) => void = () => void> {
  addListener: (listener: TListener) => () => void;
  removeListener: (listener: TListener) => void;
}

/**
 * An `Event` that can be raised.
 * @public
 */
export interface RaisableEvent<TListener extends (...args: any[]) => void = () => void> extends Event<TListener> {
  raiseEvent: (...args: Parameters<TListener>) => void;
}

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
