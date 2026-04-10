/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCachingECClassHierarchyInspector, getClass } from "../shared/Metadata.js";

describe("createCachingECClassHierarchyInspector", () => {
  const schemaProvider = { getSchema: vi.fn() };

  beforeEach(() => {
    schemaProvider.getSchema.mockReset();
  });

  it("returns `true` when candidate is base class", async () => {
    schemaProvider.getSchema.mockResolvedValue({
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
    expect(await inspector.classDerivesFrom("a.b", "c.d")).toBe(true);
  });

  it("returns `false` when candidate is not base class", async () => {
    schemaProvider.getSchema.mockResolvedValue({
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
    expect(await inspector.classDerivesFrom("a.b", "c.d")).toBe(false);
  });

  it("returns the same Promise when called with exact same arguments", async () => {
    const getClassStub = vi.fn(async (className: string) => {
      switch (className) {
        case "b":
          return { fullName: "a.b", is: async () => false };
        case "d":
          return { fullName: "c.d", is: async () => false };
      }
      return undefined;
    });
    schemaProvider.getSchema.mockResolvedValue({ getClass: getClassStub });
    const inspector = createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 1 });
    const [p1, p2] = [inspector.classDerivesFrom("a.b", "c.d"), inspector.classDerivesFrom("a.b", "c.d")];
    expect(p1).toBeInstanceOf(Promise);
    expect(p2).toBeInstanceOf(Promise);
    expect(p1).toBe(p2);
    await Promise.all([p1, p2]);
    expect(getClassStub).toHaveBeenCalledTimes(2);
    expect(getClassStub).toHaveBeenCalledWith("b");
    expect(getClassStub).toHaveBeenCalledWith("d");
  });

  it("returns cached non-Promise value when called with exact same arguments after awaiting on the initial call", async () => {
    const getClassStub = vi.fn(async (className: string) => {
      switch (className) {
        case "b":
          return { fullName: "a.b", is: async () => false };
        case "d":
          return { fullName: "c.d", is: async () => false };
      }
      return undefined;
    });
    schemaProvider.getSchema.mockResolvedValue({ getClass: getClassStub });
    const inspector = createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 1 });
    const p1 = await inspector.classDerivesFrom("a.b", "c.d");
    const p2 = inspector.classDerivesFrom("a.b", "c.d");
    expect(typeof p1).toBe("boolean");
    expect(p1).toBe(p2);
    expect(getClassStub).toHaveBeenCalledTimes(2);
    expect(getClassStub).toHaveBeenCalledWith("b");
    expect(getClassStub).toHaveBeenCalledWith("d");
  });
});

describe("getClass", () => {
  const schemaProvider = { getSchema: vi.fn() };

  beforeEach(() => {
    schemaProvider.getSchema.mockReset();
  });

  it("throws when schema does not exist", async () => {
    schemaProvider.getSchema.mockResolvedValue(undefined);
    await expect(getClass(schemaProvider, "x.y")).rejects.toThrow();
  });

  it("throws when `getSchema` call throws", async () => {
    schemaProvider.getSchema.mockRejectedValue(new Error("some error"));
    await expect(getClass(schemaProvider, "x.y")).rejects.toThrow();
  });

  it("throws when class does not exist", async () => {
    schemaProvider.getSchema.mockResolvedValue({ getClass: async () => undefined });
    await expect(getClass(schemaProvider, "x.y")).rejects.toThrow();
  });

  it("throws when `getClass` call throws", async () => {
    schemaProvider.getSchema.mockResolvedValue({
      getClass: async () => {
        throw new Error("some error");
      },
    });
    await expect(getClass(schemaProvider, "x.y")).rejects.toThrow();
  });

  it("returns class", async () => {
    const getClassStub = vi.fn().mockResolvedValue({ fullName: "result class" });
    schemaProvider.getSchema.mockResolvedValue({ getClass: getClassStub });
    const result = await getClass(schemaProvider, "x.y");
    expect(schemaProvider.getSchema).toHaveBeenCalledExactlyOnceWith("x");
    expect(getClassStub).toHaveBeenCalledExactlyOnceWith("y");
    expect(result).toEqual({ fullName: "result class" });
  });
});
