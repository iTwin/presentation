/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { buildTargetFilter, TARGET_FILTER_JOIN_ALIAS } from "../../content/query/TargetFilter.js";

import type { ContentTarget } from "../../content/ContentTarget.js";

describe("buildTargetFilter", () => {
  const primaryClass = "TestSchema.TestClass";

  it("returns no clauses for target without filters", () => {
    expect(buildTargetFilter({ primaryClass })).to.deep.equal({});
  });

  it("builds IdSet join and binding for instance ids", () => {
    const target: ContentTarget = { primaryClass, instanceIds: ["0x1", "0x2"] };
    expect(buildTargetFilter(target)).to.deep.equal({
      joins: `JOIN IdSet(:${TARGET_FILTER_JOIN_ALIAS}) [${TARGET_FILTER_JOIN_ALIAS}] ON [${TARGET_FILTER_JOIN_ALIAS}].[id] = [this].[ECInstanceId]`,
      bindings: { [TARGET_FILTER_JOIN_ALIAS]: { type: "idset", value: ["0x1", "0x2"] } },
    });
  });

  it("builds where clause and bindings for instance filter", () => {
    const target: ContentTarget = {
      primaryClass,
      instanceFilter: { expression: "this.Area > :minArea", bindings: { minArea: { type: "double", value: 100 } } },
    };
    expect(buildTargetFilter(target)).to.deep.equal({
      where: "[this].Area > :minArea",
      bindings: { minArea: { type: "double", value: 100 } },
    });
  });

  it("rewrites custom primary class aliases", () => {
    const target: ContentTarget = {
      primaryClass,
      instanceFilter: { expression: "x.Area > :minArea AND [x].Name = :name", primaryClassAlias: "x" },
    };
    expect(buildTargetFilter(target)).to.deep.equal({ where: "[this].Area > :minArea AND [this].Name = :name" });
  });

  it("combines instance ids and instance filter", () => {
    const target: ContentTarget = {
      primaryClass,
      instanceIds: ["0x1"],
      instanceFilter: { expression: "this.Area > :minArea", bindings: { minArea: { type: "double", value: 100 } } },
    };
    expect(buildTargetFilter(target)).to.deep.equal({
      joins: `JOIN IdSet(:${TARGET_FILTER_JOIN_ALIAS}) [${TARGET_FILTER_JOIN_ALIAS}] ON [${TARGET_FILTER_JOIN_ALIAS}].[id] = [this].[ECInstanceId]`,
      where: "[this].Area > :minArea",
      bindings: {
        [TARGET_FILTER_JOIN_ALIAS]: { type: "idset", value: ["0x1"] },
        minArea: { type: "double", value: 100 },
      },
    });
  });
});
