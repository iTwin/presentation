/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { createConcatenatedValueJsonSelector, createRawPropertyValueSelector } from "../shared/ecsql-snippets/ECSqlValueSelectorSnippets";
import {
  createBisInstanceLabelSelectClauseFactory,
  createClassBasedInstanceLabelSelectClauseFactory,
  createDefaultInstanceLabelSelectClauseFactory,
  IInstanceLabelSelectClauseFactory,
} from "../shared/InstanceLabelSelectClauseFactory";
import { trimWhitespace } from "../shared/Utils";

describe("createDefaultInstanceLabelSelectClauseFactory", () => {
  let factory: IInstanceLabelSelectClauseFactory;
  beforeEach(() => {
    factory = createDefaultInstanceLabelSelectClauseFactory();
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

describe("createClassBasedInstanceLabelSelectClauseFactory", () => {
  const defaultClauseFactory: IInstanceLabelSelectClauseFactory = {
    async createSelectClause() {
      return "default selector";
    },
  };
  const classHierarchyInspector = {
    classDerivesFrom: sinon.stub(),
  };
  beforeEach(() => {
    classHierarchyInspector.classDerivesFrom.reset();
  });

  it("returns default clause when given an empty list of clauses", async () => {
    const factory = createClassBasedInstanceLabelSelectClauseFactory({
      classHierarchyInspector,
      defaultClauseFactory,
      clauses: [],
    });
    const result = await factory.createSelectClause({
      classAlias: "class-alias",
    });
    expect(result).to.eq("default selector");
  });

  it("returns default clause when none of given clause classes match query class", async () => {
    const factory = createClassBasedInstanceLabelSelectClauseFactory({
      classHierarchyInspector,
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
    classHierarchyInspector.classDerivesFrom.resolves(false);
    const result = await factory.createSelectClause({
      classAlias: "class-alias",
      className: "Schema.QueryClass",
    });
    expect(result).to.eq("default selector");
  });

  it("returns combination of all clauses if class name prop is not set", async () => {
    const factory = createClassBasedInstanceLabelSelectClauseFactory({
      classHierarchyInspector,
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
    const factory = createClassBasedInstanceLabelSelectClauseFactory({
      classHierarchyInspector,
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
    classHierarchyInspector.classDerivesFrom.callsFake(async (derived, base) => derived === "Schema.ClassA" && base === "Schema.QueryClass");
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
    const factory = createClassBasedInstanceLabelSelectClauseFactory({
      classHierarchyInspector,
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
    classHierarchyInspector.classDerivesFrom.callsFake(async (derived, base) => derived === "Schema.QueryClass" && base === "Schema.ClassB");
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
  const classHierarchyInspector = {
    classDerivesFrom: sinon.stub(),
  };
  let factory: IInstanceLabelSelectClauseFactory;
  beforeEach(() => {
    factory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector });
    classHierarchyInspector.classDerivesFrom.reset();
    classHierarchyInspector.classDerivesFrom.callsFake(async (derived, base) => {
      if (derived === "BisCore.GeometricElement") {
        return base === "BisCore.Element" || base === "BisCore.GeometricElement";
      }
      if (derived === "BisCore.Element") {
        return base === "BisCore.Element";
      }
      if (derived === "BisCore.Model") {
        return base === "BisCore.Model";
      }
      return false;
    });
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
          ${await createDefaultInstanceLabelSelectClauseFactory().createSelectClause({ classAlias: "test" })}
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
          ${await createDefaultInstanceLabelSelectClauseFactory().createSelectClause({ classAlias: "test" })}
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
          ${await createDefaultInstanceLabelSelectClauseFactory().createSelectClause({ classAlias: "test" })}
        )
      `),
    );
  });
});
