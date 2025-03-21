/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import sinonChai from "sinon-chai";

// setup chai
chai.use(chaiAsPromised);
chai.use(sinonChai);

export const mochaHooks = {
  beforeAll() {},
  beforeEach() {},
  afterEach() {},
  afterAll() {},
};
