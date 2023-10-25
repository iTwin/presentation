/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IMetadataProvider } from "../../hierarchy-builder/Metadata";
import { createConcatenatedTypedValueSelector, createPropertyValueSelector } from "../../hierarchy-builder/queries/ECSqlUtils";
import {
  BisInstanceLabelSelectClauseFactory,
  ClassBasedInstanceLabelSelectClauseFactory,
  DefaultInstanceLabelSelectClauseFactory,
  IInstanceLabelSelectClauseFactory,
} from "../../hierarchy-builder/queries/InstanceLabelSelectClauseFactory";
import { createGetClassStub, TStubClassFunc } from "../Utils";
import { trimWhitespace } from "./Utils";

describe("DefaultInstanceLabelSelectClauseFactory", () => {
  let factory: DefaultInstanceLabelSelectClauseFactory;
  beforeEach(() => {
    factory = new DefaultInstanceLabelSelectClauseFactory();
  });

  it("returns valid clause", async () => {
    const result = await factory.createSelectClause({
      classAlias: "test",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`(
        SELECT ${createConcatenatedTypedValueSelector([
          {
            selector: `COALESCE(
              ${createPropertyValueSelector("c", "DisplayLabel")},
              ${createPropertyValueSelector("c", "Name")}
            )`,
          },
          { value: ` [`, type: "String" },
          { selector: `printf('0x%x', ${createPropertyValueSelector("test", "ECInstanceId")})`, type: "Id" },
          { value: `]`, type: "String" },
        ])}
        FROM [meta].[ECClassDef] AS [c]
        WHERE [c].[ECInstanceId] = [test].[ECClassId]
      )`),
    );
  });
});

