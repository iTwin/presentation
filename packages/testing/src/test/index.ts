/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiJestSnapshot from "chai-jest-snapshot";
import path from "path";
import sinon from "sinon";
import sinonChai from "sinon-chai";

// setup chai
chai.use(chaiAsPromised);
chai.use(chaiJestSnapshot);
chai.use(sinonChai);

before(function () {
  chaiJestSnapshot.resetSnapshotRegistry();
});
after(function () {
  delete require.cache[__filename];
});
beforeEach(function () {
  const currentTest = this.currentTest!;

  // set up snapshot name
  const sourceFilePath = currentTest.file!.replace(`lib${path.sep}cjs${path.sep}test`, `src${path.sep}test`).replace(/\.(jsx?|tsx?)$/, "");
  const snapPath = `${sourceFilePath}.snap`;
  chaiJestSnapshot.setFilename(snapPath);
  chaiJestSnapshot.setTestName(currentTest.fullTitle());

  sinon.restore();
});
