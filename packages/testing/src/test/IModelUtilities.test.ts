/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { join } from "path";
import sinon, { SinonStub } from "sinon";
import { IModelJsFs, SnapshotDb } from "@itwin/core-backend";
import { CreateEmptySnapshotIModelProps } from "@itwin/core-common";
import { createFileNameFromString, getTestOutputDir } from "../presentation-testing/FilenameUtils.js";
import { buildTestIModel, TestIModelConnection } from "../presentation-testing/IModelUtilities.js";
import { createStub } from "./Utils.js";

describe("buildTestIModel", () => {
  const snapshotDb = {
    saveChanges: createStub<SnapshotDb["saveChanges"]>(),
    close: createStub<SnapshotDb["close"]>(),
  };

  const testIModelConnection = {} as TestIModelConnection;
  let createSnapshotDb: SinonStub<[filePath: string, options: CreateEmptySnapshotIModelProps], SnapshotDb>;

  beforeEach(() => {
    createSnapshotDb = sinon.stub(SnapshotDb, "createEmpty").returns(snapshotDb as unknown as SnapshotDb);
    sinon.stub(TestIModelConnection, "openFile").resolves(testIModelConnection as unknown as TestIModelConnection);
  });

  afterEach(() => {
    snapshotDb.saveChanges.reset();
    snapshotDb.close.reset();
    sinon.restore();
  });

  it("calls IModelJsFs.mkdirSync if directory does not exist", async () => {
    sinon.stub(IModelJsFs, "existsSync").returns(false);
    const mkdirFake = sinon.fake();
    sinon.replace(IModelJsFs, "mkdirSync", mkdirFake);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel("name", async () => {});

    expect(mkdirFake.calledOnceWith(getTestOutputDir()));
  });

  it("calls IModelJsFs.unlinkSync if output file exists", async () => {
    const fileName = "fileName";
    sinon.stub(IModelJsFs, "existsSync").returns(true);
    const unlinkFake = sinon.fake();
    sinon.replace(IModelJsFs, "unlinkSync", unlinkFake);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel(fileName, async () => {});

    const outputFile = join(getTestOutputDir(), fileName);
    expect(unlinkFake.calledOnceWith(outputFile));
  });

  it("does not call IModelJsFs.unlinkSync if directory does not exist", async () => {
    sinon.stub(IModelJsFs, "existsSync").returns(false);
    const mkdirFake = sinon.fake();
    sinon.replace(IModelJsFs, "mkdirSync", mkdirFake);
    const unlinkFake = sinon.fake();
    sinon.replace(IModelJsFs, "unlinkSync", unlinkFake);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel("name", async () => {});

    expect(unlinkFake.notCalled);
  });

  it("does not call IModelJsFs.mkdirSync if output file exists", async () => {
    const fileName = "fileName";
    sinon.stub(IModelJsFs, "existsSync").returns(true);
    const mkdirFake = sinon.fake();
    sinon.replace(IModelJsFs, "mkdirSync", mkdirFake);
    const unlinkFake = sinon.fake();
    sinon.replace(IModelJsFs, "unlinkSync", unlinkFake);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel(fileName, async () => {});

    expect(mkdirFake.notCalled);
  });

  it("calls `SnapshotDb.createEmpty` with correct parameters when using overload with imodel name", async () => {
    const fileName = "fileName";
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel(fileName, async () => {});

    expect(createSnapshotDb.firstCall.args[0]).to.include(fileName);
    expect(createSnapshotDb.firstCall.lastArg).to.deep.equal({ rootSubject: { name: fileName } });
  });

  it("calls `SnapshotDb.createEmpty` with correct parameters when using overload with mocha context", async function () {
    const fileName = createFileNameFromString(this.test!.fullTitle());

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel(this, async () => {});

    expect(createSnapshotDb.firstCall.args[0]).to.include(fileName);
    expect(createSnapshotDb.firstCall.lastArg).to.deep.equal({ rootSubject: { name: fileName } });
  });

  it("builder calls provided callback function", async () => {
    const cb: sinon.SinonSpy<any[], Promise<void>> = sinon.spy();

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel("name", cb);

    expect(cb.calledOnce);
  });

  it("builder saves database changes and closes it when callback succeeds", async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel("name", async () => {});

    expect(snapshotDb.saveChanges).to.be.calledOnceWith("Created test IModel");
    expect(snapshotDb.close).to.be.calledOnce;
  });

  it("builder saves database changes and closes it when callback throws", async () => {
    const cb = async () => {
      throw new Error("TestError");
    };

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const promise = buildTestIModel("name", cb);

    await expect(promise).to.be.rejectedWith(Error);
    expect(snapshotDb.saveChanges).to.be.calledOnceWith("Created test IModel");
    expect(snapshotDb.close).to.be.calledOnce;
  });

  it("returns result of SnapshotConnection.openFile", async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const promise = buildTestIModel("name", async () => {});
    const result = await promise;

    expect(result).to.equal(testIModelConnection);
  });
});
