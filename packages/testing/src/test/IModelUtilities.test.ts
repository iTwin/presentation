/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { join } from "path";
import sinon, { SinonStub } from "sinon";
import * as moq from "typemoq";
import { IModelJsFs, SnapshotDb } from "@itwin/core-backend";
import { CreateEmptySnapshotIModelProps } from "@itwin/core-common";
import { SnapshotConnection } from "@itwin/core-frontend";
import { buildTestIModel } from "../presentation-testing/IModelUtilities";
import { createFileNameFromString, getTestOutputDir } from "../presentation-testing/InternalUtils";

interface SetupSnapshotResult {
  dbMock: moq.IMock<SnapshotDb>;
  connectionMock: moq.IMock<SnapshotConnection>;
  createSnapshotDb: SinonStub<[filePath: string, options: CreateEmptySnapshotIModelProps], SnapshotDb>;
  openSnapshotConnection: SinonStub<[filePath: string], Promise<SnapshotConnection>>;
}

describe("buildTestIModel", () => {
  afterEach(() => {
    sinon.restore();
  });

  const setupSnapshot = (): SetupSnapshotResult => {
    const dbMock = moq.Mock.ofType<SnapshotDb>();
    const connectionMock = moq.Mock.ofType<SnapshotConnection>();
    const createSnapshotDb = sinon.stub(SnapshotDb, "createEmpty").returns(dbMock.object);
    const openSnapshotConnection = sinon.stub(SnapshotConnection, "openFile");
    openSnapshotConnection.resolves(connectionMock.object);
    connectionMock.setup((x: any) => x.then).returns(() => undefined);
    return { dbMock, connectionMock, createSnapshotDb, openSnapshotConnection };
  };

  it("calls IModelJsFs.mkdirSync if directory does not exist", async () => {
    setupSnapshot();
    sinon.stub(IModelJsFs, "existsSync").returns(false);
    const mkdirFake = sinon.fake();
    sinon.replace(IModelJsFs, "mkdirSync", mkdirFake);

    // eslint-disable-next-line deprecation/deprecation
    await buildTestIModel("name", async () => {});

    expect(mkdirFake.calledOnceWith(getTestOutputDir()));
  });

  it("calls IModelJsFs.unlinkSync if output file exists", async () => {
    const fileName = "fileName";
    setupSnapshot();
    sinon.stub(IModelJsFs, "existsSync").returns(true);
    const unlinkFake = sinon.fake();
    sinon.replace(IModelJsFs, "unlinkSync", unlinkFake);

    // eslint-disable-next-line deprecation/deprecation
    await buildTestIModel(fileName, async () => {});

    const outputFile = join(getTestOutputDir(), `${fileName}.bim`);
    expect(unlinkFake.calledOnceWith(outputFile));
  });

  it("does not call IModelJsFs.unlinkSync if directory does not exist", async () => {
    setupSnapshot();
    sinon.stub(IModelJsFs, "existsSync").returns(false);
    const mkdirFake = sinon.fake();
    sinon.replace(IModelJsFs, "mkdirSync", mkdirFake);
    const unlinkFake = sinon.fake();
    sinon.replace(IModelJsFs, "unlinkSync", unlinkFake);

    // eslint-disable-next-line deprecation/deprecation
    await buildTestIModel("name", async () => {});

    expect(unlinkFake.notCalled);
  });

  it("does not call IModelJsFs.mkdirSync if output file exists", async () => {
    const fileName = "fileName";
    setupSnapshot();
    sinon.stub(IModelJsFs, "existsSync").returns(true);
    const mkdirFake = sinon.fake();
    sinon.replace(IModelJsFs, "mkdirSync", mkdirFake);
    const unlinkFake = sinon.fake();
    sinon.replace(IModelJsFs, "unlinkSync", unlinkFake);

    // eslint-disable-next-line deprecation/deprecation
    await buildTestIModel(fileName, async () => {});

    expect(mkdirFake.notCalled);
  });

  it("calls `SnapshotDb.createEmpty` with correct parameters when using overload with imodel name", async () => {
    const fileName = "fileName";
    const { createSnapshotDb } = setupSnapshot();

    // eslint-disable-next-line deprecation/deprecation
    await buildTestIModel(fileName, async () => {});

    expect(createSnapshotDb.firstCall.args[0]).to.include(`${fileName}.bim`);
    expect(createSnapshotDb.firstCall.lastArg).to.deep.equal({ rootSubject: { name: fileName } });
  });

  it("calls `SnapshotDb.createEmpty` with correct parameters when using overload with mocha context", async function () {
    const fileName = createFileNameFromString(this.test!.fullTitle());
    const { createSnapshotDb } = setupSnapshot();

    // eslint-disable-next-line deprecation/deprecation
    await buildTestIModel(this, async () => {});

    expect(createSnapshotDb.firstCall.args[0]).to.include(`${fileName}.bim`);
    expect(createSnapshotDb.firstCall.lastArg).to.deep.equal({ rootSubject: { name: fileName } });
  });

  it("builder calls provided callback function", async () => {
    setupSnapshot();
    const cb: sinon.SinonSpy<any[], Promise<void>> = sinon.spy();

    // eslint-disable-next-line deprecation/deprecation
    await buildTestIModel("name", cb);

    expect(cb.calledOnce);
  });

  it("builder saves database changes and closes it when callback succeeds", async () => {
    const { dbMock } = setupSnapshot();

    // eslint-disable-next-line deprecation/deprecation
    await buildTestIModel("name", async () => {});

    dbMock.verify((x) => x.saveChanges("Created test IModel"), moq.Times.once());
    dbMock.verify((x) => x.close(), moq.Times.once());
  });

  it("builder saves database changes and closes it when callback throws", async () => {
    const { dbMock } = setupSnapshot();
    const cb = async () => {
      throw new Error("TestError");
    };

    // eslint-disable-next-line deprecation/deprecation
    const promise = buildTestIModel("name", cb);

    await expect(promise).to.be.rejectedWith(Error);
    dbMock.verify((x) => x.saveChanges("Created test IModel"), moq.Times.once());
    dbMock.verify((x) => x.close(), moq.Times.once());
  });

  it("returns result of SnapshotConnection.openFile", async () => {
    const { connectionMock } = setupSnapshot();

    // eslint-disable-next-line deprecation/deprecation
    const promise = buildTestIModel("name", async () => {});
    const result = await promise;

    expect(result).to.equal(connectionMock.object);
  });
});
