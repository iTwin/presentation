/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { IModelJsFs, SnapshotDb } from "@itwin/core-backend";
import { BeEvent } from "@itwin/core-bentley";
import { CreateEmptySnapshotIModelProps } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { createFileNameFromString, getTestOutputDir } from "../presentation-testing/FilenameUtils.js";
import { buildTestIModel, TestIModelConnection } from "../presentation-testing/IModelUtilities.js";
import { createStub } from "./Utils.js";

describe("buildTestIModel", () => {
  const snapshotDb = {
    saveChanges: createStub<SnapshotDb["saveChanges"]>(),
    close: createStub<SnapshotDb["close"]>(),
  };
  const testIModelConnection = Object.create(TestIModelConnection.prototype);
  testIModelConnection._db = snapshotDb;
  testIModelConnection.onClose = new BeEvent();

  let createSnapshotDb: MockInstance<(filePath: string, options: CreateEmptySnapshotIModelProps) => SnapshotDb>;

  beforeEach(() => {
    createSnapshotDb = vi.spyOn(SnapshotDb, "createEmpty").mockReturnValue(snapshotDb as unknown as SnapshotDb);
    vi.spyOn(TestIModelConnection, "openFile").mockResolvedValue(testIModelConnection);
  });

  afterEach(() => {
    snapshotDb.saveChanges.mockReset();
    snapshotDb.close.mockReset();
  });

  it("calls IModelJsFs.mkdirSync if directory does not exist", async () => {
    vi.spyOn(IModelJsFs, "existsSync").mockReturnValue(false);
    const mkdirFake = vi.fn();
    vi.spyOn(IModelJsFs, "mkdirSync").mockImplementation(mkdirFake);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel("name", async () => {});

    expect(mkdirFake).toHaveBeenCalledExactlyOnceWith(getTestOutputDir());
  });

  it("calls IModelJsFs.unlinkSync if output file exists", async () => {
    const fileName = "fileName";
    vi.spyOn(IModelJsFs, "existsSync").mockReturnValue(true);
    const unlinkFake = vi.fn();
    vi.spyOn(IModelJsFs, "unlinkSync").mockImplementation(unlinkFake);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel(fileName, async () => {});

    const outputFile = join(getTestOutputDir(), `${fileName}.bim`);
    expect(unlinkFake).toHaveBeenCalledExactlyOnceWith(outputFile);
  });

  it("does not call IModelJsFs.unlinkSync if directory does not exist", async () => {
    vi.spyOn(IModelJsFs, "existsSync").mockReturnValue(false);
    const mkdirFake = vi.fn();
    vi.spyOn(IModelJsFs, "mkdirSync").mockImplementation(mkdirFake);
    const unlinkFake = vi.fn();
    vi.spyOn(IModelJsFs, "unlinkSync").mockImplementation(unlinkFake);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel("name", async () => {});

    expect(unlinkFake).not.toHaveBeenCalled();
  });

  it("does not call IModelJsFs.mkdirSync if output file exists", async () => {
    const fileName = "fileName";
    vi.spyOn(IModelJsFs, "existsSync").mockReturnValue(true);
    const mkdirFake = vi.fn();
    vi.spyOn(IModelJsFs, "mkdirSync").mockImplementation(mkdirFake);
    const unlinkFake = vi.fn();
    vi.spyOn(IModelJsFs, "unlinkSync").mockImplementation(unlinkFake);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel(fileName, async () => {});

    expect(mkdirFake).not.toHaveBeenCalled();
  });

  it("calls `SnapshotDb.createEmpty` with correct parameters when using overload with imodel name", async () => {
    const fileName = "fileName";
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel(fileName, async () => {});

    expect(createSnapshotDb.mock.calls[0][0]).toContain(fileName);
    expect(createSnapshotDb.mock.calls[0][1]).toEqual({ rootSubject: { name: fileName } });
  });

  it("calls `SnapshotDb.createEmpty` with correct parameters when using overload with test context", async () => {
    // Construct a fake test context-shaped object with a deterministic title.
    const testContext = {
      test: { fullTitle: () => "calls `SnapshotDb.createEmpty` with correct parameters when using overload with test context" },
    };
    const fileName = createFileNameFromString(testContext.test.fullTitle());

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel(testContext, async () => {});

    expect(createSnapshotDb.mock.calls[0][0]).toContain(fileName);
    expect(createSnapshotDb.mock.calls[0][1]).toEqual({ rootSubject: { name: fileName } });
  });

  it("builder calls provided callback function", async () => {
    const cb = vi.fn().mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel("name", cb);

    expect(cb).toHaveBeenCalledOnce();
  });

  it("builder saves database changes and closes it when callback succeeds", async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await buildTestIModel("name", async () => {});

    expect(snapshotDb.saveChanges).toHaveBeenCalledExactlyOnceWith("Created test IModel");
    expect(snapshotDb.close).toHaveBeenCalledOnce();
  });

  it("builder saves database changes and closes it when callback throws", async () => {
    const cb = async () => {
      throw new Error("TestError");
    };

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const promise = buildTestIModel("name", cb);

    await expect(promise).rejects.toThrow(Error);
    expect(snapshotDb.saveChanges).toHaveBeenCalledExactlyOnceWith("Created test IModel");
    expect(snapshotDb.close).toHaveBeenCalledOnce();
  });

  it("returns result of TestIModelConnection.openFile", async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const promise = buildTestIModel("name", async () => {});
    const result = await promise;

    expect(result).toBe(testIModelConnection);
  });

  it("raises onClose event when TestIModelConnection.close is called", async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const result = await buildTestIModel("name", async () => {});
    expect(result).toBe(testIModelConnection);
    const imodelListenerStub = vi.fn();
    const imodelConnectionListenerStub = vi.fn();
    result.onClose.addOnce(imodelListenerStub);
    IModelConnection.onClose.addOnce(imodelConnectionListenerStub);
    await result.close();
    expect(imodelListenerStub).toHaveBeenCalledOnce();
    expect(imodelConnectionListenerStub).toHaveBeenCalledOnce();
  });
});
