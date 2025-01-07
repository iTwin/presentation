/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** Polyfill for upcoming resource management feature */
(Symbol as any).dispose ??= Symbol.for("dispose");
(Symbol as any).asyncDispose ??= Symbol.for("asyncDispose");
