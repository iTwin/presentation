/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClassBasedInstanceLabelSelectClauseFactory } from "../../shared/instance-label-factory-impls/ClassBasedInstanceLabelSelectClauseFactory.js";
import { trimWhitespace } from "../../shared/Utils.js";

import type { IInstanceLabelSelectClauseFactory } from "../../shared/InstanceLabelSelectClauseFactory.js";

describe("createClassBasedInstanceLabelSelectClauseFactory", () => {
  const defaultClauseFactory: IInstanceLabelSelectClauseFactory = {
    async createSelectClause() {
      return "default selector";
    },
  };
  const classHierarchyInspector = { classDerivesFrom: vi.fn() };
  beforeEach(() => {
    classHierarchyInspector.classDerivesFrom.mockReset();
  });

  it("returns default clause when given an empty list of clauses", async () => {
    const factory = createClassBasedInstanceLabelSelectClauseFactory({
      classHierarchyInspector,
      defaultClauseFactory,
      clauses: [],
    });
    const result = await factory.createSelectClause({ classAlias: "class-alias" });
    expect(result).toBe("default selector");
  });

  it("returns default clause when none of given clause classes match query class", async () => {
    const factory = createClassBasedInstanceLabelSelectClauseFactory({
      classHierarchyInspector,
      defaultClauseFactory,
      clauses: [
        { className: "Schema.ClassA", clause: async () => "a selector" },
        { className: "Schema.ClassB", clause: async () => "b selector" },
      ],
    });
    classHierarchyInspector.classDerivesFrom.mockResolvedValue(false);
    const result = await factory.createSelectClause({ classAlias: "class-alias", className: "Schema.QueryClass" });
    expect(result).toBe("default selector");
  });

  it("returns combination of all clauses if class name prop is not set", async () => {
    const factory = createClassBasedInstanceLabelSelectClauseFactory({
      classHierarchyInspector,
      defaultClauseFactory,
      clauses: [
        { className: "Schema.ClassA", clause: async () => "a selector" },
        { className: "Schema.ClassB", clause: async () => "b selector" },
      ],
    });
    const result = await factory.createSelectClause({ classAlias: "class-alias" });
    expect(trimWhitespace(result)).toBe(
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
        { className: "Schema.ClassA", clause: async () => "a selector" },
        { className: "Schema.ClassB", clause: async () => "b selector" },
      ],
    });
    classHierarchyInspector.classDerivesFrom.mockImplementation(
      async (derived, base) => derived === "Schema.ClassA" && base === "Schema.QueryClass",
    );
    const result = await factory.createSelectClause({ classAlias: "class-alias", className: "Schema.QueryClass" });
    expect(trimWhitespace(result)).toBe(
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
        { className: "Schema.ClassA", clause: async () => "a selector" },
        { className: "Schema.ClassB", clause: async () => "b selector" },
      ],
    });
    classHierarchyInspector.classDerivesFrom.mockImplementation(
      async (derived, base) => derived === "Schema.QueryClass" && base === "Schema.ClassB",
    );
    const result = await factory.createSelectClause({ classAlias: "class-alias", className: "Schema.QueryClass" });
    expect(trimWhitespace(result)).toBe(
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
