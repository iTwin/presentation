/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

const commonjsGlobal: { MessageChannel?: any } = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
if (commonjsGlobal.MessageChannel)
  delete commonjsGlobal.MessageChannel;

import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiJestSnapshot from "chai-jest-snapshot";
import chaiSubset from "chai-subset";
import faker from "faker";
import sinon from "sinon";
import sinonChai from "sinon-chai";
import * as enzyme from "enzyme";

// setup chai
chai.use(chaiAsPromised);
chai.use(chaiJestSnapshot);
chai.use(sinonChai);
chai.use(chaiSubset);

before(function () {
  chaiJestSnapshot.resetSnapshotRegistry();
});
after(function () {
  delete require.cache[__filename];
});
beforeEach(function () {
  const currentTest = this.currentTest!;

  // we want snapshot tests to use the same random data between runs
  let seed = 0;
  for (let i = 0; i < currentTest.fullTitle().length; ++i)
    seed += currentTest.fullTitle().charCodeAt(i);
  faker.seed(seed);

  // set up snapshot name
  const sourceFilePath = currentTest.file?.replace("lib\\cjs\\test", "src\\test").replace(/\.(jsx?|tsx?)$/, "");
  const snapPath = `${sourceFilePath  }.snap`;
  chaiJestSnapshot.setFilename(snapPath);
  chaiJestSnapshot.setTestName(currentTest.fullTitle());
});
beforeEach(() => {
  sinon.restore();
});

// configure enzyme (testing utils for React)
enzyme.configure({ adapter: new (require("@wojtekmaj/enzyme-adapter-react-17/build"))() }); // eslint-disable-line @typescript-eslint/no-var-requires
chaiJestSnapshot.addSerializer(require("enzyme-to-json/serializer")); // eslint-disable-line @typescript-eslint/no-var-requires
