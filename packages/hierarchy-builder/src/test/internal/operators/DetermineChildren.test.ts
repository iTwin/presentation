/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { delay, from, Observable, of } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createDetermineChildrenOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/DetermineChildren";
import { getObservableResult, setupLogging } from "../../Utils";

describe("DetermineChildren", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("doesn't check children if node has children determined", async () => {
    const node: HierarchyNode = {
      key: "custom",
      label: "custom",
      children: false,
    };
    const hasNodes = sinon.spy();
    const result = await getObservableResult(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).to.not.be.called;
    expect(result).to.deep.eq([node]);
  });

  it("determines node children", async () => {
    const node: HierarchyNode = {
      key: "custom",
      label: "custom",
      children: undefined,
    };
    const hasNodes = sinon.stub().returns(of(true));
    const result = await getObservableResult(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).to.be.calledOnceWith(node);
    expect(result).to.deep.eq([{ ...node, children: true }]);
  });

  it("streams nodes in the same order as input", async () => {
    const nodes: HierarchyNode[] = [
      // will determine children of this node asynchronously
      {
        key: "1",
        label: "1",
        children: undefined,
      },
      // will determine children of this node synchronously
      {
        key: "2",
        label: "2",
        children: undefined,
      },
      // this node already has children determined
      {
        key: "3",
        label: "3",
        children: true,
      },
    ];
    const hasNodes = (parent: HierarchyNode): Observable<boolean> => {
      const res = of(false);
      if (parent.key === "1") {
        return res.pipe(delay(1));
      }
      return res;
    };
    const result = await getObservableResult(from(nodes).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(result.map((n) => n.key)).to.deep.eq(["1", "2", "3"]);
  });
});
