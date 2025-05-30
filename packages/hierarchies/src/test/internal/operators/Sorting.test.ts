/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect } from "presentation-test-utilities";
import { from } from "rxjs";
import { sortNodesByLabelOperator } from "../../../hierarchies/internal/operators/Sorting.js";
import { createTestProcessedGenericNode } from "../../Utils.js";

describe("Sorting", () => {
  it("sorts nodes", async () => {
    const nodes = [
      createTestProcessedGenericNode({ label: "b" }),
      createTestProcessedGenericNode({ label: "c" }),
      createTestProcessedGenericNode({ label: "a" }),
    ];
    const result = await collect(from(nodes).pipe(sortNodesByLabelOperator));
    expect(result).to.deep.eq([nodes[2], nodes[0], nodes[1]]);
  });
});
