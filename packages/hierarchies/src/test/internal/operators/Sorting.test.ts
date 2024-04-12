/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect } from "presentation-test-utilities";
import { from } from "rxjs";
import { sortNodesByLabelOperator } from "../../../hierarchies/internal/operators/Sorting";
import { createTestProcessedCustomNode } from "../../Utils";

describe("Sorting", () => {
  it("sorts nodes", async () => {
    const nodes = [createTestProcessedCustomNode({ label: "b" }), createTestProcessedCustomNode({ label: "c" }), createTestProcessedCustomNode({ label: "a" })];
    const result = await collect(from(nodes).pipe(sortNodesByLabelOperator));
    expect(result).to.deep.eq([nodes[2], nodes[0], nodes[1]]);
  });
});
