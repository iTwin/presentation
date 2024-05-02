/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { createCachingECClassHierarchyInspector, getClass } from "../shared/Metadata";

describe("createCachingECClassHierarchyInspector", () => {
  const schemaProvider = {
    getSchema: sinon.stub(),
  };

  beforeEach(() => {
    schemaProvider.getSchema.reset();
  });

  it("returns `true` when candidate is base class", async () => {
    schemaProvider.getSchema.resolves({
      getClass: async (className: string) => {
        switch (className) {
          case "b":
            return { fullName: "a.b", is: async () => true };
          case "d":
            return { fullName: "c.d", is: async () => false };
        }
        return undefined;
      },
    });
    const inspector = createCachingECClassHierarchyInspector({ schemaProvider });
    expect(await inspector.classDerivesFrom("a.b", "c.d")).to.be.true;
  });

  it("returns `false` when candidate is not base class", async () => {
    schemaProvider.getSchema.resolves({
      getClass: async (className: string) => {
        switch (className) {
          case "b":
            return { fullName: "a.b", is: async () => false };
          case "d":
            return { fullName: "c.d", is: async () => true };
        }
        return undefined;
      },
    });
    const inspector = createCachingECClassHierarchyInspector({ schemaProvider });
    expect(await inspector.classDerivesFrom("a.b", "c.d")).to.be.false;
  });

  it("returns the same Promise when called with exact same arguments", async () => {
    const getClassStub = sinon.fake(async (className: string) => {
      switch (className) {
        case "b":
          return { fullName: "a.b", is: async () => false };
        case "d":
          return { fullName: "c.d", is: async () => false };
      }
      return undefined;
    });
    schemaProvider.getSchema.resolves({
      getClass: getClassStub,
    });
    const inspector = createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 1 });
    const [p1, p2] = [inspector.classDerivesFrom("a.b", "c.d"), inspector.classDerivesFrom("a.b", "c.d")];
    expect(p1).to.be.instanceOf(Promise);
    expect(p2).to.be.instanceOf(Promise);
    expect(p1).to.eq(p2);
    await Promise.all([p1, p2]);
    expect(getClassStub).to.be.calledTwice;
    expect(getClassStub).to.be.calledWith("b");
    expect(getClassStub).to.be.calledWith("d");
  });

  it("returns cached non-Promise value when called with exact same arguments after awaiting on the initial call", async () => {
    const getClassStub = sinon.fake(async (className: string) => {
      switch (className) {
        case "b":
          return { fullName: "a.b", is: async () => false };
        case "d":
          return { fullName: "c.d", is: async () => false };
      }
      return undefined;
    });
    schemaProvider.getSchema.resolves({
      getClass: getClassStub,
    });
    const inspector = createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 1 });
    const p1 = await inspector.classDerivesFrom("a.b", "c.d");
    const p2 = inspector.classDerivesFrom("a.b", "c.d");
    expect(typeof p1).to.eq("boolean");
    expect(p1).to.eq(p2);
    expect(getClassStub).to.be.calledTwice;
    expect(getClassStub).to.be.calledWith("b");
    expect(getClassStub).to.be.calledWith("d");
  });
});

describe("getClass", () => {
  const schemaProvider = {
    getSchema: sinon.stub(),
  };

  beforeEach(() => {
    schemaProvider.getSchema.reset();
  });

  it("throws when schema does not exist", async () => {
    schemaProvider.getSchema.resolves(undefined);
    await expect(getClass(schemaProvider, "x.y")).to.eventually.be.rejected;
  });

  it("throws when `getSchema` call throws", async () => {
    schemaProvider.getSchema.rejects(new Error("some error"));
    await expect(getClass(schemaProvider, "x.y")).to.eventually.be.rejected;
  });

  it("throws when class does not exist", async () => {
    schemaProvider.getSchema.resolves({
      getClass: async () => undefined,
    });
    await expect(getClass(schemaProvider, "x.y")).to.eventually.be.rejected;
  });

  it("throws when `getClass` call throws", async () => {
    schemaProvider.getSchema.resolves({
      getClass: async () => {
        throw new Error("some error");
      },
    });
    await expect(getClass(schemaProvider, "x.y")).to.eventually.be.rejected;
  });

  it("returns class", async () => {
    const getClassStub = sinon.stub().resolves({ fullName: "result class" });
    schemaProvider.getSchema.resolves({
      getClass: getClassStub,
    });
    const result = await getClass(schemaProvider, "x.y");
    expect(schemaProvider.getSchema).to.be.calledOnceWithExactly("x");
    expect(getClassStub).to.be.calledOnceWithExactly("y");
    expect(result).to.deep.eq({ fullName: "result class" });
  });
});
