/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { IMetadataProvider } from "../../hierarchies/ECMetadata";
import { createConcatenatedValueJsonSelector, createRawPropertyValueSelector } from "../../hierarchies/queries/ecsql-snippets/ECSqlValueSelectorSnippets";
import {
  BisInstanceLabelSelectClauseFactory,
  ClassBasedInstanceLabelSelectClauseFactory,
  DefaultInstanceLabelSelectClauseFactory,
  IInstanceLabelSelectClauseFactory,
} from "../../hierarchies/queries/InstanceLabelSelectClauseFactory";
import { trimWhitespace } from "../../hierarchies/Utils";
import { ClassStubs, createClassStubs } from "../Utils";

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
        SELECT ${createConcatenatedValueJsonSelector([
          {
            selector: `COALESCE(
              ${createRawPropertyValueSelector("c", "DisplayLabel")},
              ${createRawPropertyValueSelector("c", "Name")}
            )`,
          },
          { value: ` [`, type: "String" },
          { selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} >> 40) AS TEXT)` },
          { value: `-`, type: "String" },
          { selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} & ((1 << 40) - 1)) AS TEXT)` },
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
  let classStubs: ClassStubs;
  beforeEach(() => {
    classStubs = createClassStubs(metadataProvider);
  });
  afterEach(() => {
    sinon.restore();
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
    classStubs.stubEntityClass({ schemaName: "Schema", className: "QueryClass", is: async () => false });
    classStubs.stubEntityClass({ schemaName: "Schema", className: "ClassA", is: async () => false });
    classStubs.stubEntityClass({ schemaName: "Schema", className: "ClassB", is: async () => false });
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
    classStubs.stubEntityClass({ schemaName: "Schema", className: "QueryClass", is: async () => false });
    classStubs.stubEntityClass({ schemaName: "Schema", className: "ClassA", is: async (other) => other === "Schema.QueryClass" });
    classStubs.stubEntityClass({ schemaName: "Schema", className: "ClassB", is: async () => false });
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
    classStubs.stubEntityClass({ schemaName: "Schema", className: "QueryClass", is: async (other) => other === "Schema.ClassB" });
    classStubs.stubEntityClass({ schemaName: "Schema", className: "ClassA", is: async () => false });
    classStubs.stubEntityClass({ schemaName: "Schema", className: "ClassB", is: async () => false });
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
  let classStubs: ClassStubs;
  let factory: BisInstanceLabelSelectClauseFactory;
  beforeEach(() => {
    classStubs = createClassStubs(metadataProvider);
    factory = new BisInstanceLabelSelectClauseFactory({ metadataProvider });
    classStubs.stubEntityClass({
      schemaName: "BisCore",
      className: "GeometricElement",
      is: async (other) => other === "BisCore.Element" || other === "BisCore.GeometricElement",
    });
    classStubs.stubEntityClass({ schemaName: "BisCore", className: "Element", is: async (other) => other === "BisCore.Element" });
    classStubs.stubEntityClass({ schemaName: "BisCore", className: "Model", is: async (other) => other === "BisCore.Model" });
  });

  afterEach(() => {
    sinon.restore();
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
              ${createRawPropertyValueSelector("test", "CodeValue")},
              ${createConcatenatedValueJsonSelector(
                [
                  { selector: createRawPropertyValueSelector("test", "UserLabel") },
                  { value: ` [`, type: "String" },
                  { selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} >> 40) AS TEXT)` },
                  { value: `-`, type: "String" },
                  { selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} & ((1 << 40) - 1)) AS TEXT)` },
                  { value: `]`, type: "String" },
                ],
                `${createRawPropertyValueSelector("test", "UserLabel")} IS NOT NULL`,
              )}
            ),
            NULL
          ),
          IIF(
            [test].[ECClassId] IS (BisCore.Element),
            COALESCE(
              ${createRawPropertyValueSelector("test", "UserLabel")},
              ${createRawPropertyValueSelector("test", "CodeValue")}
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
              ${createRawPropertyValueSelector("test", "CodeValue")},
              ${createConcatenatedValueJsonSelector(
                [
                  { selector: createRawPropertyValueSelector("test", "UserLabel") },
                  { value: ` [`, type: "String" },
                  { selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} >> 40) AS TEXT)` },
                  { value: `-`, type: "String" },
                  { selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} & ((1 << 40) - 1)) AS TEXT)` },
                  { value: `]`, type: "String" },
                ],
                `${createRawPropertyValueSelector("test", "UserLabel")} IS NOT NULL`,
              )}
            ),
            NULL
          ),
          IIF(
            [test].[ECClassId] IS (BisCore.Element),
            COALESCE(
              ${createRawPropertyValueSelector("test", "UserLabel")},
              ${createRawPropertyValueSelector("test", "CodeValue")}
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