describe("ClassBasedInstanceLabelSelectClauseFactory", () => {
  const defaultClauseFactory: IInstanceLabelSelectClauseFactory = {
    async createSelectClause() {
      return "default selector";
    },
  };
  const metadataProvider = {} as unknown as IMetadataProvider;
  let stubClass: TStubClassFunc;
  beforeEach(() => {
    stubClass = createGetClassStub(metadataProvider).stubClass;
  });

  it("returns default clause when given an empty list of clauses", async () => {
    const factory = new ClassBasedInstanceLabelSelectClauseFactory({
      metadataProvider,
      defaultClauseFactory,
      clauses: [],
    });
    const result = await factory.createSelectClause({
      classAlias: "class-alias",
    });
    expect(result).to.eq("default selector");
  });

  it("returns default clause when none of given clause classes match query class", async () => {
    const factory = new ClassBasedInstanceLabelSelectClauseFactory({
      metadataProvider,
      defaultClauseFactory,
      clauses: [
        {
          className: "Schema.ClassA",
          clause: async () => "a selector",
        },
        {
          className: "Schema.ClassB",
          clause: async () => "b selector",
        },
      ],
    });
    stubClass({ schemaName: "Schema", className: "QueryClass", is: async () => false });
    stubClass({ schemaName: "Schema", className: "ClassA", is: async () => false });
    stubClass({ schemaName: "Schema", className: "ClassB", is: async () => false });
    const result = await factory.createSelectClause({
      classAlias: "class-alias",
      className: "Schema.QueryClass",
    });
    expect(result).to.eq("default selector");
  });

  it("returns combination of all clauses if class name prop is not set", async () => {
    const factory = new ClassBasedInstanceLabelSelectClauseFactory({
      metadataProvider,
      defaultClauseFactory,
      clauses: [
        {
          className: "Schema.ClassA",
          clause: async () => "a selector",
        },
        {
          className: "Schema.ClassB",
          clause: async () => "b selector",
        },
      ],
    });
    const result = await factory.createSelectClause({
      classAlias: "class-alias",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
      COALESCE(
        IIF(
          [class-alias].[ECClassId] IS (Schema.ClassA),
          a selector,
          NULL
        ),
        IIF(
          [class-alias].[ECClassId] IS (Schema.ClassB),
          b selector,
          NULL
        ),
        default selector
      )
    `),
    );
  });

  it("returns clauses for classes that derive from query class", async () => {
    const factory = new ClassBasedInstanceLabelSelectClauseFactory({
      metadataProvider,
      defaultClauseFactory,
      clauses: [
        {
          className: "Schema.ClassA",
          clause: async () => "a selector",
        },
        {
          className: "Schema.ClassB",
          clause: async () => "b selector",
        },
      ],
    });
    stubClass({ schemaName: "Schema", className: "QueryClass", is: async () => false });
    stubClass({ schemaName: "Schema", className: "ClassA", is: async (other) => other === "Schema.QueryClass" });
    stubClass({ schemaName: "Schema", className: "ClassB", is: async () => false });
    const result = await factory.createSelectClause({
      classAlias: "class-alias",
      className: "Schema.QueryClass",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
      COALESCE(
        IIF(
          [class-alias].[ECClassId] IS (Schema.ClassA),
          a selector,
          NULL
        ),
        default selector
      )
    `),
    );
  });

  it("returns clauses for base classes of query class", async () => {
    const factory = new ClassBasedInstanceLabelSelectClauseFactory({
      metadataProvider,
      defaultClauseFactory,
      clauses: [
        {
          className: "Schema.ClassA",
          clause: async () => "a selector",
        },
        {
          className: "Schema.ClassB",
          clause: async () => "b selector",
        },
      ],
    });
    stubClass({ schemaName: "Schema", className: "QueryClass", is: async (other) => other === "Schema.ClassB" });
    stubClass({ schemaName: "Schema", className: "ClassA", is: async () => false });
    stubClass({ schemaName: "Schema", className: "ClassB", is: async () => false });
    const result = await factory.createSelectClause({
      classAlias: "class-alias",
      className: "Schema.QueryClass",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
      COALESCE(
        IIF(
          [class-alias].[ECClassId] IS (Schema.ClassB),
          b selector,
          NULL
        ),
        default selector
      )
    `),
    );
  });
});

describe("BisInstanceLabelSelectClauseFactory", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  let stubClass: TStubClassFunc;
  let factory: BisInstanceLabelSelectClauseFactory;
  beforeEach(() => {
    stubClass = createGetClassStub(metadataProvider).stubClass;
    factory = new BisInstanceLabelSelectClauseFactory({ metadataProvider });
    stubClass({
      schemaName: "BisCore",
      className: "GeometricElement",
      is: async (other) => other === "BisCore.Element" || other === "BisCore.GeometricElement",
    });
    stubClass({ schemaName: "BisCore", className: "Element", is: async (other) => other === "BisCore.Element" });
    stubClass({ schemaName: "BisCore", className: "Model", is: async (other) => other === "BisCore.Model" });
  });

  it("returns valid clause for geometric elements", async () => {
    const result = await factory.createSelectClause({
      classAlias: "test",
      className: "BisCore.GeometricElement",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
        COALESCE(
          IIF(
            [test].[ECClassId] IS (BisCore.GeometricElement),
            COALESCE(
              ${createPropertyValueSelector("test", "CodeValue")},
              ${createConcatenatedTypedValueSelector(
                [
                  { selector: createPropertyValueSelector("test", "UserLabel") },
                  { value: ` [`, type: "String" },
                  { selector: `printf('0x%x', ${createPropertyValueSelector("test", "ECInstanceId")})`, type: "Id" },
                  { value: `]`, type: "String" },
                ],
                createPropertyValueSelector("test", "UserLabel"),
              )}
            ),
            NULL
          ),
          IIF(
            [test].[ECClassId] IS (BisCore.Element),
            COALESCE(
              ${createPropertyValueSelector("test", "UserLabel")},
              ${createPropertyValueSelector("test", "CodeValue")}
            ),
            NULL
          ),
          ${await new DefaultInstanceLabelSelectClauseFactory().createSelectClause({ classAlias: "test" })}
        )
      `),
    );
  });

  it("returns valid clause for any element", async () => {
    const result = await factory.createSelectClause({
      classAlias: "test",
      className: "BisCore.Element",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
        COALESCE(
          IIF(
            [test].[ECClassId] IS (BisCore.GeometricElement),
            COALESCE(
              ${createPropertyValueSelector("test", "CodeValue")},
              ${createConcatenatedTypedValueSelector(
                [
                  { selector: createPropertyValueSelector("test", "UserLabel") },
                  { value: ` [`, type: "String" },
                  { selector: `printf('0x%x', ${createPropertyValueSelector("test", "ECInstanceId")})`, type: "Id" },
                  { value: `]`, type: "String" },
                ],
                createPropertyValueSelector("test", "UserLabel"),
              )}
            ),
            NULL
          ),
          IIF(
            [test].[ECClassId] IS (BisCore.Element),
            COALESCE(
              ${createPropertyValueSelector("test", "UserLabel")},
              ${createPropertyValueSelector("test", "CodeValue")}
            ),
            NULL
          ),
          ${await new DefaultInstanceLabelSelectClauseFactory().createSelectClause({ classAlias: "test" })}
        )
      `),
    );
  });

  it("returns valid clause for any model", async () => {
    const result = await factory.createSelectClause({
      classAlias: "test",
      className: "BisCore.Model",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
        COALESCE(
          IIF(
            [test].[ECClassId] IS (BisCore.Model),
            (
              SELECT ${await factory.createSelectClause({
                classAlias: "e",
                className: "BisCore.Element",
              })}
              FROM [bis].[Element] AS [e]
              WHERE [e].[ECInstanceId] = [test].[ModeledElement].[Id]
            ),
            NULL
          ),
          ${await new DefaultInstanceLabelSelectClauseFactory().createSelectClause({ classAlias: "test" })}
        )
      `),
    );
  });
});
