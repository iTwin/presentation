/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * An interface that allows subscribing and unsubscribing listeners that are called upon an event.
 * @public
 */
export interface Event<TListener extends (...args: any[]) => void = () => void> {
  addListener: (listener: TListener) => () => void;
  removeListener: (listener: TListener) => void;
}
