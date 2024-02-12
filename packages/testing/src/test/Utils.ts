/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import sinon from "sinon";

export function createStub<T extends (...args: any) => any>() {
  return sinon.stub<Parameters<T>, ReturnType<T>>();
}
