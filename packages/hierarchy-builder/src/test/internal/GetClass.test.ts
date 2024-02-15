/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { getClass } from "../../hierarchy-builder/internal/GetClass";

describe("getClass", () => {
  const metadata = {
    getSchema: sinon.stub(),
  };

  beforeEach(() => {
    metadata.getSchema.reset();
  });

  it("throws when schema does not exist", async () => {
    metadata.getSchema.resolves(undefined);
    await expect(getClass(metadata, "x.y")).to.eventually.be.rejected;
  });

  it("throws when `getSchema` call throws", async () => {
    metadata.getSchema.rejects(new Error("some error"));
    await expect(getClass(metadata, "x.y")).to.eventually.be.rejected;
  });

  it("throws when class does not exist", async () => {
    metadata.getSchema.resolves({
      getClass: async () => undefined,
    });
    await expect(getClass(metadata, "x.y")).to.eventually.be.rejected;
  });

  it("throws when `getClass` call throws", async () => {
    metadata.getSchema.resolves({
      getClass: async () => {
        throw new Error("some error");
      },
    });
    await expect(getClass(metadata, "x.y")).to.eventually.be.rejected;
  });

  it("returns class", async () => {
    const getClassStub = sinon.stub().resolves({ fullName: "result class" });
    metadata.getSchema.resolves({
      getClass: getClassStub,
    });
    const result = await getClass(metadata, "x.y");
    expect(metadata.getSchema).to.be.calledOnceWithExactly("x");
    expect(getClassStub).to.be.calledOnceWithExactly("y");
    expect(result).to.deep.eq({ fullName: "result class" });
  });
});
