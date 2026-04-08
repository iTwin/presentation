/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { BisCodeSpec, Code } from "@itwin/core-common";
import { TestIModelBuilderImpl } from "../presentation-testing/IModelBuilderImpl.js";

import type { CodeSpecs, IModelDb, Relationships } from "@itwin/core-backend";
import type {
  CodeScopeProps,
  CodeSpec,
  ElementAspectProps,
  ElementProps,
  ModelProps,
  RelationshipProps,
} from "@itwin/core-common";

describe("TestIModelBuilderImpl", () => {
  it("insertModel calls iModel.models.insertModel", async () => {
    const imodel = { models: { insertModel: vi.fn<IModelDb.Models["insertModel"]>() } };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    builder.insertModel({} as ModelProps);

    expect(imodel.models.insertModel).toHaveBeenCalledOnce();
  });

  it("insertElement calls iModel.elements.insertElement", async () => {
    const imodel = { elements: { insertElement: vi.fn<IModelDb.Elements["insertElement"]>() } };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    builder.insertElement({} as ElementProps);

    expect(imodel.elements.insertElement).toHaveBeenCalledOnce();
  });

  it("insertAspect calls iModel.elements.insertAspect", async () => {
    const imodel = { elements: { insertAspect: vi.fn<IModelDb.Elements["insertAspect"]>() } };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    builder.insertAspect({} as ElementAspectProps);

    expect(imodel.elements.insertAspect).toHaveBeenCalledOnce();
  });

  it("insertRelationship calls iModel.relationships.insertInstance", async () => {
    const imodel = { relationships: { insertInstance: vi.fn<Relationships["insertInstance"]>() } };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    builder.insertRelationship({} as RelationshipProps);

    expect(imodel.relationships.insertInstance).toHaveBeenCalledOnce();
  });

  it("createCode calls iModel.codeSpecs.getByName", () => {
    const imodel = {
      codeSpecs: {
        getByName: vi
          .fn<CodeSpecs["getByName"]>()
          .mockImplementation((name) => ({ id: "code_spec_id", name }) as CodeSpec),
      },
    };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    const result = builder.createCode({} as CodeScopeProps, BisCodeSpec.drawing, "codeValue");

    const expected = new Code({ spec: "code_spec_id", scope: {} as CodeScopeProps, value: "codeValue" });
    expect(result).toEqual(expected);
  });

  it("importSchema calls iModel.importSchemaStrings", async () => {
    const importSchemaStringsStub = vi.fn().mockResolvedValue(undefined);
    const imodel = { importSchemaStrings: importSchemaStringsStub } as unknown as IModelDb;

    const builder = new TestIModelBuilderImpl(imodel);
    await builder.importSchema("test xml");
    expect(importSchemaStringsStub).toHaveBeenCalledExactlyOnceWith(["test xml"]);
  });
});
