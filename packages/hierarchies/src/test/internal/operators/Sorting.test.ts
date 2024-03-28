/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { sortNodesByLabelOperator } from "../../../hierarchies/internal/operators/Sorting";
import { createTestProcessedCustomNode, getObservableResult } from "../../Utils";

describe("Sorting", () => {
  it("sorts nodes", async () => {
    const nodes = [createTestProcessedCustomNode({ label: "b" }), createTestProcessedCustomNode({ label: "c" }), createTestProcessedCustomNode({ label: "a" })];
    const result = await getObservableResult(from(nodes).pipe(sortNodesByLabelOperator));
    expect(result).to.deep.eq([nodes[2], nodes[0], nodes[1]]);
  });
});
