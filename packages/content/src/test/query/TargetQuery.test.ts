/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { ECSql } from "@itwin/presentation-shared";
import { buildTargetQueryParts, TARGET_FILTER_JOIN_ALIAS } from "../../content/query/TargetQuery.js";

import type { ContentTarget } from "../../content/ContentTarget.js";

describe("buildTargetQueryParts", () => {
  const primaryClass = "TestSchema.TestClass";

  it("selects the primary class without joins for target without filters", () => {
    expect(buildTargetQueryParts({ primaryClass })).to.deep.equal({
      from: `FROM ${ECSql.createClassSelector(primaryClass)} [this]`,
      joins: [],
    });
  });

  it("uses an ID-first IdSet source and binding for instance ids", () => {
    const target: ContentTarget = { primaryClass, instanceIds: ["0x1", "0x2"] };
    expect(buildTargetQueryParts(target)).to.deep.equal({
      from: `FROM IdSet(:${TARGET_FILTER_JOIN_ALIAS}) [${TARGET_FILTER_JOIN_ALIAS}]`,
      joins: [
        `CROSS JOIN ${ECSql.createClassSelector(primaryClass)} [this] ON [this].[ECInstanceId] = [${TARGET_FILTER_JOIN_ALIAS}].[id]`,
      ],
      bindings: { [TARGET_FILTER_JOIN_ALIAS]: { type: "idset", value: ["0x1", "0x2"] } },
    });
  });

  it("builds where clause and bindings for instance filter", () => {
    const target: ContentTarget = {
      primaryClass,
      instanceFilter: { expression: "this.Area > :minArea", bindings: { minArea: { type: "double", value: 100 } } },
    };
    expect(buildTargetQueryParts(target)).to.deep.equal({
      from: `FROM ${ECSql.createClassSelector(primaryClass)} [this]`,
      joins: [],
      where: "[this].Area > :minArea",
      bindings: { minArea: { type: "double", value: 100 } },
    });
  });

  it("rewrites custom primary class aliases", () => {
    const target: ContentTarget = {
      primaryClass,
      instanceFilter: { expression: "x.Area > :minArea AND [x].Name = :name", primaryClassAlias: "x" },
    };
    expect(buildTargetQueryParts(target)).to.deep.equal({
      from: `FROM ${ECSql.createClassSelector(primaryClass)} [this]`,
      joins: [],
      where: "[this].Area > :minArea AND [this].Name = :name",
    });
  });

  it("suffixes the join/binding alias when a custom primary alias is given", () => {
    const target: ContentTarget = {
      primaryClass,
      instanceIds: ["0x1"],
      instanceFilter: { expression: "this.Area > :minArea", bindings: { minArea: { type: "double", value: 100 } } },
    };
    expect(buildTargetQueryParts(target, { primaryAlias: "other" })).to.deep.equal({
      from: `FROM IdSet(:${TARGET_FILTER_JOIN_ALIAS}_other) [${TARGET_FILTER_JOIN_ALIAS}_other]`,
      joins: [
        `CROSS JOIN ${ECSql.createClassSelector(primaryClass)} [other] ON [other].[ECInstanceId] = [${TARGET_FILTER_JOIN_ALIAS}_other].[id]`,
      ],
      where: "[other].Area > :minArea",
      bindings: {
        [`${TARGET_FILTER_JOIN_ALIAS}_other`]: { type: "idset", value: ["0x1"] },
        minArea: { type: "double", value: 100 },
      },
    });
  });

  it("combines instance ids and instance filter", () => {
    const target: ContentTarget = {
      primaryClass,
      instanceIds: ["0x1"],
      instanceFilter: { expression: "this.Area > :minArea", bindings: { minArea: { type: "double", value: 100 } } },
    };
    expect(buildTargetQueryParts(target)).to.deep.equal({
      from: `FROM IdSet(:${TARGET_FILTER_JOIN_ALIAS}) [${TARGET_FILTER_JOIN_ALIAS}]`,
      joins: [
        `CROSS JOIN ${ECSql.createClassSelector(primaryClass)} [this] ON [this].[ECInstanceId] = [${TARGET_FILTER_JOIN_ALIAS}].[id]`,
      ],
      where: "[this].Area > :minArea",
      bindings: {
        [TARGET_FILTER_JOIN_ALIAS]: { type: "idset", value: ["0x1"] },
        minArea: { type: "double", value: 100 },
      },
    });
  });

  it("selects an exact narrower class", () => {
    const result = buildTargetQueryParts(
      { primaryClass },
      { primaryClassName: "TestSchema.DerivedClass", polymorphic: false },
    );
    expect(result).to.deep.equal({ from: "FROM ONLY [TestSchema].[DerivedClass] [this]", joins: [] });
  });

  it("cross joins an exact narrower class to instance ids", () => {
    const result = buildTargetQueryParts(
      { primaryClass, instanceIds: ["0x1"] },
      { primaryClassName: "TestSchema.DerivedClass", polymorphic: false },
    );
    expect(result).to.deep.equal({
      from: `FROM IdSet(:${TARGET_FILTER_JOIN_ALIAS}) [${TARGET_FILTER_JOIN_ALIAS}]`,
      joins: [
        `CROSS JOIN ONLY [TestSchema].[DerivedClass] [this] ON [this].[ECInstanceId] = [${TARGET_FILTER_JOIN_ALIAS}].[id]`,
      ],
      bindings: { [TARGET_FILTER_JOIN_ALIAS]: { type: "idset", value: ["0x1"] } },
    });
  });
});
