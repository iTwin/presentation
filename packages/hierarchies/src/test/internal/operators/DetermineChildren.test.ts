/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect } from "presentation-test-utilities";
import { delay, from, Observable, of } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import { ProcessedHierarchyNode } from "../../../hierarchies/HierarchyNode";
import { createDetermineChildrenOperator, LOGGING_NAMESPACE } from "../../../hierarchies/internal/operators/DetermineChildren";
import { createTestProcessedCustomNode, setupLogging } from "../../Utils";

describe("DetermineChildren", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("doesn't check children if node has children determined", async () => {
    const node = createTestProcessedCustomNode({
      children: false,
    });
    const hasNodes = sinon.spy();
    const result = await collect(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).to.not.be.called;
    expect(result).to.deep.eq([node]);
  });

  it("determines node children", async () => {
    const node = createTestProcessedCustomNode({
      children: undefined,
    });
    const hasNodes = sinon.stub().returns(of(true));
    const result = await collect(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).to.be.calledOnceWith(node);
    expect(result).to.deep.eq([{ ...node, children: true }]);
  });

  it("streams nodes in the same order as input", async () => {
    const nodes = [
      // will determine children of this node asynchronously
      createTestProcessedCustomNode({
        key: "1",
        label: "1",
      }),
      // will determine children of this node synchronously
      createTestProcessedCustomNode({
        key: "2",
        label: "2",
      }),
      // this node already has children determined
      createTestProcessedCustomNode({
        key: "3",
        label: "3",
        children: true,
      }),
    ];
    const hasNodes = (parent: ProcessedHierarchyNode): Observable<boolean> => {
      const res = of(false);
      if (parent.key === "2") {
        return res;
      }
      return res.pipe(delay(1));
    };
    const result = await collect(from(nodes).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(result.map((n) => n.key)).to.deep.eq(["1", "2", "3"]);
  });
});
