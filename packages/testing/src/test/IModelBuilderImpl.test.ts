/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { CodeSpecs, IModelDb, Relationships } from "@itwin/core-backend";
import { BisCodeSpec, Code, CodeScopeProps, CodeSpec, ElementAspectProps, ElementProps, ModelProps, RelationshipProps } from "@itwin/core-common";
import { TestIModelBuilderImpl } from "../presentation-testing/IModelBuilderImpl";
import { createStub } from "./Utils";

describe("TestIModelBuilderImpl", () => {
  it("insertModel calls iModel.models.insertModel", async () => {
    const imodel = {
      models: {
        insertModel: createStub<IModelDb.Models["insertModel"]>(),
      },
    };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    builder.insertModel({} as ModelProps);

    expect(imodel.models.insertModel).to.be.calledOnce;
  });

  it("insertElement calls iModel.elements.insertElement", async () => {
    const imodel = {
      elements: {
        insertElement: createStub<IModelDb.Elements["insertElement"]>(),
      },
    };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    builder.insertElement({} as ElementProps);

    expect(imodel.elements.insertElement).to.be.calledOnce;
  });

  it("insertAspect calls iModel.elements.insertAspect", async () => {
    const imodel = {
      elements: {
        insertAspect: createStub<IModelDb.Elements["insertAspect"]>(),
      },
    };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    builder.insertAspect({} as ElementAspectProps);

    expect(imodel.elements.insertAspect).to.be.calledOnce;
  });

  it("insertRelationship calls iModel.relationships.insertInstance", async () => {
    const imodel = {
      relationships: {
        insertInstance: createStub<Relationships["insertInstance"]>(),
      },
    };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    builder.insertRelationship({} as RelationshipProps);

    expect(imodel.relationships.insertInstance).to.be.calledOnce;
  });

  it("createCode calls iModel.codeSpecs.getByName", () => {
    const imodel = {
      codeSpecs: {
        getByName: createStub<CodeSpecs["getByName"]>().callsFake(
          (name) =>
            ({
              id: "code_spec_id",
              name,
            }) as CodeSpec,
        ),
      },
    };

    const builder = new TestIModelBuilderImpl(imodel as unknown as IModelDb);
    const result = builder.createCode({} as CodeScopeProps, BisCodeSpec.drawing, "codeValue");

    const expected = new Code({ spec: "code_spec_id", scope: {} as CodeScopeProps, value: "codeValue" });
    expect(result).to.deep.equal(expected);
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
