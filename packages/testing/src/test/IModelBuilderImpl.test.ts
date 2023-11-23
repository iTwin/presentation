/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { CodeSpecs, IModelDb, Relationships } from "@itwin/core-backend";
import { BisCodeSpec, Code, CodeScopeProps, CodeSpec, ElementAspectProps, ElementProps, ModelProps, RelationshipProps } from "@itwin/core-common";
import { TestIModelBuilderImpl } from "../presentation-testing/IModelBuilderImpl";

describe("TestIModelBuilderImpl", () => {
  it("insertModel calls iModel.models.insertModel", async () => {
    const imodelMock = moq.Mock.ofType<IModelDb>();
    const modelsMock = moq.Mock.ofType<IModelDb.Models>();
    imodelMock.setup((x) => x.models).returns(() => modelsMock.object);

    const builder = new TestIModelBuilderImpl(imodelMock.object);
    builder.insertModel({} as ModelProps);

    modelsMock.verify(async (x) => x.insertModel({} as ModelProps), moq.Times.once());
  });

  it("insertElement calls iModel.elements.insertElement", async () => {
    const imodelMock = moq.Mock.ofType<IModelDb>();
    const elementsMock = moq.Mock.ofType<IModelDb.Elements>();
    imodelMock.setup((x) => x.elements).returns(() => elementsMock.object);

    const builder = new TestIModelBuilderImpl(imodelMock.object);
    builder.insertElement({} as ElementProps);

    elementsMock.verify(async (x) => x.insertElement({} as ElementProps), moq.Times.once());
  });

  it("insertAspect calls iModel.elements.insertAspect", async () => {
    const imodelMock = moq.Mock.ofType<IModelDb>();
    const elementsMock = moq.Mock.ofType<IModelDb.Elements>();
    imodelMock.setup((x) => x.elements).returns(() => elementsMock.object);

    const builder = new TestIModelBuilderImpl(imodelMock.object);
    builder.insertAspect({} as ElementAspectProps);

    elementsMock.verify(async (x) => x.insertAspect({} as ElementAspectProps), moq.Times.once());
  });

  it("insertRelationship calls iModel.relationships.insertInstance", async () => {
    const imodelMock = moq.Mock.ofType<IModelDb>();
    const relationshipsMock = moq.Mock.ofType<Relationships>();
    imodelMock.setup((x) => x.relationships).returns(() => relationshipsMock.object);

    const builder = new TestIModelBuilderImpl(imodelMock.object);
    builder.insertRelationship({} as RelationshipProps);

    relationshipsMock.verify(async (x) => x.insertInstance({} as RelationshipProps), moq.Times.once());
  });

  it("createCode calls iModel.codeSpecs.getByName", () => {
    const imodelMock = moq.Mock.ofType<IModelDb>();
    const codeSpecsMock = moq.Mock.ofType<CodeSpecs>();
    const codeSpecMock = moq.Mock.ofType<CodeSpec>();
    codeSpecsMock
      .setup((x) => x.getByName(BisCodeSpec.drawing))
      .returns(() => codeSpecMock.object)
      .verifiable(moq.Times.once());
    imodelMock.setup((x) => x.codeSpecs).returns(() => codeSpecsMock.object);

    const builder = new TestIModelBuilderImpl(imodelMock.object);
    const result = builder.createCode({} as CodeScopeProps, BisCodeSpec.drawing, "codeValue");

    const expected = new Code({ spec: codeSpecMock.object.id, scope: {} as CodeScopeProps, value: "codeValue" });
    expect(result).to.deep.equal(expected);
    codeSpecsMock.verifyAll();
  });

  it("importSchema calls iModel.importSchemaStrings", async () => {
    const importSchemaStringsStub = sinon.stub().resolves();
    const imodel = {
      importSchemaStrings: importSchemaStringsStub,
    } as unknown as IModelDb;

    const builder = new TestIModelBuilderImpl(imodel);
    await builder.importSchema("test xml");
    expect(importSchemaStringsStub).to.be.calledOnceWith(["test xml"]);
  });
});
